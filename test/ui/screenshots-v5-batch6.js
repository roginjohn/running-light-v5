// v5 batch 6 artifacts: win, no-win, Double Run, double hit (×2), gamble and paytable at 1920x1080, 390x844 and 360x640,
// rendered from dist/ with the test harness and the mock's bets, into docs/design-v5/batch-6/. Fails on page overflow, or
// a control or text that is clipped or off screen. Run: npm run screenshots:batch6
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { startServer, launch, openGame, sleep } from './harness.js';
import { setup, playTo, dispatch, settle } from './scenes.js';
import { layoutCheck as check } from './a11y-audit.js';

const OUT = path.resolve(new URL('../../docs/design-v5/batch-6/', import.meta.url).pathname);
const BETS = { 100: 5, 50: 10, 20: 25, 10: 50, 5: 100 };
const SIZES = [[1920, 1080, false], [390, 844, true], [360, 640, true]];

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
