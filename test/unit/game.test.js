// E1.5 gamble, E1.6 bet limits, E1.7 state transitions, E1.8 recovery, E1.9 refill, E5 edge cases.
// v5 batch 2: bets are keyed by tier (5, 10, 20, 50, 100, 200), limits 1,000 per tier and per round, credits 10,000,
// gamble offered on wins of 300,000 or less. Squares used below (MATH-SPEC-C §3): #1/#6 5x, #5/#24 10x,
// #13/#17 20x, #3 50x, #21 100x, #8 200x, #2/#4/#30 blank.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, scriptedRng, bet } from './helpers.js';
import { ACCEPTS, ACTIONS, PHASES } from '../../src/engine/game.js';
import { KEYS, memoryBackend, validRound } from '../../src/engine/storage.js';
import { WEIGHTS, TOASTS, TIERS, START_CREDITS } from '../../src/engine/config.js';
import { mapKey } from '../../src/ui/keys.js';

const rOf = (s) => WEIGHTS.slice(1, s).reduce((a, b) => a + b, 0); // first r mapping to square s
const sum = (b) => Object.values(b).reduce((a, x) => a + x, 0);

/** Play to GAMBLE_OFFER (or BETTING on a loss) with a forced outcome. bets: tier-keyed map. */
function toOffer(g, bets, s1, s2 = null) {
  g.test.setBets(bets);
  g.test.forceNextOutcome({ s1, s2 });
  assert.equal(g.dispatch({ type: 'START' }).ok, true);
  g.dispatch({ type: 'LIGHT1_DONE' });
  g.dispatch({ type: 'RESOLVE_DONE' });
  if (s2) g.dispatch({ type: 'LIGHT2_DONE' });
}

// ------------------------------------------------------------------ E1.5 gamble
test('E1.5 gamble: no gamble without pick; match doubles; mismatch zeroes -> PAYOUT(0)', () => {
  const { g } = newGame();
  toOffer(g, { 20: 5 }, 13);
  assert.equal(g.state.phase, 'GAMBLE_OFFER');
  assert.equal(g.state.round.currentWin, 100);
  assert.equal(g.dispatch({ type: 'GAMBLE_OPEN' }).ok, true);
  assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, false, 'no pick -> rejected');
  g.dispatch({ type: 'PICK', colour: 'white' });
  g.test.forceNextGamble('white');
  assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, true);
  assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, false, 'no gamble during reveal');
  assert.equal(g.dispatch({ type: 'COLLECT' }).ok, false, 'no collect during reveal');
  assert.equal(g.dispatch({ type: 'PICK', colour: 'red' }).ok, false, 'no pick change during reveal');
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.round.currentWin, 200);
  assert.equal(g.state.phase, 'GAMBLE');
  assert.equal(g.state.gamble.pick, 'white', 'pick persists between flips');
  g.dispatch({ type: 'PICK', colour: 'red' });
  g.test.forceNextGamble('white');
  g.dispatch({ type: 'GAMBLE_FLIP' });
  const bal = g.state.balance;
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.round.currentWin, 0);
  assert.equal(g.state.phase, 'PAYOUT');
  assert.equal(g.state.balance, bal, 'PAYOUT(0) credits nothing');
  assert.equal(g.state.round.settled, true);
});

test('E1.5 gamble uses randInt(2) from the injected RNG (fair mapping)', () => {
  const rng = scriptedRng([rOf(13), 5, /*gamble*/ 1]);
  const { g } = newGame({ rng });
  bet(g, 20, 5);
  g.dispatch({ type: 'START' });
  g.dispatch({ type: 'LIGHT1_DONE' });
  g.dispatch({ type: 'RESOLVE_DONE' });
  assert.equal(g.state.round.s1, 13);
  g.dispatch({ type: 'GAMBLE_OPEN' });
  g.dispatch({ type: 'PICK', colour: 'white' });
  g.dispatch({ type: 'GAMBLE_FLIP' });
  assert.equal(g.state.round.gambles[0].result, 'white');
  assert.equal(rng.remaining(), 0);
});

test('E1.5 max 3 gambles; Collect always works', () => {
  const { g } = newGame();
  toOffer(g, { 10: 1 }, 5); // 10
  g.dispatch({ type: 'GAMBLE_OPEN' });
  g.dispatch({ type: 'PICK', colour: 'red' });
  for (let i = 0; i < 3; i++) {
    g.test.forceNextGamble('red');
    assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, true);
    g.dispatch({ type: 'REVEAL_DONE' });
  }
  assert.equal(g.state.round.currentWin, 10 * 8);
  assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, false, '4th gamble rejected');
  assert.equal(g.gambleBlock(), 'max');
  const bal = g.state.balance;
  assert.equal(g.dispatch({ type: 'COLLECT' }).ok, true);
  assert.equal(g.state.balance, bal + 80);
  assert.equal(g.dispatch({ type: 'COLLECT' }).ok, false, 'second collect rejected');
  assert.equal(g.state.balance, bal + 80);
});

