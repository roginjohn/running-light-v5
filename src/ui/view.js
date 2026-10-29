// v3 view: pure functions from (engine state, UI state, derived context, layout) to HTML strings per region.
// No outcome logic here: every number shown comes from the engine state (stored round) or simple display arithmetic.
import { MULT, TIERS, COUNT_BY_TIER, SQUARES_BY_TIER, WEIGHT_BY_TIER, TOTAL_WEIGHT, BLANK_COUNT, BLANK_WEIGHT, CHIPS, pRound, GAMBLE_CAP, MAX_GAMBLES, HISTORY_SHOWN, DOUBLE_RUN_ONE_IN, MAX_PER_ROUND, MIN_BET, REFILL_AMOUNT } from '../engine/config.js';
import { totalOf } from '../engine/bets.js';
// TEMPORARY (Batch 2 adapter, removed in Batch 5): tier-keyed bets shown on the v3 square board.
import { MAX_PER_TIER, TOP_TIER, betOn, tierCls, squareLabel } from './adapter.js';
import { icon, star, chipFace, v3icon, v3mark } from './icons.js';
import { halveBets, doubleBets } from './betscale.js';
import { winners, lightClass, bigMult, bigValue, bigResult } from './track.js';

export const fmt = (n) => Number(n).toLocaleString('en-US');
const px = (v) => `${Math.round(v * 100) / 100}px`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fs = (L, v, min) => Math.max(min, v * L.s);
const kc = (k) => `<span class="kc">${k}</span>`;
const dis = (d) => (d ? ' aria-disabled="true"' : '');
const cap = (c) => c[0].toUpperCase() + c.slice(1);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const ODDS = Object.fromEntries(TIERS.map((t) => [t, `1 in ${fmt(Math.round(1 / pRound(t)))}`]));

/** Display multiplier label: capitals in display contexts ("24X", "★1920X"). */
export function tierLabel(m, noX = false) {
  if (!m) return 'No win';
  return `${m === TOP_TIER ? star() : ''}${m}${noX ? '' : 'X'}`;
}
export function tierBand(m, f, h, w = null) {
  return `<span class="tb t${tierCls(m)}" style="font-size:${px(f)};height:${px(h)};${w ? `width:${px(w)}` : `padding:0 ${px(h * 0.4)}`}">${tierLabel(m)}</span>`;
}

// ------------------------------------------------------------------ derived UI mode
/** bet | locked | offer | ingamble | payout | paused */
export function modeOf(s, ui) {
  if (ui.gambleLoss) return 'ingamble';
  switch (s.phase) {
    case 'BETTING': return 'bet';
    case 'SPINNING': case 'RESOLVING': case 'DOUBLE_RUN': return 'locked';
    case 'GAMBLE_OFFER': return 'offer';
    case 'GAMBLE': return 'ingamble';
    case 'PAYOUT': return 'payout';
    default: return 'paused';
  }
}

export { winners, lightClass, bigMult, bigValue, bigResult };

// ------------------------------------------------------------------ page frame (v3 batch 2)
/** Frame body, rail fill with its 1 px divider, and the bottom-bar fill. Static per layout (no per-state changes). */
export function pageFrame(L) {
  const f = L.frame, b = L.bar;
  const rail = L.rail ? `<div class="frame-rail" style="left:${px(L.rail.x)};top:${px(L.rail.y)};width:${px(L.rail.w + 1)};height:${px(L.rail.h)}"></div>` : ''; // 230 rail + 1 px divider
  return `<div class="frame" style="left:${px(f.x)};top:${px(f.y)};width:${px(f.w)};height:${px(f.h)}"></div>${rail}<div class="frame-bar" style="left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)}"></div>`;
}

// Rail (desktop) and dock (tablet portrait) geometry shared by the credits line and the controls (v3 batch 3).
const HEAD_H = 16; // "Bet amount … Credits 1,000" row (label-sm line height)
const BET_LBL_W = 84; // room kept for "Bet amount" left of the credits overlay
const DOCK_PAD = 12;
function dockCols(L) {
  const d = L.dock;
  const colW = (d.w - 24) / 2;
  return { x1: d.x, x2: d.x + colW + 24, y: d.y + DOCK_PAD + 1, colW };
}

/** Where the credits value sits: right end of the "Bet amount" row (rail top, or the dock's left column). */
export function creditsRect(L) {
  if (L.rail) return { x: L.rail.x + L.rail.pad + BET_LBL_W, y: L.rail.y + L.rail.pad, w: L.rail.w - 2 * L.rail.pad - BET_LBL_W };
  const c = dockCols(L);
  return { x: c.x1 + BET_LBL_W, y: c.y, w: c.colW - BET_LBL_W };
}

/** "Credits 1,000" (with the green +N delta while paying). The markup carries the settled balance; a count-up
 *  writes only the number's text (app.js paintCredits), so a tween frame never rebuilds this region. */
export function credits(s, ui, L) {
  const r = creditsRect(L);
  const bal = s.balance;
  const delta = ui.delta ? `<span class="delta">+${fmt(ui.delta)}</span>` : '';
  return `<div class="credits" role="status" aria-label="Play credits ${fmt(s.balance)}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(HEAD_H)}"><span class="k">Credits</span><span class="v">${delta}<b data-role="balance">${fmt(bal)}</b></span></div>`;
}

// ------------------------------------------------------------------ controls (rail / dock), v3 batch 3
// Flat v3 controls (tokens.md §1–3): bet field with the round total and 1/2 · x2, chip row, primary button
// (Start, or Collect + Gamble ×2 after a win), Undo / Clear / Rebet, last bets, rail note, disclaimer. No shadows.
function chipRow(s, c, keys) {
  const off = c.mode !== 'bet' || !c.canBet;
  return `<div class="chips" role="radiogroup" aria-label="Chip value">${CHIPS.map((v, i) => {
    const sel = s.chip === v;
    return `<button class="chip c${v} hit${sel ? ' sel' : ''}" data-id="chip-${v}" role="radio" aria-checked="${sel}" aria-label="Chip ${v}${keys ? `, key ${i + 1}` : ''}"${dis(off)}>${chipFace(v)}</button>`;
  }).join('')}</div>`;
}

/** Bet field: the TOTAL bet on the board, and 1/2 · x2 that scale every square (clamped by ui/betscale.js). */
export function betField(s, c) {
  const off = c.mode !== 'bet' || !c.canBet || !c.total;
  const half = off || !halveBets(s.bets).changed;
  const dbl = off || !doubleBets(s.bets, s.balance).changed;
  const hint = c.total ? `${c.count} tier${c.count === 1 ? '' : 's'} · ${fmt(c.total)} / ${fmt(MAX_PER_ROUND)} per round` : `${MIN_BET}–${fmt(MAX_PER_TIER)} per tier · ${fmt(MAX_PER_ROUND)} per round`;
  return `<div class="grp"><div class="rhead"><span>Bet amount</span></div>
    <div class="betin${off ? ' off' : ''}"><span class="coin" aria-hidden="true"></span><output class="v" data-role="total" aria-label="Total bet ${c.total} credits">${fmt(c.total)}</output><button class="sc hit" data-id="btn-half" aria-label="Halve every bet (minimum 1 per tier)"${dis(half)}>1/2</button><button class="sc hit" data-id="btn-double" aria-label="Double every bet (maximum ${MAX_PER_TIER} per tier, ${MAX_PER_ROUND} per round)"${dis(dbl)}>x2</button></div>
    <div class="hint" data-role="bet-hint">${hint}</div></div>`;
}

