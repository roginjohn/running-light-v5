// v5 batch 4 artifacts: contrast.md (computed from the token file by scripts/gen-tokens.js), swatch-sheet.png and the
// two board PNGs, rendered from dist/ with the test harness. Run from the repo root after `npm run build`:
//   node docs/design-v5/batch-4/render.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contrastChecks, resolve, TOKENS_PATH } from '../../../scripts/gen-tokens.js';
import { startServer, launch, openGame, sleep } from '../../../test/ui/harness.js';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const T = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
const WANT = /tier-|tile-blank|chip-100|chip-500|square number|legend/;
const pair = new Map(T.contrast.map((c) => [c.name, c]));
const rows = contrastChecks(T).filter((c) => WANT.test(c.name)).map((c) => ({ ...c, fg: resolve(T, pair.get(c.name).fg), bg: resolve(T, pair.get(c.name).bg) }));
const bad = rows.filter((r) => !r.pass);
if (bad.length) throw new Error(`contrast fail: ${JSON.stringify(bad)}`);

let md = `# v5 batch 4: contrast check

Computed with the WCAG 2.1 formula by \`contrastChecks\` in \`scripts/gen-tokens.js\` from \`src/data/design-tokens-v3.json\`. The
build fails if a pair drops below its minimum, and \`test/unit/v5/tokens.test.js\` checks them too. AA minimum: 4.5:1 for text, 3:1 for
UI parts (borders, glyphs, chip fills). Regenerate with \`node docs/design-v5/batch-4/render.mjs\`.

| Colour name | Hex | Background hex | Ratio | AA pass |
|---|---|---|---|---|
`;
for (const r of rows) md += `| ${r.name} | \`${r.fg}\` | \`${r.bg}\` | ${r.ratio.toFixed(2)}:1 | Pass (min ${r.need}:1) |\n`;
md += `
Notes:

- Chip 100: the proposed violet \`#6d28d9\` passes with its white label (7.10:1) but is only 2.15–2.33:1 on the rail, frame and dock surfaces, so it fails the 3:1 UI minimum. \`#8548ef\` passes all of them. Amber \`#b45309\` passes as proposed.
- Blank squares are checked against both the base fill and the lighter hatch stripe, because text and the glyph cross both.
- Chip numerals sit on the fill, so they are held to the 4.5:1 text minimum, not the large-text one.
`;
writeFileSync(path.join(OUT, 'contrast.md'), md);

const ratio = (name) => rows.find((r) => r.name === name).ratio.toFixed(2);
const C = T.color;
const TIERS = [[200, 'tile-jackpot'], [100, 'tile-jackpot'], [50, 'tile'], [20, 'tile'], [10, 'tile'], [5, 'tile']];
const tile = (t, bg) => `<div class="sw-c"><div class="sw-t" style="background:${C[bg]};border-color:${t === 200 ? C['tier-200'] : t === 100 || t === 50 ? C['border-panel-navy'] : C['tile-border']};color:${C[`tier-${t}`]}"><b>${t}<small>x</small></b></div>
  <h3>Tier ${t}x</h3><code>${C[`tier-${t}`]}</code><p>${ratio(`tier-${t} on ${bg}`)}:1 on ${bg} ${C[bg]}</p><p>${ratio(`tier-${t} on bg-frame (last results pill)`)}:1 on bg-frame</p><p>${ratio(`tier-${t} on bg-card-pill (tier button, paytable pill)`)}:1 on bg-card-pill</p></div>`;
const chip = (v) => `<div class="sw-c"><div class="sw-p" style="background:${C[`chip-${v}`]}"><b>${v}</b></div><h3>Chip ${v}</h3><code>${C[`chip-${v}`]}</code>
  <p>${ratio(`chip-${v} numeral`)}:1 white label</p><p>${ratio(`chip-${v} fill vs bg-rail`)}:1 on rail</p><p>${ratio(`chip-${v} fill vs bg-frame`)}:1 on frame</p><p>${ratio(`chip-${v} fill vs bg-bottombar`)}:1 on dock</p></div>`;
