// MATH-SPEC-C reference values for the v5 tests (docs/design-v5/MATH-SPEC-C.md, v5-development-spec.md §2.1).
// Pure data plus a brute-force payback oracle. Does not import src/engine: the engine is checked against this file,
// and test/unit/v5/fixture.test.js checks this file against itself.

export const TIERS = Object.freeze([5, 10, 20, 50, 100, 200]);
export const COUNT_BY_TIER = Object.freeze({ 5: 12, 10: 8, 20: 4, 50: 3, 100: 2, 200: 1 });
export const WEIGHT_BY_TIER = Object.freeze({ 5: 160, 10: 120, 20: 120, 50: 64, 100: 48, 200: 48 });
export const BLANK_COUNT = 20;
export const BLANK_WEIGHT = 339;
export const TOTAL_WEIGHT = 10476;
export const TIER_SQUARE_COUNT = 30;
export const NUM_SQUARES = 50;

// MATH-SPEC-C §3 (#1 top-left, clockwise).
export const SQUARES_BY_TIER = Object.freeze({
  200: Object.freeze([8]),
  100: Object.freeze([21, 46]),
  50: Object.freeze([3, 29, 38]),
  20: Object.freeze([13, 17, 33, 42]),
  10: Object.freeze([5, 11, 15, 24, 27, 35, 40, 49]),
  5: Object.freeze([1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48]),
});
export const BLANK_SQUARES = Object.freeze([2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50]);

/** MULT[n]: tier of square n, 0 for a blank (index 0 unused). */
export const MULT = Object.freeze(Array.from({ length: 51 }, (_, n) => {
  for (const t of TIERS) if (SQUARES_BY_TIER[t].includes(n)) return t;
  return 0;
}));
/** WEIGHTS[n]: draw weight of square n (index 0 is 0). */
export const WEIGHTS = Object.freeze(MULT.map((m, n) => (n === 0 ? 0 : m ? WEIGHT_BY_TIER[m] : BLANK_WEIGHT)));

export const CHIPS = Object.freeze([1, 5, 10, 25, 50, 100, 500]);
export const DEFAULT_CHIP = 1;
export const MIN_BET = 1;
export const MAX_PER_TIER = 1000;
export const MAX_PER_ROUND = 1000;
export const START_CREDITS = 10000;
export const REFILL_AMOUNT = 10000;
export const GAMBLE_CAP = 300000;
export const MAX_GAMBLES = 3;
export const DOUBLE_RUN_ONE_IN = 25;
export const MAX_WIN = 200000; // 200x × 1,000; the 200x tier has one square, so it can't pay twice

export const TOASTS = Object.freeze({
  tier: 'Max bet reached – 1,000 per tier',
  round: 'Round limit reached – 1,000 per round',
  credits: 'Not enough credits',
  noSave: "Progress won't be saved",
  migrated: 'Game updated – credits reset to 10,000',
});

// UI strings (SPEC.md §1): "1 in X" per light and share of stops.
export const ODDS_PER_LIGHT = Object.freeze({ 200: '218.3', 100: '109.1', 50: '54.56', 20: '21.83', 10: '10.91', 5: '5.46' });
export const SHARE_OF_STOPS = Object.freeze({ 200: '0.46%', 100: '0.92%', 50: '1.83%', 20: '4.58%', 10: '9.16%', 5: '18.33%', blank: '64.72%' });

// Exact payback per tier (MATH-SPEC-C §2, 3 dp) and the acceptance range (dev spec §5.2).
export const EXACT_PAYBACK_PCT = Object.freeze({ 5: 95.343, 10: 95.357, 20: 95.357, 50: 95.377, 100: 95.383, 200: 95.383 });
export const PAYBACK_RANGE_PCT = Object.freeze([95.34, 95.39]);
export const PAYBACK_SHOWN = '95.4%';

export const V5_KEYS = Object.freeze({
  balance: 'rl.v5.balance', settings: 'rl.v5.settings', lastBets: 'rl.v5.lastBets', round: 'rl.v5.round', history: 'rl.v5.history',
});
export const V1_KEYS = Object.freeze({
  balance: 'rl.v1.balance', settings: 'rl.v1.settings', lastBets: 'rl.v1.lastBets', round: 'rl.v1.round', history: 'rl.v1.history',
});

// Proposed chip fills (SPEC.md §2.10), tokenised in batch 4 after the contrast check.
export const CHIP_FILLS = Object.freeze({ 100: '#6d28d9', 500: '#b45309' });
export const CONTRAST_MIN = Object.freeze({ text: 4.5, ui: 3 });

// Same list as docs/design-v5/tiers/render.mjs.
export const BANNED = /fair|provabl|complian|certif|regulat|christmas|xmas|santa|snow|festive|real[- ]money win/i;

/** Stop chance of tier t for one light: count × weight / 10476. */
export const pStopTier = (t) => (COUNT_BY_TIER[t] * WEIGHT_BY_TIER[t]) / TOTAL_WEIGHT;

/**
 * Exact expected return per 1 credit on tier t, by brute force over every 1-light stop and every ordered Double Run
 * pair i ≠ j (the second stop is a weighted draw that excludes i). Each light on tier t pays t.
 */
export function exactPayback(t, weights = WEIGHTS, mult = MULT) {
  const W = weights.reduce((a, b) => a + b, 0);
  const dr = 1 / DOUBLE_RUN_ONE_IN;
  let e = 0;
  for (let i = 1; i <= NUM_SQUARES; i++) {
    const pi = weights[i] / W;
    const hit1 = mult[i] === t ? t : 0;
    e += pi * (1 - dr) * hit1;
    for (let j = 1; j <= NUM_SQUARES; j++) {
      if (j === i) continue;
      e += pi * dr * (weights[j] / (W - weights[i])) * (hit1 + (mult[j] === t ? t : 0));
    }
  }
  return e;
}
