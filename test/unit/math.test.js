// v5 math (MATH-SPEC-C, dev spec §6): config invariants, exact per-tier RTP enumeration, the weighted draw, the
// rejection sampler, Double Run and payout. Rewritten in v5 batch 2 from the v3 E1.1–E1.5 tests. The Math C
// reference values live in test/fixtures/math-c.js; test/unit/v5/ holds the per-area v5 tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MULT, WEIGHTS, TOTAL_WEIGHT, SQUARES_BY_TIER, BLANK_SQUARES, COUNT_BY_TIER, WEIGHT_BY_TIER, BLANK_WEIGHT, TIERS,
  DOUBLE_RUN_ONE_IN, squarePos, squareXY, assertArrangement, assertConfig, pStop, pStopTier, pRound, pRoundTier,
} from '../../src/engine/config.js';
import { weightedPick, drawRound, payout, gambleDraw } from '../../src/engine/outcome.js';
import { makeRng, createSeededRng } from '../../src/engine/rng.js';
import { scriptedRng } from './helpers.js';
import * as C from '../fixtures/math-c.js';

const tokens = JSON.parse(readFileSync(new URL('../../src/data/design-tokens-v3.json', import.meta.url)));

// ------------------------------------------------------------------ config invariants
test('math: 50 squares = 30 tier squares + 20 blanks, counts 12/8/4/3/2/1, total weight 10,476', () => {
  assert.equal(assertConfig(), true);
  const counts = {};
  for (let n = 1; n <= 50; n++) counts[MULT[n]] = (counts[MULT[n]] || 0) + 1;
  assert.deepEqual(counts, { 0: 20, 5: 12, 10: 8, 20: 4, 50: 3, 100: 2, 200: 1 });
  assert.equal(TOTAL_WEIGHT, 10476);
  assert.equal(12 * 160 + 8 * 120 + 4 * 120 + 3 * 64 + 2 * 48 + 48 + 20 * 339, 10476);
  for (let n = 1; n <= 50; n++) assert.equal(WEIGHTS[n], MULT[n] ? WEIGHT_BY_TIER[MULT[n]] : BLANK_WEIGHT, `#${n}`);
  assert.equal(WEIGHTS[0], 0);
  const all = [...TIERS.flatMap((t) => SQUARES_BY_TIER[t]), ...BLANK_SQUARES].sort((a, b) => a - b);
  assert.deepEqual(all, Array.from({ length: 50 }, (_, i) => i + 1), 'every square exactly once');
});

test('math: layout exactly as MATH-SPEC-C §3', () => {
  for (const t of TIERS) assert.deepEqual([...SQUARES_BY_TIER[t]], [...C.SQUARES_BY_TIER[t]], `${t}x`);
  assert.deepEqual([...BLANK_SQUARES], [...C.BLANK_SQUARES]);
  for (const t of TIERS) assert.equal(SQUARES_BY_TIER[t].length, COUNT_BY_TIER[t]);
});

