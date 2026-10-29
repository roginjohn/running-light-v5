// 1/2 and x2 on the bet field (v3 batch 3): scale every bet at once. Pure; uses the locked engine limits
// (1-1,000 per tier, 1,000 per round, the balance) and never touches the engine. START still re-checks every limit.
// TEMPORARY (Batch 2 adapter, removed in Batch 5): bets are keyed by tier now; MAX_PER_TIER replaces MAX_PER_SQUARE.
import { MAX_PER_ROUND, MIN_BET } from '../engine/config.js';
import { totalOf } from '../engine/bets.js';
import { MAX_PER_TIER } from './adapter.js';

const keysOf = (bets) => Object.keys(bets).map(Number).sort((a, b) => a - b);

/** Halve every bet (rounded down, never below 1). Returns { bets, changed, limit: null }. */
export function halveBets(bets) {
  const next = {};
  let changed = false;
  for (const n of keysOf(bets)) {
    next[n] = Math.max(MIN_BET, Math.floor(bets[n] / 2));
    if (next[n] !== bets[n]) changed = true;
  }
  return { bets: changed ? next : bets, changed, limit: null };
}

/**
 * Double every bet, clamped to 1,000 per tier and to min(1,000, balance) for the round. When the round cap cuts in,
 * the room left is shared out one credit at a time in key order, so the bets stay even.
 * Returns { bets, changed, limit } where limit is null | 'tier' | 'round' | 'credits' (the cap that cut in;
 * the keys match the engine's TOASTS).
 */
export function doubleBets(bets, balance) {
  const ns = keysOf(bets);
  const target = {};
  let tierCut = false;
  for (const n of ns) {
    target[n] = Math.min(MAX_PER_TIER, bets[n] * 2);
    if (bets[n] * 2 > MAX_PER_TIER) tierCut = true;
  }
  const cap = Math.min(MAX_PER_ROUND, Math.max(0, balance));
  const capKind = MAX_PER_ROUND <= balance ? 'round' : 'credits';
  const next = { ...bets };
  let total = totalOf(bets);
  let limit = null;
  if (totalOf(target) <= cap) {
    Object.assign(next, target);
    total = totalOf(target);
    if (tierCut) limit = 'tier';
  } else {
    let grew = true;
    while (total < cap && grew) {
      grew = false;
      for (const n of ns) {
        if (total >= cap) break;
        if (next[n] < target[n]) {
          next[n]++;
          total++;
          grew = true;
        }
      }
    }
    limit = capKind;
  }
  const changed = ns.some((n) => next[n] !== bets[n]);
  return { bets: changed ? next : bets, changed, limit };
}