export function lastWin(s, ui, c) {
  const r = s.round;
  const m = c.mode;
  if (s.phase === 'DOUBLE_RUN' && r) {
    const w1 = betOn(r.bets, r.s1) * MULT[r.s1];
    return { label: 'This round', value: w1, note: 'so far · second light running' };
  }
  if (ui.gambleLoss) return { label: 'Last win', value: 0, note: 'gamble lost', lost: true };
  if (m === 'offer') {
    const { w1, w2 } = winners(s, ui);
    return { label: 'Uncollected win', value: r.currentWin, note: w1 && w2 ? '2 squares' : '' };
  }
  if (m === 'ingamble') return { label: 'In gamble', value: r.currentWin, note: 'not collected' };
  if (m === 'payout') return { label: 'Last win', value: r.currentWin, note: 'collected' };
  const lw = s.lastWin;
  if (m === 'bet' && lw.kind === 'loss') return { label: 'Last win', value: 0, note: 'no win this round' };
  if (m === 'bet' && lw.kind === 'paid') {
    const lost = r && r.gambles.length && r.currentWin === 0;
    return { label: 'Last win', value: lw.value, note: lost ? 'gamble lost' : 'last round' };
  }
  return null; // nothing to report yet: the note is not shown
}

/** Rail note (component sheet): "Uncollected win 2,400", "In gamble 4,800 · not collected". Hidden until there
 *  is a result to report. */
function railNote(s, ui, c) {
  const lw = lastWin(s, ui, c);
  if (!lw) return '';
  const v = lw.value; // the count-up writes this number's text only (app.js paintWin), never the rail markup
  return `<div class="rnote${lw.lost ? ' lost' : ''}"><span class="k">${lw.label}</span> <b data-role="lastwin">${fmt(v)}</b>${lw.note ? `<span class="n"> · ${lw.note}</span>` : ''}</div>`;
}

// ------------------------------------------------------------------ top row (v3 batch 4)
/** Row above the track: "Last results:" (newest first) on the left, "Last bets:" (round totals from ui.betTotals,
 *  newest first) on the right. Pills that do not fit wrap onto a hidden second line, so no pill is ever cut. */
export function topRow(s, ui, L) {
  const t = L.top;
  const hist = s.history.slice(-HISTORY_SHOWN).reverse();
  const res = hist.map((h, i) => {
    const m = MULT[h.s1];
    const label = h.s2 ? `${squareLabel(h.s1)} · ${squareLabel(h.s2)}` : squareLabel(h.s1);
    return `<span class="tp k${h.s2 ? 'dr' : tierCls(m)}${i === 0 ? ' new' : ''}${h.win > 0 ? ' won' : ''}">${label}</span>`;
  }).join('');
  const said = (n) => `#${n} ${MULT[n] ? `${MULT[n]}x` : 'blank'}`;
  const resLabel = hist.map((h) => (h.s2 ? `${said(h.s1)} and ${said(h.s2)}` : said(h.s1))).join(', ');
  const bets = ui.betTotals || [];
  const lbs = bets.map((e, i) => `<span class="lb${i === 0 ? ' new' : ''}">${fmt(e.t)}</span>`).join('');
  return `<div class="toprow" style="left:${px(t.x)};top:${px(t.y)};width:${px(t.w)};height:${px(t.h)}">
    <div class="tg" data-role="history" aria-label="Last results, newest first: ${resLabel || 'none yet'}"><span class="k">Last results:</span><span class="tps">${res || '<span class="none">None yet</span>'}</span></div>
    <div class="tg lastbets" data-role="last-bets" aria-label="Last bets, newest first: ${bets.length ? bets.map((e) => e.t).join(', ') : 'none yet'}"><span class="k">Last bets:</span><span class="tps">${lbs || '<span class="none">None yet</span>'}</span></div></div>`;
}

function actionRow(s, c) {
  const off = c.mode !== 'bet' || !c.canBet;
  const undoDis = off || !s.undo.length, clearDis = off || !c.total;
  const rebetDis = off || !!c.rebetWhy || c.rebetSame;
  const lastT = s.lastBets ? totalOf(s.lastBets) : 0;
  const one = (id, label, key, d, hi, title) => `<button class="btn sec hit${hi ? ' hi' : ''}" data-id="${id}" aria-label="${label} (key ${key})"${title ? ` title="${esc(title)}"` : ''}${dis(d)}><span>${label}</span></button>`;
  return `<div class="acts">${one('btn-undo', 'Undo', 'Z', undoDis)}${one('btn-clear', 'Clear', 'C', clearDis)}${one('btn-rebet', c.ghosts && !c.rebetWhy ? `Rebet ${lastT}` : 'Rebet', 'R', rebetDis, c.ghosts && !rebetDis, c.rebetWhy && s.lastBets ? c.rebetWhy : '')}</div>`;
}

const gambleWhyText = (gw) => (gw === 'cap' ? `Gamble is off on wins over ${fmt(GAMBLE_CAP)}` : gw === 'max' ? 'No gambles left for this win' : '');

/** Primary button(s): Start (blue); after a win the Collect (green, dark text) + Gamble ×2 (blue) stack; in the
 *  gamble, Gamble on <colour> (blue) + Collect, which is locked (outline) while the disc flips. */
