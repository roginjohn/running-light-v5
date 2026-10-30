// "Last bets" (v3 batch 3): the total bet of each recent round, newest first. The engine history keeps stops and
// wins but not the bet, so the UI records round.totalBet at START (keyed by roundId so a restored round is not
// counted twice) and keeps the list in its own storage key. v5 starts with an empty list: older keys are not read,
// written or removed.
export const BET_TOTALS_KEY = 'rl.v5.betTotals';
export const BET_TOTALS_SHOWN = 5;

const valid = (list) => Array.isArray(list) && list.every((e) => e && Number.isInteger(e.t) && e.t > 0 && (e.id === null || typeof e.id === 'string'));

/** Add a round's total (newest first, at most `max`); a roundId already in the list is ignored. */
export function recordTotal(list, id, total, max = BET_TOTALS_SHOWN) {
  if (!Number.isInteger(total) || total < 1) return list;
  if (id && list.some((e) => e.id === id)) return list;
  return [{ id: id || null, t: total }, ...list].slice(0, max);
}

/** Read the saved list; anything unreadable is treated as empty (cosmetic data, never an error). */
export function loadTotals(backend) {
  try {
    const raw = backend && backend.getItem(BET_TOTALS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return valid(list) ? list.slice(0, BET_TOTALS_SHOWN) : [];
  } catch {
    return [];
  }
}

export function saveTotals(backend, list) {
  try {
    if (backend) backend.setItem(BET_TOTALS_KEY, JSON.stringify(list));
  } catch { /* cosmetic: ignore quota/storage errors */ }
}