test('E1.5 300,000 cap: a win of 300,000 may gamble (-> 600,000); 300,001 is blocked; the cap never truncates', () => {
  const { g } = newGame();
  g.test.setBalance(1000000);
  toOffer(g, { 200: 1 }, 8);
  g.state.round.currentWin = 300000; // white-box: exercise the boundary on the live record
  g.state.round.baseWin = 300000;
  assert.equal(g.gambleBlock(), null);
  g.dispatch({ type: 'GAMBLE_OPEN' });
  g.dispatch({ type: 'PICK', colour: 'red' });
  g.test.forceNextGamble('red');
  g.dispatch({ type: 'GAMBLE_FLIP' });
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.round.currentWin, 600000);
  assert.equal(g.gambleBlock(), 'cap');
  assert.equal(g.dispatch({ type: 'GAMBLE_FLIP' }).ok, false);
  g.dispatch({ type: 'COLLECT' });
  assert.equal(g.state.lastWin.value, 600000);

  const { g: g2 } = newGame();
  g2.test.setBalance(1000000);
  toOffer(g2, { 200: 1 }, 8);
  g2.state.round.currentWin = 300001;
  assert.equal(g2.gambleBlock(), 'cap');
  assert.equal(g2.dispatch({ type: 'GAMBLE_OPEN' }).ok, false);
  assert.equal(g2.dispatch({ type: 'COLLECT' }).ok, true);
  assert.equal(g2.state.lastWin.value, 300001, 'cap does not truncate');
});

test('E1.5 the 200,000 max win (1,000 on 200x) can be gambled once, then the cap blocks it', () => {
  const { g } = newGame();
  g.dispatch({ type: 'SELECT_CHIP', value: 500 });
  bet(g, 200, 2);
  assert.deepEqual(g.state.bets, { 200: 1000 });
  g.test.forceNextOutcome({ s1: 8, s2: 21 }); // the Double Run's second light hits an unbet 100x square
  g.dispatch({ type: 'START' });
  g.dispatch({ type: 'LIGHT1_DONE' });
  g.dispatch({ type: 'RESOLVE_DONE' });
  assert.equal(g.state.phase, 'DOUBLE_RUN');
  g.dispatch({ type: 'LIGHT2_DONE' });
  assert.equal(g.state.round.currentWin, 200000);
  assert.equal(g.gambleBlock(), null);
  g.dispatch({ type: 'GAMBLE_OPEN' });
  g.dispatch({ type: 'PICK', colour: 'red' });
  g.test.forceNextGamble('red');
  g.dispatch({ type: 'GAMBLE_FLIP' });
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.round.currentWin, 400000);
  assert.equal(g.gambleBlock(), 'cap');
  g.dispatch({ type: 'COLLECT' });
  assert.equal(g.state.balance, START_CREDITS - 1000 + 400000);
});

test('E1.5 Double Run on the same tier pays 2 × M × bet; two tiers each pay', () => {
  const { g } = newGame();
  toOffer(g, { 5: 10 }, 1, 6);
  assert.equal(g.state.round.currentWin, 100);
  g.dispatch({ type: 'COLLECT' });
  g.dispatch({ type: 'PAYOUT_DONE' });
  toOffer(g, { 20: 2, 50: 3 }, 13, 3);
  assert.equal(g.state.round.currentWin, 40 + 150);
});

// ------------------------------------------------------------------ E1.6 bets
test('E1.6 per-tier cap 1,000 with clamp + toast; per-round 1,000; remove floor 0', () => {
  const { g } = newGame();
  g.dispatch({ type: 'SELECT_CHIP', value: 500 });
  bet(g, 5, 2);
  assert.equal(g.state.bets[5], 1000);
  const v = g.state.version;
  const res = g.dispatch({ type: 'ADD_BET', tier: 5 });
  assert.equal(res.ok, false, 'room 0 -> no change');
  assert.equal(g.state.bets[5], 1000);
  assert.equal(g.state.toast.text, TOASTS.tier);
  assert.ok(g.state.version > v, 'toast still emitted');
  // round cap across tiers
  const { g: g2 } = newGame();
  g2.dispatch({ type: 'SELECT_CHIP', value: 100 });
  for (const t of [5, 10, 20, 50, 100]) bet(g2, t, 2);
  assert.equal(sum(g2.state.bets), 1000);
  assert.equal(g2.dispatch({ type: 'ADD_BET', tier: 200 }).ok, false);
  assert.equal(g2.state.bets[200], undefined);
  assert.equal(g2.state.toast.text, TOASTS.round);
  // remove floor 0
  g2.dispatch({ type: 'SELECT_CHIP', value: 500 });
  g2.dispatch({ type: 'REMOVE_BET', tier: 5 });
  assert.equal(g2.state.bets[5], undefined);
  assert.equal(g2.dispatch({ type: 'REMOVE_BET', tier: 5 }).ok, false);
  g2.dispatch({ type: 'SELECT_CHIP', value: 50 });
  g2.dispatch({ type: 'REMOVE_BET', tier: 10 });
  assert.equal(g2.state.bets[10], 150);
});

test('E1.6 round cap clamps partial adds (exactly 1,000 across tiers)', () => {
  const { g } = newGame();
  g.dispatch({ type: 'SELECT_CHIP', value: 100 });
  bet(g, 5, 9); // 900
  g.dispatch({ type: 'SELECT_CHIP', value: 500 });
  g.dispatch({ type: 'ADD_BET', tier: 10 }); // room min(1000, 100, …) -> 100
  assert.equal(g.state.bets[10], 100);
  assert.equal(g.state.toast.text, TOASTS.round);
  assert.equal(sum(g.state.bets), 1000);
  assert.equal(g.dispatch({ type: 'START' }).ok, true, 'exactly 1,000 is a valid bet');
  assert.equal(g.state.round.totalBet, 1000);
});

