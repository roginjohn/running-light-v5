// v5 batch 5 artifacts: the betting screen with the six tier spots at 1920x1080, 390x844 and 360x640, rendered from
// dist/ with the test harness and the mock's bets. Fails on page overflow, or a control or text that is clipped or off
// screen. Run from the repo root after `npm run build`: node docs/design-v5/batch-5/render.mjs
import path from 'node:path';
import { startServer, launch, openGame, sleep } from '../../../test/ui/harness.js';

const OUT = path.dirname(new URL(import.meta.url).pathname);
const BETS = { 100: 5, 50: 10, 20: 25, 10: 50, 5: 100 };
const check = () => {
  const d = document.documentElement;
  const off = [...document.querySelectorAll('#r-controls .hit, #r-centre .hit, #r-bar .hit')].filter((e) => {
    const b = e.getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return b.width < 1 || b.left < 0 || b.top < 0 || b.right > innerWidth || b.bottom > innerHeight || !top || !e.contains(top);
  }).map((e) => e.dataset.id);
  // text wider than its box, or a child past the edge of its spot, the centre or the dock (line boxes, not glyph ink)
  const wide = [...document.querySelectorAll('.spot, .spot span, .btn, .tbet, .bkey, .cp, .ctitle, .csub')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline');
  const past = [...document.querySelectorAll('.spot, .centre, .rail, .dock')].flatMap((p) => {
    const P = p.getBoundingClientRect();
    return [...p.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.top < P.top - 0.5 || b.bottom > P.bottom + 0.5 || b.left < P.left - 4.5 || b.right > P.right + 4.5); });
  });
  const clipped = [...wide, ...past].map((e) => e.className);
  return { scrollW: d.scrollWidth, scrollH: d.scrollHeight, w: innerWidth, h: innerHeight, off, clipped, spots: document.querySelectorAll('.spot').length, chips: document.querySelectorAll('.chip').length };
};

const { server, url } = await startServer();
const browser = await launch();
try {
  for (const [w, h, touch] of [[1920, 1080, false], [390, 844, true], [360, 640, true]]) {
    const page = await openGame(browser, url, { seed: 1, width: w, height: h, touch });
    await page.evaluate((b) => {
      const g = window.__rl.game;
      g.dispatch({ type: 'SELECT_CHIP', value: 25 });
      g.test.setBets(b);
    }, BETS);
    await sleep(300);
    const c = await page.evaluate(check);
    console.log(`${w}x${h}`, JSON.stringify(c));
    if (c.scrollW > c.w || c.scrollH > c.h || c.off.length || c.clipped.length || c.spots !== 6 || c.chips !== 7) throw new Error(`layout check failed at ${w}x${h}`);
    await page.screenshot({ path: path.join(OUT, `betting-${w}x${h}.png`) });
    if (page.__issues.length) throw new Error(page.__issues.join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