function mainButtons(s, ui, c, dock) {
  const m = c.mode;
  const r = s.round;
  const st = (inner, d = true) => `<button class="btn pri stack hit" data-id="btn-start"${dis(d)}>${inner}</button>`;
  const collect = (locked) => `<button class="btn ${locked ? 'out' : 'collect'} stack hit" data-id="btn-collect" aria-label="Collect ${fmt(r.currentWin)} to credits (Enter)"${dis(locked)}><span>Collect ${fmt(r.currentWin)}</span><span class="sub">${locked ? 'After the flip' : 'Add to credits'}${dock ? '' : ' · Enter'}</span></button>`;
  if (m === 'offer') {
    const gw = c.gambleWhy;
    const gwText = gambleWhyText(gw);
    const left = MAX_GAMBLES - r.gambles.length;
    return `<div class="mains">${collect(false)}
      <button class="btn gam stack hit" data-id="btn-gamble" aria-label="Gamble times 2, fair 50/50 (G)"${gwText ? ` title="${esc(gwText)}"` : ''}${dis(!!gw)}><span>Gamble ×2</span><span class="sub">${gw ? esc(gwText) : `Fair 50/50 · ${left} of ${MAX_GAMBLES} left${dock ? '' : ' · G'}`}</span></button></div>`;
  }
  if (m === 'locked') return st(`<span>${s.phase === 'DOUBLE_RUN' ? 'Double Run…' : 'Running…'}</span><span class="sub">controls locked</span>`);
  if (m === 'ingamble' && ui.gambleLoss) {
    return `<div class="mains"><button class="btn pri stack hit" data-id="btn-back" aria-label="Back to the board (Enter)"><span>Back to the board</span><span class="sub">continues in ${ui.gambleLoss.left} s${dock ? '' : ' · Enter'}</span></button></div>`;
  }
  if (m === 'ingamble') {
    const w = r.currentWin, pick = s.gamble.pick, gw = c.gambleWhy;
    const odds = `${fmt(w)} → ${fmt(w * 2)} or 0`;
    const flip = (inner, d, label = '') => `<button class="btn gam stack hit" data-id="btn-flip"${label ? ` aria-label="${esc(label)}"` : ''}${dis(d)}>${inner}</button>`;
    let f;
    if (s.gamble.revealing) f = flip(`<span>Flipping…</span><span class="sub">${cap(pick)} · ${odds}</span>`, true);
    else if (gw) f = flip(`<span>Gamble ×2</span><span class="sub">${esc(gambleWhyText(gw))}</span>`, true);
    else if (!pick) f = flip(`<span>Pick red or white</span><span class="sub">${dock ? 'tap a disc' : 'R / W, then G'}</span>`, true);
    else f = flip(`<span>Gamble on ${pick}</span><span class="sub">${odds}${dock ? '' : ' · G'}</span>`, false, `Gamble on ${pick}: ${w} becomes ${w * 2} or 0 (G)`);
    return `<div class="mains">${f}${collect(s.gamble.revealing)}</div>`;
  }
  if (m === 'payout') return st('<span>Paying…</span><span class="sub">tap to skip the count-up</span>');
  if (m === 'paused') return st('<span>Paused</span><span class="sub">see the message</span>');
  if (!c.total) return st('<span>Place a bet</span><span class="sub">then press START</span>');
  return st(`<span>Start</span><span class="sub">${fmt(c.total)} credits on ${c.count} tier${c.count === 1 ? '' : 's'}${dock ? '' : ' · Space'}</span>`, !c.canBet || ui.startLocked);
}

const disclaimer = () => `<p class="rdisc"><b>Play credits only.</b> No real money value. Free refill to ${fmt(REFILL_AMOUNT)} whenever you run out.</p>`;
const chipGroup = (s, c, keys) => `<div class="grp"><div class="rhead"><span>Chip value</span></div>${chipRow(s, c, keys)}</div>`;

export function controls(s, ui, c, L) {
  // win offer and gamble (win-gamble-offer.png, gamble-flip.png): the note goes above the Collect / Gamble stack
  // and Undo / Clear / Rebet are not shown (they cannot be used until the win is settled)
  const result = c.mode === 'offer' || c.mode === 'ingamble';
  const acts = result ? '' : actionRow(s, c);
  if (L.rail) {
    const r = L.rail;
    const note = railNote(s, ui, c);
    return `<div class="rail" role="region" aria-label="Bet controls" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}">
      ${betField(s, c)}${chipGroup(s, c, true)}${result ? note : ''}${mainButtons(s, ui, c, false)}${acts}${result ? '' : note}
      <div style="flex:1"></div>${disclaimer()}</div>`;
  }
  // tablet portrait: the rail as a 2-column block (left: bet field, note; right: chips, button, actions)
  const d = L.dock;
  return `<div class="dock" role="region" aria-label="Bet controls" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)};padding:${DOCK_PAD}px 0">
      <div class="dcol">${betField(s, c)}${railNote(s, ui, c)}</div>
      <div class="dcol">${chipGroup(s, c, false)}${mainButtons(s, ui, c, true)}${acts}</div>
      ${disclaimer()}</div>`;
}

// ------------------------------------------------------------------ tiles
// v3 batch 4: flat squares (tokens.md §1). The static part is built once per tile; per state only the tile's
// class list and its .dyn child (bet badge, result veil) change, and during a light run only the class list.
export function tileStatic(n) {
  return `<span class="num">${n}</span><span class="m">${squareLabel(n)}</span><span class="dyn"></span>`;
}

/** Per-tile dynamic look: { cls, dyn, disabled, label } (diffed by the controller). */
export function tileLook(n, s, ui, c) {
  const r = s.round;
  const m = MULT[n];
  const cls = [`q${tierCls(m)}`];
  const light = lightClass(n, ui);
  if (light) cls.push(light);
  // v3 batch 5 result look (component sheet): a winning stop is flat accent-green with dark text, a losing stop
  // keeps the tile-lit fill, and in a Double Run both stops show "1st" / "2nd" in place of the square number.
  // No glow, ring, pulse, chase, veil or WIN tag; the only motion is the batch-4 landing pop (transform).
  const { w1, w2 } = winners(s, ui);
  let mark = '', result = '';
  if (r) {
    const revealed = ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(s.phase) || ui.gambleLoss || ui.showLastStop;
    const first = n === r.s1 && (revealed || s.phase === 'DOUBLE_RUN');
    const second = r.s2 && n === r.s2 && revealed;
    if (first || second) {
      result = n === w1 || n === w2 ? 'win' : 'lit';
      if (!light) cls.push(result);
      if (r.doubleRun) {
        cls.push('mk');
        mark = `<span class="mkt">${first ? '1st' : '2nd'}</span>`;
      }
    }
  }
  const live = betOn(s.bets, n); // the square shows its tier's bet (Batch 2 adapter)
  const ghostV = !live && c.ghosts && s.lastBets ? betOn(s.lastBets, n) : 0;
  // No veil or lock icon while the light runs (running.png): squares keep their look, so a light step changes
  // classes only. They are still aria-disabled.
  let dyn = mark;
  if (live) dyn += `<span class="bet">${live}</span>`;
  else if (ghostV) dyn += `<span class="bet ghost">${ghostV}</span>`;
  const said = result === 'win' ? ', winning stop' : result ? ', the light stopped here' : '';
  const what = m ? `pays ${m}x, your ${m}x bet ${live}` : 'blank square, no win';
  return { cls: cls.join(' '), dyn, disabled: !c.canBet || !m, label: `Square ${n}, ${what}${said}` };
}

// ------------------------------------------------------------------ centre panel
const cardOf = (r, n, idx) => {
  const b = betOn(r.bets, n);
  const none = MULT[n] ? `No ${MULT[n]}x bet` : 'Blank · no win';
  return `<div class="card${b ? ' won' : ''}"><b>${idx ? `${idx} · ` : ''}#${n}</b><span class="cm">${squareLabel(n)}</span><span class="cv"><i>${b ? 'Bet × pays' : 'Your bet'}</i><b>${b ? `${b} × ${MULT[n]} = ${fmt(b * MULT[n])}` : none}</b></span></div>`;
};
const pips = (used) => `<span class="pips" aria-hidden="true">${[0, 1, 2].map((i) => `<i${i < used ? ' class="used"' : ''}></i>`).join('')}</span>`;
const leftText = (used) => (used >= MAX_GAMBLES ? 'none left' : `${MAX_GAMBLES - used} of ${MAX_GAMBLES} left`);

