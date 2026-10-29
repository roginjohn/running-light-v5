// Running Light - approved v5 game configuration (MATH-SPEC-C, v5 dev spec §2.1). Framework-free; runs in Node and the browser.
// DO NOT CHANGE: v5 math locked = MATH-SPEC-C (docs/design-v5/MATH-SPEC-C.md).

/** The six tier spots the player bets on (multipliers). */
export const TIERS = Object.freeze([5, 10, 20, 50, 100, 200]);
export const COUNT_BY_TIER = Object.freeze({ 5: 12, 10: 8, 20: 4, 50: 3, 100: 2, 200: 1 });
/** Stop weight of ONE square of each tier. */
export const WEIGHT_BY_TIER = Object.freeze({ 5: 160, 10: 120, 20: 120, 50: 64, 100: 48, 200: 48 });
export const BLANK_COUNT = 20;
export const BLANK_WEIGHT = 339;
export const EXPECTED_TOTAL_WEIGHT = 10476;

// Fixed layout (MATH-SPEC-C §3). #1 top-left, clockwise.
export const SQUARES_BY_TIER = Object.freeze({
  200: Object.freeze([8]),
  100: Object.freeze([21, 46]),
  50: Object.freeze([3, 29, 38]),
  20: Object.freeze([13, 17, 33, 42]),
  10: Object.freeze([5, 11, 15, 24, 27, 35, 40, 49]),
  5: Object.freeze([1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48]),
});
export const BLANK_SQUARES = Object.freeze([2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50]);

export const NUM_SQUARES = 50;
export const SQUARE_NUMBERS = Object.freeze(Array.from({ length: 50 }, (_, i) => i + 1));

/** MULT[n] = tier of square n, 0 for a blank square (index 0 unused). */
export const MULT = new Array(51).fill(0);
for (const t of TIERS) for (const n of SQUARES_BY_TIER[t]) MULT[n] = t;
Object.freeze(MULT);

/** isBlank(n): square n is a blank "no win" square. */
export function isBlank(n) {
  return Number.isInteger(n) && n >= 1 && n <= 50 && MULT[n] === 0;
}

/** WEIGHTS[n] = integer stop weight of square n (index 0 unused, weight 0). */
export const WEIGHTS = MULT.map((m, n) => (n === 0 ? 0 : m ? WEIGHT_BY_TIER[m] : BLANK_WEIGHT));
Object.freeze(WEIGHTS);

export const TOTAL_WEIGHT = WEIGHTS.reduce((a, b) => a + b, 0); // 10476

export const DOUBLE_RUN_ONE_IN = 25;
export const CHIPS = Object.freeze([1, 5, 10, 25, 50, 100, 500]);
export const DEFAULT_CHIP = 1;
export const MAX_PER_TIER = 1000;
export const MAX_PER_ROUND = 1000;
export const MIN_BET = 1;
export const START_CREDITS = 10000;
export const REFILL_AMOUNT = 10000;
export const MAX_GAMBLES = 3;
export const GAMBLE_CAP = 300000;
export const HISTORY_STORED = 50;
export const HISTORY_SHOWN = 10;

export const TOASTS = Object.freeze({
  tier: 'Max bet reached – 1,000 per tier',
  round: 'Round limit reached – 1,000 per round',
  credits: 'Not enough credits',
  restored: 'Bets restored from last round',
  noSave: "Progress won't be saved",
  migrated: 'Game updated – credits reset to 10,000',
});

/** Grid col,row of square n (16-9-16-9 ring, unchanged from v3). */
export function squarePos(n) {
  if (n >= 1 && n <= 16) return [n - 1, 0];
  if (n >= 17 && n <= 25) return [15, n - 16];
  if (n >= 26 && n <= 41) return [15 - (n - 26), 10];
  if (n >= 42 && n <= 50) return [0, 10 - (n - 41)];
  throw new RangeError(`bad square ${n}`);
}

export const GRID = Object.freeze({ x: 46, y: 114, pitch: 76, cell: 70 });

/** Top-left pixel of square n's 70x70 face at the 1920x1080 reference. */
export function squareXY(n) {
  const [c, r] = squarePos(n);
  return [GRID.x + c * GRID.pitch + 3, GRID.y + r * GRID.pitch + 3];
}

/** Probability that one light stops on a given square of tier t. */
export function pStop(t) {
  return WEIGHT_BY_TIER[t] / TOTAL_WEIGHT;
}

/** Probability that one light stops on any square of tier t: count × weight / 10476. */
export function pStopTier(t) {
  return (COUNT_BY_TIER[t] * WEIGHT_BY_TIER[t]) / TOTAL_WEIGHT;
}

