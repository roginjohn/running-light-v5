// v5 §6 storage: fresh load, v1 migration, corrupt data, memory fallback, refill (dev spec §2.5, §5.6).
// Skipped until batch 3 (the only post-batch-2 change allowed in src/engine, storage.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

const SKIP = { skip: 'v5 batch 3' };
const load = async (initial) => {
  const { memoryBackend } = await import('../../../src/engine/storage.js');
  const { newGame } = await import('../helpers.js');
  return newGame({ backend: memoryBackend(initial) });
};
const V1_SETTINGS = { mute: true, reducedMotion: true, music: 20, sfx: 40 };
const V1_SAVE = {
  [C.V1_KEYS.balance]: JSON.stringify({ v: 500, seq: 9 }),
  [C.V1_KEYS.settings]: JSON.stringify(V1_SETTINGS),
  [C.V1_KEYS.lastBets]: JSON.stringify({ 8: 10 }),
  [C.V1_KEYS.history]: JSON.stringify([]),
};

test('storage: the engine uses the rl.v5.* keys', SKIP, async () => {
  const { KEYS } = await import('../../../src/engine/storage.js');
  assert.deepEqual({ ...KEYS }, { ...C.V5_KEYS });
});

test('storage: a fresh load starts at 10,000 with no migration toast', SKIP, async () => {
  const { g, backend } = await load({});
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.notEqual(g.state.toast?.text, C.TOASTS.migrated);
  assert.equal(JSON.parse(backend.getItem(C.V5_KEYS.balance)).v, C.START_CREDITS);
});

test('storage: a v1 save resets to 10,000, copies settings, ignores bets/history, keeps v1 keys', SKIP, async () => {
  const { g, backend } = await load(V1_SAVE);
  assert.equal(g.state.balance, C.START_CREDITS, 'v1 balance of 500 is not carried over');
  assert.equal(g.state.toast?.text, C.TOASTS.migrated);
  assert.deepEqual(JSON.parse(backend.getItem(C.V5_KEYS.settings)), V1_SETTINGS);
  assert.deepEqual({ ...(g.state.lastBets || {}) }, {}, 'square-keyed v1 bets are not mapped');
  for (const [k, v] of Object.entries(V1_SAVE)) assert.equal(backend.getItem(k), v, `${k} untouched`);
});

test('storage: the migration toast shows once', SKIP, async () => {
  const { memoryBackend } = await import('../../../src/engine/storage.js');
  const { newGame } = await import('../helpers.js');
  const backend = memoryBackend(V1_SAVE);
  const first = newGame({ backend }).g;
  assert.equal(first.state.toast?.text, C.TOASTS.migrated);
  const second = newGame({ backend }).g;
  assert.notEqual(second.state.toast?.text, C.TOASTS.migrated);
  assert.equal(second.state.balance, C.START_CREDITS);
});

test('storage: an in-progress v1 round is discarded with no payout', SKIP, async () => {
  const round = { id: 'r1', phase: 'SPINNING', bets: { 8: 10 }, total: 10, s1: 8, s2: null, balance: 490, seq: 10 };
  const { g, backend } = await load({ ...V1_SAVE, [C.V1_KEYS.round]: JSON.stringify(round) });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(backend.getItem(C.V5_KEYS.round), null);
  assert.equal(backend.getItem(C.V1_KEYS.round), JSON.stringify(round), 'v1 round left in place');
});

test('storage: corrupt v5 data falls back to 10,000', SKIP, async () => {
  const { g } = await load({ [C.V5_KEYS.balance]: '{not json', [C.V5_KEYS.round]: '[]' });
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.state.phase, 'BETTING');
});

test('storage: storage that will not load falls back to memory with the noSave toast', SKIP, async () => {
  const { newGame } = await import('../helpers.js');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} };
  const { g } = newGame({ backend: broken, persistent: false });
  assert.equal(g.state.balance, C.START_CREDITS);
  assert.equal(g.state.toast?.text, C.TOASTS.noSave);
});

test('storage: refill below the minimum bet sets the balance to 10,000', SKIP, async () => {
  const { g } = await load({ [C.V5_KEYS.balance]: JSON.stringify({ v: 0, seq: 1 }) });
  assert.equal(g.state.balance, 0);
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, true);
  assert.equal(g.state.balance, C.REFILL_AMOUNT);
});