export function centreModel(s, ui, c) {
  const r = s.round;
  const m = c.mode;
  const M = {};
  M.dr = !!(r && r.doubleRun && (s.phase === 'DOUBLE_RUN' || ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(s.phase) || ui.showLastStop || ui.gambleLoss));
  if (s.phase === 'ERROR') return { ...M, status: ['coral', 'Paused'], headline: 'Paused', sub: '' };
  if (s.phase === 'RECOVERY') return { ...M, status: ['amber', 'Restoring'], headline: 'Round restored', sub: '' };
  if (s.phase === 'SPINNING' || s.phase === 'RESOLVING') {
    return { ...M, status: ['amber', 'Running'], headline: 'Running…', sub: 'Bets are locked until the light stops.', note: `Credits ${fmt(r.balanceBefore)} − ${fmt(r.totalBet)} bet = <b>${fmt(r.balance)}</b>` };
  }
  if (s.phase === 'DOUBLE_RUN') {
    return { ...M, status: ['cyan', 'Double Run'], headline: 'Double Run!', sub: `A second light is running. #${r.s1} stays lit, and the second light can’t stop on it.`, cards: [cardOf(r, r.s1, 1)] };
  }
  const { w1, w2 } = winners(s, ui);
  const cards = r ? (r.doubleRun ? [cardOf(r, r.s1, 1), cardOf(r, r.s2, 2)] : [cardOf(r, r.s1)]) : [];
  if (m === 'ingamble') {
    const won = w1 && w2 ? `Double Run · won ${fmt(r.baseWin)}` : `#${w1 || w2} · ${MULT[w1 || w2]}x · won ${fmt(r.baseWin)}`;
    return { ...M, gamble: true, status: ui.gambleLoss ? ['coral', 'Gamble lost'] : ['on', 'Gamble'], won };
  }
  M.on = new Set([w1, w2].filter(Boolean).map((n) => MULT[n]));
  if (m === 'offer') {
    const status = MULT[w1] === TOP_TIER || MULT[w2] === TOP_TIER ? ['mint', 'Jackpot'] : r.doubleRun ? ['mint', 'Double Run win'] : ['mint', 'Win'];
    let sub;
    if (r.doubleRun && w1 && w2) sub = `Two squares won this round. A second light ran and could not stop on #${r.s1}.`;
    else if (r.doubleRun && w1) sub = `The second light stopped on #${r.s2} (no win there).`;
    else if (r.doubleRun) sub = `The first light stopped on #${r.s1} (no win there).`;
    else sub = c.gambleWhy ? `Collect it. Gamble is off above ${fmt(GAMBLE_CAP)} credits.` : 'Collect it, or gamble it on a fair 50/50.';
    return { ...M, status, headline: `You win ${fmt(r.baseWin)}`, sub, cards, band: true };
  }
  if (m === 'payout') {
    return { ...M, status: ['mint', 'Paid'], headline: `+${fmt(r.currentWin)} collected`, sub: `Added to your credits: ${fmt(s.balance - r.currentWin)} → ${fmt(s.balance)}`, cards };
  }
  // BETTING
  if (ui.showLastStop && r) {
    const sub = r.doubleRun ? `The lights stopped on #${r.s1} and #${r.s2}. Your bets are still on the board.` : `The light stopped on #${r.s1} (${MULT[r.s1] ? `${MULT[r.s1]}x` : 'blank'}). Your bets are still on the board. Press <b>Start</b> to play them again.`;
    return { ...M, status: ['coral', 'No win'], headline: 'No win this time', sub, cards };
  }
  if (c.ghosts) return { ...M, status: ['idle', 'Betting open'], headline: 'Place your bets', sub: `Last round’s bets are shown as outlines. Press Rebet to place all ${totalOf(s.lastBets)} again.` };
  return { ...M, status: ['idle', 'Betting open'], headline: 'Place your bets', sub: 'Pick a chip, tap a square to bet on its tier, then press <b>Start</b>.' };
}

/** Navy "Double or nothing" band under a win (win-gamble-offer.png): the fair 50/50, both outcomes, gambles left. */
function gambleBand(s, c) {
  const r = s.round;
  const used = r.gambles.length;
  const what = c.gambleWhy ? gambleWhyText(c.gambleWhy) : `Fair 50/50 · Win → ${fmt(r.currentWin * 2)} · Lose → 0`;
  return `<div class="gband"><b>Double or nothing</b><span>${esc(what)}</span>${pips(used)}<span>${leftText(used)}</span></div>`;
}

function recapText(r, loss) {
  const parts = [];
  let w = r.baseWin;
  r.gambles.forEach((g, i) => {
    if (r.pendingReveal && i === r.gambles.length - 1) return;
    if (loss && i === r.gambles.length - 1) parts.push(`Flip ${i + 1}: you picked ${cap(g.pick)} · ${cap(g.result)} lit`);
    else if (g.pick === g.result) { parts.push(`Flip ${i + 1}: you picked ${cap(g.pick)} · ${cap(g.result)} lit · ${fmt(w)} → ${fmt(w * 2)}`); w *= 2; }
  });
  return parts.join(' · ');
}

/** Gamble (gamble-flip.png): a navy panel in the centre with the two flat discs, the flip disc between them, the
 *  outcome cards and the flips so far. The flip is one element with two faces turned by a 700 ms rotateY (CSS),
 *  ending on the result the engine stored when GAMBLE was pressed. Gamble / Collect stay in the rail. */
