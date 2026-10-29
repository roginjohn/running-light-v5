// View layer: pure functions (engine state + ui state) -> SVG markup per layer.
// Compositions follow design/session-one/_render/screens.py (mockups 01-09b).
import {
  C, W, UI, SIGN, DISP, CELL, fmt, esc, t, rect, g, background, bunting, iconGlyph, logo, balancePlaque, plaque, bulb,
  square, halo, HALO, boardFrame, frameMarquee, marqueeSign, doubleRunLamp, miniLegend, lastResult, centerPanelBase,
  centerText, bannerDoubleRun, bannerJackpot, displayCard, chip, pickCard, button, historyStrip, toast, footerHints,
  tooltip, modalFrame, toggle, slider, miniMap, wrap, TIER,
} from './svg.js';
import {
  MULT, CHIPS, squareXY, squarePos, pStop, pRound, MAX_GAMBLES, GAMBLE_CAP, COUNT_BY_TIER,
} from '../engine/config.js';
import { totalOf } from '../engine/bets.js';
import { winParts } from '../engine/outcome.js';

// ------------------------------------------------------------ helpers
const RESULT_PHASES = ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'];
const RUN_PHASES = ['SPINNING', 'RESOLVING', 'DOUBLE_RUN'];

/** Interactive wrapper: focusable, labelled, with a ring spec for the focus layer. */
export function hit(id, inner, { label, ring, disabled = false, tabindex = 0, role = 'button', area = null, extra = '' }) {
  const a = area ? rect(area[0], area[1], area[2], area[3], area[4] || 0, '#000', 'none', 0, 'fill-opacity="0"') : '';
  return `<g class="hit${disabled ? ' dis' : ''}" data-id="${id}" role="${role}" tabindex="${disabled ? -1 : tabindex}" aria-label="${esc(label)}"${disabled ? ' aria-disabled="true"' : ''} data-ring="${ring}" ${extra}><g class="vis">${inner}</g>${a}</g>`;
}

const bstate = (ui, id, disabled) => (disabled ? 'disabled' : ui.hover === id ? 'hover' : 'default');

export function lastStops(state) {
  const h = state.history[state.history.length - 1];
  return h ? [h.s1, h.s2] : [null, null];
}

/** Last Win card: { value, sub, highlight }. */
export function lastWinView(state, ui) {
  const r = state.round;
  const p = state.phase;
  const dw = ui.displayWin;
  if (p === 'GAMBLE_OFFER') return { value: dw ?? r.currentWin, sub: 'Collect or Gamble', hi: true };
  if (p === 'GAMBLE') return { value: dw ?? r.currentWin, sub: 'in gamble – not yet collected', hi: true };
  if (p === 'PAYOUT') return { value: dw ?? r.currentWin, sub: 'credits', hi: false };
  if (RUN_PHASES.includes(p)) return { value: 0, sub: 'credits', hi: false };
  if (p === 'RECOVERY') {
    const pre = ['SPINNING', 'RESOLVING', 'DOUBLE_RUN'].includes(r.phase);
    return pre ? { value: 0, sub: 'result pending', hi: false } : { value: r.currentWin, sub: 'not yet collected', hi: true };
  }
  if (p === 'ERROR') return { value: state.lastWin.value, sub: 'last saved values', hi: false };
  return { value: state.lastWin.value, sub: state.lastWin.kind === 'loss' ? 'no win this round' : 'credits', hi: false };
}

export function totalBetView(state) {
  if (state.phase === 'BETTING' || !state.round) return totalOf(state.bets);
  return state.round.totalBet;
}

/** Visual state per square for the base layer and the light overlay. */
export function squareStates(state, ui) {
  const st = {};
  const p = state.phase;
  const r = state.round;
  const locked = RUN_PHASES.includes(p) || p === 'ERROR' || p === 'RECOVERY';
  const bets = r && p !== 'BETTING' ? r.bets : state.bets;
  for (let n = 1; n <= 50; n++) st[n] = locked ? 'locked' : 'idle';
  const overlay = {};
  const showStops = r && (RESULT_PHASES.includes(p) || (p === 'RESOLVING') || (p === 'DOUBLE_RUN') ||
    (p === 'BETTING' && ui.showLastStop && r.settled));
  if (showStops) {
    const win = r.currentWin > 0 || r.baseWin > 0;
    if (RESULT_PHASES.includes(p) && win) for (let n = 1; n <= 50; n++) st[n] = 'dimmed';
    const s1won = (r.bets[r.s1] || 0) > 0;
    if (!(p === 'DOUBLE_RUN' && ui.light1 && !ui.light1.done)) {
      overlay[r.s1] = s1won && p !== 'BETTING' ? 'winner' : 'lit';
    }
    const s2shown = r.doubleRun && (RESULT_PHASES.includes(p) || p === 'BETTING');
    if (s2shown) overlay[r.s2] = (r.bets[r.s2] || 0) > 0 && p !== 'BETTING' ? 'winner2' : 'second';
  }
  if (p === 'BETTING' && !ui.modalOpen && ui.hover && ui.hover.startsWith('sq-')) {
    const n = Number(ui.hover.slice(3));
    if (!overlay[n]) st[n] = 'hover';
  }
  // running lights (drawn above the lock layer)
  for (const L of [ui.light1, ui.light2]) {
    if (!L || L.idx == null) continue;
    const second = L === ui.light2;
    if (L.trail) {
      L.trail.forEach((n, i) => {
        if (n && !overlay[n]) overlay[n] = i === 0 ? 'trail1' : 'trail2';
      });
    }
    overlay[L.idx] = second ? 'second' : 'lit';
    if (L.level != null && L.level < 1) overlay[L.idx] = second ? 'second' : 'lit';
  }
  for (const k in overlay) st[k] = overlay[k];
  return { st, overlay, bets, locked };
}

// ------------------------------------------------------------ static layers
export function bgLayer(flash = 0) {
  return background() + bunting({ flash });
}

export function topLayer(state, ui, canInfo) {
  const s = [rect(0, 0, W, 80, 0, '#140B2C', 'none', 0, 'opacity="0.55"'), `<line x1="0" y1="80" x2="${W}" y2="80" stroke="${C['marigold-dark']}" stroke-width="2"/>`,
    logo(28, 50, ui.logoLit ?? 7), `<g aria-hidden="true">${balancePlaque(ui.displayBalance ?? state.balance)}</g>`];
  const icons = [
    ['icon-info', 'info', 1700, 'Info and help (paytable, rules)', !canInfo],
    ['icon-settings', 'settings', 1770, 'Settings', !canInfo],
    ['icon-sound', state.settings.mute ? 'muted' : 'sound', 1840, state.settings.mute ? 'Sound is muted, press to unmute (M)' : 'Mute sound (M)', false],
  ];
  for (const [id, kind, cx, label, dis] of icons) {
    s.push(hit(id, iconGlyph(kind, cx, 38, bstate(ui, id, dis)), { label, disabled: dis, ring: `c,${cx},38,28`, area: [cx - 28, 10, 56, 56, 28] }));
  }
  return s.join('');
}

