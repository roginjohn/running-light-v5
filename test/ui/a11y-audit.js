// v5 batch 7: what the accessibility checks and the batch 7 screenshots share: the v5 scenes, a layout check, and a
// measured audit of the rendered page. Text must reach 4.5:1 (disabled controls are exempt, as in WCAG 1.4.3) and state
// borders and other non-text cues 3:1, each after compositing any fade over what is behind it.
import { setup, playTo, dispatch, settle, force } from './scenes.js';
import { sleep, clickId, waitPhase } from './harness.js';

export const VIEWPORTS = [[1920, 1080, false], [390, 844, true], [360, 640, true]];
const MOCK_BETS = { 100: 5, 50: 10, 20: 25, 10: 50, 5: 100 };
const prepare = (page) => setup(page, { balance: 10000, history: [], bets: MOCK_BETS, chip: 25 });
const gamble = async (page) => {
  await prepare(page);
  await playTo(page, 13);
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await settle(page);
};
const flip = async (page, result) => {
  await gamble(page);
  await page.evaluate((r) => window.__rl.game.test.forceNextGamble(r), result);
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
};

/** Every state with its own look. The first group is also screenshotted. */
export const SCENES = {
  betting: prepare,
  win: async (page) => { await prepare(page); await playTo(page, 13); },
  'no-win': async (page) => { await prepare(page); await playTo(page, 30, null, 'BETTING'); },
  'double-run': async (page) => { await prepare(page); await playTo(page, 6, 24); },
  'double-hit': async (page) => { await prepare(page); await playTo(page, 6, 7); },
  gamble,
  paytable: async (page) => { await prepare(page); await dispatch(page, { type: 'OPEN_INFO', tab: 'paytable' }); },
};
export const AUDIT_ONLY = {
  'gamble-won': (page) => flip(page, 'red'),
  'gamble-lost': (page) => flip(page, 'white'),
  running: async (page) => {
    await prepare(page);
    await force(page, 30);
    await dispatch(page, { type: 'START' });
    await waitPhase(page, ['SPINNING']);
    await page.evaluate(() => window.__rl.app.setPaused(true));
  },
  'no-bets': (page) => setup(page, { balance: 10000, history: [], bets: {}, chip: 25 }),
  'over-balance': (page) => setup(page, { balance: 5, history: [], bets: MOCK_BETS, chip: 25 }),
  help: async (page) => { await prepare(page); await dispatch(page, { type: 'OPEN_INFO', tab: 'help' }); },
  settings: async (page) => { await prepare(page); await dispatch(page, { type: 'OPEN_INFO', tab: 'settings' }); },
  results: async (page) => { await prepare(page); await clickId(page, 'icon-results'); },
  refill: async (page) => { await setup(page, { balance: 0, history: [], bets: {}, chip: 25 }); await page.evaluate(() => window.__rl.app.render()); },
  start: (page) => page.evaluate(() => { window.__rl.app.ui.start = true; window.__rl.app.render(); }),
};

/** Runs in the page: overflow and clipping. */
export function layoutCheck() {
  const d = document.documentElement;
  const off = [...document.querySelectorAll('#r-controls .hit, #r-centre .hit, #r-bar .hit, #r-modal .hit')].filter((e) => {
    if (e.closest('[inert]')) return false;
    const b = e.getBoundingClientRect();
    return b.width < 1 || b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight;
  }).map((e) => e.dataset.id);
  const wide = [...document.querySelectorAll('.spot, .spot span, .btn, .btn span, .bkey, .cp, .ctitle, .csub, .dlg')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline');
  const past = [...document.querySelectorAll('.spot, .centre, .rail, .dock')].flatMap((p) => {
    const P = p.getBoundingClientRect();
    return [...p.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.top < P.top - 0.5 || b.bottom > P.bottom + 0.5 || b.left < P.left - 4.5 || b.right > P.right + 4.5); });
  });
  return { scrollW: d.scrollWidth, scrollH: d.scrollHeight, w: innerWidth, h: innerHeight, off, clipped: [...wide, ...past].map((e) => e.className) };
}