function gamblePanel(s, ui, c, L) {
  const r = s.round;
  const loss = ui.gambleLoss;
  const used = r.gambles.length;
  const rev = s.gamble.revealing;
  const pick = loss ? loss.pick : s.gamble.pick;
  const w = loss ? loss.win : r.currentWin;
  const flipNo = loss ? loss.flip : rev ? used : used + 1;
  const shown = rev ? used - 1 : used; // the flip in progress is not used up until it resolves
  const off = !!loss || rev || !!c.gambleWhy;
  const disc = (col) => {
    const sel = pick === col;
    const key = col === 'red' ? 'R / ←' : 'W / →';
    const foot = sel ? '<span class="yp">Your pick</span>' : L.dockMode ? '' : `<span class="gk">key ${key}</span>`;
    return `<button class="pick hit ${col}${sel ? ' sel' : ''}" data-id="pick-${col}" role="radio" aria-checked="${sel}" aria-label="${cap(col)} (key ${col === 'red' ? 'R or left arrow' : 'W or right arrow'})"${dis(off)}><span class="disc"></span><b>${cap(col)}</b>${foot}</button>`;
  };
  // flip disc: turning while the stored result is revealed, then resting on the last result
  const lastRes = used ? r.gambles[used - 1].result : null;
  const turning = rev && ui.flip && !ui.flip.final;
  const mid = lastRes && (rev || loss || ui.flip || ui.matchMsg)
    ? `<span class="flip ${lastRes === 'red' ? 'r' : 'w'}${turning ? ' go' : ''}" aria-hidden="true"><i class="coin"><i class="f"></i><i class="f b"></i></i></span>`
    : '<span class="gor">or</span>';
  let msg;
  if (loss) msg = `<b class="lost">No match.</b> ${cap(loss.result)} lit. Your pick was ${cap(loss.pick)}, so the ${fmt(w)} gamble is lost.`;
  else if (rev) msg = `<b>Flipping…</b> If ${pick} lights, your win doubles.`;
  else if (ui.matchMsg) msg = `<b class="won">Match!</b> ${cap(ui.matchMsg.colour)} lit. Your win is now ${fmt(r.currentWin)}.${c.gambleWhy ? ' Collect it.' : ' Gamble again or collect.'}`;
  else if (c.gambleWhy) msg = `${esc(gambleWhyText(c.gambleWhy))}. Collect your win.`;
  else if (!pick) msg = `Pick red or white for flip ${flipNo}. If your colour lights, your win doubles.`;
  else msg = `You picked ${pick}. If ${pick} lights, your win doubles.`;
  const gc = (k, v, cls = '') => `<div class="gc"><span>${k}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b></div>`;
  const other = pick === 'red' ? 'white' : 'red';
  const cards = loss
    ? gc('Gamble lost', fmt(w), 'lost') + gc('Credits', fmt(s.balance))
    : gc('Current win', `<span data-role="current-win">${fmt(w)}</span>`) + gc(pick ? `${cap(pick)} lights` : 'Match', fmt(w * 2), 'won') + gc(pick ? `${cap(other)} lights` : 'No match', '0');
  const recap = recapText(r, loss);
  return `<div class="gpanel" role="group" aria-label="Double or nothing">
    <div class="ghead"><b>Double or nothing · flip ${flipNo}</b><span class="gl">${pips(shown)}${leftText(shown)}</span></div>
    <div class="gdiscs" role="radiogroup" aria-label="Pick a colour">${disc('red')}${mid}${disc('white')}</div>
    <div class="gmsg" data-role="gamble-instr" aria-live="polite">${msg}</div>
    <div class="gcards"${loss ? ' data-role="gamble-loss"' : ''}>${cards}</div>${recap ? `<div class="grec">${recap}</div>` : ''}</div>
    <div class="gnote">${loss ? `Your credits stay at <b>${fmt(s.balance)}</b>. Nothing else was taken.` : `Gamble is turned off on wins over ${fmt(GAMBLE_CAP)} credits.`}</div>`;
}

/** Centre (v3 batches 4–5): status pills, the big multiplier, a flat title and sub line, the pays row (the won
 *  tiers in green), result cards, and the navy gamble band; or the gamble panel. The number's text is written by
 *  the controller (app.js paintBig), so a light step never rebuilds this region. */
export function centre(s, ui, c, L) {
  const M = centreModel(s, ui, c);
  const I = L.inner;
  const box = (cls, inner) => `<div class="centre${cls}" style="left:${px(I.x)};top:${px(I.y)};width:${px(I.w)};height:${px(I.h)}">${inner}</div>`;
  const st = `<span class="cp ${M.status[0]}" data-role="status">${M.status[1]}</span>`;
  if (M.gamble) return box(' gam', `<div class="cps">${st}<span class="cp mint">${M.won}</span></div>${gamblePanel(s, ui, c, L)}`);
  const dr = `<span class="cp${M.dr ? ' on' : ''}">${M.dr ? 'Double Run on' : `Double Run · 1 in ${DOUBLE_RUN_ONE_IN}`}</span>`;
  const B = bigResult(s, ui);
  const on = M.on || new Set();
  const pays = I.w < 420 ? '' : `<div class="pays">${TIERS.map((m) => `<span class="pay${on.has(m) ? ' on' : ''}"><b>${m}x</b><i>${COUNT_BY_TIER[m]} square${COUNT_BY_TIER[m] > 1 ? 's' : ''}</i></span>`).join('')}</div>`;
  return box('', `<div class="cps">${st}${dr}</div>
    <div class="bigrow"><div class="big${B.win ? ' win' : ''}" aria-hidden="true"><span data-role="big"></span><small>x</small></div>${B.extra ? `<div class="big2" aria-hidden="true">+ ${B.extra}<small>x</small></div>` : ''}</div>
    <div class="ctxt" aria-live="polite"><div class="ctitle" data-role="headline">${M.headline}</div>${M.sub ? `<div class="csub">${M.sub}${M.note ? ` ${M.note}` : ''}</div>` : ''}</div>
    ${pays}${M.cards && M.cards.length ? `<div class="cards">${M.cards.join('')}</div>` : ''}${M.band ? gambleBand(s, c) : ''}`);
}

// ------------------------------------------------------------------ bottom bar (v3 batch 2)
/** 40 px bar across the frame: sound, settings, stats (paytable + help) left; title centre; fairness right. */
export function bottomBar(s, ui, c, L) {
  const b = L.bar;
  const locked = !['BETTING', 'INIT'].includes(s.phase);
  const off = !c.canInfo;
  const lockWhy = !locked ? '' : ['locked', 'paused'].includes(c.mode) ? 'unlocks when the round ends' : 'opens again after you collect';
  const ib = (id, ic, label, d) => `<button class="ibtn hit${d ? '' : ' on'}" data-id="${id}" aria-label="${label}${lockWhy ? `: ${lockWhy}` : ''}"${lockWhy ? ` title="${label}: ${lockWhy}"` : ''}${dis(d)}>${ic}${lockWhy ? `<span class="lk">${icon('lock')}</span>` : ''}</button>`;
  const mute = s.settings.mute;
  const sound = `<button class="ibtn hit on" data-id="icon-sound" role="switch" aria-checked="${!mute}" aria-label="${mute ? 'Sound muted, press to turn on (M)' : 'Sound on, press to mute (M)'}">${icon(mute ? 'mute' : 'sound')}</button>`;
  const tail = b.w >= 640 ? ' · Play credits only · No real money value' : ' · Play credits only';
  return `<div class="bbar" role="toolbar" aria-label="Sound, settings and game info" style="left:${px(b.x)};top:${px(b.y)};width:${px(b.w)};height:${px(b.h)}">
    <div class="bb-l">${sound}${ib('icon-settings', icon('gear'), 'Settings', off)}${ib('icon-stats', v3icon('stats'), 'Paytable and help', off)}</div>
    <div class="bb-c">${v3mark()}<span><b>Running Light</b>${tail}</span></div>
    <div class="bb-r">${ib('icon-fair', v3icon('scales'), 'How results are decided', off)}</div></div>`;
}