test('E1.6 the 50, 100 and 500 chips add their full value', () => {
  for (const chip of [50, 100, 500]) {
    const { g } = newGame();
    assert.equal(g.dispatch({ type: 'SELECT_CHIP', value: chip }).ok, true);
    bet(g, 20);
    assert.deepEqual(g.state.bets, { 20: chip });
  }
});

test('E1.6/E5 balance limit: balance smaller than the chip; last credit bet', () => {
  const { g } = newGame();
  g.test.setBalance(3);
  g.dispatch({ type: 'SELECT_CHIP', value: 5 });
  g.dispatch({ type: 'ADD_BET', tier: 10 });
  assert.equal(g.state.bets[10], 3);
  assert.equal(g.state.toast.text, TOASTS.credits);
  assert.equal(g.dispatch({ type: 'ADD_BET', tier: 200 }).ok, false);
  // last credit
  const { g: g2 } = newGame();
  g2.test.setBalance(1);
  bet(g2, 10);
  g2.test.forceNextOutcome({ s1: 2 }); // blank
  assert.equal(g2.dispatch({ type: 'START' }).ok, true);
  assert.equal(g2.state.balance, 0);
  g2.dispatch({ type: 'LIGHT1_DONE' });
  g2.dispatch({ type: 'RESOLVE_DONE' });
  assert.equal(g2.state.phase, 'BETTING');
  assert.equal(g2.needsRefill(), true);
});