/** Runs in the page: measures every visible text node and the state-bearing borders. */
export function audit({ touch }) {
  const parse = (c) => {
    const n = (c.match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number);
    if (c.startsWith('color(')) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
    return [n[0], n[1], n[2], n[3] ?? 1];
  };
  const over = (f, b) => { const a = f[3] ?? 1; return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a)); };
  const lum = (c) => { const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const css = getComputedStyle.bind(window);
  const token = (n) => parse(css(document.documentElement).getPropertyValue(n).trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)})`));
  // the frame, rail and bar are pointer-events: none siblings under the content, so they are found by position
  const backdrop = (x, y) => {
    for (const s of ['#r-frame .frame-bar', '#r-frame .frame-rail', '#r-frame .frame']) {
      const e = document.querySelector(s);
      if (!e) continue;
      const r = e.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return over(parse(css(e).backgroundColor), [0, 0, 0]);
    }
    return over(parse(css(document.body).backgroundColor), [0, 0, 0]);
  };
  /** { fg, bg } as shown: the element's colour on the fills behind it, with every group opacity on the way applied. */
  const shown = (el, fgColour, x, y, extraBg = null) => {
    const chain = [];
    for (let p = el; p; p = p.parentElement) chain.unshift(p);
    let cur = backdrop(x, y);
    const groups = [];
    for (const p of chain) {
      const s = css(p);
      const before = cur;
      cur = over(parse(s.backgroundColor), cur);
      if (Number(s.opacity) < 1) groups.push([before, Number(s.opacity)]);
    }
    if (extraBg) cur = extraBg;
    else if (el.closest('.chip')) cur = over(parse(css(el.closest('.chip')).getPropertyValue('--chip-bg').trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)})`)), cur); // the fill is an SVG circle
    let fg = over(fgColour, cur), bg = cur;
    for (const [b, o] of groups.reverse()) { fg = over([...fg, o], b); bg = over([...bg, o], b); }
    return { fg, bg };
  };
  const vis = (el) => el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) && el.getClientRects().length > 0 && !el.closest('[inert], .warm, .sr-only');
  const desc = (el) => `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).join('.')}`;
  const EXEMPT = '.btn[aria-disabled="true"], .chip[aria-disabled="true"], .ibtn[aria-disabled="true"], .tgl[aria-disabled="true"], .srow.off';
  const BODY = '.dtext, .pbody p, .plims li, .facts li, .igamble li, .isteps li, .inavy, .inote';
  const out = { text: [], textPairs: new Map(), exempt: 0, nonText: [], nonTextPairs: new Map(), font: [], body: [], tap: [], minText: Infinity, minTap: Infinity };
  const note = (bag, key, r) => { if (!bag.has(key) || bag.get(key) > r) bag.set(key, r); };

  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 2) });
  const seen = new Set();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement;
    if (seen.has(el) || !vis(el)) continue;
    seen.add(el);
    const s = css(el);
    if (s.visibility === 'hidden') continue;
    const size = parseFloat(s.fontSize);
    if (size < 12) out.font.push(`${desc(el)} ${size}px "${n.textContent.trim().slice(0, 24)}"`);
    if (el.closest(BODY) && !el.matches('.n') && size < 14) out.body.push(`${desc(el)} ${size}px`);
    if (el.closest(EXEMPT)) { out.exempt++; continue; }
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const b = rg.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const fills = [null];
    // a hatched fill: the text also has to read on the stripes
    for (let p = el; p; p = p.parentElement) if (/gradient/.test(css(p).backgroundImage)) { fills.push(token('--c-tile-blank-hatch')); break; }
    for (const fill of fills) {
      const { fg, bg } = shown(el, parse(s.color), x, y, fill);
      const r = ratio(fg, bg);
      out.minText = Math.min(out.minText, r);
      const key = `${desc(el)} ${s.color}`;
      note(out.textPairs, key, r);
      if (r < 4.5) out.text.push(`${r.toFixed(2)} ${desc(el)} "${n.textContent.trim().slice(0, 28)}"`);
    }
  }

  // state-bearing borders and fills: [what, selector, colour of the cue, the surfaces it must stand out from]
  const cues = [
    ['bet spot border', '.spot.has:not(.lost, .won)', (s) => s.borderTopColor, 'own', 'behind'],
    ['faded spot border', '.spot.lost', (s) => s.borderTopColor, 'own', 'behind'],
    ['won spot fill', '.spot.won', (s) => s.backgroundColor, 'behind'],
    ['blank square edge', '.tile.qblank:not(.lit, .win)', (s) => s.borderTopColor, 'own', 'hatch', 'behind'],
    ['win stop fill', '.tile.win', (s) => s.backgroundColor, 'tile'],
    ['lit stop fill', '.tile.lit', (s) => s.backgroundColor, 'tile'],
    ['winning tier outline', '.tile.tw', (s) => s.outlineColor, 'own'],
    ['switch, on', '.tgl.on', (s) => css(s.el, '::before').backgroundColor, 'behind'],
    ['switch knob, off', '.tgl:not(.on, [aria-disabled="true"]) i', (s) => s.backgroundColor],
    ['switch track, off', '.tgl:not(.on, [aria-disabled="true"])', (s) => css(s.el, '::before').borderTopColor, 'behind'],
    ['slider rail', '.slider', (s) => css(s.el, '::before').backgroundColor, 'behind'],
    ['slider fill', '.slider i', (s) => s.backgroundColor, 'behind'],
    ['slider thumb', '.slider b', (s) => s.backgroundColor, 'behind'],
    ['selected tab', '.itabs .on', (s) => s.backgroundColor, 'parent'],
    ['chip fill', '.chip:not([aria-disabled="true"])', (s) => css(s.el).getPropertyValue('--chip-bg').trim().replace(/^#(..)(..)(..)$/, (m, r, g, b) => `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)})`), 'behind'],
    ['selected chip ring', '.chip.sel:not([aria-disabled="true"])', (s) => css(s.el, '::after').borderTopColor, 'behind'],
    ['gamble disc', '.pick:not([aria-disabled="true"]) .disc', (s) => s.backgroundColor, 'behind'],
    ['gamble pips, used', '.pips i.used', (s) => s.backgroundColor, 'behind'],
    ['pill border', '.cp.mint, .cp.coral', (s) => s.borderTopColor, 'behind'],
    ['icon', '.ibtn:not([aria-disabled="true"]) .ic', (s) => s.color, 'behind'],
  ];
  for (const [name, sel, cue, ...against] of cues) {
    for (const el of document.querySelectorAll(sel)) {
      if (!vis(el)) continue;
      const s = css(el);
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const colour = parse(cue(Object.assign(Object.create(s), { borderTopColor: s.borderTopColor, backgroundColor: s.backgroundColor, outlineColor: s.outlineColor, fill: s.fill, color: s.color, el })));
      for (const a of against) {
        // `own`: the cue on the element's own fill; `behind`: on the fills behind the element
        const host = a === 'behind' ? (el.parentElement || el) : a === 'parent' ? el.parentElement : el;
        const fill = a === 'tile' ? token('--c-tile') : a === 'hatch' ? token('--c-tile-blank-hatch') : null;
        const { fg, bg } = shown(host, colour, x, y, fill);
        const r = ratio(fg, bg);
        note(out.nonTextPairs, `${name} / ${a}`, r);
        if (r < 3) out.nonText.push(`${r.toFixed(2)} ${name} vs ${a}: ${desc(el)}`);
      }
    }
  }

  if (touch) {
    for (const el of document.querySelectorAll('.hit')) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect();
      const m = Math.min(b.width, b.height);
      out.minTap = Math.min(out.minTap, m);
      if (m < 44) out.tap.push(`${el.dataset.id} ${b.width.toFixed(0)}x${b.height.toFixed(0)}`);
    }
  }
  return { ...out, textPairs: [...out.textPairs], nonTextPairs: [...out.nonTextPairs], text: [...new Set(out.text)], nonText: [...new Set(out.nonText)] };
}

