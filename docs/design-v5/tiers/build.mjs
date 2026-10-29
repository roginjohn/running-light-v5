// Running Light v5 tier-betting mocks: writes the static pages in mocks/*.html (all share ../mock.css).
// Numbers come from math-v5/MATH-SPEC-C.md (approved). They are written out here because src/engine/config.js
// still holds the v3/v4 per-square rules. One responsive page per state: desktop (>= 1200 wide) and phones
// render from the same file through mock.css media queries. Run: node docs/design-v5/tiers/build.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'mocks');
const fmt = (n) => n.toLocaleString('en-US');

// ---------------------------------------------------------------- MATH-SPEC-C
export const TIERS = [
  { m: 200, sq: [8], odds: '218.3', pct: '0.46' },
  { m: 100, sq: [21, 46], odds: '109.1', pct: '0.92' },
  { m: 50, sq: [3, 29, 38], odds: '54.56', pct: '1.83' },
  { m: 20, sq: [13, 17, 33, 42], odds: '21.83', pct: '4.58' },
  { m: 10, sq: [5, 11, 15, 24, 27, 35, 40, 49], odds: '10.91', pct: '9.16' },
  { m: 5, sq: [1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48], odds: '5.46', pct: '18.33' },
];
export const BLANK = { count: 20, pct: '64.72' };
export const PAYBACK = '95.4%';
export const DOUBLE_RUN_ONE_IN = 25;
export const CHIPS = [1, 5, 10, 25, 50, 100, 500];
export const MAX_SPOT = 1000, MAX_ROUND = 1000, START = 10000, GAMBLE_CAP = 300000;
const TIER_OF = {};
for (const t of TIERS) for (const s of t.sq) TIER_OF[s] = t.m;
const tierCount = TIERS.reduce((a, t) => a + t.sq.length, 0);
if (tierCount + BLANK.count !== 50) throw new Error(`board has ${tierCount + BLANK.count} squares`);

// ---------------------------------------------------------------- ring placement (#1 top-left, clockwise)
// C x R ring with 2C + 2R - 4 = 50. mock.css picks the shape per breakpoint through --gC.
const SHAPES = [[16, 11], [11, 16], [12, 15]];
function ringPos(i, C, R) {
  if (i <= C) return [1, i];
  if (i <= C + R - 2) return [i - C + 1, C];
  if (i <= 2 * C + R - 2) return [R, C - (i - (C + R - 2)) + 1];
  return [R - (i - (2 * C + R - 2)), 1];
}
const gridVars = (i) => SHAPES.map(([C, R]) => { const [r, c] = ringPos(i, C, R); return `--g${C}:${r}/${c}`; }).join(';');

// ---------------------------------------------------------------- example round
const BETS = { 5: 100, 10: 50, 20: 25, 50: 10, 100: 5, 200: 0 };
const total = Object.values(BETS).reduce((a, b) => a + b, 0);
const nspots = Object.values(BETS).filter(Boolean).length;

function tile(i, st) {
  const m = TIER_OF[i];
  const cls = ['tile', m ? `t${m}` : 'blank'];
  const light = st.lights?.indexOf(i) ?? -1;
  if (light >= 0) cls.push(st.won?.includes(m) ? 'win' : 'lit');
  if (m && st.won?.includes(m) && light < 0) cls.push('tw');
  const label = m ? `<span class="m">${m}<span class="x">x</span></span>` : '<span class="m nw"><i class="no" aria-hidden="true"></i><span class="nwt">No win</span></span>';
  const badge = light >= 0 && st.lights.length > 1 ? `<span class="lb">${light + 1}</span>` : '';
  return `<div class="${cls.join(' ')}" style="${gridVars(i)}" aria-label="Square ${i}, ${m ? `${m}x tier` : 'blank, no win'}"><span class="num">${i}</span>${label}${badge}</div>`;
}

function spot(t, st) {
  const bet = BETS[t.m];
  const won = st.won?.includes(t.m);
  const cls = ['spot', `t${t.m}`];
  if (bet) cls.push('has');
  let foot = `<span class="sb">${bet ? `Bet <b>${fmt(bet)}</b>` : 'No bet'}</span>`;
  if (st.result) {
    if (won) { cls.push('won'); foot = `<span class="sb">Won <b>${fmt(st.pays[t.m])}</b></span>`; }
    else if (bet) cls.push('lost');
  }
  const n = t.sq.length;
  const tag = st.result ? ' aria-disabled="true"' : '';
  return `<button class="${cls.join(' ')}"${tag} aria-label="${t.m}x spot, 1 in ${t.odds} per light, ${n} square${n > 1 ? 's' : ''}, ${bet ? `your bet ${bet}` : 'no bet'}">
      <span class="sm">${t.m}x</span><span class="so">1 in ${t.odds}</span><span class="sq">${n} square${n > 1 ? 's' : ''}</span>${foot}</button>`;
}