export function frameLayer() {
  return boardFrame() + centerPanelBase();
}

// ------------------------------------------------------------ squares
function squareLabel(n, bet) {
  return `Square ${n}, pays ${MULT[n]}x, your bet ${bet || 0}`;
}

export function squaresLayer(state, ui) {
  const { st, bets, locked } = squareStates(state, ui);
  const interactive = state.phase === 'BETTING' && !ui.modalOpen;
  const ghosts = state.phase === 'BETTING' && state.ghosts && totalOf(state.bets) === 0 ? state.lastBets || {} : {};
  const out = [];
  for (let n = 1; n <= 50; n++) {
    const [x, y] = squareXY(n);
    const bet = bets[n] || 0;
    let inner = square(n, st[n], { bet, ghost: ghosts[n] || 0 });
    if (locked) inner = `<g class="lockfade">${inner}</g>`;
    out.push(hit(`sq-${n}`, inner, {
      label: squareLabel(n, bet), ring: `r,${x},${y},${CELL},${CELL},8`, disabled: !interactive,
      tabindex: ui.roving === n ? 0 : -1, area: [x, y, CELL, CELL, 8],
    }));
  }
  return out.join('');
}

export function lightLayer(state, ui) {
  const { overlay, bets } = squareStates(state, ui);
  const ghosts = state.phase === 'BETTING' && state.ghosts && totalOf(state.bets) === 0 ? state.lastBets || {} : {};
  const s = [];
  if (ui.marquee != null) s.push(frameMarquee(ui.marquee));
  const lit = Object.keys(overlay).map(Number);
  const levelOf = (n) => {
    for (const L of [ui.light1, ui.light2]) if (L && L.idx === n && L.level != null) return L.level;
    return 1;
  };
  for (const n of lit) {
    const lv = levelOf(n);
    const pulse = ui.pulse && ui.pulse.includes(n) ? ' class="pulse"' : '';
    s.push(`<g${pulse} opacity="${lv === 1 ? 1 : Math.max(0.05, lv)}">${halo(n, overlay[n])}</g>`);
  }
  for (const n of lit) s.push(square(n, overlay[n], { bet: bets[n] || 0, ghost: ghosts[n] || 0, level: levelOf(n) }));
  return s.join('');
}

// ------------------------------------------------------------ centre
export function centerView(state, ui, needsRefill) {
  const r = state.round;
  const p = state.phase;
  const v = { text: null, sub: null, col: null, big: false, note: null };
  const partsText = () => {
    const parts = winParts(r.bets, r.s1, r.s2);
    if (!r.doubleRun) {
      const pt = parts[0];
      return `${pt.bet} credit${pt.bet === 1 ? '' : 's'} × ${pt.mult}x on square #${pt.square} = ${fmt(pt.win)}`;
    }
    return parts.map((pt) => (pt.bet ? `#${pt.square}: ${pt.bet} × ${pt.mult}x = ${fmt(pt.win)}` : `#${pt.square}: no bet`)).join('   ·   ');
  };
  if (p === 'BETTING') {
    if (needsRefill) v.text = 'Out of credits';
    else if (r && r.settled && state.lastWin.kind === 'loss' && ui.showLastStop) {
      v.text = 'Try again';
      const stops = r.doubleRun ? `#${r.s1} (${MULT[r.s1]}x) and #${r.s2} (${MULT[r.s2]}x)` : `#${r.s1} (${MULT[r.s1]}x)`;
      v.sub = `The light${r.doubleRun ? 's' : ''} stopped on ${stops}  ·  no bet there  ·  your bets stay on the board`;
      v.note = `${fmt(r.balanceBefore)} − ${r.totalBet} + 0 = ${fmt(r.balance)} credits`;
    } else {
      v.text = 'Place your bets';
      v.sub = 'Pick a chip  ·  click squares  ·  press START';
    }
  } else if (p === 'SPINNING' || (p === 'RESOLVING' && (r.doubleRun || r.currentWin === 0))) {
    v.text = 'Running…';
    v.sub = 'Good luck!  ·  squares are locked until the light stops';
    v.note = `Bet ${r.totalBet} taken:  ${fmt(r.balanceBefore)} − ${r.totalBet} = ${fmt(r.balanceBefore - r.totalBet)} credits`;
  } else if (p === 'DOUBLE_RUN') {
    v.text = 'Double Run…';
    v.sub = `Second light running  ·  it never stops on #${r.s1}`;
  } else if (p === 'RESOLVING' || p === 'GAMBLE_OFFER' || p === 'GAMBLE') {
    v.text = `You win ${fmt(r.currentWin)}`;
    v.col = C.marigold;
    v.big = true;
    v.sub = r.gambles.length && r.currentWin !== r.baseWin ? `${fmt(r.baseWin)} doubled ${Math.log2(r.currentWin / r.baseWin)}× by gamble` : partsText();
    v.note = `After Collect:  ${fmt(r.balanceBefore)} − ${r.totalBet} + ${fmt(r.currentWin)} = ${fmt(r.balanceBefore - r.totalBet + r.currentWin)} credits`;
  } else if (p === 'PAYOUT') {
    if (r.currentWin > 0) {
      v.text = `You win ${fmt(r.currentWin)}`;
      v.col = C.marigold;
      v.big = true;
      v.sub = 'Added to your credits';
    } else {
      v.text = 'No win this time';
      v.sub = 'The gamble did not match  ·  your bets are ready for Rebet';
    }
  } else if (p === 'RECOVERY') v.text = 'Round restored';
  else if (p === 'ERROR') v.text = r && !r.settled && RUN_PHASES.includes(r.phase) ? 'Running…' : 'Paused';
  return v;
}

