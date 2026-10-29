// Bet operations with limit clamping (v5 dev spec §2.3). Bets are plain objects keyed by TIER (5, 10, 20, 50, 100, 200)
// with integer amounts 1..1,000 per tier and at most 1,000 per round.
import { TIERS, MAX_PER_TIER, MAX_PER_ROUND, TOASTS } from './config.js';

/** A tier spot the player can bet on: one of the six multipliers (a number, not a string). */
export function isTier(t) {
  return typeof t === 'number' && TIERS.includes(t);
}

/** A board square number 1..50 (stops and history; the board is display-only). */
export function isSquare(n) {
  return Number.isInteger(n) && n >= 1 && n <= 50;
}

export function totalOf(bets) {
  let s = 0;
  for (const k in bets) s += bets[k];
  return s;
}

export function countOf(bets) {
  return Object.keys(bets).length;
}

export function cloneBets(bets) {
  const out = {};
  for (const k in bets) if (bets[k] > 0) out[k] = bets[k];
  return out;
}

export function sameBets(a, b) {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/** A chip or bet amount: a positive integer. The game only offers CHIPS (SELECT_CHIP checks that). */
const isAmount = (v) => Number.isInteger(v) && v >= 1;

/**
 * Add a chip (any positive integer amount) to a tier spot, clamped to the remaining room (tier cap 1,000, round cap 1,000, balance).
 * Returns { bets, added, toast }. room = 0 -> no change, toast only.
 */
export function addChip(bets, tier, chip, balance) {
  if (!isTier(tier)) throw new RangeError('bad tier');
  if (!isAmount(chip)) throw new RangeError('bad chip');
  if (!Number.isInteger(balance) || balance < 0) throw new RangeError('bad balance');
  const cur = bets[tier] || 0;
  const total = totalOf(bets);
  const rooms = [
    ['tier', MAX_PER_TIER - cur],
    ['round', MAX_PER_ROUND - total],
    ['credits', balance - total],
  ];
  let reason = rooms[0];
  for (const r of rooms) if (r[1] < reason[1]) reason = r;
  const room = Math.max(0, reason[1]);
  const added = Math.min(chip, room);
  const toast = added < chip ? TOASTS[reason[0]] : null;
  if (added === 0) return { bets, added: 0, toast };
  const next = { ...bets, [tier]: cur + added };
  return { bets: next, added, toast };
}

/** Remove one chip value from a tier spot (floor 0). Returns { bets, removed }. */
export function removeChip(bets, tier, chip) {
  if (!isTier(tier)) throw new RangeError('bad tier');
  if (!isAmount(chip)) throw new RangeError('bad chip');
  const cur = bets[tier] || 0;
  if (cur === 0) return { bets, removed: 0 };
  const removed = Math.min(cur, chip);
  const next = { ...bets };
  if (cur - removed === 0) delete next[tier];
  else next[tier] = cur - removed;
  return { bets: next, removed };
}

/**
 * Validate a bet map (from storage, or a test hook). All-integer. Keys that are not a tier ("5" … "200") are
 * dropped (for example square-keyed or v3-tier maps). Returns the cleaned map, or null when a tier amount is not an
 * integer 1..1,000, the round total is over 1,000, or (allowEmpty: false) nothing is left.
 */
export function validBets(bets, { allowEmpty = true } = {}) {
  if (!bets || typeof bets !== 'object' || Array.isArray(bets)) return null;
  const out = {};
  let total = 0;
  for (const k of Object.keys(bets)) {
    const t = Number(k);
    if (!isTier(t) || String(t) !== k) continue; // unknown key: dropped
    const v = bets[k];
    if (!Number.isInteger(v) || v < 1 || v > MAX_PER_TIER) return null;
    out[t] = v;
    total += v;
  }
  if (total > MAX_PER_ROUND) return null;
  if (!allowEmpty && total === 0) return null;
  return out;
}

/** Rebet availability: null if allowed, else a reason string for the tooltip. */
export function rebetBlockReason(lastBets, balance) {
  const t = lastBets ? totalOf(lastBets) : 0;
  if (!t) return 'No previous round to rebet';
  if (t > balance) return `Not enough credits for last round's ${t} bet`;
  return null;
}
