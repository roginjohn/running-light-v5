// v5 §6 config invariants (dev spec §2.1, §5.1). Unskipped in batch 2 (Math C config).
// Engine modules are imported inside each test (kept from batch 1, when the file loaded against the v3 engine).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';
const config = () => import('../../../src/engine/config.js');

test('config: tiers, counts, weights and total weight match MATH-SPEC-C', async () => {
  const E = await config();
  assert.deepEqual([...E.TIERS], [...C.TIERS]);
  assert.deepEqual({ ...E.COUNT_BY_TIER }, { ...C.COUNT_BY_TIER });
  assert.deepEqual({ ...E.WEIGHT_BY_TIER }, { ...C.WEIGHT_BY_TIER });
  assert.equal(E.BLANK_COUNT, C.BLANK_COUNT);
  assert.equal(E.BLANK_WEIGHT, C.BLANK_WEIGHT);
  assert.equal(E.TOTAL_WEIGHT, C.TOTAL_WEIGHT);
});

test('config: layout, BLANK_SQUARES, MULT and WEIGHTS match MATH-SPEC-C §3', async () => {
  const E = await config();
  for (const t of C.TIERS) assert.deepEqual([...E.SQUARES_BY_TIER[t]], [...C.SQUARES_BY_TIER[t]], `${t}x`);
  assert.deepEqual([...E.BLANK_SQUARES], [...C.BLANK_SQUARES]);
  for (let n = 1; n <= 50; n++) {
    assert.equal(E.MULT[n], C.MULT[n], `MULT[${n}]`);
    assert.equal(E.WEIGHTS[n], C.WEIGHTS[n], `WEIGHTS[${n}]`);
  }
});

test('config: chips, limits, credits, gamble and Double Run constants', async () => {
  const E = await config();
  assert.deepEqual([...E.CHIPS], [...C.CHIPS]);
  assert.equal(E.MAX_PER_TIER, C.MAX_PER_TIER);
  assert.equal(E.MAX_PER_SQUARE, undefined, 'MAX_PER_SQUARE is removed');
  assert.equal(E.MAX_PER_ROUND, C.MAX_PER_ROUND);
  assert.equal(E.START_CREDITS, C.START_CREDITS);
  assert.equal(E.REFILL_AMOUNT, C.REFILL_AMOUNT);
  assert.equal(E.GAMBLE_CAP, C.GAMBLE_CAP);
  assert.equal(E.MAX_GAMBLES, C.MAX_GAMBLES);
  assert.equal(E.DOUBLE_RUN_ONE_IN, C.DOUBLE_RUN_ONE_IN);
  assert.equal(E.DEFAULT_CHIP, C.DEFAULT_CHIP);
  assert.equal(E.MIN_BET, C.MIN_BET);
});

test('config: limit toasts name the v5 limits', async () => {
  const E = await config();
  assert.equal(E.TOASTS.tier, C.TOASTS.tier);
  assert.equal(E.TOASTS.round, C.TOASTS.round);
  assert.equal(E.TOASTS.credits, C.TOASTS.credits);
  assert.equal(E.TOASTS.noSave, C.TOASTS.noSave);
});

test('config: assertConfig passes; pStopTier is count × weight / 10476', async () => {
  const E = await config();
  assert.equal(E.assertConfig(), true);
  for (const t of C.TIERS) {
    assert.equal(E.pStopTier(t), C.pStopTier(t), `${t}x`);
    assert.ok(E.pRoundTier(t) > E.pStopTier(t), `${t}x: Double Run makes a round hit slightly more often`);
  }
});

test('config: assertArrangement accepts "blank" labels and rejects a wrong layout', async () => {
  const E = await config();
  const arr = Array.from({ length: 50 }, (_, i) => (C.MULT[i + 1] ? C.MULT[i + 1] : 'blank'));
  assert.equal(E.assertArrangement(arr), true);
  const bad = arr.slice();
  [bad[0], bad[1]] = [bad[1], bad[0]];
  assert.throws(() => E.assertArrangement(bad));
});