test('E1.6 Undo stack, Clear, Rebet (incl. unaffordable)', () => {
  const { g } = newGame();
  bet(g, 5);
  g.dispatch({ type: 'SELECT_CHIP', value: 5 });
  bet(g, 10);
  g.dispatch({ type: 'REMOVE_BET', tier: 10 });
  assert.deepEqual(g.state.bets, { 5: 1 });
  g.dispatch({ type: 'UNDO' });
  assert.deepEqual(g.state.bets, { 5: 1, 10: 5 });
  g.dispatch({ type: 'CLEAR' });
  assert.deepEqual(g.state.bets, {});
  g.dispatch({ type: 'UNDO' });
  assert.deepEqual(g.state.bets, { 5: 1, 10: 5 });
  g.dispatch({ type: 'UNDO' });
  g.dispatch({ type: 'UNDO' });
  assert.deepEqual(g.state.bets, {});
  assert.equal(g.dispatch({ type: 'UNDO' }).ok, false);
  assert.equal(g.dispatch({ type: 'REBET' }).ok, false, 'no previous round');
  // play a winning round -> ghosts -> rebet
  toOffer(g, { 50: 5, 20: 2 }, 3);
  g.dispatch({ type: 'COLLECT' });
  g.dispatch({ type: 'PAYOUT_DONE' });
  assert.deepEqual(g.state.bets, {});
  assert.equal(g.state.ghosts, true);
  assert.deepEqual(g.state.lastBets, { 50: 5, 20: 2 });
  assert.equal(g.dispatch({ type: 'REBET' }).ok, true);
  assert.deepEqual(g.state.bets, { 50: 5, 20: 2 });
  assert.equal(g.state.toast.text, TOASTS.restored);
  g.dispatch({ type: 'UNDO' });
  assert.deepEqual(g.state.bets, {});
  g.test.setBalance(6);
  assert.match(g.rebetBlock(), /Not enough credits for last round's 7 bet/);
  assert.equal(g.dispatch({ type: 'REBET' }).ok, false);
});

test('E1.6 loss (blank square) keeps bets live', () => {
  const { g } = newGame();
  bet(g, 10, 3);
  g.test.forceNextOutcome({ s1: 30 });
  g.dispatch({ type: 'START' });
  g.dispatch({ type: 'LIGHT1_DONE' });
  g.dispatch({ type: 'RESOLVE_DONE' });
  assert.equal(g.state.phase, 'BETTING');
  assert.deepEqual(g.state.bets, { 10: 3 });
  assert.equal(g.state.lastWin.kind, 'loss');
  assert.equal(g.state.round.settled, true);
  assert.equal(g.state.round.baseWin, 0);
  assert.equal(g.dispatch({ type: 'START' }).ok, true, 'ready to START again');
});

// ------------------------------------------------------------------ E1.7 transitions
const SAMPLE = {
  SELECT_CHIP: { value: 5 }, ADD_BET: { tier: 20 }, REMOVE_BET: { tier: 20 }, PICK: { colour: 'red' },
  OPEN_INFO: { tab: 'help' }, SET_TAB: { tab: 'help' }, SET_SETTING: { key: 'music', value: 40 }, FAIL: { message: 'x' },
};

function gameIn(phase) {
  const { g, backend } = newGame();
  const go = {
    BETTING: () => {},
    SPINNING: () => { bet(g, 20, 5); g.test.forceNextOutcome({ s1: 13, s2: 17 }); g.dispatch({ type: 'START' }); },
    RESOLVING: () => { go.SPINNING(); g.dispatch({ type: 'LIGHT1_DONE' }); },
    DOUBLE_RUN: () => { go.RESOLVING(); g.dispatch({ type: 'RESOLVE_DONE' }); },
    GAMBLE_OFFER: () => { go.DOUBLE_RUN(); g.dispatch({ type: 'LIGHT2_DONE' }); },
    GAMBLE: () => { go.GAMBLE_OFFER(); g.dispatch({ type: 'GAMBLE_OPEN' }); },
    PAYOUT: () => { go.GAMBLE_OFFER(); g.dispatch({ type: 'COLLECT' }); },
    ERROR: () => { g.dispatch({ type: 'FAIL', message: 'boom' }); },
    RECOVERY: () => { go.SPINNING(); g.init(); },
  };
  go[phase]();
  assert.equal(g.state.phase, phase);
  return { g, backend };
}

test('E1.7 table-driven: every action not in ACCEPTS[phase] is rejected with no state change', () => {
  for (const phase of PHASES.filter((p) => p !== 'INIT')) {
    for (const type of ACTIONS) {
      if (ACCEPTS[phase].includes(type) || type === 'FAIL') continue;
      const { g, backend } = gameIn(phase);
      const before = JSON.stringify({ s: { ...g.state, version: 0, toast: null }, d: backend.dump() });
      const res = g.dispatch({ type, ...(SAMPLE[type] || {}) });
      assert.equal(res.ok, false, `${type} should be rejected in ${phase}`);
      const after = JSON.stringify({ s: { ...g.state, version: 0, toast: null }, d: backend.dump() });
      assert.equal(after, before, `${type} changed state in ${phase}`);
    }
  }
});

test('E1.7 every valid transition of the flow', () => {
  // BETTING -> SPINNING -> RESOLVING -> DOUBLE_RUN -> GAMBLE_OFFER -> GAMBLE -> GAMBLE -> PAYOUT -> BETTING
  const { g } = gameIn('GAMBLE');
  assert.equal(g.state.round.currentWin, 200, 'both lights on 20x: 2 × 20 × 5');
  g.dispatch({ type: 'PICK', colour: 'red' });
  g.test.forceNextGamble('red');
  g.dispatch({ type: 'GAMBLE_FLIP' });
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.phase, 'GAMBLE');
  g.dispatch({ type: 'COLLECT' });
  assert.equal(g.state.phase, 'PAYOUT');
  g.dispatch({ type: 'PAYOUT_DONE' });
  assert.equal(g.state.phase, 'BETTING');
  // RESOLVING -> GAMBLE_OFFER directly (no DR)
  const { g: g2 } = newGame();
  toOffer(g2, { 20: 1 }, 13);
  assert.equal(g2.state.phase, 'GAMBLE_OFFER');
  // DOUBLE_RUN -> BETTING (loss on two blanks)
  const { g: g3 } = newGame();
  bet(g3, 5);
  g3.test.forceNextOutcome({ s1: 2, s2: 4 });
  g3.dispatch({ type: 'START' });
  g3.dispatch({ type: 'LIGHT1_DONE' });
  g3.dispatch({ type: 'RESOLVE_DONE' });
  assert.equal(g3.state.phase, 'DOUBLE_RUN');
  g3.dispatch({ type: 'LIGHT2_DONE' });
  assert.equal(g3.state.phase, 'BETTING');
  // ERROR -> INIT -> BETTING via RELOAD; info modal open/close
  const { g: g4 } = gameIn('ERROR');
  g4.dispatch({ type: 'RELOAD' });
  assert.equal(g4.state.phase, 'BETTING');
  g4.dispatch({ type: 'OPEN_INFO', tab: 'settings' });
  assert.equal(g4.dispatch({ type: 'ADD_BET', tier: 5 }).ok, false, 'no betting under a modal');
  g4.dispatch({ type: 'SET_TAB', tab: 'help' });
  assert.equal(g4.state.info, 'help');
  g4.dispatch({ type: 'CLOSE_INFO' });
  assert.equal(g4.state.info, null);
  // FAIL from any state
  for (const p of ['BETTING', 'SPINNING', 'GAMBLE', 'PAYOUT', 'RECOVERY']) {
    const { g: gx } = gameIn(p);
    gx.dispatch({ type: 'FAIL', message: 'x' });
    assert.equal(gx.state.phase, 'ERROR');
  }
});

test('E1.7 invalid inputs rejected (non-tiers, square-keyed actions, bad chips)', () => {
  const { g } = newGame();
  for (const tier of [0, 1, 8, 24, 1920, 5.5, '5', null, undefined]) assert.equal(g.dispatch({ type: 'ADD_BET', tier }).ok, false, String(tier));
  assert.equal(g.dispatch({ type: 'ADD_BET', square: 1 }).ok, false, 'the engine takes tiers, not squares');
  for (const value of [2, 250, 1000, '5', 0]) assert.equal(g.dispatch({ type: 'SELECT_CHIP', value }).ok, false, String(value));
  assert.equal(g.dispatch({ type: 'NOPE' }).ok, false);
  assert.equal(g.dispatch({ type: 'SET_SETTING', key: 'music', value: 40 }).ok, false, 'settings need the modal');
  g.dispatch({ type: 'OPEN_INFO', tab: 'settings' });
  assert.equal(g.dispatch({ type: 'SET_SETTING', key: 'music', value: 101 }).ok, false);
  assert.equal(g.dispatch({ type: 'SET_SETTING', key: 'music', value: 2.5 }).ok, false);
  assert.equal(g.dispatch({ type: 'SET_SETTING', key: 'turbo', value: true }).ok, false, 'no turbo setting');
  assert.deepEqual(g.state.bets, {});
});