/**
 * Probability that tier t is hit by at least one light in a round (incl. Double Run, where the second stop is a
 * weighted draw that excludes the first square).
 */
export function pRoundTier(t) {
  let p = 0;
  for (let i = 1; i <= 50; i++) {
    const pi = WEIGHTS[i] / TOTAL_WEIGHT;
    if (MULT[i] === t) {
      p += pi;
      continue;
    }
    let q = 0; // P(second stop on tier t | first stop i)
    for (const j of SQUARES_BY_TIER[t]) q += WEIGHTS[j] / (TOTAL_WEIGHT - WEIGHTS[i]);
    p += (pi * q) / DOUBLE_RUN_ONE_IN;
  }
  return p;
}

/** Probability a given square of tier t is hit by either light in one round (incl. Double Run, s2 != s1). */
export function pRound(t) {
  const pi = pStop(t);
  let s = 0;
  for (let j = 1; j <= 50; j++) {
    const pj = WEIGHTS[j] / TOTAL_WEIGHT;
    s += (pj * pi) / (1 - pj);
  }
  s -= (pi * pi) / (1 - pi); // the second stop never repeats the first
  return pi + s / DOUBLE_RUN_ONE_IN;
}

/** Tier label -> tier number, or 0 for "blank". Accepts 5, "5", "5x", "blank". NaN for anything else. */
function labelTier(lab) {
  if (lab === 'blank' || lab === 0) return 0;
  if (typeof lab === 'number') return lab;
  const m = /^(\d+)x?$/.exec(String(lab));
  return m ? Number(m[1]) : NaN;
}

/**
 * Throws if an arrangement differs from MATH-SPEC-C §3. Accepts a map {"1":"5x",...,"2":"blank"} or an array of
 * 50 labels (index 0 = square 1). Labels: a tier (5, "5" or "5x") or "blank".
 */
export function assertArrangement(arr) {
  const get = Array.isArray(arr) ? (n) => arr[n - 1] : (n) => (arr || {})[String(n)];
  const size = Array.isArray(arr) ? arr.length : Object.keys(arr || {}).length;
  if (size !== 50) throw new Error(`board-arrangement has ${size} squares, expected 50`);
  const counts = Object.fromEntries(TIERS.map((t) => [t, 0]));
  let blanks = 0;
  for (let n = 1; n <= 50; n++) {
    const lab = get(n);
    const t = labelTier(lab);
    if (t !== MULT[n]) throw new Error(`board-arrangement mismatch at #${n}: ${lab} vs ${MULT[n] ? `${MULT[n]}x` : 'blank'}`);
    if (t === 0) blanks++;
    else counts[t]++;
  }
  for (const t of TIERS) {
    if (counts[t] !== COUNT_BY_TIER[t]) throw new Error(`tier ${t}x count ${counts[t]} != ${COUNT_BY_TIER[t]}`);
  }
  if (blanks !== BLANK_COUNT) throw new Error(`blank count ${blanks} != ${BLANK_COUNT}`);
  if (TOTAL_WEIGHT !== EXPECTED_TOTAL_WEIGHT) throw new Error(`total weight ${TOTAL_WEIGHT} != ${EXPECTED_TOTAL_WEIGHT}`);
  return true;
}

/** Self-check of the hard-coded table: tiers + blanks cover 1..50 exactly once, counts, total weight 10476. */
export function assertConfig() {
  for (const t of TIERS) {
    if (SQUARES_BY_TIER[t].length !== COUNT_BY_TIER[t]) throw new Error(`count mismatch ${t}`);
  }
  if (BLANK_SQUARES.length !== BLANK_COUNT) throw new Error('blank count mismatch');
  const all = [...TIERS.flatMap((t) => SQUARES_BY_TIER[t]), ...BLANK_SQUARES].sort((a, b) => a - b);
  if (all.length !== 50 || all.some((n, i) => n !== i + 1)) throw new Error('layout does not cover 1..50 exactly once');
  const tierSquares = TIERS.reduce((a, t) => a + COUNT_BY_TIER[t], 0);
  if (tierSquares + BLANK_COUNT !== NUM_SQUARES) throw new Error('30 tier + 20 blank != 50');
  if (TOTAL_WEIGHT !== EXPECTED_TOTAL_WEIGHT) throw new Error(`total weight ${TOTAL_WEIGHT} != ${EXPECTED_TOTAL_WEIGHT}`);
  return true;
}
assertConfig();
