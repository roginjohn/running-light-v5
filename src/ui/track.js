// v3 batch 4: pure helpers for the track's running light and the centre's big multiplier. No DOM, no layout
// reads: the controller turns these strings into class swaps and one textContent write per light step.
import { MULT, TIERS, COUNT_BY_TIER, WEIGHT_BY_TIER, TOTAL_WEIGHT } from '../engine/config.js';

// v5 tier spots, rarest first (tiers/SPEC.md §2.2), and the exact chance per light on each: 1 in 218.3 … 1 in 5.46.
export const SPOT_ORDER = [...TIERS].reverse();
export function lightOdds(t) {
  const w = COUNT_BY_TIER[t] * WEIGHT_BY_TIER[t];
  const d = TOTAL_WEIGHT >= 100 * w ? 10 : 100; // integer division, so 21.825 rounds up to 21.83
  return `1 in ${Math.round((TOTAL_WEIGHT * d) / w) / d}`;
}

/** The bet that covers square n: its tier's bet in a tier-keyed map (0 on a blank square). */
export function betOn(bets, n) {
  const t = MULT[n];
  return t && bets ? bets[t] || 0 : 0;
}

/** Winning squares of the current round (only once revealed): a stop wins when its tier has a bet. */
export function winners(s, ui) {
  const r = s.round;
  if (!r) return { w1: null, w2: null };
  const revealed = ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(s.phase) || ui.gambleLoss;
  const w1 = (revealed || s.phase === 'DOUBLE_RUN') && betOn(r.bets, r.s1) ? r.s1 : null;
  const w2 = revealed && r.s2 && betOn(r.bets, r.s2) ? r.s2 : null;
  return { w1, w2 };
}

/** Light classes for square n: lit / trail1 / trail2 (second light: lit2 / trailc1 / trailc2), or lvl1 / lvl2
 *  while the reduced-motion fade comes up, plus `land` once a run has stopped on n. */
export function lightClass(n, ui) {
  const l1 = ui.light1, l2 = ui.light2;
  let L = null, light = null;
  if (l2 && l2.idx === n) [L, light] = [l2, 'lit2'];
  else if (l2 && l2.trail && l2.trail[0] === n) light = 'trailc1';
  else if (l2 && l2.trail && l2.trail[1] === n) light = 'trailc2';
  else if (l1 && l1.idx === n) [L, light] = [l1, 'lit'];
  else if (l1 && l1.trail && l1.trail[0] === n) light = 'trail1';
  else if (l1 && l1.trail && l1.trail[1] === n) light = 'trail2';
  if (L && L.level != null && L.level < 1) return L.level < 0.5 ? 'lvl1' : 'lvl2';
  if (L && L.done) return `${light} land`;
  return light;
}

/** The big mono number is the MULTIPLIER (open question 3, confirmed): "00.00" while betting and after a loss
 *  (loss.png), the multiplier under the light during a run, the stopped square's while it resolves, then the
 *  winning square's. It never shows a stop before the light gets there. */
export const bigMult = (m) => `${String(m).padStart(2, '0')}.00`;
export function bigValue(s, ui) {
  const lit = ui.light2 && ui.light2.idx ? ui.light2 : ui.light1 && ui.light1.idx ? ui.light1 : null;
  if (lit) return bigMult(MULT[lit.idx]);
  const r = s.round;
  if (r && ['RESOLVING', 'DOUBLE_RUN', 'GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(s.phase)) {
    const { w1, w2 } = winners(s, ui);
    if (!w1 && !w2 && !['RESOLVING', 'DOUBLE_RUN'].includes(s.phase)) return bigMult(0);
    return bigMult(MULT[w1 || w2 || r.s1]);
  }
  return bigMult(0);
}