export function centerLayer(state, ui, needsRefill) {
  const r = state.round;
  const p = state.phase;
  const v = centerView(state, ui, needsRefill);
  const s = [marqueeSign(654, 228, { phase: ui.signPhase || 0 })];
  s.push(`<g aria-hidden="true">${centerText(v)}</g>`);
  const drOn = !!r && r.doubleRun && (p === 'DOUBLE_RUN' || RESULT_PHASES.includes(p) || (p === 'BETTING' && ui.showLastStop && r.settled));
  s.push(doubleRunLamp(154, 672, drOn));
  s.push(miniLegend(394, 672));
  const [l1, l2] = lastStops(state);
  s.push(lastResult(918, 672, l1, l2));
  // Double Run banner: animated drop at DOUBLE_RUN start; shown static on the result (mockup 04)
  const showDrStatic = r && r.doubleRun && RESULT_PHASES.includes(p) && !ui.celebration;
  if (ui.banner && ui.banner.kind === 'dr') s.push(`<g transform="translate(0 ${ui.banner.dy || 0})" opacity="${ui.banner.op ?? 1}">${bannerDoubleRun(654, 214, ui.banner.phase || 0)}</g>`);
  else if (showDrStatic) s.push(bannerDoubleRun(654, 214));
  if (ui.celebration && ui.celebration.kind === 'jackpot') s.push(`<g opacity="${ui.celebration.op ?? 1}">${bannerJackpot(654, 214, ui.signPhase || 0)}</g>`);
  return s.join('');
}

// ------------------------------------------------------------ right panel
export function rightLayer(state, ui, ctx) {
  const { canBet, needsRefill, rebetWhy, gambleWhy } = ctx;
  const p = state.phase;
  const r = state.round;
  const x = 1308, y = 92, w = 588, cx0 = x + 20;
  const s = [rect(x, y, w, 880, 22, 'url(#gPanel)', C['night-panel-edge'], 2, 'opacity="0.96" filter="url(#fShadow)"')];
  const lw = lastWinView(state, ui);
  s.push(`<g aria-hidden="true">${displayCard(cx0, y + 20, 266, 'TOTAL BET', fmt(totalBetView(state)), 'max 200 per round')}${displayCard(cx0 + 282, y + 20, 266, 'LAST WIN', fmt(lw.value), lw.sub, lw.hi ? C.marigold : null, lw.hi)}</g>`);
  s.push(t(x + w / 2, y + 174, 'Bet 1–10 per square  ·  1–200 per round', 16, C['text-muted-on-dark'], UI, 800));
  s.push(t(cx0, y + 214, 'SELECT CHIP', 15, C['text-muted-on-dark'], UI, 900, 'start', 2));
  CHIPS.forEach((v, i) => {
    const ccx = cx0 + 46 + i * 114;
    const id = `chip-${v}`;
    const st = !canBet ? 'disabled' : v === state.chip ? 'selected' : ui.hover === id ? 'hover' : 'idle';
    const lift = st === 'selected' || st === 'hover' ? -6 : 0;
    s.push(hit(id, chip(ccx, y + 280, v, st), {
      label: `Chip ${v}${v === state.chip ? ', selected' : ''} (key ${i + 1})`, disabled: !canBet, ring: `c,${ccx},${y + 280 + lift},47`,
      area: [ccx - 50, y + 230, 100, 104, 50], role: 'radio', extra: `aria-checked="${v === state.chip}"`,
    }));
    s.push(t(ccx, y + 356, `key ${i + 1}`, 13, C['text-muted-on-dark'], UI, 800));
  });
  const bw = (548 - 32) / 3;
  [['btn-undo', 'Undo', 'Ctrl+Z'], ['btn-clear', 'Clear', 'C'], ['btn-rebet', 'Rebet', 'R']].forEach(([id, lab, key], i) => {
    const bx = cx0 + i * (bw + 16);
    const dis = !canBet || (id === 'btn-rebet' && !!rebetWhy);
    s.push(hit(id, button(bx, y + 382, bw, 70, lab, 'neutral', bstate(ui, id, dis), key, 24), {
      label: `${lab} (${key})`, disabled: dis, ring: `r,${bx},${y + 382},${bw},70,14`, area: [bx, y + 382, bw, 76, 14],
    }));
  });
  // START / offer area
  const sy = y + 478;
  const offer = RESULT_PHASES.includes(p) || (p === 'RECOVERY' && r && ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(r.phase));
  if (offer && r) {
    const live = p === 'GAMBLE_OFFER';
    const win = ui.displayWin ?? r.currentWin;
    const gDis = !live || !!gambleWhy;
    const gsub = !live ? '' : gambleWhy === 'cap' ? `cap ${fmt(GAMBLE_CAP)} reached` : gambleWhy === 'max' ? 'no gambles left' : `50/50 · ${MAX_GAMBLES - r.gambles.length} left · G`;
    s.push(hit('btn-collect', button(cx0, sy, 266, 140, 'COLLECT', 'collect', bstate(ui, 'btn-collect', !live), `${fmt(win)} credits · Enter`, 40, SIGN), {
      label: `Collect ${fmt(win)} credits (Enter)`, disabled: !live, ring: `r,${cx0},${sy},266,140,14`, area: [cx0, sy, 266, 146, 14],
    }));
    s.push(hit('btn-gamble', button(cx0 + 282, sy, 266, 140, 'GAMBLE ×2', 'gamble', bstate(ui, 'btn-gamble', gDis), gsub, 38, SIGN), {
      label: gambleWhy === 'cap' ? `Gamble unavailable: doubling would exceed the ${fmt(GAMBLE_CAP)} cap` : gambleWhy === 'max' ? 'Gamble unavailable: 3 gambles used' : 'Gamble times 2, double or nothing (G)',
      disabled: gDis, ring: `r,${cx0 + 282},${sy},266,140,14`, area: [cx0 + 282, sy, 266, 146, 14],
    }));
  } else {
    let lab = 'START', sub = 'SPACE', dis = false;
    if (p === 'BETTING') {
      if (needsRefill) { dis = true; sub = 'no credits'; } else if (totalOf(state.bets) === 0) { dis = true; lab = 'PLACE A BET'; sub = 'START needs 1+ credit bet'; }
      if (ui.modalOpen) dis = dis || false;
    } else if (RUN_PHASES.includes(p)) { dis = true; lab = 'RUNNING…'; sub = 'controls locked'; } else if (p === 'ERROR') { dis = true; lab = 'PAUSED'; sub = null; } else { dis = true; sub = null; }
    if (ui.startLocked) dis = true;
    s.push(hit('btn-start', button(cx0, sy, 548, 140, lab, 'start', bstate(ui, 'btn-start', dis), sub, lab.length <= 7 ? 64 : 46, SIGN), {
      label: dis ? `${lab}, unavailable` : 'START (Space)', disabled: dis, ring: `r,${cx0},${sy},548,140,14`, area: [cx0, sy, 548, 146, 14],
    }));
  }
  const hist = state.history.slice(-10).map((h) => (h.s2 ? [h.s1, h.s2] : h.s1));
  s.push(`<g aria-hidden="true">${historyStrip(cx0, y + 660, hist)}</g>`);
  if (ui.toast) s.push(`<g class="toast-in">${toast(x + w / 2, y + 776, ui.toast.text, ui.toast.kind)}</g>`);
  else {
    s.push(rect(cx0, y + 776, 548, 80, 14, '#0F0822', C['night-panel-edge'], 1.5));
    s.push(t(x + w / 2, y + 810, 'Play credits only. No real money value.', 18, C.cream, UI, 800));
    s.push(t(x + w / 2, y + 836, 'Free refill to 1,000 when credits run out.', 15, C['text-muted-on-dark'], UI, 700));
  }
  return s.join('');
}

