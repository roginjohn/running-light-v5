// Running Light v5 tier mocks: build mocks/*.html, render them to png/<state>-<WxH>.png with puppeteer-core and
// measure every page. Fails (exit 1) when a visible tap target is under 44 px, text is under 12 px, body copy is
// under 14 px, anything overflows (page scroll, off-screen, clipped text, a square over the centre), or the copy
// uses banned wording. Results go to measurements.json either way.
// Run from the repo root: node docs/design-v5/tiers/render.mjs
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { build } from './build.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(HERE, '../../..')); // repo root, so the mocks can load src/ tokens and fonts
const PNG = join(HERE, 'png');
const MIN_TAP = 44, MIN_FONT = 12, MIN_BODY = 14;
const BANNED = /fair|provabl|complian|certif|regulat|christmas|xmas|santa|snow|festive|real[- ]money win/i;

const DESK = { w: 1920, h: 1080, inset: { t: 0, r: 0, b: 0, l: 0 } };
const P390 = { w: 390, h: 844, inset: { t: 47, r: 0, b: 34, l: 0 } };
const P360 = { w: 360, h: 640, inset: { t: 24, r: 0, b: 0, l: 0 } };
const jobs = [
  ...[DESK, P390, P360].map((d) => ({ page: 'betting', ...d })),
  ...[DESK, P390].map((d) => ({ page: 'paytable', ...d })),
  ...['win', 'double-run', 'no-win'].flatMap((s) => [DESK, P390].map((d) => ({ page: s, ...d }))),
];

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function serve() {
  const srv = createServer(async (req, res) => {
    const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { const body = await readFile(p); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }).end(body); }
    catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

// runs in the page
function measure({ minTap, minFont, minBody }) {
  const vis = (el) => el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true }) && el.getClientRects().length > 0;
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const desc = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''} "${(el.getAttribute('aria-label') || el.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  const hit = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p; } return null; };
  const W = innerWidth, H = innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const px = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
  const safe = { x: px('--sim-sal'), y: px('--sim-sat'), r: W - px('--sim-sar'), b: H - px('--sim-sab') };
  const v = [];
  const live = (el) => vis(el) && !el.closest('[inert]');

  // tap targets
  const taps = [...document.querySelectorAll('button, [role=button], a, input, select')].filter(live);
  let minT = null;
  for (const el of taps) {
    const r = R(el), s = Math.min(r.w, r.h);
    if (!minT || s < minT.size) minT = { size: s, el: desc(el) };
    if (s < minTap - 0.01) v.push({ kind: 'tap-target', size: s, el: desc(el) });
    const box = inScroller(el) ? R(inScroller(el)) : r;
    if (box.x < safe.x - 0.5 || box.y < safe.y - 0.5 || box.x + box.w > safe.r + 0.5 || box.y + box.h > safe.b + 0.5) v.push({ kind: 'outside-safe-area', rect: box, el: desc(el) });
  }

  // fonts
  let minF = null, minB = null;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 2) });
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!live(el)) continue;
    const f = parseFloat(getComputedStyle(el).fontSize);
    if (!minF || f < minF.size) minF = { size: f, text: n.textContent.trim().slice(0, 30), el: desc(el) };
    if (f < minFont) v.push({ kind: 'font', size: f, el: desc(el) });
  }
  for (const el of document.querySelectorAll('.body, p')) {
    if (!live(el)) continue; const f = parseFloat(getComputedStyle(el).fontSize);
    if (el.classList.contains('legend')) continue; // legend is a label line, not body copy
    if (!minB || f < minB.size) minB = { size: f, el: desc(el) };
    if (f < minBody) v.push({ kind: 'body-font', size: f, el: desc(el) });
  }

  // overflow
  const flags = { pageScrollX: document.documentElement.scrollWidth > W + 1, pageScrollY: document.documentElement.scrollHeight > H + 1, offscreen: 0, clipped: 0, overlap: 0 };
  if (flags.pageScrollX || flags.pageScrollY) v.push({ kind: 'page-overflow', sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight });
  for (const el of document.body.querySelectorAll('*')) {
    if (!live(el)) continue;
    const r = R(el);
    if (!inScroller(el) && r.w && (r.x < -0.5 || r.y < -0.5 || r.x + r.w > W + 0.5 || r.y + r.h > H + 0.5)) { flags.offscreen++; v.push({ kind: 'offscreen', rect: r, el: desc(el) }); }
    const st = getComputedStyle(el);
    if (st.overflowY === 'auto' || st.overflowY === 'scroll') continue;
    const clipX = st.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const clipY = st.overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 1;
    if ((clipX || clipY) && el.textContent.trim()) { flags.clipped++; v.push({ kind: 'clipped', el: desc(el), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }); }
  }
  // text wider than its tile (tiles do not clip, so check the label box against the tile)
  for (const t of document.querySelectorAll('.tile')) {
    const tr = R(t);
    for (const m of t.querySelectorAll('.m, .num')) { if (!vis(m)) continue; const mr = R(m); if (mr.w > tr.w - 1.5 || mr.x < tr.x || mr.x + mr.w > tr.x + tr.w) { flags.clipped++; v.push({ kind: 'tile-label-overflow', tile: tr, label: mr, el: desc(t) }); } }
  }
  const tiles = [...document.querySelectorAll('.tile')].filter(vis).map(R);
  for (const c of [...document.querySelectorAll('.centre, .top, .dock')].filter(live)) { const cr = R(c); if (tiles.some((t) => hit(t, cr))) { flags.overlap++; v.push({ kind: 'overlap', el: desc(c) }); } }

  return {
    tapTargets: taps.length, minTapTarget: minT, minFont: minF, minBodyFont: minB,
    tileMin: tiles.length ? +Math.min(...tiles.map((t) => Math.min(t.w, t.h))).toFixed(1) : null,
    spotMin: (() => { const s = [...document.querySelectorAll('.spot')].filter(live).map(R); return s.length ? { w: Math.min(...s.map((r) => r.w)), h: Math.min(...s.map((r) => r.h)) } : null; })(),
    overflow: flags, violations: v,
  };
}