function board(st) {
  let h = '';
  for (let i = 1; i <= 50; i++) h += tile(i, st);
  return `<div class="ring">${h}<div class="centre">
    <div class="chead">${st.head}</div>
    <div class="spots" role="group" aria-label="Tier bet spots">${TIERS.map((t) => spot(t, st)).join('')}</div>
    <p class="legend"><i class="sw" aria-hidden="true"></i>Blank square · no win · ${BLANK.count} of 50</p>
  </div></div>`;
}

const dis = (d) => (d ? ' aria-disabled="true"' : '');
const chips = (off) => `<div class="chips" role="radiogroup" aria-label="Chip value">${CHIPS.map((c) => `<button class="chip c${c}${c === 25 ? ' sel' : ''}" role="radio" aria-checked="${c === 25}" aria-label="Chip ${c}"${dis(off)}><span>${c}</span></button>`).join('')}</div>`;

function dock(kind, st) {
  const off = kind === 'win';
  const tb = `<div class="tbet"><span class="k">Total bet</span><span class="v"><b>${fmt(total)}</b> / ${fmt(MAX_ROUND)}</span><span class="k rl">Max ${fmt(MAX_SPOT)} per spot</span></div>`;
  const edits = `<button class="btn sec"${dis(off)}>Undo</button><button class="btn sec"${dis(off)}>Clear</button>`;
  const main = kind === 'win'
    ? `<button class="btn collect"><span>Collect ${fmt(st.total)}</span></button><button class="btn gam"><span>Gamble</span></button>`
    : `${edits}<button class="btn cta"><span>${kind === 'again' ? 'Start again' : 'Start'}</span><span class="sub">${fmt(total)} on ${nspots} spots</span></button>`;
  return `<section class="dock${kind === 'win' ? ' wdock' : ''}" aria-label="Bet controls">
    <span class="dl">Chip</span>${chips(off)}${tb}<div class="acts">${main}</div>
    <p class="note">Simulated play credits only.</p></section>`;
}

function top(credits, delta) {
  return `<header class="top">
    <div class="brand"><i class="mark" aria-hidden="true"></i><span>Running Light</span></div>
    <div class="cred"><span class="k">Play credits</span><span class="v"><b>${fmt(credits)}</b>${delta ? `<span class="delta">${delta}</span>` : ''}</span></div>
    <button class="btn sec pt" aria-label="Paytable and odds">Paytable</button>
    <button class="ib" role="switch" aria-checked="true" aria-label="Sound on"><i class="ic ic-sound"></i></button>
  </header>`;
}