export const FOOTER_BETTING = 'Keys:  1–5 chip  ·  Click / Enter add  ·  Right-click / Shift+click / Backspace remove  ·  Ctrl+Z undo  ·  C clear  ·  R rebet  ·  Space start  ·  M mute  ·  Tab move focus';

export function footerText(state, gambleWhy) {
  const p = state.phase;
  const r = state.round;
  if (RUN_PHASES.includes(p)) return 'Light running  ·  only M (mute) is active  ·  result was decided before the light started';
  if (p === 'GAMBLE_OFFER') {
    const both = r.doubleRun && r.bets[r.s1] && r.bets[r.s2];
    if (gambleWhy) return `Enter  collect ${fmt(r.currentWin)}   ·   gamble unavailable (${gambleWhy === 'cap' ? `doubling would exceed ${fmt(GAMBLE_CAP)}` : '3 gambles used'})   ·   Space  press focused button`;
    if (both) return 'Double Run: two different squares won  ·  each square pays once  ·  Enter collect  ·  G gamble  ·  Space press focused button';
    return `Enter  collect ${fmt(r.currentWin)}   ·   G  gamble ×2 (pick red or white, fair 50/50, double or nothing)   ·   Space  press focused button`;
  }
  if (p === 'PAYOUT') return 'Collecting…  ·  click anywhere to skip the count';
  return FOOTER_BETTING;
}

// ------------------------------------------------------------ tooltips
export function squareTooltip(n, state) {
  const [x, y] = squareXY(n);
  const [col, row] = squarePos(n);
  const tier = MULT[n];
  const chipV = state.chip;
  const bet = state.bets[n] || 0;
  const lines = [
    [`Square ${n}  ·  ${tier === 1920 ? '★ ' : ''}${tier}x`, C.marigold, 900, 20],
    [`Pays ${fmt(tier)} per credit bet`, C.cream, 800, 16],
    [`Hit chance ≈ 1 in ${fmt(Math.round(1 / pRound(tier)))} rounds`, C.cream, 800, 16],
  ];
  if (bet) lines.push([`Your bet: ${bet}`, C.cream, 800, 16]);
  lines.push([`Click: +${chipV}  ·  Right-click: −${chipV}`, C['text-muted-on-dark'], 800, 15]);
  const w = 290;
  const h = 26 + 26 * lines.length;
  let tx, ty, arrow;
  if (col === 0) { tx = x + CELL + 18; ty = y + CELL / 2 - h / 2; arrow = 'left'; } else if (col === 15) { tx = x - 18 - w; ty = y + CELL / 2 - h / 2; arrow = 'right'; } else if (row === 0) { tx = x + CELL / 2 - w / 2; ty = y + CELL + 16; arrow = 'up'; } else { tx = x + CELL / 2 - w / 2; ty = y - h - 16; arrow = 'down'; }
  ty = Math.max(90, Math.min(ty, 1070 - h));
  if (col === 0 && n === 49) ty = y - 26; // matches mockup 01 placement
  return tooltip(tx, ty, lines, w, arrow).markup;
}

export function buttonTooltip(id, ctx) {
  const map = {
    'btn-rebet': ctx.rebetWhy ? ['Rebet unavailable', ctx.rebetWhy, 1702, 466] : null,
    'btn-gamble': ctx.gambleWhy === 'cap' ? ['Gamble unavailable', `Doubling would exceed the ${fmt(GAMBLE_CAP)} cap`, 1742, 562]
      : ctx.gambleWhy === 'max' ? ['Gamble unavailable', 'Max 3 gambles used this round', 1742, 562] : null,
    'm-gamble': ctx.modalGambleWhy ? ['Gamble unavailable', ctx.modalGambleWhy, 434, 744] : null,
    'btn-start': ctx.startWhy ? ['START unavailable', ctx.startWhy, 1602, 562] : null,
  };
  const m = map[id];
  if (!m) return '';
  const [title, body, cx, by] = m;
  const lines = [[title, C.danger, 900, 17], ...wrap(body, 30).map((l) => [l, C.cream, 800, 15])];
  const w = 300;
  const h = 26 + 26 * lines.length;
  return tooltip(cx - w / 2, by - h - 14, lines, w, 'down').markup;
}

// ------------------------------------------------------------ modals
export function hudOverScrim(state, ui, { icons = 'disabled' } = {}) {
  const lw = lastWinView(state, ui);
  const s = [rect(0, 0, W, 80, 0, '#140B2C', 'none', 0, 'opacity="0.55"'), `<line x1="0" y1="80" x2="${W}" y2="80" stroke="${C['marigold-dark']}" stroke-width="2"/>`,
    logo(28, 50, ui.logoLit ?? 7), balancePlaque(ui.displayBalance ?? state.balance)];
  [['info', 1700], ['settings', 1770], [state.settings.mute ? 'muted' : 'sound', 1840]].forEach(([k, cx]) => s.push(iconGlyph(k, cx, 38, icons === 'disabled' && (k === 'info' || k === 'settings') ? 'disabled' : 'default')));
  s.push(rect(1308, 92, 588, 164, 22, 'url(#gPanel)', C['night-panel-edge'], 2));
  s.push(displayCard(1328, 112, 266, 'TOTAL BET', fmt(totalBetView(state)), 'max 200 per round'));
  s.push(displayCard(1610, 112, 266, 'LAST WIN', fmt(lw.value), lw.sub, lw.hi ? C.marigold : null, lw.hi));
  return `<g aria-hidden="true">${s.join('')}</g>`;
}

const scrim = () => rect(0, 0, W, 1080, 0, '#0A0516', 'none', 0, 'opacity="0.74"');

