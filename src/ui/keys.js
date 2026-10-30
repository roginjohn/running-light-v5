// Keyboard map (spec B8 + B13 fix 2). Pure: maps a key event + context to an intent.
// Intents: { kind: 'dispatch', action } | { kind: 'activate' } (press focused control) |
//          { kind: 'focusTier', delta } | { kind: 'tab', delta } | { kind: 'slider', delta } | null

const NAV_KEYS = new Set(['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * ctx: { phase, info, refill, focus: { kind: 'tier'|'button'|'chip'|'pick'|'slider'|'toggle'|'tab'|'icon'|null, tier } }
 */
export function mapKey(e, ctx) {
  const key = e.key;
  const k = key.length === 1 ? key.toLowerCase() : key;
  const focus = ctx.focus || { kind: null };
  // Auto-repeat is ignored for every action key (only plain navigation may repeat).
  if (e.repeat && !(NAV_KEYS.has(key) && ctx.phase === 'BETTING' && !ctx.refill)) return null;
  if (e.altKey || e.metaKey) return null;

  if (k === 'm' && !e.ctrlKey) return { kind: 'dispatch', action: { type: 'TOGGLE_MUTE' } };

  const activateOr = (fallback) => (focus.kind && focus.kind !== 'tier' ? { kind: 'activate' } : fallback);

  switch (ctx.phase) {
    case 'ERROR':
      if (k === 'Enter' || k === ' ') return activateOr({ kind: 'dispatch', action: { type: 'RELOAD' } });
      return null;
    case 'RECOVERY':
      if (k === 'Enter' || k === ' ') return activateOr({ kind: 'dispatch', action: { type: 'CONTINUE' } });
      return null;
    case 'GAMBLE_OFFER':
      if (k === 'g' && !e.ctrlKey) return { kind: 'dispatch', action: { type: 'GAMBLE_OPEN' } };
      if (k === 'Enter') return { kind: 'dispatch', action: { type: 'COLLECT' } };
      if (k === ' ') return activateOr(null);
      return null;
    case 'GAMBLE':
      if ((k === 'r' && !e.ctrlKey) || k === 'ArrowLeft') return { kind: 'dispatch', action: { type: 'PICK', colour: 'red' }, focusPick: 'red' };
      if ((k === 'w' && !e.ctrlKey) || k === 'ArrowRight') return { kind: 'dispatch', action: { type: 'PICK', colour: 'white' }, focusPick: 'white' };
      if (k === 'g' && !e.ctrlKey) return { kind: 'dispatch', action: { type: 'GAMBLE_FLIP' } };
      if (k === 'Enter') return { kind: 'dispatch', action: { type: 'COLLECT' } }; // Enter is reserved for Collect
      if (k === ' ') return { kind: 'activate' }; // Space presses whichever control is focused (incl. GAMBLE)
      return null;
    case 'BETTING':
      break;
    default:
      return null; // SPINNING / RESOLVING / DOUBLE_RUN / PAYOUT / INIT: only M
  }

  // ---- BETTING
  if (ctx.refill) {
    if (k === 'Enter' || k === ' ') return activateOr({ kind: 'dispatch', action: { type: 'REFILL' } });
    return null;
  }
  if (ctx.info) {
    if (k === 'Escape') return { kind: 'dispatch', action: { type: 'CLOSE_INFO' } };
    if (focus.kind === 'slider' && (k === 'ArrowLeft' || k === 'ArrowDown')) return { kind: 'slider', delta: -5 };
    if (focus.kind === 'slider' && (k === 'ArrowRight' || k === 'ArrowUp')) return { kind: 'slider', delta: 5 };
    if (k === 'ArrowLeft') return { kind: 'tab', delta: -1 };
    if (k === 'ArrowRight') return { kind: 'tab', delta: 1 };
    if (k === 'Enter' || k === ' ') return activateOr(null);
    return null;
  }
  if (/^[1-5]$/.test(k) && !e.ctrlKey) {
    return { kind: 'dispatch', action: { type: 'SELECT_CHIP', value: [1, 5, 10, 25, 50][Number(k) - 1] } };
  }
  if (k === 'z' || (k === 'z' && e.ctrlKey)) return { kind: 'dispatch', action: { type: 'UNDO' } };
  if (k === 'c' && !e.ctrlKey) return { kind: 'dispatch', action: { type: 'CLEAR' } };
  if (k === 'r' && !e.ctrlKey) return { kind: 'dispatch', action: { type: 'REBET' } };
  if (focus.kind === 'tier') {
    if (k === 'Enter') return { kind: 'dispatch', action: { type: e.shiftKey ? 'REMOVE_BET' : 'ADD_BET', tier: focus.tier } };
    if (k === 'Backspace') return { kind: 'dispatch', action: { type: 'REMOVE_BET', tier: focus.tier } };
    if (k === 'ArrowRight' || k === 'ArrowDown') return { kind: 'focusTier', delta: 1 };
    if (k === 'ArrowLeft' || k === 'ArrowUp') return { kind: 'focusTier', delta: -1 };
  }
  if (k === ' ') return activateOr({ kind: 'dispatch', action: { type: 'START' } });
  if (k === 'Enter') return activateOr(null);
  return null;
}
