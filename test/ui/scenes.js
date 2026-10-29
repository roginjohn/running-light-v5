// Scene setup helpers shared by screenshots and UI tests (test mode hooks only).
import { sleep, waitPhase } from './harness.js';

// v5 batch 2: bets are keyed by tier (the v3 UI shows them on every square of the tier, Batch 2 adapter)
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

export async function playTo(page, s1, s2 = null, target = ['GAMBLE_OFFER', 'BETTING']) {
  await force(page, s1, s2);
  await page.evaluate(() => window.__rl.app.ui.startLocked = false);
  const r = await dispatch(page, { type: 'START' });
  if (!r.ok) throw new Error(`START rejected: ${r.reason}`);
  await waitPhase(page, target, 30000);
  await settle(page);
}