export function gambleModal(state, ui, gambleWhy) {
  const r = state.round;
  const x = 154, y = 140, w = 1000, h = 810, cx = x + w / 2;
  const revealing = state.gamble.revealing || ui.flip;
  const flipping = !!ui.flip;
  const s = [modalFrame(x, y, w, h, 'Double or Nothing')];
  const win = ui.displayWin ?? r.currentWin;
  const applied = r.pendingReveal ? r.gambles.slice(0, -1) : r.gambles;
  const flipN = applied.length + 1;
  s.push(t(cx, y + 142, 'CURRENT WIN', 18, C['text-muted-on-dark'], UI, 900, 'middle', 3));
  s.push(`<g aria-live="polite">${t(cx, y + 214, fmt(win), 80, C.marigold, UI, 900, 'middle', 0, `stroke="#2A160A" stroke-width="6" paint-order="stroke" opacity="${ui.winFade ?? 1}"`)}</g>`);
  s.push(t(cx, y + 262, `Pick a colour for flip ${Math.min(flipN, MAX_GAMBLES)}, then press GAMBLE. Fair 50/50: win ×2 if your colour lights.`, 19, C.cream, UI, 800));
  for (const [colour, pcx] of [['red', cx - 165], ['white', cx + 165]]) {
    const id = `pick-${colour}`;
    let st = 'idle';
    let bulbState = null;
    if (revealing || state.phase !== 'GAMBLE') {
      st = 'disabled';
      if (flipping) bulbState = ui.flip.lit === colour ? colour : 'off';
    } else if (state.gamble.pick === colour) st = 'selected';
    else if (ui.hover === id) st = 'hover';
    const sel = state.gamble.pick === colour;
    let inner = pickCard(pcx, y + 400, colour, st, { bulbState });
    if (st === 'disabled' && sel) inner += rect(pcx - 140, y + 293, 280, 214, 18, 'none', C['pick-selected-ring'], 3, 'opacity="0.7"');
    s.push(hit(id, inner, {
      label: `Pick ${colour.toUpperCase()} (${colour === 'red' ? 'R' : 'W'})${sel ? ', your pick' : ''}`, disabled: st === 'disabled', role: 'radio',
      extra: `aria-checked="${sel}"`, ring: `r,${pcx - 140},${y + 293},280,214,18`, area: [pcx - 140, y + 293, 280, 214, 18],
    }));
  }
  s.push(t(cx, y + 408, 'or', 22, C['text-muted-on-dark'], UI, 800));
  // recap of the last applied flip (or the flip in progress)
  let note = '';
  if (flipping) note = ui.flip.text || 'Flipping…';
  else if (applied.length) {
    const k = applied.length;
    const gm = applied[k - 1];
    const prev = r.baseWin * 2 ** (k - 1);
    note = gm.pick === gm.result
      ? `Flip ${k}: you picked ${gm.pick.toUpperCase()}  ·  ${gm.result.toUpperCase()} lit  ·  ${fmt(prev)} doubled to ${fmt(prev * 2)}`
      : `Flip ${k}: you picked ${gm.pick.toUpperCase()}  ·  ${gm.result.toUpperCase()} lit  ·  no win`;
  }
  if (note) s.push(`<g aria-live="polite">${t(cx, y + 548, note, 18, C['text-muted-on-dark'], UI, 800)}</g>`);
  const left = MAX_GAMBLES - r.gambles.length;
  let dots = '';
  for (let i = 0; i < 3; i++) dots += `<circle cx="${cx + 60 + i * 30}" cy="${y + 580}" r="10" fill="${i < left ? C.marigold : 'none'}" stroke="${C.marigold}" stroke-width="3"/>`;
  s.push(t(cx + 30, y + 587, 'GAMBLES LEFT', 18, C['text-muted-on-dark'], UI, 900, 'end', 2) + dots + t(cx + 160, y + 587, `${left} of 3`, 18, C.cream, UI, 900, 'start'));
  const pick = state.gamble.pick;
  const live = state.phase === 'GAMBLE' && !revealing;
  let glab, gsub, gdis = !live;
  if (!pick) { glab = 'PICK A COLOUR'; gsub = 'Gamble needs a red or white pick'; gdis = true; } else { glab = `GAMBLE ON ${pick.toUpperCase()}`; gsub = `win → ${fmt(win * 2)}  ·  lose → 0  ·  G`; }
  if (gambleWhy === 'cap') { glab = pick ? glab : 'GAMBLE ×2'; gsub = `cap ${fmt(GAMBLE_CAP)} reached`; gdis = true; }
  if (gambleWhy === 'max') { gsub = 'no gambles left'; gdis = true; }
  s.push(hit('m-gamble', button(x + 80, y + 612, 400, 112, glab, 'gamble', bstate(ui, 'm-gamble', gdis), gsub, glab.length > 14 ? 32 : 36, SIGN), {
    label: gdis ? `${glab}, unavailable: ${gsub}` : `${glab} (G or Space)`, disabled: gdis, ring: `r,${x + 80},${y + 612},400,112,14`, area: [x + 80, y + 612, 400, 118, 14],
  }));
  const cdis = !live;
  s.push(hit('m-collect', button(x + w - 480, y + 612, 400, 112, 'COLLECT', 'collect', bstate(ui, 'm-collect', cdis), `take ${fmt(win)} → balance ${fmt(state.balance + win)}  ·  Enter`, 44, SIGN), {
    label: `Collect ${fmt(win)} (Enter)`, disabled: cdis, ring: `r,${x + w - 480},${y + 612},400,112,14`, area: [x + w - 480, y + 612, 400, 118, 14],
  }));
  s.push(t(cx, y + 758, 'Keys: R / W or ← → pick  ·  G gamble  ·  Enter collect  ·  Space press focused button', 15, C['text-muted-on-dark'], UI, 800));
  s.push(t(cx, y + 782, `Max 3 gambles; off if the doubled win would exceed ${fmt(GAMBLE_CAP)}.`, 15, C['text-muted-on-dark'], UI, 800));
  return s.join('');
}