// ---------------------------------------------------------------- paytable
function paytable() {
  const rows = TIERS.map((t) => `<tr class="t${t.m}"><th scope="row"><span class="pm">${t.m}x</span></th><td>${t.sq.length}</td><td class="nums">${t.sq.join(', ')}</td><td><b>1 in ${t.odds}</b></td><td>${t.pct}%</td><td>${PAYBACK}</td></tr>`).join('');
  const cards = TIERS.map((t) => `<li class="pc t${t.m}"><span class="pm">${t.m}x</span><span class="po"><b>1 in ${t.odds}</b><span>${t.pct}% of stops</span></span><span class="pn">${t.sq.length} sq · #${t.sq.join(', #')}</span></li>`).join('');
  return `<div class="scrim"></div>
  <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="pt-title">
    <header class="shead"><h2 id="pt-title">Paytable</h2><button class="ib" aria-label="Close paytable"><i class="ic ic-x"></i></button></header>
    <div class="sbody">
      <p class="body">Bet on a tier spot. You win when the light stops on <b>any</b> square of that tier. The win is the multiplier × your bet on that spot.</p>
      <div class="kpis"><div><span class="k">Payback, every tier spot</span><b>${PAYBACK}</b></div><div><span class="k">Squares</span><b>${tierCount} tier + ${BLANK.count} blank = 50</b></div></div>
      <table class="ptab"><thead><tr><th scope="col">Tier</th><th scope="col">Squares</th><th scope="col">Square numbers</th><th scope="col">Chance per light</th><th scope="col">Share of stops</th><th scope="col">Payback</th></tr></thead>
        <tbody>${rows}<tr class="blank"><th scope="row"><span class="pm"><i class="sw" aria-hidden="true"></i>Blank</span></th><td>${BLANK.count}</td><td class="nums">No win</td><td>—</td><td>${BLANK.pct}%</td><td>—</td></tr></tbody>
        <tfoot><tr><th scope="row">Total</th><td>50</td><td></td><td></td><td>100%</td><td></td></tr></tfoot></table>
      <ul class="pcards">${cards}<li class="pc blank"><span class="pm"><i class="sw" aria-hidden="true"></i>Blank</span><span class="po"><b>No win</b><span>${BLANK.pct}% of stops</span></span><span class="pn">${BLANK.count} squares</span></li>
        <li class="pc tot"><span class="pm">Total</span><span class="po"><b>50 squares</b><span>100% of stops</span></span></li></ul>
      <p class="body">Squares are not equally likely: one blank square is about 7 times as likely as the 200x square. The chances above already include this.</p>
      <h3>Double Run</h3>
      <p class="body">About 1 in ${DOUBLE_RUN_ONE_IN} rounds, a second light runs and stops on a different square. Each light pays on its own, so both lights on your tier pay twice.</p>
      <h3>Limits</h3>
      <ul class="lims body"><li>Up to ${fmt(MAX_SPOT)} on each tier spot and ${fmt(MAX_ROUND)} per round</li><li>Chips ${CHIPS.join(', ')}</li><li>Start with ${fmt(START)} play credits; free refill to ${fmt(START)}</li><li>Gamble is off above ${fmt(GAMBLE_CAP)}</li><li>Simulated credits only, no real money</li></ul>
    </div>
  </section>`;
}

// ---------------------------------------------------------------- states
const chip = (t, c = '') => `<span class="cp${c ? ' ' + c : ''}">${t}</span>`;
const S = {
  betting: {
    head: `<div class="cps">${chip('Betting open', 'on')}${chip(`Double Run · 1 in ${DOUBLE_RUN_ONE_IN}`)}</div><h1 class="ctitle">Pick a tier spot</h1><p class="csub body">Win if the light stops on any square of that tier.</p>`,
  },
  win: {
    result: true, lights: [13], won: [20], pays: { 20: 500 }, total: 500,
    head: `<div class="cps">${chip('20x win', 'ok')}</div><h1 class="ctitle">You win 500</h1><p class="csub body">Stopped on #13 (20x). Bet 25 × 20.</p>`,
  },
  double: {
    result: true, lights: [6, 24], won: [5, 10], pays: { 5: 500, 10: 500 }, total: 1000,
    head: `<div class="cps">${chip('Double Run · 2 lights', 'ok')}</div><h1 class="ctitle">You win 1,000</h1><p class="csub body">Light 1 on #6 (5x) pays 500. Light 2 on #24 (10x) pays 500.</p>`,
  },
  nowin: {
    result: true, lights: [30], won: [],
    head: `<div class="cps">${chip('No win', 'bad')}</div><h1 class="ctitle">Blank square</h1><p class="csub body">Stopped on #30, a blank. Your bets are kept.</p>`,
  },
};

function page(name, { body, title }) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Running Light v5 tiers · ${title}</title>
<link rel="stylesheet" href="../mock.css">
</head>
<body>
${body}
</body>
</html>
`;
  writeFileSync(join(OUT, `${name}.html`), html);
}

const app = (st, kind, credits, delta, attrs = '') => `<div class="app"${attrs}>${top(credits, delta)}<main class="stage">${board(st)}</main>${dock(kind, st)}</div>`;

export function build() {
  mkdirSync(OUT, { recursive: true });
  page('betting', { title: 'Betting', body: app(S.betting, 'bet', START) });
  page('paytable', { title: 'Paytable', body: app(S.betting, 'bet', START, '', ' inert') + paytable() });
  page('win', { title: 'Tier win', body: app(S.win, 'win', START - total, '+500 pending') });
  page('double-run', { title: 'Double Run', body: app(S.double, 'win', START - total, '+1,000 pending') });
  page('no-win', { title: 'No win', body: app(S.nowin, 'again', START - total) });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) { build(); console.log('mocks written'); }
