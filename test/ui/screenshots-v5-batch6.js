// v5 batch 6 artifacts: win, no-win, Double Run, double hit (×2), gamble and paytable at 1920x1080, 390x844 and 360x640,
// rendered from dist/ with the test harness and the mock's bets, into docs/design-v5/batch-6/. Fails on page overflow, or
// a control or text that is clipped or off screen. Run: npm run screenshots:batch6
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer, launch, openGame, sleep } from './harness.js';
import { setup, playTo, dispatch, settle } from './scenes.js';

const OUT = path.resolve(new URL('../../docs/design-v5/batch-6/', import.meta.url).pathname);
const BETS = { 100: 5, 50: 10, 20: 25, 10: 50, 5: 100 };
const SIZES = [[1920, 1080, false], [390, 844, true], [360, 640, true]];

const check = () => {
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
};

const prepare = (page) => setup(page, { balance: 10000, history: [], bets: BETS, chip: 25 });
const SCENES = {
  win: async (page) => { await prepare(page); await playTo(page, 13); },
  'no-win': async (page) => { await prepare(page); await playTo(page, 30, null, 'BETTING'); },
  'double-run': async (page) => { await prepare(page); await playTo(page, 6, 24); },
  'double-hit': async (page) => { await prepare(page); await playTo(page, 6, 7); },
  gamble: async (page) => {
    await prepare(page);
    await playTo(page, 13);
    await dispatch(page, { type: 'GAMBLE_OPEN' });
    await dispatch(page, { type: 'PICK', colour: 'red' });
    await settle(page);
  },
  paytable: async (page) => {
    await prepare(page);
    await dispatch(page, { type: 'OPEN_INFO', tab: 'paytable' });
  },
};

const { server, url } = await startServer();
const browser = await launch();
mkdirSync(OUT, { recursive: true });
try {
  for (const [w, h, touch] of SIZES) {
    for (const [name, scene] of Object.entries(SCENES)) {
      const page = await openGame(browser, url, { seed: 1, timeScale: 4, width: w, height: h, touch });
      await scene(page);
      await sleep(350); // staged renders and the dialog entrance have ended
      const c = await page.evaluate(check);
      console.log(`${name}-${w}x${h}`, JSON.stringify(c));
      if (c.scrollW > c.w || c.scrollH > c.h || c.off.length || c.clipped.length) throw new Error(`layout check failed: ${name} at ${w}x${h}`);
      await page.screenshot({ path: path.join(OUT, `${name}-${w}x${h}.png`) });
      if (page.__issues.length) throw new Error(page.__issues.join('\n'));
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