async function main() {
  build();
  await mkdir(PNG, { recursive: true });
  // wording check on the built pages
  const wording = [];
  for (const f of (await readdir(join(HERE, 'mocks'))).filter((f) => f.endsWith('.html'))) {
    const txt = (await readFile(join(HERE, 'mocks', f), 'utf8')).replace(/<[^>]+>/g, ' ');
    const m = txt.match(BANNED); if (m) wording.push({ file: f, word: m[0] });
  }
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/${relative(ROOT, join(HERE, 'mocks')).split('\\').join('/')}`;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--hide-scrollbars'], headless: true });
  const results = [];
  try {
    const page = await browser.newPage();
    for (const j of jobs) {
      const touch = j.w < 1200;
      await page.setViewport({ width: j.w, height: j.h, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
      await page.goto(`${base}/${j.page}.html`, { waitUntil: 'networkidle0' });
      await page.evaluate((i) => {
        const s = document.documentElement.style;
        for (const [k, val] of Object.entries({ sat: i.t, sar: i.r, sab: i.b, sal: i.l })) s.setProperty(`--sim-${k}`, `${val}px`);
        document.documentElement.setAttribute('data-sim', '');
      }, j.inset);
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(measure, { minTap: MIN_TAP, minFont: MIN_FONT, minBody: MIN_BODY });
      const file = `png/${j.page}-${j.w}x${j.h}.png`;
      await page.screenshot({ path: join(HERE, file) });
      results.push({ file, page: `mocks/${j.page}.html`, viewport: `${j.w}x${j.h}`, safeArea: j.inset, ...m });
      console.log(`${file.padEnd(32)} tap>=${m.minTapTarget?.size ?? '-'}  font>=${m.minFont?.size ?? '-'}  body>=${m.minBodyFont?.size ?? '-'}  tile=${m.tileMin}  spot=${m.spotMin ? `${m.spotMin.w.toFixed(0)}x${m.spotMin.h.toFixed(0)}` : '-'}${m.violations.length ? `  !! ${m.violations.length}` : ''}`);
    }
  } finally { await browser.close(); srv.close(); }

  const bad = results.filter((r) => r.violations.length);
  const summary = {
    generated: new Date().toISOString(), rules: { minTapTarget: MIN_TAP, minFont: MIN_FONT, minBodyFont: MIN_BODY },
    pages: results.length, failing: bad.length, wording,
    minTapTargetOverall: Math.min(...results.filter((r) => r.minTapTarget).map((r) => r.minTapTarget.size)),
    minFontOverall: Math.min(...results.filter((r) => r.minFont).map((r) => r.minFont.size)),
    minBodyFontOverall: Math.min(...results.filter((r) => r.minBodyFont).map((r) => r.minBodyFont.size)),
    anyOverflow: results.some((r) => Object.values(r.overflow).some(Boolean)),
  };
  await writeFile(join(HERE, 'measurements.json'), JSON.stringify({ summary, results }, null, 2) + '\n');
  if (bad.length || wording.length) {
    console.error(`\nFAIL: ${bad.length} page(s) break the rules${wording.length ? `, banned wording in ${wording.map((w) => w.file).join(', ')}` : ''}`);
    for (const r of bad) for (const x of r.violations.slice(0, 8)) console.error(`  ${r.file}: ${JSON.stringify(x)}`);
    process.exit(1);
  }
  console.log(`\nOK: ${results.length} pages. tap >= ${summary.minTapTargetOverall}px, text >= ${summary.minFontOverall}px, body >= ${summary.minBodyFontOverall}px, no overflow. measurements.json written.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
