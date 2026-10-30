// v3 view: pure functions from (engine state, UI state, derived context, layout) to HTML strings per region.
// No outcome logic here: every number shown comes from the engine state (stored round) or simple display arithmetic.
import { MULT, TIERS, COUNT_BY_TIER, SQUARES_BY_TIER, WEIGHT_BY_TIER, TOTAL_WEIGHT, BLANK_COUNT, BLANK_WEIGHT, CHIPS, GAMBLE_CAP, MAX_GAMBLES, HISTORY_SHOWN, DOUBLE_RUN_ONE_IN, MAX_PER_ROUND, MAX_PER_TIER, MIN_BET, REFILL_AMOUNT, START_CREDITS, TOASTS } from '../engine/config.js';
import { sameBets } from '../engine/bets.js';
import { winParts } from '../engine/outcome.js';
import { icon, chipFace, v3icon, v3mark } from './icons.js';
import { SPOT_ORDER, lightOdds, betOn, winners, lightClass, bigMult, bigValue } from './track.js';

export const fmt = (n) => Number(n).toLocaleString('en-US');
const px = (v) => `${Math.round(v * 100) / 100}px`;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fs = (L, v, min) => Math.max(min, v * L.s);
const kc = (k) => `<span class="kc">${k}</span>`;
const dis = (d) => (d ? ' aria-disabled="true"' : '');
const cap = (c) => c[0].toUpperCase() + c.slice(1);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const tierCls = (m) => m || 'blank'; // colour class suffix (styles.css .q5 / .k5 …); blank squares get "blank"
const squareLabel = (n) => (MULT[n] ? `${MULT[n]}x` : '–');

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

export { SPOT_ORDER, winners, lightClass, bigMult, bigValue };

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
  if (L.phone) return { x: 3 * 44 + 8, y: (L.bar.h - HEAD_H) / 2, w: L.W - (3 * 44 + 8) - 48 };
  if (L.rail) return { x: L.rail.x + L.rail.pad + BET_LBL_W, y: L.rail.y + L.rail.pad, w: L.rail.w - 2 * L.rail.pad - BET_LBL_W };
  const c = dockCols(L);
  return { x: c.x1 + BET_LBL_W, y: c.y, w: c.colW - BET_LBL_W };
}

/** "Credits 1,000" (with the green +N delta while paying, "+N pending" while a win is uncollected). The markup carries
 *  the settled balance; a count-up writes only the number's text (app.js paintCredits), so a tween frame never rebuilds
 *  this region. Phones drop the label while a win is pending, to fit a 6-digit win at 360 wide. */
