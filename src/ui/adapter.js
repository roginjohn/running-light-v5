// TEMPORARY (v5 Batch 2 adapter, removed in Batch 5): helpers that let the v3 UI show the v5 tier engine until the tier
// spots land. The engine keys bets by tier (5, 10, 20, 50, 100, 200); since batch 4 the ring is display-only and the
// bets go through the centre's tier buttons. No outcome or payout logic lives here.
import { MULT, MAX_PER_TIER, TIERS } from '../engine/config.js';

export { MAX_PER_TIER }; // replaces the v3 MAX_PER_SQUARE (removed from config.js in v5)

/** The top tier (the v3 "jackpot" look). */
export const TOP_TIER = TIERS[TIERS.length - 1];

/** The bet that covers square n: its tier's bet in a tier-keyed map (0 on a blank square). */
export function betOn(bets, n) {
  const t = MULT[n];
  return t && bets ? bets[t] || 0 : 0;
}

/** Colour class suffix per tier (styles.css .q5 / .k5 …); blank squares get "blank". */
export const tierCls = (m) => m || 'blank';

/** Short tier label for a square ("5x", or "–" for a blank). */
export const squareLabel = (n) => (MULT[n] ? `${MULT[n]}x` : '–');
