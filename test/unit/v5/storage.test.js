// v5 §6 storage: fresh load, v1 migration, corrupt data, memory fallback, refill (dev spec §2.5, §5.6).
// Unskipped in batch 3 (the only post-batch-2 change allowed in src/engine, storage.js).
// The migration runs inside createStore (storage.js); game.js is locked, so the one-time toast is reported on
// game.store.migration and shown by the UI (test/ui/ui.test.js checks the toast on screen).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';
import { KEYS, V1_KEYS, MIGRATION_KEY, memoryBackend, migrateFromV1 } from '../../../src/engine/storage.js';
import { TOASTS } from '../../../src/engine/config.js';
import { newGame, bet } from '../helpers.js';

const load = (initial) => newGame({ backend: memoryBackend(initial) });
const V1_SETTINGS = { mute: true, reducedMotion: true, music: 20, sfx: 40 };
const V1_SAVE = {
  [C.V1_KEYS.balance]: JSON.stringify({ v: 500, seq: 9 }),
  [C.V1_KEYS.settings]: JSON.stringify(V1_SETTINGS),
  [C.V1_KEYS.lastBets]: JSON.stringify({ 8: 10 }),
  [C.V1_KEYS.history]: JSON.stringify([]),
};
const V1_ROUND = { roundId: 'r1', phase: 'SPINNING', bets: { 8: 10 }, totalBet: 10, s1: 8, s2: null, doubleRun: false,
  baseWin: 240, gambles: [], pendingReveal: false, currentWin: 240, settled: false, balanceBefore: 500, balance: 490, seq: 10, createdAt: 1 };
const v1Entries = (backend) => Object.entries(backend.dump()).filter(([k]) => k.startsWith('rl.v1.'));
/** Backend that records every write/remove so tests can prove rl.v1.* is never touched. */
function spyBackend(initial) {
  const inner = memoryBackend(initial);
  const writes = [];
  return {
    ...inner,
    setItem: (k, v) => { writes.push(k); inner.setItem(k, v); },
    removeItem: (k) => { writes.push(k); inner.removeItem(k); },
    writes,
  };
}

test('storage: the engine uses the rl.v5.* keys and still knows the rl.v1.* keys', () => {
  assert.deepEqual({ ...KEYS }, { ...C.V5_KEYS });
  assert.deepEqual({ ...V1_KEYS }, { ...C.V1_KEYS });
  assert.ok(MIGRATION_KEY.startsWith('rl.v5.'));
  assert.equal(TOASTS.migrated, C.TOASTS.migrated);
  assert.equal(TOASTS.migrated, 'Game updated – credits reset to 10,000');
});

test('storage: a fresh load starts at 10,000 with no migration toast', () => {
  const { g, backend } = load({});
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.store.migration.notice, false);
  assert.equal(g.state.toast, null);
  assert.equal(JSON.parse(backend.getItem(C.V5_KEYS.balance)).v, C.START_CREDITS);
  assert.notEqual(backend.getItem(MIGRATION_KEY), null, 'flag set, so a later v1 key can never trigger the toast');
  assert.deepEqual(v1Entries(backend), [], 'no rl.v1.* key is created');
});

test('storage: a v1 save resets to 10,000, copies settings, ignores bets/history, keeps v1 keys', () => {
  const { g, backend } = load(V1_SAVE);
  assert.equal(g.state.phase, 'BETTING', 'square-keyed v1 data is not treated as corrupt');
  assert.equal(g.state.error, null);
  assert.equal(g.state.balance, C.START_CREDITS, 'v1 balance of 500 is not carried over');
  assert.equal(JSON.parse(backend.getItem(C.V5_KEYS.balance)).v, C.START_CREDITS);
  assert.equal(g.store.migration.notice, true);
  assert.equal(g.store.migration.settingsCopied, true);
  assert.deepEqual(g.state.settings, V1_SETTINGS);
  assert.deepEqual(JSON.parse(backend.getItem(C.V5_KEYS.settings)), V1_SETTINGS);
  assert.equal(g.state.lastBets, null, 'square-keyed v1 bets are not mapped');
  assert.deepEqual(g.state.history, []);
  assert.equal(backend.getItem(C.V5_KEYS.lastBets), null);
  assert.equal(backend.getItem(C.V5_KEYS.history), null);
  assert.equal(g.state.toast, null, 'no "Progress won\'t be saved" toast for v1 data');
  for (const [k, v] of Object.entries(V1_SAVE)) assert.equal(backend.getItem(k), v, `${k} untouched`);
});

test('storage: v1 settings are copied only when valid; unreadable v1 settings fall back to defaults (not corrupt)', () => {
  const { g, backend } = load({ [C.V1_KEYS.settings]: '{not json', [C.V1_KEYS.lastBets]: '{broken' });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.store.migration.notice, true);
  assert.equal(g.store.migration.settingsCopied, false);
  assert.deepEqual(g.state.settings, { mute: false, music: 60, sfx: 80, reducedMotion: false });
  assert.equal(backend.getItem(C.V5_KEYS.settings), null);
  assert.equal(backend.getItem(C.V1_KEYS.settings), '{not json', 'v1 key untouched');
  assert.equal(backend.getItem(C.V1_KEYS.lastBets), '{broken', 'v1 key untouched');
});