// ------------------------------------------------------------------ tooltip / long-press sheet
export function tooltip(n, s, L, sheet) {
  const { x, y, side } = L.pos[n];
  const m = MULT[n];
  const w = 250 * L.s + 20 + (sheet ? 30 : 0);
  const f = fs(L, 14, 12);
  let l = side === 'left' ? x + L.tile.w + 14 : x - w - 14;
  let arrow = side === 'left' ? 'arrow-left' : 'arrow-right';
  if (l < 4) { l = x + L.tile.w + 14; arrow = 'arrow-left'; }
  if (l + w > L.W - 4) { l = L.W - w - 4; arrow = 'arrow-up'; }
  const t = Math.max(L.header + 4, Math.min(y - 10, L.H - 190));
  const bet = betOn(s.bets, n);
  const foot = !m ? ''
    : sheet
      ? `<div class="tbtns"><button class="btn sec hit" data-id="tip-remove" aria-label="Remove ${s.chip} from the ${m}x tier"${dis(!bet)}>−${s.chip}</button><button class="btn cta hit" data-id="tip-add" aria-label="Add ${s.chip} to the ${m}x tier"${dis(bet >= MAX_PER_TIER)}>+${s.chip}</button></div>`
      : `<div class="lo" style="margin-top:6px;font-weight:600;font-size:${px(f * 0.86)}">Click +${s.chip} · Right-click −${s.chip}</div>`;
  const body = m
    ? `Pays <b style="color:var(--c-text-hi)">${m}× your ${m}x bet</b> (incl. stake)<br>This square, per round ≈ ${ODDS[m]}<br>Your ${m}x bet: ${fmt(bet)} / ${fmt(MAX_PER_TIER)}`
    : 'Blank square: no win.<br>A light that stops here pays nothing.';
  return `<div class="tip ${arrow}${sheet ? ' sheet' : ''}" role="${sheet ? 'dialog' : 'tooltip'}" aria-label="Square ${n}" style="left:${px(l)};top:${px(t)};width:${px(w)};padding:${px(12 * L.s)} ${px(14 * L.s)};font-size:${px(f)}">
    <div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:${px(f * 1.1)}">Square ${n} ${tierBand(m, f * 0.85, f * 1.4)}</div>
    <div class="muted" style="margin-top:6px;font-weight:600;line-height:1.45">${body}</div>${foot}</div>`;
}

// ------------------------------------------------------------------ toast
export function toastHtml(t, L) {
  if (!t) return '';
  const f = fs(L, 15, 12);
  let l, tp, w;
  if (L.dockMode) { w = Math.min(L.inner.w - 12, 420); l = (L.W - w) / 2; tp = L.inner.y + L.inner.h - 64; }
  else { w = L.rail.w - 2 * (L.bp === 'desktop-xl' ? 24 : 14); l = L.rail.x + (L.rail.w - w) / 2; tp = L.rail.y + L.rail.h - (L.bp === 'desktop-xl' ? 170 : 130); }
  const kind = t.kind === 'ok' ? 'ok' : t.kind === 'info' ? 'info' : '';
  const ic = kind === 'ok' ? 'check' : kind === 'info' ? 'info' : 'alert';
  return `<div class="toast ${kind}${t.out ? ' out' : ''}" role="status" style="left:${px(l)};top:${px(tp)};width:${px(w)};padding:12px 14px;font-size:${px(f)}">${icon(ic)}<span data-role="toast">${esc(t.text)}</span></div>`;
}

// ------------------------------------------------------------------ dialogs (v3 batch 6)
// Flat dialogs (refill.png, error.png, settings-paytable-help.png): bg-frame fill, 1 px border, 8 px radius and no
// shadow, over a flat scrim. Refill dims and centres on the game area only (refill.png: the rail and bar stay lit);
// the others cover the page. The wrapper centres the dialog, so its height follows the content. Tablet portrait
// shows them as bottom sheets over the whole page.
function dialog(L, { w, label, cls = '', stage = false }, inner) {
  const a = stage && !L.dockMode ? L.stage : { x: 0, y: 0, w: L.W, h: L.H };
  const scrim = stage && !L.dockMode ? `<div class="scrim st" style="left:${px(a.x)};top:${px(a.y)};width:${px(a.w)};height:${px(a.h)}"></div>` : '<div class="scrim"></div>';
  return `${scrim}<div class="dwrap${L.dockMode ? ' sheet' : ''}" style="left:${px(a.x)};top:${px(a.y)};width:${px(a.w)};height:${px(a.h)}"><div class="dlg${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}"${L.dockMode ? '' : ` style="width:${px(Math.min(w, a.w - 32))}"`}>${inner}</div></div>`;
}
const dbtn = (id, main, sub, label) => `<button class="btn pri stack hit dbtn" data-id="${id}" aria-label="${esc(label)}"><span>${main}</span><span class="sub">${sub}</span></button>`;
const dfoot = '<p class="dfoot">Play credits only. No real money value.</p>';
const dhead = (ic, title) => `<span class="dic" aria-hidden="true">${icon(ic)}</span><h2 class="dtitle">${title}</h2>`;
const enterKey = (L) => (L.dockMode ? '' : ' · Enter');

export function refillModal(s, ui, L) {
  return dialog(L, { w: 420, label: 'Out of play credits', stage: true }, `${dhead('reload', 'Out of play credits')}
    <p class="dtext">Take a free refill and keep playing. Refills are unlimited, with no waiting and no cost.</p>
    <div class="drow"><span>Free refill</span><b>${fmt(REFILL_AMOUNT)} credits</b></div>
    ${dbtn('m-refill', `Refill ${fmt(REFILL_AMOUNT)}`, `Free${enterKey(L)}`, `Refill ${fmt(REFILL_AMOUNT)} play credits, free (Enter)`)}${dfoot}`);
}

export function errorCode(err) {
  if (!err) return 'E-UNKNOWN';
  if (err.key) return `E-CORRUPT-${err.key.split('.').pop().toUpperCase()}`;
  if (/storage|quota|setItem/i.test(err.message)) return 'E-STORAGE-WRITE';
  return 'E-RUNTIME';
}

/** error.png: red top edge, the saved round in a mono line, Reload. */
export function errorModal(s, L) {
  const r = s.round;
  const pending = r && !r.settled;
  const code = errorCode(s.error);
  const line = pending ? `Round in progress: bet ${fmt(r.totalBet)} · ${plural(Object.keys(r.bets).length, 'tier')} · credits ${fmt(s.balance)} · code ${code}` : `Nothing was in progress · credits ${fmt(s.balance)} · code ${code}`;
  const sub = pending ? 'Restores your round' : 'Continues the game';
  return dialog(L, { w: 460, label: 'Something went wrong', cls: ' err' }, `${dhead('alert', 'Something went wrong')}
    <p class="dtext">The game paused to keep your round safe. Your bet and its result are already saved on this device, so reloading <b>won’t change the outcome or charge you again</b>.</p>
    <div class="dcode" data-role="error-code">${esc(line)}</div>
    ${dbtn('m-reload', 'Reload', `${sub}${enterKey(L)}`, `Reload: ${sub.toLowerCase()} (Enter)`)}${dfoot}`);
}

