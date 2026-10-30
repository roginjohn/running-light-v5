// v3 batch screenshots at 1920x1080, 1280x720 and 768x1024, plus side-by-side compare-*.png (build left, mockup
// right, letterboxed where the mockup only exists at 1920x1080). Mockup story: 20 credits on 6 squares, chip 5,
// credits 1,000, last bets 20 20 15 30 10. Test mode only (window.__rl hooks).
//   betting   betting*.png         the board before START
//   running   running.png          after START: credits 980, the light on #30 with its trail on #29 and #28
//   win-gamble-offer               the light stopped on #13 (480x, 5 on it): You win 2,400, Collect / Gamble ×2
//   gamble-flip                    flip 1 (White) won 2,400 -> 4,800; flip 2 on Red, frozen mid-flip
//   loss                           the light stopped on #26 (no bet there)
//   double-run-result              Double Run: #21 (960x, 2 on it) and #33 (24x, 5 on it): You win 2,040
//   refill                         credits 0, no bets: Out of play credits (refill.png)
//   error                          paused mid-run (credits 980, the light on #30) with a storage write error (error.png)
//   settings-paytable-help         the Game info window (settings-paytable-help.png)
//   fairness, start, loading       not mocked: How results are decided, the Start screen, the loading screen
// Overlays are captured at 1920x1080 only (Game info also at 1280x720 and 768x1024, where it shows tabs / a sheet);
// the other scenes at all three sizes. --small <scenes> limits the 1280x720 / 768x1024 captures to those scenes
// (batch 7: --small betting).
// Usage: npm run build && node test/ui/screenshots-v3.js [--out docs/design-v3/batch-7] [--scenes betting,refill,...]
//        [--small betting]
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, launch, openGame, sleep, waitPhase } from './harness.js';
import { setup, force, settle, H01 } from './scenes.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const OUT = path.resolve(ROOT, args.out || 'docs/design-v3/batch-7');
const SMALL = args.small ? new Set(args.small.split(',')) : null;
const MOCK = path.join(ROOT, 'docs/design-v3');
const OVERLAYS = ['refill', 'error', 'settings-paytable-help', 'fairness', 'start', 'loading'];
const MOCKED = new Set(['betting', 'running', 'win-gamble-offer', 'gamble-flip', 'loss', 'double-run-result', 'refill', 'error', 'settings-paytable-help']);
const SCENES = (args.scenes || ['betting', ...OVERLAYS].join(',')).split(',');
const SIZES = [[1920, 1080, 'betting.png'], [1280, 720, 'betting-1280x720.png'], [768, 1024, 'betting-768x1024.png']];
export const MOCK_BETS = { 3: 2, 8: 1, 13: 5, 21: 2, 27: 5, 33: 5 }; // betting.png: 20 credits on 6 squares
const MOCK_TOTALS = [20, 20, 15, 30, 10];
const MOCK_HISTORY = [1, 2, 4, 3, 6, 9, 7, 11].reverse(); // shown newest first: 24x 96x 24x 480x 24x 24x 96x 24x

mkdirSync(OUT, { recursive: true });
const { server, url } = await startServer();
const browser = await launch();
const issues = [];

async function compare(file, mock, w, h, name) {
  // side by side: build | mockup, each scaled to the same height
  const ch = w > h ? 540 : 1024;
  const cw = Math.round((w * ch) / h);
  const gap = 24;
  const cmp = await browser.newPage();
  await cmp.setViewport({ width: cw * 2 + gap, height: ch });
  const img = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
  await cmp.setContent(`<body style="margin:0;background:#0f1216;display:flex;gap:${gap}px"><img src="${img(file)}" style="width:${cw}px;height:${ch}px"><img src="${img(path.join(MOCK, mock))}" style="width:${cw}px;height:${ch}px;object-fit:contain"></body>`, { waitUntil: 'load' });
  await cmp.screenshot({ path: path.join(OUT, `compare-${name}.png`) });
  await cmp.close();
}

// play a round for real (bet taken, stored outcome animated) at a fast time scale, then let every animation end
async function play(page, s1, s2 = null, target = ['GAMBLE_OFFER', 'BETTING']) {
  await force(page, s1, s2);
  await page.evaluate(() => { window.__rl.app.ui.startLocked = false; window.__rl.game.dispatch({ type: 'START' }); });
  await waitPhase(page, target, 30000);
  await settle(page);
}
async function flip(page, pick, result) {
  await page.evaluate((p, r) => {
    const g = window.__rl.game;
    g.dispatch({ type: 'PICK', colour: p });
    g.test.forceNextGamble(r);
    g.dispatch({ type: 'GAMBLE_FLIP' });
  }, pick, result);
}

