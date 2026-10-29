// v5 §6 settlement: blank, same tier, two tiers, 200,000 max (dev spec §2.4, §5.5). Unskipped in batch 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';
const outcome = () => import('../../../src/engine/outcome.js');
const ALL = { 5: 10, 10: 10, 20: 10, 50: 10, 100: 10, 200: 10 };

test('settlement: a blank square pays 0, on one light and on both', async () => {
  const { payout } = await outcome();
  for (const n of C.BLANK_SQUARES) assert.equal(payout(ALL, n), 0, `square ${n}`);
  assert.equal(payout(ALL, 2, 4), 0);
});

test('settlement: one light pays M × bet on its tier only', async () => {
  const { payout } = await outcome();
  for (const t of C.TIERS) for (const n of C.SQUARES_BY_TIER[t]) {
    assert.equal(payout({ [t]: 7 }, n), 7 * t, `${t}x square ${n}`);
    const other = C.TIERS.find((u) => u !== t);
    assert.equal(payout({ [other]: 7 }, n), 0, `${t}x square ${n}, bet on ${other}x`);
  }
});

test('settlement: two lights on the same tier pay 2 × M × bet', async () => {
  const { payout } = await outcome();
  assert.equal(payout({ 5: 10 }, 1, 6), 2 * 5 * 10);
  assert.equal(payout({ 100: 3 }, 21, 46), 2 * 100 * 3);
});

test('settlement: two different tiers each pay; a blank plus a tier pays the tier', async () => {
  const { payout } = await outcome();
  assert.equal(payout(ALL, 8, 21), 200 * 10 + 100 * 10);
  assert.equal(payout({ 20: 4 }, 2, 13), 20 * 4);
  assert.equal(payout({ 20: 4 }, 13, 2), 20 * 4);
});

test('settlement: the maximum single-round win is 200,000', async () => {
  const { payout } = await outcome();
  const max = { 200: 1000 };
  let best = 0;
  for (let i = 1; i <= 50; i++) for (let j = 1; j <= 50; j++) if (i !== j) best = Math.max(best, payout(max, i, j));
  assert.equal(best, C.MAX_WIN);
  let bestAny = 0;
  for (const t of C.TIERS) for (let i = 1; i <= 50; i++) for (let j = 1; j <= 50; j++) {
    if (i !== j) bestAny = Math.max(bestAny, payout({ [t]: 1000 }, i, j));
  }
  assert.equal(bestAny, C.MAX_WIN);
});

test('settlement: the result lists each light (square, tier or blank, amount) and the total', async () => {
  const { winParts } = await outcome();
  const r = winParts({ 5: 10, 200: 2 }, 8, 2);
  assert.deepEqual(r.lights, [
    { square: 8, tier: 200, amount: 400 },
    { square: 2, tier: 'blank', amount: 0 },
  ]);
  assert.equal(r.total, 400);
  const same = winParts({ 5: 10 }, 1, 6);
  assert.equal(same.total, 100);
  assert.deepEqual(same.lights.map((l) => l.amount), [50, 50]);
});