export function credits(s, ui, L) {
  const r = creditsRect(L);
  const bal = s.balance;
  const pending = ['GAMBLE_OFFER', 'GAMBLE'].includes(s.phase) ? s.round.currentWin : 0;
  const key = L.phone ? (pending ? '' : 'Play credits') : 'Credits';
  const delta = ui.delta ? `<span class="delta">+${fmt(ui.delta)}</span>` : pending ? `<span class="delta">+${fmt(pending)} pending</span>` : '';
  return `<div class="credits" role="status" aria-label="Play credits ${fmt(s.balance)}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(HEAD_H)}"><span class="k">${key}</span><span class="v">${delta}<b data-role="balance">${fmt(bal)}</b></span></div>`;
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

/** Total bet card: "190 / 1,000" and the limit per spot (tiers/SPEC.md §2.7). Phones show the total on Start only. */
export function totalCard(c) {
  return `<div class="tbet"><span class="k">Total bet</span><output class="v" data-role="total" aria-label="Total bet ${c.total} of ${MAX_PER_ROUND} credits"><b>${fmt(c.total)}</b> / ${fmt(MAX_PER_ROUND)}</output><span class="k rl" data-role="bet-hint">Max ${fmt(MAX_PER_TIER)} per spot</span></div>`;
}

export function lastWin(s, ui, c) {
  const r = s.round;
  const m = c.mode;
  if (s.phase === 'DOUBLE_RUN' && r) {
    const w1 = betOn(r.bets, r.s1) * MULT[r.s1];
    return { label: 'This round', value: w1, note: 'so far · second light running' };
  }
  if (ui.gambleLoss) return { label: 'Last win', value: 0, note: 'gamble lost', lost: true };
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
  if (!t) return ''; // phones: no room, the last stop is on the ring
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
  const one = (id, label, key, d) => `<button class="btn sec hit" data-id="${id}" aria-label="${label} (key ${key})"${dis(d)}><span>${label}</span></button>`;
  return `<div class="acts">${one('btn-undo', 'Undo', 'Z', off || !s.undo.length)}${one('btn-clear', 'Clear', 'C', off || !c.total)}</div>`;
}

// the engine (gambleBlockReason) stops a win that would double past the cap, so the last win it offers is half the cap
const GAMBLE_MAX_WIN = GAMBLE_CAP / 2;
const gambleWhyText = (gw) => (gw === 'cap' ? `Off above ${fmt(GAMBLE_MAX_WIN)}` : gw === 'max' ? 'No gambles left for this win' : '');
const gambleWhyLine = (gw) => (gw === 'cap' ? `Gamble is off above ${fmt(GAMBLE_MAX_WIN)}` : gambleWhyText(gw));

/** Primary button(s): Start (blue); after a win the Collect (green, dark text) + Gamble (secondary, win mock) stack; in
 *  the gamble, Gamble on <colour> (blue) + Collect, which is locked (outline) while the disc flips. */
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
      <button class="btn sec stack hit" data-id="btn-gamble" aria-label="${gw ? `Gamble: ${esc(gambleWhyLine(gw))}` : 'Gamble times 2, 50/50 (G)'}"${gwText ? ` title="${esc(gambleWhyLine(gw))}"` : ''}${dis(!!gw)}><span>Gamble</span><span class="sub${gw ? ' short' : ''}">${gw ? esc(gwText) : `50/50 · ${left} of ${MAX_GAMBLES} left${dock ? '' : ' · G'}`}</span></button></div>`;
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
  // bets persist between rounds: the same bets on the board replay as "Start again" (there is no Rebet)
  const again = r && r.settled && sameBets(s.bets, r.bets);
  // kept bets can exceed the balance after a loss: Start is off until they fit (phones show the total on Start only)
  if (c.total > s.balance) return st(`<span>${again ? 'Start again' : 'Start'} · ${fmt(c.total)}</span><span class="sub short" data-role="start-hint">${TOASTS.credits}</span>`);
  return st(`<span>${again ? 'Start again' : 'Start'}</span><span class="sub">${fmt(c.total)} on ${plural(c.count, 'spot')}</span>`, !c.canBet || ui.startLocked);
}

const disclaimer = () => `<p class="rdisc"><b>Play credits only.</b> No real money value. Free refill to ${fmt(REFILL_AMOUNT)} whenever you run out.</p>`;
const chipGroup = (s, c, keys) => `<div class="grp"><div class="rhead"><span>Chip</span></div>${chipRow(s, c, keys)}</div>`;

export function controls(s, ui, c, L) {
  // win offer and gamble (win-gamble-offer.png, gamble-flip.png): the note goes above the Collect / Gamble stack
  // and Undo / Clear / Rebet are not shown (they cannot be used until the win is settled)
  const result = c.mode === 'offer' || c.mode === 'ingamble';
  const acts = result ? '' : actionRow(s, c);
  if (L.rail) {
    const r = L.rail;
    const note = railNote(s, ui, c);
    return `<div class="rail" role="region" aria-label="Bet controls" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}">
      ${chipGroup(s, c, true)}${totalCard(c)}${result ? note : ''}${acts}${mainButtons(s, ui, c, false)}${result ? '' : note}
      <div style="flex:1"></div>${disclaimer()}</div>`;
  }
  // phones: one row of 44 px chips, then the actions (the total is on Start's second line)
  if (L.phone) {
    const d = L.dock;
    return `<div class="dock ph" role="region" aria-label="Bet controls" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)}">
      ${chipRow(s, c, false)}<div class="phact">${acts}${mainButtons(s, ui, c, true)}</div></div>`;
  }
  // tablet portrait: the rail as a 2-column block (left: bet field, note; right: chips, button, actions)
  const d = L.dock;
  return `<div class="dock" role="region" aria-label="Bet controls" style="left:${px(d.x)};top:${px(d.y)};width:${px(d.w)};height:${px(d.h)};padding:${DOCK_PAD}px 0">
      <div class="dcol">${totalCard(c)}${railNote(s, ui, c)}</div>
      <div class="dcol">${chipGroup(s, c, false)}${acts}${mainButtons(s, ui, c, true)}</div>
      ${disclaimer()}</div>`;
}

// ------------------------------------------------------------------ tiles
// v5 batch 4: the ring is display-only: plain <div>s with no focus, hover or bet target, and no bet badges (bets show
// on the centre's tier spots). The static part is built once per tile; per state only the tile's class list and
// its .dyn child (Double Run marker) change, and during a light run only the class list. A blank square is marked
// three ways, not by colour alone: hatching, a dashed border and the no-win glyph, plus "No win" where it fits.
export function tileStatic(n) {
  const m = MULT[n];
  const label = m ? `<span class="m">${m}<span class="x">x</span></span>` : '<span class="m nw"><i class="noglyph"></i><span class="nwt">No win</span></span>';
  return `<span class="num">${n}</span>${label}<span class="dyn"></span>`;
}

/** Per-tile dynamic look: { cls, dyn } (diffed by the controller). */
export function tileLook(n, s, ui) {
  const r = s.round;
  const cls = [`q${tierCls(MULT[n])}`];
  const light = lightClass(n, ui);
  if (light) cls.push(light);
  // v3 batch 5 result look (component sheet): a winning stop is flat accent-green with dark text, a losing stop
  // keeps the tile-lit fill, and in a Double Run both stops show "1st" / "2nd" in place of the square number.
  // No glow, ring, pulse, chase, veil or WIN tag; the only motion is the batch-4 landing pop (transform).
  const { w1, w2 } = winners(s, ui);
  let dyn = '';
  if (r) {
    const revealed = ['GAMBLE_OFFER', 'GAMBLE', 'PAYOUT'].includes(s.phase) || ui.gambleLoss || ui.showLastStop;
    const first = n === r.s1 && (revealed || s.phase === 'DOUBLE_RUN');
    const second = r.s2 && n === r.s2 && revealed;
    if (first || second) {
      if (!light) cls.push(n === w1 || n === w2 ? 'win' : 'lit');
      // the light's number on the square (win and Double Run mocks), on every layout
      if (r.doubleRun) dyn = `<span class="lbadge">${first ? 1 : 2}</span>`;
    } else if (revealed && MULT[n] && (MULT[n] === MULT[w1] || MULT[n] === MULT[w2])) cls.push('tw'); // any square of the tier would have paid
  }
  return { cls: cls.join(' '), dyn };
}

// ------------------------------------------------------------------ centre panel
/** "Light 1 on #6 (5x) pays 500. Light 2 on #30, a blank." from the engine's per-light result. */
const lightsLine = (bets, s1, s2 = null) => winParts(bets, s1, s2).lights.map((l, i) => {
  const what = l.tier === 'blank' ? ', a blank.' : l.amount ? ` (${l.tier}x) pays ${fmt(l.amount)}.` : ` (${l.tier}x), no bet.`;
  return `Light ${i + 1} on #${l.square}${what}`;
}).join(' ');
const DOUBLE_PILL = 'Double Run · 2 lights';
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
    return { ...M, status: ['cyan', 'Double Run'], headline: 'Double Run!', sub: `${lightsLine(r.bets, r.s1)} A second light is running and can’t stop on #${r.s1}.` };
  }
  const { w1, w2 } = winners(s, ui);
  if (m === 'ingamble') {
    const won = w1 && w2 ? `Double Run · won ${fmt(r.baseWin)}` : `#${w1 || w2} · ${MULT[w1 || w2]}x · won ${fmt(r.baseWin)}`;
    return { ...M, gamble: true, status: ui.gambleLoss ? ['coral', 'Gamble lost'] : ['on', 'Gamble'], won };
  }
  if (m === 'offer') {
    const headline = `You win ${fmt(r.baseWin)}`;
    if (r.doubleRun) {
      // a double hit: both lights on one bet tier, so the pill names the tier and its spot shows the total with ×2
      const extra = w1 && w2 && MULT[w1] === MULT[w2] ? [`${MULT[w1]}x ×2`] : [];
      return { ...M, result: true, status: ['mint', DOUBLE_PILL], extra, headline, sub: lightsLine(r.bets, r.s1, r.s2) };
    }
    return { ...M, result: true, status: ['mint', `${MULT[r.s1]}x win`], headline, sub: `Stopped on #${r.s1} (${MULT[r.s1]}x). Bet ${fmt(betOn(r.bets, r.s1))} × ${MULT[r.s1]}.` };
  }
  if (m === 'payout') {
    return { ...M, result: true, status: ['mint', 'Paid'], headline: `+${fmt(r.currentWin)} collected`, sub: `Added to your credits: ${fmt(s.balance - r.currentWin)} → ${fmt(s.balance)}` };
  }
  // BETTING
  if (ui.showLastStop && r) {
    const kept = 'Your bets are kept.';
    if (r.doubleRun) {
      const bothBlank = !MULT[r.s1] && !MULT[r.s2];
      return { ...M, result: true, status: ['coral', 'No win'], extra: [DOUBLE_PILL], headline: bothBlank ? 'Blank squares' : 'Neither light pays', sub: `${lightsLine(r.bets, r.s1, r.s2)} ${kept}` };
    }
    const m1 = MULT[r.s1];
    return { ...M, result: true, status: ['coral', 'No win'], headline: m1 ? `No bet on ${m1}x` : 'Blank square', sub: `Stopped on #${r.s1}${m1 ? ` (${m1}x)` : ', a blank'}. ${kept}` };
  }
  return { ...M, status: ['idle', 'Betting open'], headline: 'Pick a tier spot', sub: 'Win if the light stops on any square of that tier.' };
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
  else if (c.gambleWhy) msg = `${esc(gambleWhyLine(c.gambleWhy))}. Collect your win.`;
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
    <div class="gnote">${loss ? `Your credits stay at <b>${fmt(s.balance)}</b>. Nothing else was taken.` : `Gamble is offered on wins up to ${fmt(GAMBLE_MAX_WIN)}, so a win never passes ${fmt(GAMBLE_CAP)}.`}</div>`;
}

/** The six tier spots, in the ring's centre (tiers/SPEC.md §2.2–2.3): multiplier, "1 in X" per light, square count
 *  and the bet. Click / Enter adds the chip, right-click / Shift+click / Backspace removes it. A bet adds a blue
 *  border; once the stops are shown a winning spot is green with "Won N" (the total with ×2 when both lights hit it) and
 *  a spot that bet and lost fades. While a light runs the spots are a compact strip (multiplier and bet only) beside the
 *  running display; results use the full spots (win, double-run and no-win mocks). */
function tierSpots(s, ui, c, compact) {
  const r = s.round;
  const off = c.mode !== 'bet' || !c.canBet;
  const { w1, w2 } = winners(s, ui);
  const shown = ['offer', 'payout'].includes(c.mode) || (ui.showLastStop && r && sameBets(s.bets, r.bets));
  return `<div class="spots${compact ? ' compact' : ''}" role="group" aria-label="Tier bet spots">${SPOT_ORDER.map((m) => {
    const bet = (c.mode !== 'bet' && r ? r.bets[m] : s.bets[m]) || 0;
    const hits = [w1, w2].filter((n) => n && MULT[n] === m).length;
    const won = hits * m * bet;
    const cls = `${bet ? ' has' : ''}${won ? ' won' : bet && shown ? ' lost' : ''}`;
    const squares = plural(COUNT_BY_TIER[m], 'square');
    const said = won ? `won ${won}${hits > 1 ? ', both lights' : ''}` : bet ? `your bet ${bet}` : 'no bet';
    const foot = won ? `Won <b>${fmt(won)}</b>${hits > 1 ? ' ×2' : ''}` : bet ? `Bet <b>${fmt(bet)}</b>` : 'No bet';
    return `<button class="spot hit k${m}${cls}" data-id="tier-${m}" aria-label="${m}x spot, ${lightOdds(m)} per light, ${squares}, ${said}"${dis(off)}><span class="sm">${m}x</span><span class="so">${lightOdds(m)}</span><span class="sq">${squares}</span><span class="sb">${foot}</span></button>`;
  }).join('')}</div>`;
}

/** Centre: status pills, a flat title and sub line and the six tier spots while betting is open and for a result (win,
 *  double-run and no-win mocks); while a light runs the big multiplier and a compact strip, the multiplier's text being
 *  written by the controller (app.js paintBig), so a light step never rebuilds this region; or the gamble panel. */
export function centre(s, ui, c, L) {
  const M = centreModel(s, ui, c);
  const I = L.inner;
  const box = (cls, inner) => `<div class="centre${cls}" style="left:${px(I.x)};top:${px(I.y)};width:${px(I.w)};height:${px(I.h)}">${inner}</div>`;
  const st = `<span class="cp ${M.status[0]}" data-role="status">${M.status[1]}</span>`;
  if (M.gamble) return box(' gam', `<div class="cps">${st}<span class="cp mint">${M.won}</span></div>${gamblePanel(s, ui, c, L)}`);
  const dr = `<span class="cp${M.dr ? ' on' : ''}">${M.dr ? 'Double Run on' : `Double Run · 1 in ${DOUBLE_RUN_ONE_IN}`}</span>`;
  const txt = `<div class="ctxt" aria-live="polite"><div class="ctitle" data-role="headline">${M.headline}</div>${M.sub ? `<div class="csub">${M.sub}${M.note ? ` ${M.note}` : ''}</div>` : ''}</div>`;
  const legend = `<div class="bkey"><i class="sw" aria-hidden="true"></i>Blank square · no win · ${BLANK_COUNT} of 50</div>`;
  if (M.result) {
    const extra = (M.extra || []).map((t) => `<span class="cp ${M.status[0]}">${t}</span>`).join('');
    return box(' open', `<div class="cps">${st}${extra}</div>${txt}${tierSpots(s, ui, c, false)}${legend}`);
  }
  if (c.mode === 'bet') return box(' open', `<div class="cps">${st}${dr}</div>${txt}${tierSpots(s, ui, c, false)}${legend}`);
  return box('', `<div class="cps">${st}${dr}</div>
    <div class="big" aria-hidden="true"><span data-role="big"></span><small>x</small></div>
    ${txt}${tierSpots(s, ui, c, true)}${L.phone || I.h < 560 ? '' : legend}`);
}

// ------------------------------------------------------------------ bottom bar (v3 batch 2)
/** 40 px bar across the frame: sound, settings, stats (paytable + help) left; title centre; results panel right. */
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
    <div class="bb-r">${ib('icon-results', v3icon('scales'), 'How results are decided', off)}</div></div>`;
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

