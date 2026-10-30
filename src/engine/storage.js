// Persistence adapter + validation (spec B6, B7) and the v1 -> v5 migration (v5 dev spec §2.5).
//
// Atomic write approach (B7 "one setItem"): every balance-changing transition writes the ROUND RECORD
// first, and that record carries the resulting balance and a monotonically increasing `seq`.
// `rl.v5.balance` stores { v, seq }. On load, whichever of the two has the higher seq is authoritative,
// so a crash between the two setItem calls can never make balance and round disagree.
import { MAX_GAMBLES, HISTORY_STORED } from './config.js';
import { validBets, totalOf, isSquare, sameBets } from './bets.js';
import { payout } from './outcome.js';

export const KEYS = Object.freeze({
  balance: 'rl.v5.balance',
  settings: 'rl.v5.settings',
  lastBets: 'rl.v5.lastBets',
  round: 'rl.v5.round',
  history: 'rl.v5.history',
});

/** v1/v3 keys. Read once by the migration and NEVER written or removed (deleting them needs Rogin's approval). */
export const V1_KEYS = Object.freeze({
  balance: 'rl.v1.balance',
  settings: 'rl.v1.settings',
  lastBets: 'rl.v1.lastBets',
  round: 'rl.v1.round',
  history: 'rl.v1.history',
});

/** Set on the first v5 load, so the migration (and its one-time toast) runs once per device. */
export const MIGRATION_KEY = 'rl.v5.migrated';

export const ROUND_PHASES = ['SPINNING', 'RESOLVING', 'DOUBLE_RUN', 'GAMBLE_OFFER', 'GAMBLE', 'PAYOUT', 'SETTLED'];

/** In-memory Storage-like backend (used when localStorage is unavailable, and in Node). */
export function memoryBackend(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

/** Pick localStorage if it works, otherwise memory. Returns { backend, persistent }. */
export function detectBackend() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) throw new Error('no localStorage');
    const k = 'rl.v5.__probe';
    ls.setItem(k, '1');
    if (ls.getItem(k) !== '1') throw new Error('probe mismatch');
    ls.removeItem(k);
    return { backend: ls, persistent: true };
  } catch {
    return { backend: memoryBackend(), persistent: false };
  }
}

/**
 * First v5 load (runs once, guarded by MIGRATION_KEY). Old balances are not carried over: with no rl.v5.balance the
 * game starts at START_CREDITS (10,000). Valid v1 settings are copied to rl.v5.settings. v1 lastBets, round and
 * history are square-keyed and are ignored (not treated as corrupt); an in-progress v1 round is discarded with no
 * payout. Nothing under rl.v1.* is written or removed.
 * Returns { notice, settingsCopied, discardedRound }; notice = show the one-time "Game updated" toast.
 */
export function migrateFromV1(backend) {
  const res = { notice: false, settingsCopied: false, discardedRound: false };
  try {
    if (backend.getItem(MIGRATION_KEY) != null) return res;
    const hasV1 = Object.values(V1_KEYS).some((k) => backend.getItem(k) != null);
    if (hasV1 && backend.getItem(KEYS.balance) == null) {
      res.notice = true;
      res.discardedRound = backend.getItem(V1_KEYS.round) != null;
      const raw = backend.getItem(V1_KEYS.settings);
      let s = null;
      try { s = raw == null ? null : JSON.parse(raw); } catch { s = null; }
      if (validSettings(s) && backend.getItem(KEYS.settings) == null) {
        const { mute, reducedMotion, music, sfx } = s;
        backend.setItem(KEYS.settings, JSON.stringify({ mute, reducedMotion, music, sfx }));
        res.settingsCopied = true;
      }
    }
    backend.setItem(MIGRATION_KEY, JSON.stringify({ v: 5, notice: res.notice }));
  } catch {
    // a failed migration write is not fatal: the game still starts at 10,000 on the v5 keys
  }
  return res;
}

function readable(backend) {
  try {
    backend.getItem(KEYS.balance);
    return true;
  } catch {
    return false;
  }
}

