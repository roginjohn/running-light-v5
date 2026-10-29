// Running Light game core: state machine with a single guarded dispatch (spec B5, B6, B7).
// Framework-free. The UI subscribes to state and never computes outcomes.
import {
  CHIPS, DEFAULT_CHIP, START_CREDITS, REFILL_AMOUNT, HISTORY_STORED, MAX_PER_ROUND, TOASTS,
} from './config.js';
import { drawRound, payout, gambleDraw, gambleBlockReason } from './outcome.js';
import {
  addChip, removeChip, totalOf, countOf, cloneBets, sameBets, validBets, rebetBlockReason, isTier,
} from './bets.js';
import {
  KEYS, createStore, validBalanceRec, validSettings, validHistory, validRound,
} from './storage.js';

export const PHASES = Object.freeze([
  'INIT', 'RECOVERY', 'BETTING', 'SPINNING', 'RESOLVING', 'DOUBLE_RUN', 'GAMBLE_OFFER', 'GAMBLE', 'PAYOUT', 'ERROR',
]);

export const ACTIONS = Object.freeze([
  'SELECT_CHIP', 'ADD_BET', 'REMOVE_BET', 'UNDO', 'CLEAR', 'REBET', 'START',
  'LIGHT1_DONE', 'RESOLVE_DONE', 'LIGHT2_DONE',
  'COLLECT', 'GAMBLE_OPEN', 'PICK', 'GAMBLE_FLIP', 'REVEAL_DONE', 'PAYOUT_DONE',
  'REFILL', 'CONTINUE', 'RELOAD',
  'OPEN_INFO', 'CLOSE_INFO', 'SET_TAB', 'SET_SETTING', 'TOGGLE_MUTE', 'FAIL',
]);

const BETTING_ACTIONS = ['SELECT_CHIP', 'ADD_BET', 'REMOVE_BET', 'UNDO', 'CLEAR', 'REBET', 'START', 'OPEN_INFO'];
const INFO_MODAL_ACTIONS = ['CLOSE_INFO', 'SET_TAB', 'SET_SETTING', 'TOGGLE_MUTE'];

/** Static acceptance table: phase -> actions accepted (further guards apply inside handlers). */
export const ACCEPTS = Object.freeze({
  INIT: [],
  RECOVERY: ['CONTINUE', 'TOGGLE_MUTE'],
  BETTING: [...BETTING_ACTIONS, ...INFO_MODAL_ACTIONS, 'REFILL'],
  SPINNING: ['LIGHT1_DONE', 'TOGGLE_MUTE'],
  RESOLVING: ['RESOLVE_DONE', 'TOGGLE_MUTE'],
  DOUBLE_RUN: ['LIGHT2_DONE', 'TOGGLE_MUTE'],
  GAMBLE_OFFER: ['COLLECT', 'GAMBLE_OPEN', 'TOGGLE_MUTE'],
  GAMBLE: ['PICK', 'GAMBLE_FLIP', 'REVEAL_DONE', 'COLLECT', 'TOGGLE_MUTE'],
  PAYOUT: ['PAYOUT_DONE', 'TOGGLE_MUTE'],
  ERROR: ['RELOAD', 'TOGGLE_MUTE'],
});

export const INFO_TABS = ['settings', 'paytable', 'help'];

export function defaultSettings(reducedMotion = false) {
  return { mute: false, music: 60, sfx: 80, reducedMotion: !!reducedMotion };
}

let idCounter = 0;
function defaultIdGen(now) {
  idCounter = (idCounter + 1) % 1e6;
  return `r${now.toString(36)}-${idCounter.toString(36)}`;
}

/**
 * createGame({ rng, backend, persistent, now, idGen, prefersReducedMotion, testMode })
 * rng: { randInt(n) } (crypto in production, seeded in tests/simulation)
 * backend: Storage-like ({ getItem, setItem, removeItem })
 */