test('storage: the migration toast shows once', () => {
  const backend = memoryBackend(V1_SAVE);
  const first = newGame({ backend }).g;
  assert.equal(first.store.migration.notice, true);
  const second = newGame({ backend }).g;
  assert.equal(second.store.migration.notice, false);
  assert.equal(second.state.balance, C.START_CREDITS);
  const third = newGame({ backend }).g;
  assert.equal(third.store.migration.notice, false);
  for (const [k, v] of Object.entries(V1_SAVE)) assert.equal(backend.getItem(k), v, `${k} untouched`);
});

test('storage: v1 keys found after v5 is already in use do not show the toast', () => {
  const { g } = load({ [C.V5_KEYS.balance]: JSON.stringify({ v: 4321, seq: 3 }), ...V1_SAVE });
  assert.equal(g.store.migration.notice, false);
  assert.equal(g.state.balance, 4321);
});

test('storage: an in-progress v1 round is discarded with no payout', () => {
  const { g, backend } = load({ ...V1_SAVE, [C.V1_KEYS.round]: JSON.stringify(V1_ROUND) });
  assert.equal(g.state.phase, 'BETTING', 'no RECOVERY, no ERROR');
  assert.equal(g.state.round, null);
  assert.equal(g.state.balance, C.START_CREDITS, 'no payout or refund of the v1 round');
  assert.equal(g.store.migration.notice, true);
  assert.equal(g.store.migration.discardedRound, true);
  assert.equal(backend.getItem(C.V5_KEYS.round), null);
  assert.equal(backend.getItem(C.V1_KEYS.round), JSON.stringify(V1_ROUND), 'v1 round left in place');
});

test('storage: rl.v1.* keys are never written or removed (load, play, refill, settings, reload)', () => {
  const backend = spyBackend({ ...V1_SAVE, [C.V1_KEYS.round]: JSON.stringify(V1_ROUND) });
  const before = v1Entries(backend);
  const { g } = newGame({ backend });
  bet(g, 5, 3);
  assert.equal(g.dispatch({ type: 'START' }).ok, true);
  g.dispatch({ type: 'TOGGLE_MUTE' });
  newGame({ backend });
  assert.deepEqual(backend.writes.filter((k) => k.startsWith('rl.v1.')), []);
  assert.deepEqual(v1Entries(backend), before);
});

test('storage: corrupt v5 data falls back to 10,000', () => {
  // an unreadable balance alone falls back to 10,000 directly (spec B6)
  const { g } = load({ [C.V5_KEYS.balance]: '{not json' });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.balance, C.START_CREDITS);
  // a corrupt round keeps the existing ERROR -> Reload flow, which resets only that key and lands on 10,000
  const { g: g2, backend } = load({ ...V1_SAVE, [C.V5_KEYS.balance]: '{not json', [C.V5_KEYS.round]: '[]' });
  assert.equal(g2.state.phase, 'ERROR');
  assert.equal(g2.state.error.key, C.V5_KEYS.round);
  assert.equal(g2.dispatch({ type: 'RELOAD' }).ok, true);
  assert.equal(g2.state.phase, 'BETTING');
  assert.equal(g2.state.balance, C.START_CREDITS);
  for (const [k, v] of Object.entries(V1_SAVE)) assert.equal(backend.getItem(k), v, `${k} untouched`);
});

test('storage: storage that will not load falls back to memory with the noSave toast', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const { g } = newGame({ backend: broken, persistent: false });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.state.toast?.text, C.TOASTS.noSave);
  assert.notEqual(g.store.backend, broken, 'memory backend in use');
  bet(g, 10, 2);
  assert.equal(g.dispatch({ type: 'START' }).ok, true, 'plays in memory');
});

test('storage: the memory backend (no localStorage) starts at 10,000 with the noSave toast and no migration toast', () => {
  const { g } = newGame({ backend: memoryBackend(), persistent: false });
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.state.toast?.text, C.TOASTS.noSave);
  assert.equal(g.store.migration.notice, false);
});

test('storage: a failing migration write is not fatal', () => {
  const inner = memoryBackend(V1_SAVE);
  const backend = { ...inner, setItem: (k, v) => { if (k === MIGRATION_KEY) throw new Error('quota'); inner.setItem(k, v); } };
  const r = migrateFromV1(backend);
  assert.equal(r.notice, true);
  const { g } = newGame({ backend });
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.state.phase, 'BETTING');
});

test('storage: refill below the minimum bet sets the balance to 10,000', () => {
  const { g, backend } = load({ [C.V5_KEYS.balance]: JSON.stringify({ v: 0, seq: 1 }) });
  assert.equal(g.state.balance, 0);
  assert.equal(g.needsRefill(), true);
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, true);
  assert.equal(g.state.balance, C.REFILL_AMOUNT);
  assert.equal(JSON.parse(backend.getItem(C.V5_KEYS.balance)).v, C.REFILL_AMOUNT);
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, false, 'no refill at or above the minimum bet');
  const { g: g2 } = load({ [C.V5_KEYS.balance]: JSON.stringify({ v: C.MIN_BET, seq: 1 }) });
  assert.equal(g2.dispatch({ type: 'REFILL' }).ok, false);
  assert.equal(g2.state.balance, C.MIN_BET);
});