export function createStore(backend) {
  // storage that won't load falls back to memory (fresh 10,000); the caller passes persistent=false for the toast
  if (!readable(backend)) backend = memoryBackend();
  const migration = migrateFromV1(backend);
  return {
    backend,
    migration,
    /** Returns { ok, value, present }. ok=false means present but unparseable. */
    read(key) {
      const raw = backend.getItem(key);
      if (raw == null) return { ok: true, present: false, value: undefined };
      try {
        return { ok: true, present: true, value: JSON.parse(raw) };
      } catch {
        return { ok: false, present: true, value: undefined };
      }
    },
    write(key, value) {
      // backends may opt into a structured fast path (simulation only); browsers always use JSON strings
      if (backend.setJSON) backend.setJSON(key, value);
      else backend.setItem(key, JSON.stringify(value));
    },
    remove(key) {
      backend.removeItem(key);
    },
  };
}

const isInt = (v) => Number.isInteger(v);
const isNonNegInt = (v) => isInt(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER;
const isColour = (c) => c === 'red' || c === 'white';

export function validBalanceRec(x) {
  return !!x && typeof x === 'object' && isNonNegInt(x.v) && isNonNegInt(x.seq);
}

export function validSettings(s) {
  return (
    !!s && typeof s === 'object' &&
    typeof s.mute === 'boolean' && typeof s.reducedMotion === 'boolean' &&
    isInt(s.music) && s.music >= 0 && s.music <= 100 &&
    isInt(s.sfx) && s.sfx >= 0 && s.sfx <= 100
  );
}

export function validHistory(h) {
  if (!Array.isArray(h) || h.length > HISTORY_STORED) return false;
  return h.every(
    (e) => e && typeof e.roundId === 'string' && isSquare(e.s1) &&
      (e.s2 === null || (isSquare(e.s2) && e.s2 !== e.s1)) && isNonNegInt(e.win)
  );
}

/** A stored, non-empty tier-keyed bet map with no unknown keys (a round record must match its bets exactly). */
export function strictBets(b) {
  const v = validBets(b, { allowEmpty: false });
  return !!v && sameBets(v, b);
}

/** Recompute the current win from the base win and the applied gamble results. */
export function computeCurrentWin(r) {
  let w = r.baseWin;
  const applied = r.pendingReveal ? r.gambles.slice(0, -1) : r.gambles;
  for (const g of applied) w = g.pick === g.result ? w * 2 : 0;
  return w;
}

export function validRound(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.roundId !== 'string' || !r.roundId) return false;
  if (!strictBets(r.bets)) return false;
  if (r.totalBet !== totalOf(r.bets)) return false;
  if (!isSquare(r.s1) || typeof r.doubleRun !== 'boolean') return false;
  if (r.doubleRun ? !(isSquare(r.s2) && r.s2 !== r.s1) : r.s2 !== null) return false;
  if (r.baseWin !== payout(r.bets, r.s1, r.s2)) return false;
  if (!Array.isArray(r.gambles) || r.gambles.length > MAX_GAMBLES) return false;
  if (!r.gambles.every((g) => g && isColour(g.pick) && isColour(g.result))) return false;
  if (typeof r.pendingReveal !== 'boolean' || (r.pendingReveal && r.gambles.length === 0)) return false;
  // a lost gamble ends the gamble sequence
  const applied = r.pendingReveal ? r.gambles.slice(0, -1) : r.gambles;
  if (applied.slice(0, -1).some((g) => g.pick !== g.result)) return false;
  if (!isNonNegInt(r.currentWin) || r.currentWin !== computeCurrentWin(r)) return false;
  if (!ROUND_PHASES.includes(r.phase) || typeof r.settled !== 'boolean') return false;
  if (r.settled !== (r.phase === 'SETTLED' || (r.phase === 'PAYOUT' && r.settled))) return false;
  if (!isNonNegInt(r.balance) || !isNonNegInt(r.balanceBefore) || !isNonNegInt(r.seq)) return false;
  if (typeof r.createdAt !== 'number' || !Number.isFinite(r.createdAt)) return false;
  return true;
}