/** Results panel (bottom-bar scales icon): how the engine decides results. Plain facts only; there is no seed
 *  verification, so nothing here may suggest one. Numbers come from engine/config.js. */
export function resultsModal(L) {
  const weights = TIERS.map((t) => WEIGHT_BY_TIER[t]).join(' / ');
  const item = (a, b) => `<li><b>${a}</b> ${b}</li>`;
  return dialog(L, { w: 560, label: 'How results are decided', cls: ' info' }, `<div class="ihead">${v3icon('scales')}<h2>How results are decided</h2><button class="ibtn hit x" data-id="f-close" aria-label="Close (Esc)">${icon('x')}</button></div>
    <ul class="facts" data-role="results">
    ${item('Drawn first.', 'When you press Start, the result is drawn and saved on this device before the light starts. The light only shows that saved result, and reloading shows the same one.')}
    ${item('Weighted squares.', `Squares are not equally likely: weights ${weights} per square for ${TIERS.map((t) => `${t}x`).join(' / ')}, and ${BLANK_WEIGHT} for each of the ${BLANK_COUNT} blank squares, of ${fmt(TOTAL_WEIGHT)}. A blank square pays nothing.`)}
    ${item(`Double Run, 1 in ${DOUBLE_RUN_ONE_IN}.`, 'Drawn in the same step. The second light never stops on the first square.')}
    ${item('Gamble, 50/50.', `Red or white is drawn when you press Gamble and saved before the disc flips. A match doubles the win, no match loses it. Up to ${MAX_GAMBLES} per win, on wins up to ${fmt(GAMBLE_MAX_WIN)}, so a win never passes ${fmt(GAMBLE_CAP)}.`)}
    ${item('RTP about 95.4%.', 'The theoretical long-run average return. Any session can be higher or lower.')}
    ${item('Randomness.', 'Your browser’s built-in crypto random number generator, on this device. Nothing is sent anywhere.')}</ul>
    <div class="ifoot"><span>${L.dockMode ? 'Play credits only' : 'Esc closes this window'}</span><span>No real money value</span></div>`);
}