/** Accessible-tree facts for the rendered page. */
export function aria() {
  const lives = [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"], output')].filter((e) => !e.closest('.warm')).map((e) => e.id || e.className);
  const noName = [...document.querySelectorAll('button, [role="button"], [role="radio"], [role="switch"], [role="slider"], [role="tab"]')].filter((e) => !e.closest('.warm') && !(e.getAttribute('aria-label') || e.textContent.trim())).map((e) => e.dataset.id);
  const ring = document.getElementById('r-track');
  return {
    lives, noName,
    live: { polite: document.getElementById('live').getAttribute('aria-live') },
    ringHidden: ring.getAttribute('aria-hidden'),
    ringFocusable: ring.querySelectorAll('button, [tabindex], a, input').length,
    groups: ['#r-centre .spots', '#r-controls .chips'].map((s) => { const e = document.querySelector(s); return e ? [e.getAttribute('role'), e.getAttribute('aria-label')] : null; }),
    dialog: (() => { const d = document.querySelector('#r-modal [role="dialog"]'); return d ? { modal: d.getAttribute('aria-modal'), label: d.getAttribute('aria-label') } : null; })(),
    h1: document.querySelectorAll('h1').length,
  };
}

export const pause = () => sleep(350); // staged renders and the dialog entrance have ended