export function refillModal(ui) {
  const x = 254, y = 220, w = 800, h = 640, cx = x + w / 2;
  const s = [modalFrame(x, y, w, h, 'Out of credits')];
  s.push(t(cx, y + 160, 'Your play credits have run out.', 26, C.cream, UI, 800));
  s.push(t(cx, y + 196, 'Free refills are unlimited: no waiting, no cost.', 22, C['text-muted-on-dark'], UI, 800));
  s.push(rect(cx - 220, y + 226, 440, 130, 18, '#0F0822', C.turquoise, 3));
  s.push(t(cx, y + 264, 'FREE REFILL', 18, C.turquoise, UI, 900, 'middle', 3));
  s.push(t(cx, y + 336, '1,000 credits', 60, C.cream, UI, 900));
  s.push(hit('m-refill', button(cx - 250, y + 392, 500, 110, 'REFILL 1,000', 'refill', bstate(ui, 'm-refill', false), 'Enter', 44, SIGN), {
    label: 'Refill 1,000 free play credits (Enter)', ring: `r,${cx - 250},${y + 392},500,110,14`, area: [cx - 250, y + 392, 500, 116, 14],
  }));
  s.push(rect(x + 70, y + 538, w - 140, 62, 12, '#0F0822', C['night-panel-edge'], 1.5));
  s.push(t(cx, y + 576, 'Play credits only. No real money value.', 22, C.cream, UI, 900));
  return s.join('');
}

export function errorModal(ui) {
  const x = 254, y = 230, w = 800, h = 620, cx = x + w / 2;
  const s = [modalFrame(x, y, w, h, 'Something went wrong', C.cream)];
  s.push(`<circle cx="${cx}" cy="${y + 190}" r="44" fill="${C.danger}" stroke="${C.cream}" stroke-width="4"/><rect x="${cx - 5}" y="${y + 160}" width="10" height="38" rx="5" fill="#FFFFFF"/><circle cx="${cx}" cy="${y + 212}" r="6" fill="#FFFFFF"/>`);
  ['The game hit a problem and has paused.', 'Your credits and the round in progress are saved', 'on this device. Reload to pick up where you left off.']
    .forEach((ln, i) => s.push(t(cx, y + 282 + i * 34, ln, 23, i === 0 ? C.cream : C['text-muted-on-dark'], UI, 800)));
  s.push(hit('m-reload', button(cx - 220, y + 410, 440, 110, 'RELOAD', 'start', bstate(ui, 'm-reload', false), 'Enter', 48, SIGN), {
    label: 'Reload the game (Enter)', ring: `r,${cx - 220},${y + 410},440,110,14`, area: [cx - 220, y + 410, 440, 116, 14],
  }));
  s.push(t(cx, y + 570, 'If this keeps happening, close the tab and open the game again.', 16, C['text-muted-on-dark'], UI, 700));
  return s.join('');
}

const STAGE_TEXT = {
  SPINNING: 'light result ready', RESOLVING: 'light result ready', DOUBLE_RUN: 'light result ready',
  GAMBLE_OFFER: 'win ready: collect or gamble', PAYOUT: 'win ready to collect',
};

export function recoveryModal(state, ui) {
  const r = state.round;
  const x = 234, y = 200, w = 840, h = 680, cx = x + w / 2;
  const s = [modalFrame(x, y, w, h, 'Round restored')];
  s.push(t(cx, y + 156, 'Your last round did not finish. We saved it.', 24, C.cream, UI, 800));
  s.push(rect(x + 90, y + 190, w - 180, 220, 16, '#0F0822', C.turquoise, 2.5));
  const stage = r.phase === 'GAMBLE' ? (r.pendingReveal ? 'gamble result ready' : 'gamble in progress') : STAGE_TEXT[r.phase];
  [['Bet placed (already taken)', `${r.totalBet} credits`], ['Squares with bets', `${Object.keys(r.bets).length}`], ['Stage', stage], ['Balance now', fmt(state.balance)]]
    .forEach(([a, b], i) => {
      const yy = y + 240 + i * 46;
      s.push(t(x + 120, yy, a, 20, C['text-muted-on-dark'], UI, 800, 'start'));
      s.push(t(x + w - 120, yy, b, 22, C.cream, UI, 900, 'end'));
    });
  s.push(t(cx, y + 448, 'The result was decided before the light started.', 19, C.cream, UI, 700));
  s.push(t(cx, y + 474, 'Continue shows that same result. Reloading never changes it.', 19, C['text-muted-on-dark'], UI, 700));
  s.push(hit('m-continue', button(cx - 230, y + 512, 460, 110, 'CONTINUE', 'refill', bstate(ui, 'm-continue', false), 'Enter', 48, SIGN), {
    label: 'Continue the restored round (Enter)', ring: `r,${cx - 230},${y + 512},460,110,14`, area: [cx - 230, y + 512, 460, 116, 14],
  }));
  return s.join('');
}

const MX = 64, MY = 104, MW = 1180, MH = 860;

function tabbed(active, ui) {
  const s = [modalFrame(MX, MY, MW, MH, null)];
  ['settings', 'paytable', 'help'].forEach((tb, i) => {
    const tx = MX + 40 + i * 236;
    const on = tb === active;
    const label = tb[0].toUpperCase() + tb.slice(1);
    const inner = rect(tx, MY + 36, 220, 64, 14, on ? C['paint-red'] : ui.hover === `tab-${tb}` ? '#3B2868' : '#2E1E52', on ? C.marigold : C['night-panel-edge'], 3) +
      t(tx + 110, MY + 80, label, on ? 34 : 30, on ? C.cream : C['text-muted-on-dark'], DISP, 400) + (on ? rect(tx + 60, MY + 92, 100, 4, 2, C.marigold) : '');
    s.push(hit(`tab-${tb}`, inner, { label: `${label} tab`, role: 'tab', extra: `aria-selected="${on}"`, ring: `r,${tx},${MY + 36},220,64,14`, area: [tx, MY + 36, 220, 64, 14] }));
  });
  s.push(t(MX + 760, MY + 76, 'Tab / ← → to switch', 15, C['text-muted-on-dark'], UI, 800, 'start'));
  const close = `<circle cx="${MX + MW - 70}" cy="${MY + 68}" r="28" fill="${ui.hover === 'close' ? 'url(#gBtnHover)' : 'url(#gBtn)'}" stroke="${C['night-panel-edge']}" stroke-width="2"/><path d="M${MX + MW - 80},${MY + 58} l20,20 M${MX + MW - 60},${MY + 58} l-20,20" stroke="${C.cream}" stroke-width="4" stroke-linecap="round"/>`;
  s.push(hit('close', close, { label: 'Close (Esc)', ring: `c,${MX + MW - 70},${MY + 68},28`, area: [MX + MW - 98, MY + 40, 56, 56, 28] }));
  s.push(t(MX + MW - 112, MY + 74, 'Close  Esc', 15, C['text-muted-on-dark'], UI, 800, 'end'));
  s.push(`<line x1="${MX + 36}" y1="${MY + 112}" x2="${MX + MW - 36}" y2="${MY + 112}" stroke="${C['night-panel-edge']}" stroke-width="2"/>`);
  return s.join('');
}