test('math: design-tokens-v3.json board-arrangement matches the engine (startup assertion, "blank" labels)', () => {
  assert.equal(assertArrangement(tokens['board-arrangement']), true);
  assert.deepEqual(tokens['board-arrangement-check'], { counts: { ...C.COUNT_BY_TIER, blank: 20 }, totalWeight: 10476 });
  assert.throws(() => assertArrangement({ ...tokens['board-arrangement'], 8: '5x' }), /mismatch at #8/);
  assert.throws(() => assertArrangement({ ...tokens['board-arrangement'], 2: '5x' }), /mismatch at #2/);
});

test('math: grid positions unchanged: clockwise from top-left, pitch 76 from (46,114)', () => {
  for (let n = 1; n <= 16; n++) assert.deepEqual(squarePos(n), [n - 1, 0]);
  for (let n = 17; n <= 25; n++) assert.deepEqual(squarePos(n), [15, n - 16]);
  for (let n = 26; n <= 41; n++) assert.deepEqual(squarePos(n), [15 - (n - 26), 10]);
  for (let n = 42; n <= 50; n++) assert.deepEqual(squarePos(n), [0, 10 - (n - 41)]);
  assert.deepEqual(squareXY(1), [49, 117]);
  const seen = new Set();
  for (let n = 1; n <= 50; n++) {
    const k = squarePos(n).join(',');
    assert.ok(!seen.has(k));
    seen.add(k);
  }
});

test('math: per-light odds match the paytable ("1 in" 5.46 … 218.3, share of stops)', () => {
  for (const t of TIERS) {
    assert.ok(Math.abs(pStopTier(t) - COUNT_BY_TIER[t] * pStop(t)) < 1e-15);
    const oneIn = 1 / pStopTier(t);
    const shown = C.ODDS_PER_LIGHT[t];
    assert.equal(oneIn.toFixed(shown.split('.')[1].length), shown, `${t}x 1 in ${oneIn}`);
    assert.equal(`${(pStopTier(t) * 100).toFixed(2)}%`, C.SHARE_OF_STOPS[t], `${t}x share`);
  }
  assert.equal(`${((20 * BLANK_WEIGHT * 100) / TOTAL_WEIGHT).toFixed(2)}%`, C.SHARE_OF_STOPS.blank);
});

// ------------------------------------------------------------------ exact RTP (enumeration)
/** Exact return per 1 credit on tier t, brute force over every 1-light stop i and every ordered DR pair i ≠ j. */
function enumerate(t) {
  const W = TOTAL_WEIGHT, dr = 1 / DOUBLE_RUN_ONE_IN;
  let e = 0, hit = 0;
  for (let i = 1; i <= 50; i++) {
    const pi = WEIGHTS[i] / W;
    const one = payout({ [t]: 1 }, i, null);
    e += pi * (1 - dr) * one;
    if (one) hit += pi;
    for (let j = 1; j <= 50; j++) {
      if (j === i) continue;
      const pij = pi * dr * (WEIGHTS[j] / (W - WEIGHTS[i]));
      e += pij * payout({ [t]: 1 }, i, j);
      if (!one && MULT[j] === t) hit += pij;
    }
  }
  return { e, hit };
}

test('math: exact per-tier payback (1-light + ordered Double Run pairs i ≠ j) is in [95.34%, 95.39%]', () => {
  for (const t of TIERS) {
    const { e } = enumerate(t);
    const pct = e * 100;
    assert.ok(pct >= 95.34 && pct <= 95.39, `${t}x payback ${pct}`);
    assert.equal(pct.toFixed(3), C.EXACT_PAYBACK_PCT[t].toFixed(3), `${t}x vs MATH-SPEC-C §2`);
    assert.ok(Math.abs(e - C.exactPayback(t)) < 1e-12, `${t}x vs the fixture oracle`);
  }
});

test('math: closed form E = M·[p_t + (1/25)·Σ_i p_i·(p_t − [i∈t]·p_i)/(1−p_i)] agrees with the enumeration', () => {
  for (const t of TIERS) {
    const pt = pStopTier(t);
    let s = 0;
    for (let i = 1; i <= 50; i++) {
      const pi = WEIGHTS[i] / TOTAL_WEIGHT;
      s += (pi * (pt - (MULT[i] === t ? pi : 0))) / (1 - pi);
    }
    const closed = t * (pt * (1 - 1 / DOUBLE_RUN_ONE_IN) + (pt + s) / DOUBLE_RUN_ONE_IN);
    // the DR round pays the first light (p_t) plus the second light (s) — same as the brute force
    assert.ok(Math.abs(closed - enumerate(t).e) < 1e-12, `${t}x`);
  }
});

test('math: pRoundTier equals the enumerated per-round hit chance; pRound is per square', () => {
  for (const t of TIERS) {
    assert.ok(Math.abs(pRoundTier(t) - enumerate(t).hit) < 1e-12, `${t}x`);
    assert.ok(pRoundTier(t) > pStopTier(t), 'Double Run adds hits');
  }
  // the 200x tier has one square, so its tier and square chances agree
  assert.ok(Math.abs(pRound(200) - pRoundTier(200)) < 1e-12);
});

// ------------------------------------------------------------------ weighted draw + rejection sampler
test('math: weightedPick maps every r in 0..10475 correctly (exhaustive)', () => {
  const table = [];
  for (let n = 1; n <= 50; n++) for (let i = 0; i < WEIGHTS[n]; i++) table.push(n);
  assert.equal(table.length, 10476);
  for (let r = 0; r < 10476; r++) assert.equal(weightedPick(r), table[r], `r=${r}`);
  assert.throws(() => weightedPick(10476));
  assert.equal(weightedPick(0), 1);
  assert.equal(weightedPick(10475), 50);
});

test('math: seeded 1M weighted draws via randInt(10476): every square within 4σ of its weight', () => {
  const rng = createSeededRng(5);
  const N = 1_000_000;
  const hits = new Array(51).fill(0);
  for (let i = 0; i < N; i++) hits[weightedPick(rng.randInt(TOTAL_WEIGHT))]++;
  for (let n = 1; n <= 50; n++) {
    const p = WEIGHTS[n] / TOTAL_WEIGHT;
    const sd = Math.sqrt(N * p * (1 - p));
    assert.ok(Math.abs(hits[n] - N * p) <= 4 * sd, `#${n}: ${hits[n]} vs ${N * p}`);
  }
});

test('math: randInt rejection sampling has no modulo bias (mocked uint32 at the boundary)', () => {
  // n = 3: limit = floor(2^32/3)*3 = 4294967295 -> only 0xFFFFFFFF is rejected
  const seq = [0xffffffff, 0xfffffffe];
  let i = 0;
  const rng = makeRng(() => seq[i++]);
  assert.equal(rng.randInt(3), 0xfffffffe % 3);
  assert.equal(i, 2, 'rejected exactly one draw');
  // n = 10476: limit = floor(2^32/10476)*10476; the 2^32 mod 10476 values in the tail are redrawn
  const limit = Math.floor(2 ** 32 / 10476) * 10476;
  assert.equal(2 ** 32 - limit, 2 ** 32 % 10476);
  const seq2 = [limit, limit + 100, 2 ** 32 - 1, limit - 1];
  i = 0;
  const rng2 = makeRng(() => seq2[i++]);
  assert.equal(rng2.randInt(10476), (limit - 1) % 10476);
  assert.equal(i, 4, 'all values >= limit rejected');
  // the accepted range 0..limit-1 holds every residue exactly limit/10476 times (no residue favoured)
  assert.equal(limit % 10476, 0);
  // a uniform walk over the last 3 full cycles below the limit hits each residue equally
  const counts = new Array(10476).fill(0);
  for (let x = limit - 3 * 10476; x < limit; x++) counts[x % 10476]++;
  assert.ok(counts.every((c) => c === 3));
  assert.throws(() => rng.randInt(0));
  assert.throws(() => rng.randInt(1.5));
});

test('math: seeded PRNG is deterministic per seed', () => {
  const a = createSeededRng(42), b = createSeededRng(42), c = createSeededRng(43);
  const sa = Array.from({ length: 20 }, () => a.randInt(10476));
  const sb = Array.from({ length: 20 }, () => b.randInt(10476));
  const sc = Array.from({ length: 20 }, () => c.randInt(10476));
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
});

// ------------------------------------------------------------------ Double Run
test('math: Double Run triggers iff randInt(25) === 0; draw order s1, DR, s2', () => {
  assert.deepEqual(drawRound(scriptedRng([0, 1])), { s1: 1, doubleRun: false, s2: null });
  for (let v = 1; v < 25; v++) assert.equal(drawRound(scriptedRng([500, v])).doubleRun, false);
  const r = scriptedRng([0, 0, 0]);
  const out = drawRound(r);
  assert.deepEqual(out, { s1: 1, doubleRun: true, s2: 2 }, 'with s1 excluded, r=0 maps to the next square');
  assert.equal(r.remaining(), 0);
});

test('math: Double Run excludes the first square: s2 ≠ s1 always and P(s2=j|s1) = w_j/(10476−w_s1) (exhaustive)', () => {
  for (let s1 = 1; s1 <= 50; s1++) {
    const tot = TOTAL_WEIGHT - WEIGHTS[s1];
    const counts = new Array(51).fill(0);
    for (let r = 0; r < tot; r++) counts[weightedPick(r, WEIGHTS, s1)]++;
    assert.equal(counts[s1], 0, `s1=${s1} never repeats`);
    for (let j = 1; j <= 50; j++) if (j !== s1) assert.equal(counts[j], WEIGHTS[j], `s1=${s1} j=${j}`);
    assert.throws(() => weightedPick(tot, WEIGHTS, s1));
    // through drawRound: the second randInt is called with n = 10476 − w[s1]
    const firstR = WEIGHTS.slice(1, s1).reduce((a, b) => a + b, 0);
    for (const last of [0, tot - 1]) {
      const o = drawRound(scriptedRng([firstR, 0, last]));
      assert.equal(o.s1, s1);
      assert.notEqual(o.s2, s1);
    }
  }
});

// ------------------------------------------------------------------ payout
test('math: payout per light: blank 0, tier M × bet, same tier 2 × M × bet, two tiers each pay', () => {
  const bets = { 5: 10, 20: 2, 200: 1 };
  assert.equal(payout(bets, 1), 50, '#1 is 5x');
  assert.equal(payout(bets, 2), 0, '#2 is blank');
  assert.equal(payout(bets, 5), 0, '#5 is 10x, no 10x bet');
  assert.equal(payout(bets, 2, 4), 0, 'two blanks');
  assert.equal(payout(bets, 2, 13), 40, 'blank + 20x');
  assert.equal(payout(bets, 1, 6), 100, 'both lights on 5x: 2 × 5 × 10');
  assert.equal(payout(bets, 8, 13), 240, '200x + 20x');
  assert.equal(payout({ 200: 1000 }, 8), 200000);
  let max = 0;
  for (let a = 1; a <= 50; a++) {
    max = Math.max(max, payout({ 200: 1000 }, a));
    for (let b = 1; b <= 50; b++) if (a !== b) max = Math.max(max, payout({ 200: 1000 }, a, b));
  }
  assert.equal(max, C.MAX_WIN, 'the 200x has one square, so it cannot pay twice');
});

test('math: gamble draw mapping is randInt(2): 0 -> red, 1 -> white', () => {
  assert.equal(gambleDraw(scriptedRng([0])), 'red');
  assert.equal(gambleDraw(scriptedRng([1])), 'white');
});