/** Recovery (not mocked): the same flat dialog as Refill, with the saved round as label / value rows. */
export function recoveryModal(s, L) {
  const r = s.round;
  const stage = { SPINNING: ['Light running', 'Show the stored stop, then settle'], RESOLVING: ['Light stopped', 'Show the stored stop, then settle'], DOUBLE_RUN: ['Double Run running', 'Show both stored stops, then settle'], GAMBLE_OFFER: ['Win offered', 'Show the win, then Collect or Gamble'], GAMBLE: ['Gamble in progress', 'Finish the stored gamble'], PAYOUT: ['Paying out', 'Finish the payout'] }[r.phase] || ['—', '—'];
  const row = (a, b) => `<div class="drow"><span>${a}</span><b>${b}</b></div>`;
  return dialog(L, { w: 460, label: 'Round restored' }, `${dhead('reload', 'Round restored')}
    <p class="dtext">Your last round was interrupted. Its result was decided before the light started, and Continue shows that same result. Nothing is redrawn.</p>
    <div class="drows">${row('Bet already taken', `${fmt(r.totalBet)} credits · ${plural(Object.keys(r.bets).length, 'tier')}`)}${row('Stage', stage[0])}${row('Credits now', fmt(s.balance))}${row('Next', stage[1])}</div>
    ${dbtn('m-continue', 'Continue', `Show my result${enterKey(L)}`, 'Continue: show my result (Enter)')}${dfoot}`);
}

/** Fairness panel (bottom-bar scales icon): how the engine decides results. Plain facts only; there is no seed
 *  verification, so nothing here may suggest one. Numbers come from engine/config.js. */
export function fairnessModal(L) {
  const weights = TIERS.map((t) => WEIGHT_BY_TIER[t]).join(' / ');
  const item = (a, b) => `<li><b>${a}</b> ${b}</li>`;
  return dialog(L, { w: 560, label: 'How results are decided', cls: ' info' }, `<div class="ihead">${v3icon('scales')}<h2>How results are decided</h2><button class="ibtn hit x" data-id="f-close" aria-label="Close (Esc)">${icon('x')}</button></div>
    <ul class="facts" data-role="fairness">
    ${item('Drawn first.', 'When you press Start, the result is drawn and saved on this device before the light starts. The light only shows that saved result, and reloading shows the same one.')}
    ${item('Weighted squares.', `Squares are not equally likely: weights ${weights} per square for ${TIERS.map((t) => `${t}x`).join(' / ')}, and ${BLANK_WEIGHT} for each of the ${BLANK_COUNT} blank squares, of ${fmt(TOTAL_WEIGHT)}. A blank square pays nothing.`)}
    ${item(`Double Run, 1 in ${DOUBLE_RUN_ONE_IN}.`, 'Drawn in the same step. The second light never stops on the first square.')}
    ${item('Gamble, fair 50/50.', `Red or white is drawn when you press Gamble and saved before the disc flips. A match doubles the win, no match loses it. Up to ${MAX_GAMBLES} per win, and off on wins over ${fmt(GAMBLE_CAP)}.`)}
    ${item('RTP about 95.4%.', 'The theoretical long-run average return. Any session can be higher or lower.')}
    ${item('Randomness.', 'Your browser’s built-in crypto random number generator, on this device. Nothing is sent anywhere.')}</ul>
    <div class="ifoot"><span>${L.dockMode ? 'Play credits only' : 'Esc closes this window'}</span><span>No real money value</span></div>`);
}

// ------------------------------------------------------------------ game info: Settings · Paytable · Help
// settings-paytable-help.png: one "Game info" window with three columns at 1920 wide. Smaller layouts show one
// section at a time behind a segmented control (the engine's Info tab), with the same content.
const INFO = [['settings', 'Settings'], ['paytable', 'Paytable'], ['help', 'Help']];

export function infoModal(s, ui, L) {
  const tab = s.info;
  const cols = L.bp === 'desktop-xl';
  const body = { settings: () => settingsBody(s, ui), paytable: paytableBody, help: helpBody };
  // the section headings are the tab targets in the 3-column view (arrows / clicks move between them)
  const sec = ([id, title]) => `<section class="isec" aria-label="${title}">${cols ? `<h3 class="ih hit" data-id="tab-${id}" tabindex="-1">${title}</h3>` : ''}${body[id]()}</section>`;
  const tabs = cols ? '' : `<div class="itabs" role="tablist">${INFO.map(([id, l]) => `<button class="hit${tab === id ? ' on' : ''}" data-id="tab-${id}" role="tab" aria-selected="${tab === id}">${l}</button>`).join('')}</div>`;
  const main = cols ? `<div class="icols">${INFO.map(sec).join('')}</div>` : `<div class="ione" role="tabpanel">${sec(INFO.find((x) => x[0] === tab))}</div>`;
  return dialog(L, { w: 1180, label: 'Game info', cls: ' info' }, `<div class="ihead">${v3mark()}<h2>Running Light · Game info</h2><button class="ibtn hit x" data-id="close" aria-label="Close (Esc)">${icon('x')}</button></div>
    ${tabs}${main}<div class="ifoot"><span>${L.dockMode ? 'Play credits only' : 'Esc closes this window'}</span><span>Outcome is decided and saved before the light runs</span></div>`);
}

function settingsBody(s, ui) {
  const st = s.settings;
  const tg = (id, on, label, d = false) => `<button class="tgl hit${on ? ' on' : ''}" data-id="${id}" role="switch" aria-checked="${on}" aria-label="${label}"${dis(d)}><i></i></button>`;
  const sl = (id, key, label) => `<span class="sl"><span class="slider hit" data-id="${id}" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st[key]}"><i style="width:${st[key]}%"></i><b style="left:${st[key]}%"></b></span><span class="v">${st[key]}</span></span>`;
  const row = (a, sub, ctl, off = false) => `<div class="srow${off ? ' off' : ''}"><span><b>${a}</b><br>${sub}</span>${ctl}</div>`;
  const keys = [['Space', 'Start'], ['1–5', 'Chip'], ['Enter · Backspace', 'Add · remove on a square'], ['Z · C · R', 'Undo · Clear · Rebet'], ['G · Enter', 'Gamble · Collect'], ['R / W · ← →', 'Pick red / white'], ['M', 'Mute'], ['Esc', 'Close this window']];
  let h = '';
  if (ui.settingsReset) h += `<p class="inote" data-role="settings-reset">Your saved settings couldn’t be read, so they were reset to the defaults. Your credits and rounds were not affected.</p>`;
  h += row('Sound', 'Effects for the light, wins and gamble · M', tg('tg-mute', !st.mute, 'Sound'));
  h += row('Music', 'Background loop', sl('sl-music', 'music', 'Music volume'));
  h += row('Sound effects', 'Clicks, light, wins', sl('sl-sfx', 'sfx', 'Sound effects volume'));
  h += row('Reduced motion', 'Short light run, no flip animation', tg('tg-rm', st.reducedMotion, 'Reduced motion'));
  h += row('Turbo', 'Placeholder – pending approval', tg('tg-turbo', false, 'Turbo (placeholder, not available)', true), true);
  h += `<h4 class="isub">Keys</h4><table class="ikeys">${keys.map(([a, b]) => `<tr><td>${a.split(' · ').map(kc).join(' ')}</td><td>${b}</td></tr>`).join('')}</table>`;
  return h;
}