// ------------------------------------------------------------------ game info: Settings · Paytable · Help
// The paytable mock's window: a 920 px dialog on desktop, a bottom sheet on tablet portrait and phones, one section at
// a time behind a segmented control (the engine's Info tab).
const INFO = [['settings', 'Settings'], ['paytable', 'Paytable'], ['help', 'Help']];

export function infoModal(s, ui, L) {
  const tab = s.info;
  const body = { settings: () => settingsBody(s, ui), paytable: () => paytableBody(L), help: helpBody };
  const title = INFO.find((x) => x[0] === tab)[1];
  const tabs = `<div class="itabs" role="tablist">${INFO.map(([id, l]) => `<button class="hit${tab === id ? ' on' : ''}" data-id="tab-${id}" role="tab" aria-selected="${tab === id}">${l}</button>`).join('')}</div>`;
  const foot = L.dockMode ? '<span>Play credits only</span><span>No real money value</span>' : '<span>Esc closes this window</span><span>Outcome is decided and saved before the light runs</span>';
  return dialog(L, { w: 920, label: title, cls: ' info' }, `<div class="ihead"><h2>${title}</h2><button class="ibtn hit x" data-id="close" aria-label="Close (Esc)">${icon('x')}</button></div>
    ${tabs}<div class="ione" role="tabpanel"><section class="isec" aria-label="${title}">${body[tab]()}</section></div><div class="ifoot">${foot}</div>`);
}

