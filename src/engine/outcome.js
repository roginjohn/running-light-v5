// Outcome generation and payout (v5 dev spec §2.2, §2.4). Pure functions; all draws happen before any animation.
import { WEIGHTS, TOTAL_WEIGHT, MULT, DOUBLE_RUN_ONE_IN, MAX_GAMBLES, GAMBLE_CAP } from './config.js';

/**
 * Walk squares 1..50 accumulating weights; return the first square where cumulative > r.
 * `weights` is indexed by square number (index 0 ignored). `exclude` (optional) is treated as weight 0.
 */
export function weightedPick(r, weights = WEIGHTS, exclude = 0) {
  let cum = 0;
  for (let n = 1; n <= 50; n++) {
    if (n === exclude) continue;
    cum += weights[n];
    if (cum > r) return n;
  }
  throw new RangeError(`weightedPick: r=${r} out of range`);
}

/**
 * Draw one round: { s1, doubleRun, s2 }. Draw order is fixed: s1 = weighted stop over the 50 squares
 * (randInt(10476), rejection-sampled), then Double Run = randInt(25) === 0, then s2 = a weighted stop that
 * excludes s1 (randInt(10476 - w[s1]) over the other 49 squares).
 */
export function drawRound(rng) {
  const s1 = weightedPick(rng.randInt(TOTAL_WEIGHT));
  const doubleRun = rng.randInt(DOUBLE_RUN_ONE_IN) === 0;
  let s2 = null;
  if (doubleRun) s2 = weightedPick(rng.randInt(TOTAL_WEIGHT - WEIGHTS[s1]), WEIGHTS, s1);
  return { s1, doubleRun, s2 };
}

/** What one light on square s pays for a tier-keyed bet map: MULT[s] × bet[MULT[s]] (a blank pays 0). */
function lightPays(bets, s) {
  const t = MULT[s];
  return t ? t * ((bets && bets[t]) || 0) : 0;
}

/**
 * Integer payout for a tier-keyed bet map: Σ over the lights L of MULT[L] × bet[MULT[L]].
 * Each light pays on its own, so two lights on the same tier pay 2 × M × bet.
 */
export function payout(bets, s1, s2 = null) {
  let win = lightPays(bets, s1);
  if (s2 != null) win += lightPays(bets, s2);
  return win;
}

/**
 * Per-light result, for display: { lights: [{ square, tier, amount }], total }.
 * tier is the multiplier, or 'blank' for a blank square.
 */
export function winParts(bets, s1, s2 = null) {
  const lights = [];
  for (const s of [s1, s2]) {
    if (s == null) continue;
    lights.push({ square: s, tier: MULT[s] || 'blank', amount: lightPays(bets, s) });
  }
  return { lights, total: lights.reduce((a, l) => a + l.amount, 0) };
}

/** Gamble draw: randInt(2) === 0 ? 'red' : 'white'. */
export function gambleDraw(rng) {
  return rng.randInt(2) === 0 ? 'red' : 'white';
}

/**
 * Why gambling is not allowed (null when allowed). A gamble may never produce a win above GAMBLE_CAP (300,000),
 * so it is offered only while the doubled win (win × 2) is GAMBLE_CAP or less, i.e. on a win of 150,000 or less.
 * Checked before every flip, up to MAX_GAMBLES per win.
 */
export function gambleBlockReason(win, gamblesUsed) {
  if (!(win > 0)) return 'nowin';
  if (gamblesUsed >= MAX_GAMBLES) return 'max';
  if (win * 2 > GAMBLE_CAP) return 'cap';
  return null;
}
