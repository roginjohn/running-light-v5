// Scene setup helpers shared by screenshots and UI tests (test mode hooks only).
import { sleep, waitPhase } from './harness.js';

// v5: bets are keyed by tier
export const BETS = { 5: 10, 10: 10, 20: 5, 50: 5, 100: 5, 200: 5 }; // total 40 on the 6 tiers
export const H01 = [5, 31, 12, 44, 3, 27, 9, 36, 20, 50];
export const H03 = [...H01.slice(1), 12];
export const H04 = [...H03.slice(1), [24, 13]];
export const H06 = [...H04.slice(1), 27];

export async function setup(page, { balance = 1240, history = H01, bets = BETS, chip = 5 } = {}) {
  await page.evaluate((o) => {
    const g = window.__rl.game;
    g.test.setBalance(o.balance);
    g.test.setHistory(o.history.map((e, i) => (Array.isArray(e) ? { roundId: `h${i}`, s1: e[0], s2: e[1], win: 0 } : { roundId: `h${i}`, s1: e, s2: null, win: 0 })));
    g.dispatch({ type: 'SELECT_CHIP', value: o.chip });
    g.test.setBets(o.bets);
    window.__rl.app.ui.lightIndex = 1;
  }, { balance, history, bets, chip });
  await sleep(50);
}

export async function force(page, s1, s2 = null) {
  await page.evaluate((a, b) => window.__rl.game.test.forceNextOutcome({ s1: a, s2: b }), s1, s2);
}

export async function dispatch(page, action) {
  return page.evaluate((a) => window.__rl.game.dispatch(a), action);
}

/** Wait out a staged result render (app.js renderStaged): board and centre first, then the rail, top row and bar,
 *  then the focus move, one frame apart (two frames from an input). */
export async function staged(page) {
  await page.evaluate(() => new Promise((r) => { let n = 4; const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }));
}

/** Wait until no animation tasks are pending (or timeout). */
export async function settle(page, timeout = 15000) {
  await page.waitForFunction(() => window.__rl.app.pendingTasks() === 0, { timeout });
  await sleep(100);
}

/** START, timed inside the page from the dispatch to the first frame in the wanted phase, so the time puppeteer takes to
 *  poll is not counted. maxGap is the longest frame seen: a loaded machine can stall a frame, and the run can only
 *  end on a frame, so a run may overshoot by one such gap. */
export function timeToPhase(page, phases) {
  return page.evaluate((want) => new Promise((done, fail) => {
    const g = window.__rl.game;
    const t0 = performance.now();
    let last = t0, maxGap = 0;
    const r = g.dispatch({ type: 'START' });
    if (!r.ok) { fail(new Error(`START rejected: ${r.reason}`)); return; }
    const tick = (t) => {
      maxGap = Math.max(maxGap, t - last);
      last = t;
      if ([].concat(want).includes(g.state.phase)) done({ ms: Math.round(performance.now() - t0), maxGap: Math.round(maxGap) });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), phases);
}

export async function playTo(page, s1, s2 = null, target = ['GAMBLE_OFFER', 'BETTING']) {
  await force(page, s1, s2);
  await page.evaluate(() => window.__rl.app.ui.startLocked = false);
  const r = await dispatch(page, { type: 'START' });
  if (!r.ok) throw new Error(`START rejected: ${r.reason}`);
  await waitPhase(page, target, 30000);
  await settle(page);
}