function settingsBody(s, ui) {
  const st = s.settings;
  const tg = (id, on, label, d = false) => `<button class="tgl hit${on ? ' on' : ''}" data-id="${id}" role="switch" aria-checked="${on}" aria-label="${label}"${dis(d)}><i></i></button>`;
  const sl = (id, key, label) => `<span class="sl"><span class="slider hit" data-id="${id}" role="slider" tabindex="0" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st[key]}"><i style="width:${st[key]}%"></i><b style="left:${st[key]}%"></b></span><span class="v">${st[key]}</span></span>`;
  const row = (a, sub, ctl, off = false) => `<div class="srow${off ? ' off' : ''}"><span><b>${a}</b><br>${sub}</span>${ctl}</div>`;
  const keys = [['Space', 'Start'], ['1–7', 'Chip'], ['Enter · Backspace', 'Add · remove on a spot'], ['Z · C', 'Undo · Clear'], ['G · Enter', 'Gamble · Collect'], ['R / W · ← →', 'Pick red / white'], ['M', 'Mute'], ['Esc', 'Close this window']];
  let h = '';
  if (ui.settingsReset) h += `<p class="inote" data-role="settings-reset">Your saved settings couldn’t be read, so they were reset to the defaults. Your credits and rounds were not affected.</p>`;
  h += row('Sound', 'Effects for the light, wins and gamble · M', tg('tg-mute', !st.mute, 'Sound'));
  h += row('Music', 'Background loop', sl('sl-music', 'music', 'Music volume'));
  h += row('Sound effects', 'Clicks, light, wins', sl('sl-sfx', 'sfx', 'Sound effects volume'));
  h += row('Reduced motion', 'Short light run, no flip animation', tg('tg-rm', st.reducedMotion, 'Reduced motion'));
  h += row('Turbo', 'Placeholder – pending approval', tg('tg-turbo', false, 'Turbo (placeholder, not available)', true), true);
  h += `<div class="keylist"><h4 class="isub">Keys</h4><table class="ikeys">${keys.map(([a, b]) => `<tr><td>${a.split(' · ').map(kc).join(' ')}</td><td>${b}</td></tr>`).join('')}</table></div>`;
  return h;
}