test('E1.7 duplicate START/Collect/Gamble/Refill/Continue in the same tick -> exactly one effect', () => {
  const { g } = newGame();
  bet(g, 20, 5);
  g.test.forceNextOutcome({ s1: 13 });
  const r = [g.dispatch({ type: 'START' }), g.dispatch({ type: 'START' })];
  assert.deepEqual(r.map((x) => x.ok), [true, false]);
  assert.equal(g.state.balance, START_CREDITS - 5);
  g.dispatch({ type: 'LIGHT1_DONE' });
  g.dispatch({ type: 'RESOLVE_DONE' });
  const gm = [g.dispatch({ type: 'GAMBLE_OPEN' }), g.dispatch({ type: 'GAMBLE_OPEN' })];
  assert.deepEqual(gm.map((x) => x.ok), [true, false]);
  g.dispatch({ type: 'PICK', colour: 'red' });
  const fl = [g.dispatch({ type: 'GAMBLE_FLIP' }), g.dispatch({ type: 'GAMBLE_FLIP' })];
  assert.deepEqual(fl.map((x) => x.ok), [true, false]);
  assert.equal(g.state.round.gambles.length, 1);
  g.state.round.gambles[0].result = 'red'; // force a match for the collect check
  g.dispatch({ type: 'REVEAL_DONE' });
  const c = [g.dispatch({ type: 'COLLECT' }), g.dispatch({ type: 'COLLECT' })];
  assert.deepEqual(c.map((x) => x.ok), [true, false]);
  assert.equal(g.state.balance, START_CREDITS - 5 + 200);
  // refill
  const { g: g2 } = newGame();
  g2.test.setBalance(0);
  const rf = [g2.dispatch({ type: 'REFILL' }), g2.dispatch({ type: 'REFILL' })];
  assert.deepEqual(rf.map((x) => x.ok), [true, false]);
  assert.equal(g2.state.balance, 10000);
  // continue
  const { g: g3 } = gameIn('RECOVERY');
  const ct = [g3.dispatch({ type: 'CONTINUE' }), g3.dispatch({ type: 'CONTINUE' })];
  assert.deepEqual(ct.map((x) => x.ok), [true, false]);
});

test('E1.7 event.repeat is ignored for every action key', () => {
  const ctxs = [
    { phase: 'BETTING' }, { phase: 'GAMBLE_OFFER' }, { phase: 'GAMBLE' }, { phase: 'RECOVERY' }, { phase: 'ERROR' },
    { phase: 'BETTING', refill: true },
  ];
  for (const ctx of ctxs) {
    for (const key of [' ', 'Enter', 'g', 'G', 'r', 'w', 'c', 'z', '1', '5', 'm', 'Backspace']) {
      assert.equal(mapKey({ key, repeat: true }, { ...ctx, focus: { kind: 'square', square: 3 } }), null, `${key} ${ctx.phase}`);
    }
  }
  assert.deepEqual(mapKey({ key: ' ', repeat: false }, { phase: 'BETTING', focus: { kind: null } }).action, { type: 'START' });
});

test('E1.7/B8 key map: G gamble, Enter collect, R/W pick in modal, Space activates focused control', () => {
  // the v3 key map still names squares; the UI adapter (src/ui/adapter.js) turns them into tier bets
  assert.deepEqual(mapKey({ key: 'g' }, { phase: 'GAMBLE_OFFER' }).action, { type: 'GAMBLE_OPEN' });
  assert.deepEqual(mapKey({ key: 'Enter' }, { phase: 'GAMBLE_OFFER' }).action, { type: 'COLLECT' });
  assert.deepEqual(mapKey({ key: 'r' }, { phase: 'GAMBLE' }).action, { type: 'PICK', colour: 'red' });
  assert.deepEqual(mapKey({ key: 'ArrowRight' }, { phase: 'GAMBLE' }).action, { type: 'PICK', colour: 'white' });
  assert.deepEqual(mapKey({ key: 'Enter' }, { phase: 'GAMBLE', focus: { kind: 'button' } }).action, { type: 'COLLECT' });
  assert.deepEqual(mapKey({ key: ' ' }, { phase: 'GAMBLE', focus: { kind: 'button' } }), { kind: 'activate' });
  assert.deepEqual(mapKey({ key: 'r' }, { phase: 'BETTING' }).action, { type: 'REBET' });
  assert.deepEqual(mapKey({ key: ' ' }, { phase: 'BETTING', focus: { kind: 'chip' } }), { kind: 'activate' });
  assert.deepEqual(mapKey({ key: ' ' }, { phase: 'BETTING', focus: { kind: 'square', square: 4 } }).action, { type: 'START' });
  assert.deepEqual(mapKey({ key: 'Backspace' }, { phase: 'BETTING', focus: { kind: 'square', square: 4 } }).action, { type: 'REMOVE_BET', square: 4 });
  assert.equal(mapKey({ key: 'Escape' }, { phase: 'GAMBLE' }), null, 'Esc never closes the gamble modal');
  assert.deepEqual(mapKey({ key: 'Escape' }, { phase: 'BETTING', info: 'help' }).action, { type: 'CLOSE_INFO' });
  assert.equal(mapKey({ key: ' ' }, { phase: 'SPINNING' }), null);
  assert.deepEqual(mapKey({ key: 'm' }, { phase: 'SPINNING' }).action, { type: 'TOGGLE_MUTE' });
});