const SCENE = {
  async refill(page) {
    await page.evaluate(() => {
      window.__rl.game.test.setBets({});
      window.__rl.game.test.setBalance(0);
      window.__rl.app.render();
    });
  },
  async error(page) {
    await force(page, 30);
    await page.evaluate(() => { window.__rl.app.ui.startLocked = false; window.__rl.game.dispatch({ type: 'START' }); });
    await sleep(700);
    await page.evaluate(() => {
      const app = window.__rl.app;
      app.setPaused(true);
      app.ui.light1 = { idx: 30, trail: [], level: null };
      window.__rl.game.dispatch({ type: 'FAIL', message: 'storage setItem failed' });
    });
  },
  'settings-paytable-help': (page) => page.evaluate(() => window.__rl.game.dispatch({ type: 'OPEN_INFO', tab: 'settings' })),
  async fairness(page) {
    const r = await page.evaluate(() => document.querySelector('[data-id="icon-results"]').getBoundingClientRect().toJSON());
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  },
  start: (page) => page.evaluate(() => { window.__rl.app.ui.start = true; window.__rl.app.render(); }),
  loading: (page) => page.evaluate(() => window.__rlShowLoading(0.72, 0, 'Loading sounds…')),
  async running(page) {
    // START for real, then freeze the run and show the mockup frame: light on #30, trail on #29 (.34) and #28 (.20)
    await force(page, 30);
    await page.evaluate(() => { window.__rl.app.ui.startLocked = false; window.__rl.game.dispatch({ type: 'START' }); });
    await sleep(700);
    await page.evaluate(() => {
      const app = window.__rl.app;
      app.setPaused(true);
      app.ui.displayBalance = null;
      app.ui.light1 = { idx: 30, trail: [29, 28], level: null };
      app.render();
    });
  },
  'win-gamble-offer': (page) => play(page, 13),
  loss: (page) => play(page, 26, null, 'BETTING'),
  'double-run-result': (page) => play(page, 21, 33),
  async 'gamble-flip'(page) {
    await play(page, 13);
    await page.evaluate(() => window.__rl.game.dispatch({ type: 'GAMBLE_OPEN' }));
    await flip(page, 'white', 'white');
    await page.waitForFunction(() => window.__rl.game.state.phase === 'GAMBLE' && !window.__rl.game.state.gamble.revealing);
    await settle(page);
    await flip(page, 'red', 'red');
    await sleep(60);
    // freeze the stored flip mid-turn (the mockup's mid-flip frame): stop the rAF tasks and the CSS animation
    await page.evaluate(() => {
      window.__rl.app.setPaused(true);
      const coin = document.querySelector('.flip .coin');
      for (const a of coin.getAnimations()) a.cancel();
      coin.style.transform = 'rotateY(72deg)';
    });
  },
};

try {
  for (const scene of SCENES) {
    const wideOnly = SMALL ? !SMALL.has(scene) : OVERLAYS.includes(scene) && scene !== 'settings-paytable-help';
    for (const [w, h, betMock] of wideOnly ? SIZES.slice(0, 1) : SIZES) {
      const page = await openGame(browser, url, { seed: 7, timeScale: scene === 'betting' || scene === 'running' ? 1 : 4, width: w, height: h, touch: w < 900 });
      await setup(page, { balance: 1000, history: H01, bets: MOCK_BETS, chip: 5 });
      await page.evaluate((t, hist) => {
        const g = window.__rl.game;
        g.test.setHistory(hist.map((s1, i) => ({ roundId: `h${i}`, s1, s2: null, win: 0 })));
        window.__rl.app.ui.betTotals = t.map((v, i) => ({ id: `m${i}`, t: v }));
        window.__rl.app.render();
      }, MOCK_TOTALS, MOCK_HISTORY);
      if (SCENE[scene]) await SCENE[scene](page);
      await page.mouse.move(w - 2, h - 2);
      await page.evaluate(() => { window.__rl.app.ui.ringOn = false; document.getElementById('app').classList.remove('kbd'); });
      await sleep(400);
      const name = `${scene}-${w}x${h}`;
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file });
      issues.push(...page.__issues.map((i) => `${name}: ${i}`));
      await page.close();
      // only betting has mockups at every size; the others are compared against the 1920x1080 mockup, letterboxed
      if (MOCKED.has(scene)) await compare(file, scene === 'betting' ? betMock : `${scene}.png`, w, h, name);
      console.log('captured', name);
    }
  }
} finally {
  await browser.close();
  server.close();
}
if (issues.length) {
  console.error(issues.join('\n'));
  process.exitCode = 1;
}