const stopShare = (w) => `${((100 * w) / TOTAL_WEIGHT).toFixed(2)}%`;
const tierShare = (t) => stopShare(COUNT_BY_TIER[t] * WEIGHT_BY_TIER[t]);
const BLANK_SHARE = stopShare(BLANK_COUNT * BLANK_WEIGHT);
const BLANK_SW = '<i class="sw" aria-hidden="true"></i>';

/** Paytable mock: a full table in a dialog, one card per tier on phones. One payback figure (dev spec §3.8). */
function payTable() {
  const rows = SPOT_ORDER.map((t) => `<tr${t >= 100 ? ' class="pnavy"' : ''}><th scope="row"><span class="pm k${t}">${t}x</span></th><td>${COUNT_BY_TIER[t]}</td><td class="nums">${SQUARES_BY_TIER[t].join(', ')}</td><td><b>${lightOdds(t)}</b></td><td>${tierShare(t)}</td></tr>`).join('');
  return `<table class="ptab" data-role="paytable"><thead><tr><th scope="col">Tier</th><th scope="col">Squares</th><th scope="col">Square numbers</th><th scope="col">Chance per light</th><th scope="col">Share of stops</th></tr></thead>
    <tbody>${rows}<tr class="pblank"><th scope="row"><span class="pm">${BLANK_SW}Blank</span></th><td>${BLANK_COUNT}</td><td class="nums">No win</td><td>—</td><td>${BLANK_SHARE}</td></tr></tbody>
    <tfoot><tr><th scope="row">Total</th><td>50</td><td></td><td></td><td>100%</td></tr></tfoot></table>`;
}
function payCards() {
  const cards = SPOT_ORDER.map((t) => `<li class="pcard${t >= 100 ? ' pnavy' : ''}"><span class="pm k${t}">${t}x</span><span class="po"><b>${lightOdds(t)}</b><span>${tierShare(t)} of stops</span></span><span class="pn">${COUNT_BY_TIER[t]} sq · #${SQUARES_BY_TIER[t].join(', #')}</span></li>`).join('');
  return `<ul class="pcards" data-role="paytable">${cards}<li class="pcard pblank"><span class="pm">${BLANK_SW}Blank</span><span class="po"><b>No win</b><span>${BLANK_SHARE} of stops</span></span><span class="pn">${BLANK_COUNT} squares</span></li>
    <li class="pcard ptot"><span class="pm">Total</span><span class="po"><b>50 squares</b><span>100% of stops</span></span></li></ul>`;
}
function paytableBody(L) {
  const tierSquares = TIERS.reduce((a, t) => a + COUNT_BY_TIER[t], 0);
  const likely = Math.round(BLANK_WEIGHT / WEIGHT_BY_TIER[TIERS[TIERS.length - 1]]);
  return `<div class="pbody"><p>Bet on a tier spot. You win when a light stops on <b>any</b> square of that tier. The win is the multiplier × your bet on that spot: a bet of 5 on 10x pays 50.</p>
    <div class="kpis"><div><span>Payback, every tier spot</span><b>95.4%</b></div><div><span>Squares</span><b>${tierSquares} tier + ${BLANK_COUNT} blank = 50</b></div></div>
    ${L.phone ? payCards() : payTable()}
    <p>Squares are not equally likely: one blank square is about ${likely} times as likely as the 200x square. The chances above already include this. Payback is the theoretical long-run average, not a promise for any session.</p>
    <h4 class="isub">Double Run</h4>
    <p>In Double Run (1 in ${DOUBLE_RUN_ONE_IN} rounds) a second light can pay too, so a round hits slightly more often. It stops on a different square and each light pays on its own, so both lights on your tier pay twice (shown as ×2).</p>
    <h4 class="isub">Limits</h4>
    <ul class="plims"><li>${MIN_BET} to ${fmt(MAX_PER_TIER)} on each tier spot, up to ${fmt(MAX_PER_ROUND)} per round</li><li>Chips ${CHIPS.join(', ')}</li><li>Start with ${fmt(START_CREDITS)} play credits; free refill to ${fmt(REFILL_AMOUNT)}</li><li>Gamble on wins up to ${fmt(GAMBLE_MAX_WIN)}, ${MAX_GAMBLES} times per win, ${fmt(GAMBLE_CAP)} cap</li><li>Simulated credits only, no real money</li></ul></div>`;
}