// ------------------------------------------------------------------ E1.8 recovery
function reload(backend, seed = 999) {
  // a "reload" is a brand new engine on the same storage, with a different RNG so any redraw would show
  return newGame({ backend, seed }).g;
}

function snapshotOutcome(r) {
  return JSON.stringify({ s1: r.s1, s2: r.s2, dr: r.doubleRun, base: r.baseWin, g: r.gambles });
}

test('E1.8 reload at every phase restores the same outcome, no redraw, no double credit', () => {
  const stages = ['SPINNING', 'RESOLVING', 'DOUBLE_RUN', 'GAMBLE_OFFER', 'GAMBLE_BEFORE_DRAW', 'GAMBLE_AFTER_DRAW', 'PAYOUT_BEFORE_CREDIT', 'PAYOUT_AFTER_CREDIT'];
  const B = START_CREDITS - 7;
  for (const stage of stages) {
    const { g, backend } = newGame();
    bet(g, 20, 5);
    bet(g, 50, 2);
    g.test.forceNextOutcome({ s1: 13, s2: 3 }); // 20x (5 × 20) + 50x (2 × 50) = 200
    g.dispatch({ type: 'START' });
    const outcome = snapshotOutcome(g.state.round);
    assert.equal(g.state.balance, B);
    assert.equal(g.state.round.baseWin, 200);
    const steps = {
      SPINNING: [],
      RESOLVING: ['LIGHT1_DONE'],
      DOUBLE_RUN: ['LIGHT1_DONE', 'RESOLVE_DONE'],
      GAMBLE_OFFER: ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE'],
      GAMBLE_BEFORE_DRAW: ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE', 'GAMBLE_OPEN'],
      GAMBLE_AFTER_DRAW: ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE', 'GAMBLE_OPEN', 'PICK', 'GAMBLE_FLIP'],
      PAYOUT_BEFORE_CREDIT: ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE'],
      PAYOUT_AFTER_CREDIT: ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE', 'COLLECT'],
    }[stage];
    for (const t of steps) g.dispatch(t === 'PICK' ? { type: 'PICK', colour: 'red' } : { type: t });
    if (stage === 'PAYOUT_BEFORE_CREDIT') {
      // simulate a crash right after the PAYOUT phase write, before the credit write
      const r = JSON.parse(backend.getItem(KEYS.round));
      r.phase = 'PAYOUT';
      backend.setItem(KEYS.round, JSON.stringify(r));
    }
    const storedOutcome = snapshotOutcome(JSON.parse(backend.getItem(KEYS.round)));
    const g2 = reload(backend);
    if (stage === 'PAYOUT_AFTER_CREDIT') {
      assert.equal(g2.state.phase, 'BETTING', 'settled round is not recovered');
      assert.equal(g2.state.balance, B + 200);
      continue;
    }
    assert.equal(g2.state.phase, 'RECOVERY', stage);
    assert.equal(g2.state.balance, B, `${stage}: bet already deducted, not refunded`);
    assert.equal(snapshotOutcome(g2.state.round), storedOutcome);
    assert.equal(JSON.parse(storedOutcome).s1, JSON.parse(outcome).s1);
    g2.dispatch({ type: 'CONTINUE' });
    assert.equal(snapshotOutcome(g2.state.round), storedOutcome, `${stage}: no redraw`);
    assert.equal(g2.state.history.filter((h) => h.roundId === g2.state.round.roundId).length, 1, 'one history entry');
    if (stage === 'GAMBLE_AFTER_DRAW') {
      assert.equal(g2.state.phase, 'GAMBLE');
      assert.equal(g2.state.gamble.revealing, true, 'stored result is revealed');
      const res = g2.state.round.gambles[0].result;
      g2.dispatch({ type: 'REVEAL_DONE' });
      assert.equal(g2.state.round.currentWin, res === 'red' ? 400 : 0);
      if (res !== 'red') {
        assert.equal(g2.state.phase, 'PAYOUT');
        assert.equal(g2.state.balance, B);
        continue;
      }
    }
    if (stage === 'PAYOUT_BEFORE_CREDIT') {
      assert.equal(g2.state.phase, 'PAYOUT');
      assert.equal(g2.state.balance, B + 200, 'credited exactly once on recovery');
      const g3 = reload(backend, 7);
      assert.equal(g3.state.phase, 'BETTING');
      assert.equal(g3.state.balance, B + 200, 'no double credit after another reload');
      continue;
    }
    if (g2.state.phase === 'GAMBLE') g2.dispatch({ type: 'COLLECT' });
    else {
      assert.equal(g2.state.phase, 'GAMBLE_OFFER', stage);
      g2.dispatch({ type: 'COLLECT' });
    }
    const expected = B + g2.state.round.currentWin;
    assert.equal(g2.state.balance, expected);
    const g3 = reload(backend, 5);
    assert.equal(g3.state.balance, expected, 'no double credit');
    assert.equal(g3.state.phase, 'BETTING');
  }
});

