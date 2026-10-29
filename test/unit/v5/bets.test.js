// v5 §6 bets: limits, chips, balance, undo/clear (dev spec §2.3, §5.4). Skipped until batch 2.
// Bets are keyed by tier (5, 10, 20, 50, 100, 200). API names follow the v3 bets.js with `square` → `tier`.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

const SKIP = { skip: 'v5 batch 2' };
const bets = () => import('../../../src/engine/bets.js');

test('bets: isTier accepts the six tiers only', SKIP, async () => {
  const { isTier } = await bets();
  for (const t of C.TIERS) assert.equal(isTier(t), true, `${t}`);
  for (const x of [0, 1, 8, 24, 1920, '5', 5.5, null, undefined]) assert.equal(isTier(x), false, String(x));
});

test('bets: 1,000 on one tier is accepted, the 1,001st credit is refused with the tier toast', SKIP, async () => {
  const { addChip, totalOf } = await bets();
  let b = {};
  for (let i = 0; i < 2; i++) b = addChip(b, 200, 500, 1e6).bets;
  assert.equal(b[200], 1000);
  const r = addChip(b, 200, 1, 1e6);
  assert.equal(r.added, 0);
  assert.equal(r.toast, C.TOASTS.tier);
  assert.equal(totalOf(r.bets), 1000);
});

test('bets: 1,000 per round across tiers; over the round limit shows the round toast', SKIP, async () => {
  const { addChip, totalOf } = await bets();
  let b = {};
  for (const t of [5, 10, 20, 50]) b = addChip(b, t, 250, 1e6).bets;
  assert.equal(totalOf(b), 1000);
  const r = addChip(b, 100, 1, 1e6);
  assert.equal(r.added, 0);
  assert.equal(r.toast, C.TOASTS.round);
});

test('bets: the 50, 100 and 500 chips add their full value (v3 bug: capped at 10)', SKIP, async () => {
  const { addChip } = await bets();
  for (const chip of [50, 100, 500]) {
    const r = addChip({}, 5, chip, 1e6);
    assert.equal(r.added, chip, `chip ${chip}`);
    assert.equal(r.bets[5], chip);
    assert.equal(r.toast, null);
  }
});

test('bets: a chip is clamped to the room left and shows the matching toast', SKIP, async () => {
  const { addChip } = await bets();
  const r = addChip({ 10: 900 }, 10, 500, 1e6);
  assert.equal(r.added, 100);
  assert.equal(r.bets[10], 1000);
  assert.equal(r.toast, C.TOASTS.tier);
});

test('bets: a bet above the balance is refused with the credits toast', SKIP, async () => {
  const { addChip } = await bets();
  const r = addChip({ 5: 20 }, 10, 25, 30);
  assert.ok(r.added <= 10);
  assert.equal(r.toast, C.TOASTS.credits);
});

test('bets: validation is all-integer and drops unknown keys', SKIP, async () => {
  const { validBets } = await bets();
  assert.ok(validBets({ 5: 10, 200: 1 }));
  assert.equal(validBets({ 5: 1.5 }), null);
  assert.equal(validBets({ 5: -1 }), null);
  assert.equal(validBets({ 5: 1001 }), null);
  assert.deepEqual(validBets({ 5: 10, 8: 3, 24: 1 }), { 5: 10 }, 'square or v3-tier keys are dropped');
});

test('bets: undo and clear in the game', SKIP, async () => {
  const { newGame } = await import('../helpers.js');
  const { g } = newGame();
  g.dispatch({ type: 'SELECT_CHIP', value: 100 });
  g.dispatch({ type: 'ADD_BET', tier: 50 });
  g.dispatch({ type: 'SELECT_CHIP', value: 5 });
  g.dispatch({ type: 'ADD_BET', tier: 5 });
  assert.deepEqual({ ...g.state.bets }, { 50: 100, 5: 5 });
  g.dispatch({ type: 'UNDO' });
  assert.deepEqual({ ...g.state.bets }, { 50: 100 });
  g.dispatch({ type: 'CLEAR' });
  assert.deepEqual({ ...g.state.bets }, {});
  assert.equal(g.state.balance, C.START_CREDITS);
});