/** Help: the steps, what a multiplier and a blank mean, how the gamble really works (engine rules: 50/50 drawn and saved
 *  when Gamble is pressed, ×2 or lose the win, max 3 per win, wins up to half the 300,000 cap), and the play-credits note. */
function helpBody() {
  const steps = [['Pick a chip', `${CHIPS.slice(0, -1).join(', ')} or ${CHIPS[CHIPS.length - 1]} credits.`], ['Place bets', `Tap a tier spot in the centre to bet on it, up to ${fmt(MAX_PER_TIER)} per tier and ${fmt(MAX_PER_ROUND)} per round.`], ['Press Start', 'The light runs for 4–6 seconds and stops on one square.'], ['Collect or gamble', 'Win when the light stops on a tier you bet on, then Collect it or gamble it.']];
  let h = `<ol class="isteps">${steps.map(([a, b], i) => `<li><span class="n">${i + 1}</span><span><b>${a}</b><br>${b}</span></li>`).join('')}</ol>`;
  h += `<h4 class="isub">Multipliers and blanks</h4><ul class="igamble" data-role="help-tiers">
    <li>Each spot is a multiplier. It pays when a light stops on any square of that tier: a bet of 5 on 10x pays 50.</li>
    <li>The ${BLANK_COUNT} blank squares are hatched and pay nothing. Squares are not equally likely; the Paytable shows the chance of each tier.</li>
    <li>In Double Run (1 in ${DOUBLE_RUN_ONE_IN} rounds) a second light stops on a different square, and each light pays on its own.</li></ul>`;
  h += `<h4 class="isub">How the gamble works</h4><ul class="igamble" data-role="help-gamble">
    <li>After a win, press <b>Gamble</b>, pick <b>red</b> or <b>white</b>, then press Gamble on your colour.</li>
    <li>Red or white is drawn at that moment, a 50/50, and saved before the disc flips.</li>
    <li><b>Match:</b> your win doubles. Gamble again or Collect. <b>No match:</b> the win is lost. Nothing else is taken.</li>
    <li>Up to ${MAX_GAMBLES} gambles per win, and Collect is open between flips. Gamble is offered on wins up to ${fmt(GAMBLE_MAX_WIN)}, so a win never passes ${fmt(GAMBLE_CAP)}.</li></ul>`;
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
    const c = { mode: modeOf(st, ux), gambleWhy: null, total: 0, count: 0, canBet: false };
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