test('E1.8 crash between round write and balance write keeps balance consistent (seq rule)', () => {
  const { g, backend } = newGame();
  const balRaw = backend.getItem(KEYS.balance);
  bet(g, 20, 5);
  g.test.forceNextOutcome({ s1: 1 });
  g.dispatch({ type: 'START' });
  backend.setItem(KEYS.balance, balRaw); // the balance write "never happened"
  const g2 = reload(backend);
  assert.equal(g2.state.balance, START_CREDITS - 5, 'round record carries the deducted balance');
  assert.equal(g2.state.phase, 'RECOVERY');
});

test('E1.8 corrupt storage -> ERROR -> Reload resets ONLY the corrupt key', () => {
  for (const key of [KEYS.round, KEYS.history, KEYS.lastBets, KEYS.settings]) {
    const { g, backend } = newGame();
    toOffer(g, { 20: 5 }, 13);
    g.dispatch({ type: 'COLLECT' });
    g.dispatch({ type: 'PAYOUT_DONE' });
    const good = backend.dump();
    backend.setItem(key, key === KEYS.round ? '{"roundId":"x","bets":{"99":5}}' : '{not json');
    const g2 = reload(backend);
    assert.equal(g2.state.phase, 'ERROR', key);
    assert.equal(g2.state.error.key, key);
    g2.dispatch({ type: 'RELOAD' });
    assert.equal(g2.state.phase, 'BETTING', key);
    const after = backend.dump();
    assert.equal(after[key], undefined, `${key} removed`);
    for (const k of Object.values(KEYS)) if (k !== key && k !== KEYS.balance) assert.equal(after[k], good[k], `${k} untouched`);
    assert.equal(g2.state.balance, START_CREDITS - 5 + 100);
  }
  // tampered-but-parseable round (outcome inconsistent with win) is rejected too
  const { g, backend } = newGame();
  bet(g, 20, 5);
  g.dispatch({ type: 'START' });
  const r = JSON.parse(backend.getItem(KEYS.round));
  r.baseWin = 999999;
  r.currentWin = 999999;
  backend.setItem(KEYS.round, JSON.stringify(r));
  assert.equal(reload(backend).state.phase, 'ERROR');
});

test('E1.8 stored last bets: unknown (square-keyed) keys are dropped, a bad tier amount is corrupt', () => {
  const { g } = newGame({ backend: memoryBackend({ [KEYS.lastBets]: '{"12":5,"27":1}' }) });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.lastBets, null, 'nothing left -> no last bets');
  const { g: g2 } = newGame({ backend: memoryBackend({ [KEYS.lastBets]: '{"20":5,"27":1}' }) });
  assert.deepEqual(g2.state.lastBets, { 20: 5 });
  const { g: g3 } = newGame({ backend: memoryBackend({ [KEYS.lastBets]: '{"20":1001}' }) });
  assert.equal(g3.state.phase, 'ERROR');
  assert.equal(g3.state.error.key, KEYS.lastBets);
});

test('E1.8 a stored round with square-keyed (v3) bets is rejected as corrupt', () => {
  const { g, backend } = newGame();
  bet(g, 20, 5);
  g.test.forceNextOutcome({ s1: 13 });
  g.dispatch({ type: 'START' });
  const r = JSON.parse(backend.getItem(KEYS.round));
  r.bets = { 13: 5 };
  backend.setItem(KEYS.round, JSON.stringify(r));
  const g2 = reload(backend);
  assert.equal(g2.state.phase, 'ERROR');
  assert.equal(g2.state.error.key, KEYS.round);
});

test('E1.8 unreadable balance falls back to 10,000 and is logged', () => {
  const backend = memoryBackend({ [KEYS.balance]: '"lots"' });
  const { g } = newGame({ backend });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.balance, 10000);
  assert.ok(g.state.log.some((l) => /balance unreadable/.test(l.msg)));
});

test('E1.8 storage write failure during play -> ERROR, pending round recoverable', () => {
  const inner = memoryBackend();
  let failNext = false;
  const backend = { ...inner, setItem: (k, v) => { if (failNext && k === KEYS.round) throw new Error('quota'); inner.setItem(k, v); } };
  const { g } = newGame({ backend });
  bet(g, 20, 5);
  g.test.forceNextOutcome({ s1: 13 });
  g.dispatch({ type: 'START' });
  failNext = true;
  g.dispatch({ type: 'LIGHT1_DONE' });
  assert.equal(g.state.phase, 'ERROR');
  failNext = false;
  const g2 = newGame({ backend: inner, seed: 4 }).g;
  assert.equal(g2.state.phase, 'RECOVERY');
  g2.dispatch({ type: 'CONTINUE' });
  assert.equal(g2.state.round.currentWin, 100);
});

test('E5 storage unavailable -> in-memory play with a "Progress won\'t be saved" toast', () => {
  const { g } = newGame({ persistent: false });
  assert.equal(g.state.phase, 'BETTING');
  assert.equal(g.state.toast.text, TOASTS.noSave);
  bet(g, 5);
  assert.equal(g.dispatch({ type: 'START' }).ok, true);
});