function settingsTab(state, ui) {
  const st = state.settings;
  const s = [];
  const x0 = MX + 70, y0 = MY + 170;
  const rows = [
    ['Mute all sound', 'Key M  ·  off = sound plays', (y) => hit('tg-mute', toggle(MX + MW - 220, y - 30, st.mute), { label: 'Mute all sound', role: 'switch', extra: `aria-checked="${st.mute}"`, ring: `r,${MX + MW - 220},${y - 30},96,44,22`, area: [MX + MW - 220, y - 30, 96, 44, 22] })],
    ['Music volume', 'Perya crowd & brass loop', (y) => sliderHit('sl-music', MX + 560, y - 8, 420, st.music, 'Music volume')],
    ['Sound effects volume', 'Bulb clicks, wins, gamble drumroll', (y) => sliderHit('sl-sfx', MX + 560, y - 8, 420, st.sfx, 'Sound effects volume')],
    ['Reduced motion', 'No light chase, flashes or particles. Follows your system setting by default.', (y) => hit('tg-rm', toggle(MX + MW - 220, y - 30, st.reducedMotion), { label: 'Reduced motion', role: 'switch', extra: `aria-checked="${st.reducedMotion}"`, ring: `r,${MX + MW - 220},${y - 30},96,44,22`, area: [MX + MW - 220, y - 30, 96, 44, 22] })],
  ];
  rows.forEach(([lab, sub, ctl], i) => {
    const y = y0 + i * 118;
    s.push(rect(x0 - 20, y - 52, MW - 100, 100, 14, '#160C2C', C['night-panel-edge'], 1.5));
    s.push(t(x0, y - 8, lab, 28, C.cream, UI, 900, 'start'));
    s.push(t(x0, y + 24, sub, 17, C['text-muted-on-dark'], UI, 700, 'start'));
    s.push(ctl(y));
  });
  const y = y0 + 4 * 118;
  s.push(rect(x0 - 20, y - 52, MW - 100, 118, 14, '#1A1430', C.marigold, 2.5, 'stroke-dasharray="10 7"'));
  s.push(t(x0, y - 8, 'Turbo (faster light run)', 28, C['disabled-text'], UI, 900, 'start'));
  s.push(rect(x0 + 360, y - 36, 330, 36, 18, C.marigold));
  s.push(t(x0 + 525, y - 12, 'PLACEHOLDER – pending approval', 16, '#2A160A', UI, 900));
  s.push(t(x0, y + 24, 'Design placeholder only. Not part of approved rules; shown disabled.', 17, C['text-muted-on-dark'], UI, 700, 'start'));
  s.push(t(x0, y + 50, 'Behaviour (speed, skip) to be decided by Rogin.', 17, C['text-muted-on-dark'], UI, 700, 'start'));
  s.push(`<g aria-disabled="true" role="switch" aria-checked="false" aria-label="Turbo, placeholder pending approval, disabled">${toggle(MX + MW - 220, y - 30, false, true)}</g>`);
  s.push(t(MX + MW / 2, MY + MH - 50, 'Sound stays muted until your first click or key press.  ·  Settings are saved on this device.', 17, C['text-muted-on-dark'], UI, 800));
  return s.join('');
}

function sliderHit(id, x, y, w, val, label) {
  const kx = x + (w * val) / 100;
  return hit(id, slider(x, y, w, val), {
    label, role: 'slider', extra: `aria-valuemin="0" aria-valuemax="100" aria-valuenow="${val}" data-track="${x},${w}"`,
    ring: `c,${kx},${y},15`, area: [x - 16, y - 22, w + 32, 44, 10],
  });
}

function paytableTab() {
  const s = [];
  const x0 = MX + 60, y0 = MY + 160;
  [[x0, 'PAYS', 'start'], [x0 + 150, 'SQUARES', 'middle'], [x0 + 300, 'PER LIGHT STOP', 'middle'], [x0 + 470, 'PER ROUND*', 'middle'], [x0 + 610, '1 BET RETURNS', 'middle']]
    .forEach(([cx, lab, an]) => s.push(t(cx, y0, lab, 14, C['text-muted-on-dark'], UI, 900, an, 1.5)));
  [1920, 960, 480, 96, 24].forEach((tier, i) => {
    const y = y0 + 22 + i * 64;
    s.push(rect(x0 - 16, y, 700, 56, 10, i % 2 === 0 ? '#160C2C' : '#1C1238'));
    s.push(plaque(x0 + 50, y + 11, tier, 100, 34, 22));
    s.push(t(x0 + 150, y + 38, COUNT_BY_TIER[tier], 24, C.cream, UI, 900));
    s.push(t(x0 + 300, y + 38, `${(pStop(tier) * 100).toFixed(4)}%`, 22, C.cream, UI, 800));
    s.push(t(x0 + 470, y + 38, `1 in ${fmt(Math.round(1 / pRound(tier)))}`, 22, C.cream, UI, 800));
    s.push(t(x0 + 610, y + 38, fmt(tier), 24, C.marigold, UI, 900));
  });
  const yb = y0 + 22 + 5 * 64 + 26;
  s.push(t(x0, yb, '* Chance a given square is hit by either light in one round (includes Double Run).', 15, C['text-muted-on-dark'], UI, 700, 'start'));
  s.push(t(x0, yb + 22, 'Pays = total return including your bet. Example: 5 on a 96x square returns 480.', 15, C['text-muted-on-dark'], UI, 700, 'start'));
  const blocks = [
    ['Double Run', ['1 in 25 rounds a second (turquoise) light runs.', 'It always stops on a different square.', 'Each square pays once per round.']],
    ['Gamble', ['After a win: fair 50/50, double or nothing.', 'Up to 3 times. Collect any time.', `Off if the doubled win would exceed ${fmt(GAMBLE_CAP)}.`]],
    ['Limits', ['1–10 credits per square.', '1–200 credits per round, never above balance.', 'Free refill to 1,000 when credits run out.']],
  ];
  blocks.forEach(([hd, lines], i) => {
    const bx = x0 - 16 + i * 238, by = yb + 52;
    s.push(rect(bx, by, 226, 200, 12, '#160C2C', C['night-panel-edge'], 1.5));
    s.push(t(bx + 16, by + 38, hd, 30, C.marigold, DISP, 400, 'start'));
    let yy = by + 70;
    for (const ln of lines) {
      for (const part of wrap(ln, 27)) {
        s.push(t(bx + 16, yy, part, 15, C.cream, UI, 700, 'start'));
        yy += 20;
      }
      yy += 6;
    }
  });
  const rx = MX + 800, ry = MY + 640;
  s.push(rect(rx, ry, 330, 130, 16, '#0F0822', C.marigold, 3));
  s.push(t(rx + 165, ry + 32, 'RETURN TO PLAYER (RTP)', 15, C['text-muted-on-dark'], UI, 900, 'middle', 1.5));
  s.push(t(rx + 165, ry + 86, '≈ 95.45%', 48, C.marigold, UI, 900));
  s.push(t(rx + 165, ry + 114, 'theoretical long-run average', 15, C.cream, UI, 800));
  s.push(t(x0, MY + MH - 46, 'RTP ≈ 95.45% is a theoretical long-run average over many rounds, not a promise for any session. Play credits only.', 15, C['text-muted-on-dark'], UI, 800, 'start'));
  s.push(miniMap(MX + 800, MY + 190, 19));
  return s.join('');
}