export function createGame(opts) {
  const {
    rng, backend, persistent = true, now = () => Date.now(), idGen, prefersReducedMotion = false, testMode = false,
  } = opts;
  if (!rng || typeof rng.randInt !== 'function') throw new Error('createGame: rng required');
  if (!backend) throw new Error('createGame: storage backend required');
  const store = createStore(backend);
  const listeners = new Set();
  let forcedOutcome = null;
  let forcedGamble = null;

  const state = {
    phase: 'INIT',
    balance: 0,
    bets: {},
    undo: [],
    chip: DEFAULT_CHIP,
    lastBets: null,
    ghosts: false,
    round: null,
    history: [],
    settings: defaultSettings(prefersReducedMotion),
    info: null, // null | 'settings' | 'paytable' | 'help'
    gamble: { pick: null, revealing: false },
    toast: null, // { seq, text, kind }
    error: null, // { message, key }
    lastWin: { value: 0, kind: 'none' }, // kind: none | loss | paid
    persistent,
    seq: 0,
    log: [],
    version: 0,
  };
  let toastSeq = 0;

  // ------------------------------------------------------------ helpers
  function emit(evt) {
    state.version++;
    for (const fn of listeners) fn(state, evt);
  }
  function toast(text, kind = 'warn') {
    state.toast = { seq: ++toastSeq, text, kind };
  }
  function log(msg) {
    state.log.push({ at: now(), msg });
  }
  function write(key, value) {
    store.write(key, value); // throws on quota/storage failure -> caught by dispatch -> ERROR
  }
  function persistRound() {
    state.round.seq = ++state.seq;
    write(KEYS.round, state.round);
  }
  function persistBalance() {
    write(KEYS.balance, { v: state.balance, seq: state.seq });
  }
  function persistHistory() {
    write(KEYS.history, state.history);
  }
  function setRoundPhase(p) {
    state.round.phase = p;
    persistRound();
  }
  function pendingRound() {
    return !!(state.round && !state.round.settled);
  }
  function needsRefill() {
    return state.phase === 'BETTING' && state.balance < 1 && !pendingRound();
  }
  function addHistory() {
    const r = state.round;
    if (state.history.some((h) => h.roundId === r.roundId)) return;
    state.history.push({ roundId: r.roundId, s1: r.s1, s2: r.s2, win: r.baseWin });
    if (state.history.length > HISTORY_STORED) state.history.splice(0, state.history.length - HISTORY_STORED);
    persistHistory();
  }
  function pushUndo() {
    state.undo.push(state.bets);
  }

  // ------------------------------------------------------------ round flow
  function revealResult() {
    addHistory();
    if (state.round.currentWin > 0) {
      setRoundPhase('GAMBLE_OFFER');
      state.phase = 'GAMBLE_OFFER';
    } else {
      // loss: settle with win 0, bets stay live
      state.round.settled = true;
      state.round.phase = 'SETTLED';
      state.round.balance = state.balance;
      persistRound();
      persistBalance();
      state.lastWin = { value: 0, kind: 'loss' };
      state.phase = 'BETTING';
      state.undo = [];
    }
  }
  function credit() {
    const r = state.round;
    if (r.settled) return false; // settled at most once
    state.balance += r.currentWin;
    r.settled = true;
    r.balance = state.balance;
    persistRound(); // one setItem: settled=true + new balance
    persistBalance();
    state.lastWin = { value: r.currentWin, kind: 'paid' };
    return true;
  }
  function enterPayout() {
    setRoundPhase('PAYOUT'); // "PAYOUT before credit" point
    credit();
    state.gamble.revealing = false;
    state.phase = 'PAYOUT';
  }

  // ------------------------------------------------------------ handlers
  const H = {
    SELECT_CHIP(a) {
      if (!CHIPS.includes(a.value)) return 'bad chip';
      state.chip = a.value;
    },
    ADD_BET(a) {
      if (!isTier(a.tier)) return 'bad tier';
      const r = addChip(state.bets, a.tier, state.chip, state.balance);
      if (r.toast) toast(r.toast, r.toast === TOASTS.credits ? 'error' : 'warn');
      if (r.added === 0) return 'no room';
      pushUndo();
      state.bets = r.bets;
      state.ghosts = false;
    },
    REMOVE_BET(a) {
      if (!isTier(a.tier)) return 'bad tier';
      const r = removeChip(state.bets, a.tier, state.chip);
      if (!r.removed) return 'nothing to remove';
      pushUndo();
      state.bets = r.bets;
    },
    UNDO() {
      if (!state.undo.length) return 'nothing to undo';
      state.bets = state.undo.pop();
    },
    CLEAR() {
      if (!totalOf(state.bets)) return 'no bets';
      pushUndo();
      state.bets = {};
    },
    REBET() {
      const why = rebetBlockReason(state.lastBets, state.balance);
      if (why) return why;
      if (sameBets(state.bets, state.lastBets)) return 'already placed';
      pushUndo();
      state.bets = cloneBets(state.lastBets);
      state.ghosts = false;
      toast(TOASTS.restored, 'info');
    },
    START() {
      const total = totalOf(state.bets);
      if (total < 1) return 'no bet';
      if (total > MAX_PER_ROUND) return 'over round limit';
      if (total > state.balance) {
        toast(TOASTS.credits, 'error');
        return 'not enough credits';
      }
      const bets = cloneBets(state.bets);
      const out = forcedOutcome || drawRound(rng); // outcome first, before any animation
      forcedOutcome = null;
      const t = now();
      const baseWin = payout(bets, out.s1, out.s2);
      state.round = {
        roundId: idGen ? idGen() : defaultIdGen(t),
        bets,
        totalBet: total,
        s1: out.s1,
        doubleRun: out.doubleRun,
        s2: out.s2,
        baseWin,
        gambles: [],
        pendingReveal: false,
        currentWin: baseWin,
        phase: 'SPINNING',
        settled: false,
        createdAt: t,
        balanceBefore: state.balance,
        balance: state.balance - total,
        seq: 0,
      };
      state.balance -= total;
      persistRound(); // ONE setItem carries the deducted balance + drawn outcome
      persistBalance();
      state.lastBets = bets;
      write(KEYS.lastBets, bets);
      state.undo = [];
      state.ghosts = false;
      state.gamble = { pick: null, revealing: false };
      state.lastWin = { value: 0, kind: 'none' };
      state.phase = 'SPINNING';
    },
    LIGHT1_DONE() {
      setRoundPhase('RESOLVING');
      state.phase = 'RESOLVING';
    },
    RESOLVE_DONE() {
      if (state.round.doubleRun) {
        setRoundPhase('DOUBLE_RUN');
        state.phase = 'DOUBLE_RUN';
      } else revealResult();
    },
    LIGHT2_DONE() {
      revealResult();
    },
    GAMBLE_OPEN() {
      const why = gambleBlockReason(state.round.currentWin, state.round.gambles.length);
      if (why) return `gamble blocked: ${why}`;
      setRoundPhase('GAMBLE');
      state.phase = 'GAMBLE';
    },
    PICK(a) {
      if (state.gamble.revealing) return 'revealing';
      if (a.colour !== 'red' && a.colour !== 'white') return 'bad colour';
      state.gamble.pick = a.colour;
    },
    GAMBLE_FLIP() {
      const r = state.round;
      if (state.gamble.revealing) return 'revealing';
      if (!state.gamble.pick) return 'no pick';
      const why = gambleBlockReason(r.currentWin, r.gambles.length);
      if (why) return `gamble blocked: ${why}`;
      const result = forcedGamble || gambleDraw(rng);
      forcedGamble = null;
      r.gambles.push({ pick: state.gamble.pick, result });
      r.pendingReveal = true;
      persistRound(); // stored before the reveal
      state.gamble.revealing = true;
    },
    REVEAL_DONE() {
      const r = state.round;
      if (!state.gamble.revealing || !r.pendingReveal) return 'no reveal pending';
      const g = r.gambles[r.gambles.length - 1];
      r.currentWin = g.pick === g.result ? r.currentWin * 2 : 0;
      r.pendingReveal = false;
      state.gamble.revealing = false;
      if (r.currentWin === 0) enterPayout();
      else persistRound();
    },
    COLLECT() {
      if (state.phase === 'GAMBLE' && state.gamble.revealing) return 'revealing';
      enterPayout();
    },
    PAYOUT_DONE() {
      state.phase = 'BETTING';
      state.bets = {};
      state.undo = [];
      state.ghosts = true;
      state.gamble = { pick: null, revealing: false };
    },
    REFILL() {
      if (!needsRefill()) return 'refill not available';
      state.balance = REFILL_AMOUNT;
      state.seq++;
      persistBalance();
    },
    CONTINUE() {
      const r = state.round;
      if (!r || r.settled) {
        state.phase = 'BETTING';
        return;
      }
      state.bets = cloneBets(r.bets);
      switch (r.phase) {
        case 'SPINNING':
        case 'RESOLVING':
        case 'DOUBLE_RUN':
          revealResult(); // stored stops shown directly; never redrawn
          break;
        case 'GAMBLE_OFFER':
          addHistory();
          state.phase = 'GAMBLE_OFFER';
          break;
        case 'GAMBLE': {
          addHistory();
          const last = r.gambles[r.gambles.length - 1];
          state.gamble = { pick: last ? last.pick : null, revealing: r.pendingReveal };
          state.phase = 'GAMBLE';
          break;
        }
        case 'PAYOUT':
          addHistory();
          credit();
          state.phase = 'PAYOUT';
          break;
        default:
          throw new Error(`unknown stored phase ${r.phase}`);
      }
    },
    RELOAD() {
      if (state.error && state.error.key) {
        store.remove(state.error.key); // reset ONLY the corrupt key
        log(`reset corrupt storage key ${state.error.key}`);
      }
      init();
    },
    OPEN_INFO(a) {
      const tab = a.tab || 'paytable';
      if (!INFO_TABS.includes(tab)) return 'bad tab';
      state.info = tab;
    },
    CLOSE_INFO() {
      if (!state.info) return 'no modal';
      state.info = null;
    },
    SET_TAB(a) {
      if (!state.info) return 'no modal';
      if (!INFO_TABS.includes(a.tab)) return 'bad tab';
      state.info = a.tab;
    },
    SET_SETTING(a) {
      const s = { ...state.settings, [a.key]: a.value };
      if (!(a.key in state.settings) || !validSettings(s)) return 'bad setting';
      state.settings = s;
      write(KEYS.settings, s);
    },
    TOGGLE_MUTE() {
      state.settings = { ...state.settings, mute: !state.settings.mute };
      write(KEYS.settings, state.settings);
    },
    FAIL(a) {
      state.error = { message: String(a.message || 'error'), key: a.key || null };
      state.phase = 'ERROR';
      state.info = null;
    },
  };

  /** Reason string if `action` is not accepted right now, else null. */
  function rejectReason(action) {
    if (!action || typeof action.type !== 'string' || !H[action.type]) return 'unknown action';
    const type = action.type;
    if (type === 'FAIL') return null;
    if (!ACCEPTS[state.phase].includes(type)) return `${type} not accepted in ${state.phase}`;
    if (state.phase === 'BETTING') {
      if (needsRefill()) return ['REFILL', 'TOGGLE_MUTE'].includes(type) ? null : 'refill required';
      if (type === 'REFILL') return 'refill not available';
      if (state.info) return INFO_MODAL_ACTIONS.includes(type) ? null : 'info modal open';
      if (['CLOSE_INFO', 'SET_TAB', 'SET_SETTING'].includes(type)) return 'no modal';
    }
    return null;
  }

  function dispatch(action) {
    const why = rejectReason(action);
    if (why) return { ok: false, reason: why };
    let res;
    const toastBefore = toastSeq;
    try {
      res = H[action.type](action);
    } catch (e) {
      // storage failure or invariant break -> ERROR, pending round stays stored for recovery
      state.error = { message: e && e.message ? e.message : String(e), key: null };
      state.phase = 'ERROR';
      state.info = null;
      emit({ type: 'ERROR', action });
      return { ok: false, reason: state.error.message };
    }
    if (typeof res === 'string') {
      if (toastSeq !== toastBefore) emit({ type: 'TOAST', action }); // toast only, no state change
      return { ok: false, reason: res };
    }
    emit({ type: action.type, action });
    return { ok: true };
  }

  // ------------------------------------------------------------ init / load
  function init() {
    state.phase = 'INIT';
    state.error = null;
    state.info = null;
    state.undo = [];
    state.bets = {};
    state.gamble = { pick: null, revealing: false };
    state.round = null;
    state.lastWin = { value: 0, kind: 'none' };
    state.chip = DEFAULT_CHIP;

    const fail = (key, msg) => {
      state.error = { message: msg, key };
      state.phase = 'ERROR';
      log(msg);
      emit({ type: 'INIT' });
      return state;
    };

    // settings
    const st = store.read(KEYS.settings);
    if (st.present) {
      if (!st.ok || !validSettings(st.value)) return fail(KEYS.settings, 'Saved settings are corrupt');
      state.settings = { ...st.value };
    } else state.settings = defaultSettings(prefersReducedMotion);

    // history
    const hi = store.read(KEYS.history);
    if (hi.present && (!hi.ok || !validHistory(hi.value))) return fail(KEYS.history, 'Saved history is corrupt');
    state.history = hi.present ? hi.value.slice() : [];

    // last bets
    const lb = store.read(KEYS.lastBets);
    // unknown (square-keyed v3) keys are dropped; a map with nothing left is ignored, a bad tier amount is corrupt
    const lbv = lb.present && lb.ok ? validBets(lb.value) : null;
    if (lb.present && !lbv) return fail(KEYS.lastBets, 'Saved last bets are corrupt');
    state.lastBets = lbv && countOf(lbv) ? lbv : null;
    state.ghosts = !!state.lastBets;

    // round
    const rd = store.read(KEYS.round);
    if (rd.present && (!rd.ok || !validRound(rd.value))) return fail(KEYS.round, 'Saved round is corrupt');
    const round = rd.present ? rd.value : null;

    // balance (authoritative = higher seq of balance record vs round record)
    const bl = store.read(KEYS.balance);
    let balance = START_CREDITS;
    let seq = 0;
    if (bl.present && bl.ok && validBalanceRec(bl.value)) {
      balance = bl.value.v;
      seq = bl.value.seq;
    } else if (bl.present) {
      // spec B6: unreadable balance -> fall back (to the round record's balance if one exists, else START_CREDITS)
      log(round ? 'balance unreadable: restored from round record' : `balance unreadable: fell back to ${START_CREDITS}`);
      seq = -1;
    }
    if (round && round.seq > seq) {
      balance = round.balance;
      seq = round.seq;
    }
    state.balance = balance;
    state.seq = Math.max(seq, 0, round ? round.seq : 0);
    try {
      persistBalance();
    } catch (e) {
      return fail(null, `Storage write failed: ${e.message}`);
    }

    if (round && !round.settled) {
      state.round = round;
      state.bets = cloneBets(round.bets);
      state.ghosts = false;
      state.phase = 'RECOVERY';
    } else {
      state.phase = 'BETTING';
    }
    if (!persistent) toast(TOASTS.noSave, 'info');
    emit({ type: 'INIT' });
    return state;
  }

  const api = {
    get state() {
      return state;
    },
    dispatch,
    canDispatch: (a) => rejectReason(a) === null,
    rejectReason,
    init,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    needsRefill,
    pendingRound,
    gambleBlock: () => (state.round ? gambleBlockReason(state.round.currentWin, state.round.gambles.length) : 'nowin'),
    rebetBlock: () => rebetBlockReason(state.lastBets, state.balance),
    store,
  };
  if (testMode) {
    // TEST MODE ONLY (simulation hooks / forced outcomes for screenshots). Never exposed to players.
    api.test = {
      setBalance(v) {
        if (!Number.isInteger(v) || v < 0) throw new RangeError('bad balance');
        state.balance = v;
        state.seq++;
        persistBalance();
        emit({ type: 'TEST' });
      },
      forceNextOutcome(o) {
        forcedOutcome = { s1: o.s1, doubleRun: !!o.s2, s2: o.s2 || null };
      },
      forceNextGamble(c) {
        forcedGamble = c;
      },
      setBets(b) {
        const v = validBets(b);
        if (!v) throw new Error('bad bets');
        state.bets = cloneBets(v);
        emit({ type: 'TEST' });
      },
      setHistory(h) {
        state.history = h.slice();
        persistHistory();
        emit({ type: 'TEST' });
      },
      emit: () => emit({ type: 'TEST' }),
    };
  }
  return api;
}