const hatch = `repeating-linear-gradient(135deg, transparent 0 5px, ${C['tile-blank-hatch']} 5px 7px)`;
const blank = `<div class="sw-c"><div class="sw-t" style="background:${C['tile-blank']} ${hatch};border:1px dashed ${C['tile-blank-edge']};color:${C['text-muted']}"><i class="sw-n"></i><span>No win</span></div><h3>Blank square</h3><code>${C['tile-blank']}</code>
  <p>${ratio('No win label (text-muted) on tile-blank-hatch')}:1 label on hatch</p><p>${ratio('tile-blank-edge (dashed border, no-win glyph) on tile-blank-hatch')}:1 edge on hatch</p><p>${ratio('tile-blank-edge (dashed border, no-win glyph) on tile-blank')}:1 edge on fill</p></div>`;
const sheet = `<style>
  html, body { overflow: auto; background: ${C['bg-frame']}; }
  #sheet { width: 1280px; padding: 32px 40px; font: 600 14px/20px Poppins, sans-serif; color: ${C['text-primary']}; }
  #sheet h1 { font-size: 24px; line-height: 32px; } #sheet h2 { margin: 24px 0 12px; font-size: 16px; color: ${C['text-muted']}; }
  .sw-g { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
  .sw-c { padding: 14px; border-radius: 8px; background: ${C['bg-rail']}; border: 1px solid ${C.divider}; }
  .sw-c h3 { margin-top: 10px; font-size: 15px; } .sw-c code { font: 600 13px/20px "JetBrains Mono", monospace; color: ${C['text-primary']}; }
  .sw-c p { font-size: 12px; line-height: 18px; color: ${C['text-muted']}; }
  .sw-t { width: 74px; height: 74px; border: 1px solid; border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 12px; }
  .sw-t b { font: 600 20px/24px "JetBrains Mono", monospace; } .sw-t small { font-size: 14px; }
  .sw-n { position: relative; display: block; width: 16px; height: 16px; border: 1.5px solid ${C['tile-blank-edge']}; border-radius: 50%; }
  .sw-n::after { content: ''; position: absolute; left: 50%; top: -1px; bottom: -1px; width: 1.5px; margin-left: -.75px; background: ${C['tile-blank-edge']}; transform: rotate(45deg); }
  .sw-p { width: 56px; height: 56px; border-radius: 50%; border: 3px dashed #fff; display: grid; place-items: center; color: #fff; font-weight: 700; }
  .sw-p b { font-size: 15px; }
</style><div id="sheet"><h1>Running Light v5 · tier and chip colours</h1><p>Every ratio meets WCAG AA: 4.5:1 for text, 3:1 for UI parts. The label always names the tier, so colour is never the only cue.</p>
  <h2>Tier squares</h2><div class="sw-g">${TIERS.map(([t, bg]) => tile(t, bg)).join('')}</div>
  <h2>Blank square and chips</h2><div class="sw-g">${blank}${chip(100)}${chip(500)}</div></div>`;

const BETS = { 100: 5, 50: 10, 20: 25, 10: 50, 5: 100 };
const { server, url } = await startServer();
const browser = await launch();
try {
  for (const [w, h, file, touch] of [[1920, 1080, 'board-desktop-1920x1080.png', false], [390, 844, 'board-phone-390x844.png', true]]) {
    const page = await openGame(browser, url, { seed: 1, width: w, height: h, touch });
    await page.evaluate((b) => {
      const g = window.__rl.game;
      g.dispatch({ type: 'SELECT_CHIP', value: 25 });
      g.test.setBets(b);
    }, BETS);
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, file) });
    if (page.__issues.length) throw new Error(page.__issues.join('\n'));
    await page.close();
  }
  const page = await openGame(browser, url, { seed: 1, width: 1360, height: 900 });
  await page.evaluate((html) => { document.body.innerHTML = html; }, sheet);
  await sleep(200);
  const el = await page.$('#sheet');
  await el.screenshot({ path: path.join(OUT, 'swatch-sheet.png') });
  await page.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`${rows.length} pairs pass; wrote contrast.md and 3 PNGs to ${OUT}`);