function helpTab() {
  const s = [];
  const x0 = MX + 60, y0 = MY + 170;
  s.push(t(x0, y0, 'How to play', 40, C.marigold, DISP, 400, 'start'));
  ['Pick a chip: 1, 5, 10, 25 or 50.', 'Click squares to place bets (1–10 per square, up to 200 per round).', 'Press START. The light races around the board and stops on one square.',
    "If it stops on your square you win bet × the square's multiplier.", 'After a win: Collect, or pick red or white and Gamble on a fair 50/50 (up to 3 times).']
    .forEach((st, i) => {
      const y = y0 + 44 + i * 42;
      s.push(`<circle cx="${x0 + 16}" cy="${y - 7}" r="16" fill="${C['paint-red']}"/>` + t(x0 + 16, y - 1, i + 1, 18, '#FFFFFF', UI, 900));
      s.push(t(x0 + 46, y, st, 20, C.cream, UI, 700, 'start'));
    });
  s.push(t(x0, y0 + 44 + 5 * 42 + 2, 'Outcomes are random and decided before the light starts. The light only shows the result.', 17, C['text-muted-on-dark'], UI, 700, 'start'));
  const kx = x0, ky = y0 + 318;
  s.push(t(kx, ky, 'Mouse & keyboard', 34, C.marigold, DISP, 400, 'start'));
  const keys = [['Left-click / Enter', 'add chip to square'], ['Right-click / Shift+click / Backspace', 'remove one chip'], ['1 – 5', 'select chip'], ['Space', 'START  ·  press focused button'],
    ['Ctrl+Z', 'undo'], ['C', 'clear all bets'], ['R', 'rebet last round'], ['M', 'mute / unmute'], ['Tab', 'move focus between squares & buttons'],
    ['Gamble:  R / W  or  ← →', 'pick red / white (during a gamble)'], ['Gamble:  G  ·  Enter', 'gamble  ·  collect']];
  keys.forEach(([k, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const xx = kx + col * 540, yy = ky + 40 + row * 34;
    const kw = 14 + k.length * 9.6;
    s.push(rect(xx, yy - 22, kw, 32, 8, '#0F0822', C.cream, 1.5));
    s.push(t(xx + kw / 2, yy, k, 15, C.cream, UI, 900));
    s.push(t(xx + kw + 12, yy, d, 17, C['text-muted-on-dark'], UI, 700, 'start'));
  });
  const dy = MY + MH - 132;
  s.push(rect(x0 - 16, dy, MW - 88, 92, 14, '#0F0822', C.marigold, 3));
  s.push(`<circle cx="${x0 + 30}" cy="${dy + 46}" r="22" fill="${C.marigold}"/>` + t(x0 + 30, dy + 55, 'i', 26, '#2A160A', UI, 900));
  s.push(t(x0 + 70, dy + 42, 'Play credits only. No real money value.', 28, C.cream, UI, 900, 'start'));
  s.push(t(x0 + 70, dy + 72, 'Credits cannot be bought, sold, cashed out or exchanged for prizes.', 17, C['text-muted-on-dark'], UI, 700, 'start'));
  return s.join('');
}

export function infoModal(state, ui) {
  const tab = state.info;
  const body = tab === 'settings' ? settingsTab(state, ui) : tab === 'paytable' ? paytableTab() : helpTab();
  return tabbed(tab, ui) + `<g role="tabpanel">${body}</g>`;
}

/** Which modal is showing (priority order). */
export function activeModal(state, ui, needsRefill) {
  if (state.phase === 'ERROR') return 'error';
  if (state.phase === 'RECOVERY') return 'recovery';
  if (needsRefill) return 'refill';
  if (state.phase === 'GAMBLE' || ui.gambleLinger) return 'gamble';
  if (state.info && state.phase === 'BETTING') return 'info';
  return null;
}

export function modalLayer(state, ui, kind, gambleWhy) {
  if (!kind) return '';
  const body = { error: () => errorModal(ui), recovery: () => recoveryModal(state, ui), refill: () => refillModal(ui), gamble: () => gambleModal(state, ui, gambleWhy), info: () => infoModal(state, ui) }[kind]();
  const label = { error: 'Something went wrong', recovery: 'Round restored', refill: 'Out of credits', gamble: 'Double or Nothing', info: 'Information' }[kind];
  return `${scrim()}${hudOverScrim(state, ui, { icons: kind === 'info' ? 'default' : 'disabled' })}<g class="modal-in" role="dialog" aria-modal="true" aria-label="${label}">${body}</g>`;
}

// ------------------------------------------------------------ loading / enlarge
export function loadingScreen(p) {
  const s = [background(), bunting()];
  s.push(marqueeSign(960, 330, { w: 900, h: 180, size: 112, textY: 128, phase: Math.floor(p * 10) % 2 }));
  s.push(rect(560, 640, 800, 34, 17, '#0F0822', C.marigold, 3));
  s.push(rect(566, 646, 788 * Math.max(0.03, p), 22, 11, 'url(#gMari)'));
  for (let i = 0; i < 10; i++) s.push(bulb(605 + i * 79, 730, 12, i < Math.round(p * 10) ? 'on' : 'off'));
  s.push(t(960, 800, `Loading the perya… ${Math.round(p * 100)}%`, 30, C.cream, UI, 900));
  s.push(t(960, 846, 'Play credits only. No real money value.', 22, C['text-muted-on-dark'], UI, 800));
  return s.join('');
}
