// v5 batch 1: the Math C fixture is consistent with itself and with MATH-SPEC-C. Not skipped; no src/engine import.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

/** |shown − exact| is at most half a unit of the last decimal shown. */
function roundsTo(shown, exact) {
  const dp = (shown.split('.')[1] || '').length;
  return Math.abs(Number(shown) - exact) <= 0.5 * 10 ** -dp + 1e-9;
}

test('fixture: tiers plus blanks cover squares 1–50 exactly once (30 tier + 20 blank)', () => {
  const all = [...C.TIERS.flatMap((t) => C.SQUARES_BY_TIER[t]), ...C.BLANK_SQUARES].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 50 }, (_, i) => i + 1));
  assert.equal(C.TIERS.flatMap((t) => C.SQUARES_BY_TIER[t]).length, C.TIER_SQUARE_COUNT);
  assert.equal(C.BLANK_SQUARES.length, C.BLANK_COUNT);
  assert.equal(C.TIER_SQUARE_COUNT + C.BLANK_COUNT, C.NUM_SQUARES);
});

test('fixture: counts match the square lists, lists are sorted, 200x is square 8 only', () => {
  for (const t of C.TIERS) {
    const sq = C.SQUARES_BY_TIER[t];
    assert.equal(sq.length, C.COUNT_BY_TIER[t], `${t}x`);
    assert.deepEqual([...sq].sort((a, b) => a - b), [...sq], `${t}x sorted`);
  }
  assert.deepEqual([...C.BLANK_SQUARES].sort((a, b) => a - b), [...C.BLANK_SQUARES]);
  assert.deepEqual(C.SQUARES_BY_TIER[200], [8]);
  assert.deepEqual(Object.values(C.COUNT_BY_TIER), [12, 8, 4, 3, 2, 1]);
  assert.deepEqual(C.TIERS.map((t) => C.WEIGHT_BY_TIER[t]), [160, 120, 120, 64, 48, 48]);
});

test('fixture: total weight is 10476 (by tier and per square)', () => {
  const byTier = C.TIERS.reduce((a, t) => a + C.COUNT_BY_TIER[t] * C.WEIGHT_BY_TIER[t], 0) + C.BLANK_COUNT * C.BLANK_WEIGHT;
  assert.equal(byTier, 10476);
  assert.equal(C.TOTAL_WEIGHT, 10476);
  assert.equal(C.WEIGHTS.reduce((a, b) => a + b, 0), 10476);
  assert.equal(C.WEIGHTS.length, 51);
  assert.equal(C.WEIGHTS[0], 0);
  for (let n = 1; n <= 50; n++) assert.equal(C.WEIGHTS[n], C.MULT[n] ? C.WEIGHT_BY_TIER[C.MULT[n]] : C.BLANK_WEIGHT, `square ${n}`);
});

test('fixture: MULT maps every square to its tier, blanks to 0', () => {
  for (const t of C.TIERS) for (const n of C.SQUARES_BY_TIER[t]) assert.equal(C.MULT[n], t);
  for (const n of C.BLANK_SQUARES) assert.equal(C.MULT[n], 0);
});

test('fixture: "1 in X" per light and share of stops match the weights', () => {
  for (const t of C.TIERS) {
    const p = C.pStopTier(t);
    assert.ok(roundsTo(C.ODDS_PER_LIGHT[t], 1 / p), `${t}x 1 in ${C.ODDS_PER_LIGHT[t]} vs ${1 / p}`);
    assert.ok(roundsTo(C.SHARE_OF_STOPS[t].slice(0, -1), 100 * p), `${t}x share`);
  }
  assert.ok(roundsTo(C.SHARE_OF_STOPS.blank.slice(0, -1), (100 * C.BLANK_COUNT * C.BLANK_WEIGHT) / C.TOTAL_WEIGHT));
});

test('fixture: exact payback per tier matches MATH-SPEC-C §2, lies in [95.34%, 95.39%], shows as 95.4%', () => {
  const [lo, hi] = C.PAYBACK_RANGE_PCT;
  const all = C.TIERS.map((t) => 100 * C.exactPayback(t));
  C.TIERS.forEach((t, k) => {
    assert.ok(all[k] >= lo && all[k] <= hi, `${t}x ${all[k]}`);
    assert.ok(roundsTo(C.EXACT_PAYBACK_PCT[t].toFixed(3), all[k]), `${t}x ${all[k]} vs ${C.EXACT_PAYBACK_PCT[t]}`);
  });
  // MATH-SPEC-C §2: spread 0.04 pp (95.34–95.38%) → one figure, 95.4%, within 0.06 pp of every tier.
  assert.ok(Math.max(...all) - Math.min(...all) < 0.05);
  for (const p of all) assert.ok(Math.abs(p - parseFloat(C.PAYBACK_SHOWN)) < 0.06, `${p}`);
});

test('fixture: limits, chips, credits and max win are consistent', () => {
  assert.deepEqual([...C.CHIPS], [1, 5, 10, 25, 50, 100, 500]);
  assert.ok(C.CHIPS.every((c) => c <= C.MAX_PER_TIER && c <= C.MAX_PER_ROUND));
  assert.ok(C.CHIPS.includes(C.DEFAULT_CHIP));
  assert.equal(C.MAX_WIN, Math.max(...C.TIERS) * C.MAX_PER_TIER);
  assert.equal(C.COUNT_BY_TIER[200], 1, 'max win assumes 200x cannot pay twice');
  assert.ok(C.MAX_WIN <= C.GAMBLE_CAP);
  assert.equal(C.START_CREDITS, 10000);
  assert.equal(C.REFILL_AMOUNT, 10000);
  for (const k of Object.keys(C.V5_KEYS)) assert.equal(C.V5_KEYS[k].replace('rl.v5.', 'rl.v1.'), C.V1_KEYS[k]);
});

test('fixture: toasts and UI strings contain no banned wording', () => {
  const copy = [...Object.values(C.TOASTS), ...Object.values(C.ODDS_PER_LIGHT), ...Object.values(C.SHARE_OF_STOPS), C.PAYBACK_SHOWN];
  for (const s of copy) assert.doesNotMatch(s, C.BANNED);
});