test('records written to storage always validate', () => {
  const { g, backend } = newGame({ seed: 77 });
  for (let i = 0; i < 300; i++) {
    if (g.state.phase === 'BETTING') {
      if (g.needsRefill()) g.dispatch({ type: 'REFILL' });
      if (!Object.keys(g.state.bets).length) g.dispatch(g.rebetBlock() ? { type: 'ADD_BET', tier: TIERS[i % 6] } : { type: 'REBET' });
      g.dispatch({ type: 'START' });
    }
    for (const t of ['LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE']) g.dispatch({ type: t });
    if (g.state.phase === 'GAMBLE_OFFER') {
      if (i % 2) g.dispatch({ type: 'COLLECT' });
      else {
        g.dispatch({ type: 'GAMBLE_OPEN' });
        g.dispatch({ type: 'PICK', colour: 'red' });
        g.dispatch({ type: 'GAMBLE_FLIP' });
        g.dispatch({ type: 'REVEAL_DONE' });
        if (g.state.phase === 'GAMBLE') g.dispatch({ type: 'COLLECT' });
      }
    }
    if (g.state.phase === 'PAYOUT') g.dispatch({ type: 'PAYOUT_DONE' });
    const raw = backend.getItem(KEYS.round);
    if (raw) assert.ok(validRound(JSON.parse(raw)), raw);
    assert.ok(g.state.balance >= 0);
  }
});

// ------------------------------------------------------------------ E1.9 refill
test('E1.9 refill only when balance < 1 and no pending round; exactly 10,000; unlimited', () => {
  const { g } = newGame();
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, false, 'balance 10,000');
  g.test.setBalance(1);
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, false, 'balance 1');
  g.test.setBalance(0);
  assert.equal(g.needsRefill(), true);
  assert.equal(g.dispatch({ type: 'ADD_BET', tier: 5 }).ok, false, 'refill modal blocks betting');
  assert.equal(g.dispatch({ type: 'OPEN_INFO', tab: 'help' }).ok, false);
  assert.equal(g.dispatch({ type: 'REFILL' }).ok, true);
  assert.equal(g.state.balance, 10000);
  for (let i = 0; i < 5; i++) {
    g.test.setBalance(0);
    assert.equal(g.dispatch({ type: 'REFILL' }).ok, true, 'unlimited, no cooldown');
    assert.equal(g.state.balance, 10000);
  }
  // pending round with balance 0: no refill until it is settled
  const { g: g2, backend } = newGame();
  g2.test.setBalance(5);
  bet(g2, 20, 5);
  g2.test.forceNextOutcome({ s1: 13 });
  g2.dispatch({ type: 'START' });
  assert.equal(g2.state.balance, 0);
  assert.equal(g2.dispatch({ type: 'REFILL' }).ok, false, 'round pending');
  const g3 = reload(backend);
  assert.equal(g3.state.phase, 'RECOVERY');
  assert.equal(g3.needsRefill(), false);
  assert.equal(g3.dispatch({ type: 'REFILL' }).ok, false);
  g3.dispatch({ type: 'CONTINUE' });
  g3.dispatch({ type: 'COLLECT' });
  assert.equal(g3.state.balance, 100);
  g3.dispatch({ type: 'PAYOUT_DONE' });
  assert.equal(g3.needsRefill(), false);
});

test('E1.9 refill persists across reload', () => {
  const { g, backend } = newGame();
  g.test.setBalance(0);
  g.dispatch({ type: 'REFILL' });
  assert.equal(reload(backend).state.balance, 10000);
});

// ------------------------------------------------------------------ E5 edge cases
test('E5 Double Run where s2 is an unbet tier; history = ONE entry per round; settled once', () => {
  const { g } = newGame();
  toOffer(g, { 10: 5 }, 24, 13);
  assert.equal(g.state.round.currentWin, 50);
  assert.equal(g.state.history.length, 1);
  assert.deepEqual([g.state.history[0].s1, g.state.history[0].s2], [24, 13]);
  g.dispatch({ type: 'GAMBLE_OPEN' });
  g.dispatch({ type: 'PICK', colour: 'red' });
  g.test.forceNextGamble('red');
  g.dispatch({ type: 'GAMBLE_FLIP' });
  g.dispatch({ type: 'REVEAL_DONE' });
  assert.equal(g.state.history.length, 1, 'gambles add no history entry');
});

test('E5 history capped at 50 in storage', () => {
  const { g, backend } = newGame();
  bet(g, 5);
  for (let i = 0; i < 60; i++) {
    g.test.forceNextOutcome({ s1: 2 });
    g.dispatch({ type: 'START' });
    g.dispatch({ type: 'LIGHT1_DONE' });
    g.dispatch({ type: 'RESOLVE_DONE' });
  }
  assert.equal(g.state.history.length, 50);
  assert.equal(JSON.parse(backend.getItem(KEYS.history)).length, 50);
});

test('E5 START rejected (toast) when kept bets exceed the balance', () => {
  const { g } = newGame();
  g.dispatch({ type: 'SELECT_CHIP', value: 10 });
  bet(g, 5);
  bet(g, 10);
  g.test.setBalance(15);
  assert.equal(g.dispatch({ type: 'START' }).ok, false);
  assert.equal(g.state.toast.text, TOASTS.credits);
  assert.equal(g.state.balance, 15);
});