const PAY_PILL = (t) => `<span class="ppill k${t}">${t}x</span>`;
function paytableBody() {
  let h = '<table class="ptab"><tr><th>Pays</th><th>Squares</th><th>Hit chance per round</th><th>Square numbers</th></tr>';
  for (const t of [...TIERS].reverse()) h += `<tr><td>${PAY_PILL(t)}</td><td>${COUNT_BY_TIER[t]}</td><td>${ODDS[t]}</td><td>${SQUARES_BY_TIER[t].join(', ')}</td></tr>`;
  h += '</table><div class="pnotes">';
  h += `<p><b>You bet on a tier.</b> Each light that stops on a square of that tier pays: a bet of 5 on 10x returns 50 (stake included). The ${BLANK_COUNT} blank squares pay nothing.</p>`;
  h += `<p><b>Double Run · 1 in ${DOUBLE_RUN_ONE_IN} rounds:</b> a second light runs and can’t stop on the first square. Both stops pay.</p>`;
  h += `<p><b>Gamble:</b> fair 50/50 on red or white, up to ${MAX_GAMBLES} times per win. Off on wins over ${fmt(GAMBLE_CAP)}.</p>`;
  h += `<p><b>Limits:</b> ${MIN_BET}–${fmt(MAX_PER_TIER)} per tier, ${fmt(MAX_PER_ROUND)} per round. Chips ${CHIPS.join(', ')}.</p>`;
  h += '<p><b>RTP ≈95.4%:</b> the theoretical long-run average return, not a promise for any session.</p></div>';
  return h;
}

/** Help: the four steps, how the gamble really works (engine rules: fair 50/50 drawn and saved when Gamble is
 *  pressed, ×2 or lose the win, max 3 per win, off above the 30,000 cap), and the play-credits note. */
function helpBody() {
  const steps = [['Pick a chip', `${CHIPS.slice(0, -1).join(', ')} or ${CHIPS[CHIPS.length - 1]} credits.`], ['Place bets', `Click a square to bet on its tier, up to ${fmt(MAX_PER_TIER)} per tier and ${fmt(MAX_PER_ROUND)} per round.`], ['Press Start', 'The light runs for 4–6 seconds and stops on one square. Blank squares pay nothing.'], ['Collect or gamble', 'Win when the light stops on a tier you bet on, then Collect it or gamble it.']];
  let h = `<ol class="isteps">${steps.map(([a, b], i) => `<li><span class="n">${i + 1}</span><span><b>${a}</b><br>${b}</span></li>`).join('')}</ol>`;
  h += `<h4 class="isub">How the gamble works</h4><ul class="igamble" data-role="help-gamble">
    <li>After a win, press <b>Gamble ×2</b>, pick <b>red</b> or <b>white</b>, then press Gamble on your colour.</li>
    <li>Red or white is drawn at that moment, a fair 50/50, and saved before the disc flips.</li>
    <li><b>Match:</b> your win doubles. Gamble again or Collect. <b>No match:</b> the win is lost. Nothing else is taken.</li>
    <li>Up to ${MAX_GAMBLES} gambles per win, and Collect is open between flips. Gamble is off on wins over ${fmt(GAMBLE_CAP)}.</li></ul>`;
  h += `<p class="inavy"><b>Play credits only.</b> No real money value. Credits can’t be bought, sold or cashed out. Free refill to ${fmt(REFILL_AMOUNT)} whenever you run out.</p>`;
  return h;
}

// ------------------------------------------------------------------ type warm-up (v3 batch 7)
/** The result templates (win offer, gamble, gamble match, payout, loss) filled from a sample round that is not the
 *  player's, for app.js warmType: laid out once in a hidden box so the first real result does not shape its text
 *  from a cold cache. Ids, roles and live regions are stripped, so nothing can be focused, found or announced. */
export function warmSamples(s, L) {
  const round = { roundId: 'warm', bets: { 20: 5 }, totalBet: 5, s1: 13, s2: null, doubleRun: false, baseWin: 100, gambles: [], pendingReveal: false, currentWin: 100, settled: false, balanceBefore: 10000, balance: 9995 };
  const ui = { betTotals: [], gambleLoss: null, showLastStop: false, flip: null, matchMsg: null, light1: null, light2: null };
  const one = (phase, u = {}, g = { pick: null, revealing: false }, r = round) => {
    const st = { ...s, phase, round: r, gamble: g, bets: {}, lastBets: r.bets };
    const ux = { ...ui, ...u };
    const c = { mode: modeOf(st, ux), gambleWhy: null, total: 0, count: 0, canBet: false, rebetWhy: null, rebetSame: false, ghosts: false };
    return centre(st, ux, c, L) + controls(st, ux, c, L);
  };
  const won = { ...round, gambles: [{ pick: 'red', result: 'red' }], currentWin: 200 };
  return [
    one('GAMBLE_OFFER'),
    one('GAMBLE', {}, { pick: 'red', revealing: false }),
    one('GAMBLE', { matchMsg: { colour: 'red' } }, { pick: 'red', revealing: false }, won),
    one('PAYOUT', {}, undefined, won) + toastHtml({ text: '+200 added to your credits', kind: 'ok' }, L),
    one('BETTING', { showLastStop: true }, undefined, { ...round, baseWin: 0, currentWin: 0, s1: 30, settled: true }),
  ].map((h) => h.replace(/ (data-id|data-role|role|aria-live|tabindex)="[^"]*"/g, ''));
}

// ------------------------------------------------------------------ start and loading screens (v3 batch 6)
// Flat: the Running Light mark, the title and plain controls on the page fill. No bulb ring, glow or ticker.
const brand = (cls) => `<div class="brand ${cls}">${v3mark()}<h1>Running Light</h1></div>`;

export function startScreen(s, ui, L) {
  return `<div class="bg"></div><div class="content"><div class="scard">${brand('')}
    <p class="dtext">Bet play credits on a 50-square track. The light runs, slows and stops on one square.</p>
    <div class="drow"><span>Credits</span><b>${fmt(s.balance)}</b></div>
    ${dbtn('start-play', 'Play', `Turns sound on${enterKey(L)}`, 'Play: turns sound on (Enter)')}
    <div class="srow2"><button class="btn sec hit" data-id="start-help">How to play</button><button class="btn sec hit" data-id="start-sound" role="switch" aria-checked="${!s.settings.mute}">Sound: ${s.settings.mute ? 'off' : 'on'}</button></div></div></div>
    <p class="foot">Play credits only · No real money value · Free refill to ${fmt(REFILL_AMOUNT)}</p>`;
}

export function loadingScreen(W, H, p, step, label) {
  const pc = Math.round(p * 100);
  return `<div class="bg"></div><div class="content">${brand('col')}
    <div class="lbar"><i style="width:${pc}%"></i></div><div class="lrow"><span>${label}</span><span>${pc}%</span></div></div>
    <p class="foot">Play credits only · No real money value</p>`;
}
