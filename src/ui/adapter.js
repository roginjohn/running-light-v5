// TEMPORARY (v5 Batch 2 adapter, removed in Batch 5): lets the v3 square-betting UI drive the v5 tier engine
// until the tier spots land. The engine keys bets by tier (5, 10, 20, 50, 100, 200); the v3 UI still shows bets on
// squares and sends { type: 'ADD_BET' | 'REMOVE_BET', square: n }. This file is the only place that bridges the two:
//   - a click on square n bets on n's tier (MULT[n]); a click on a blank square is ignored
//   - a square "carries" its tier's bet for display (every square of a tier shows the same tier bet)
//   - v5 tiers are drawn with the nearest v3 tier colour class until the batch-4 tier tokens exist
// No outcome or payout logic lives here; the engine decides and settles everything.
import { MULT, MAX_PER_TIER, TIERS } from '../engine/config.js';

export { MAX_PER_TIER }; // replaces the v3 MAX_PER_SQUARE (removed from config.js in v5)

/** The top tier (the v3 "jackpot" look). */
export const TOP_TIER = TIERS[TIERS.length - 1];

/** Tier of square n, 0 for a blank square. */
export const tierOf = (n) => MULT[n] || 0;

/** The bet that covers square n: its tier's bet in a tier-keyed map (0 on a blank square). */
export function betOn(bets, n) {
  const t = MULT[n];
  return t && bets ? bets[t] || 0 : 0;
}

/** Translate a v3 square bet action into a v5 tier action. null = a blank square (ignored). Other actions pass. */
export function tierAction(a) {
  if (!a || (a.type !== 'ADD_BET' && a.type !== 'REMOVE_BET') || a.square === undefined) return a;
  const t = MULT[a.square];
  if (!Number.isInteger(a.square) || !t) return null;
  const { square, ...rest } = a;
  return { ...rest, tier: t };
}

/** Wrap the engine API so the v3 UI's square actions reach the engine as tier actions. Everything else is the
 *  engine's own object (state, subscribe, test hooks …). */
export function adaptGame(game) {
  const blank = { ok: false, reason: 'blank square' };
  return Object.create(game, {
    dispatch: { value: (a) => { const t = tierAction(a); return t ? game.dispatch(t) : blank; } },
    canDispatch: { value: (a) => { const t = tierAction(a); return t ? game.canDispatch(t) : false; } },
    rejectReason: { value: (a) => { const t = tierAction(a); return t ? game.rejectReason(t) : blank.reason; } },
  });
}

// v3 colour class suffix per v5 tier (styles.css .q24 / .t24 / .k24 …); blank squares get "blank".
const V3_CLASS = Object.freeze({ 5: 24, 10: 96, 20: 480, 50: 480, 100: 960, 200: 1920 });
export const tierCls = (m) => (m ? V3_CLASS[m] || m : 'blank');

/** Short tier label for a square ("5x", or "–" for a blank). */
export const squareLabel = (n) => (MULT[n] ? `${MULT[n]}x` : '–');
