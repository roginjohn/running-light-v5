// v3 performance evidence: a Chrome performance trace (puppeteer Tracing, devtools.timeline) of one full round at
// 1920x1080, real speed, with and without 4x CPU throttling. Batch 4 traced the light run; batch 5 continues the
// same round through the result states: the light stops on #13 (a 480x win, 5 on it), the win offer, Gamble ×2,
// a pick, one stored flip (won), Collect and the payout back to betting. Per segment it counts Layout events (and
// how big they are), forced (synchronous) layouts from script, style recalcs, paints, script time per animation
// frame, and long tasks (> 50 ms). Batch 7 adds the credits count-up check (layouts in the first 300 ms after
// START's render: how many, how many full, the largest object count). Prints a JSON summary.
// Usage: npm run build && node test/ui/perf-trace.js [--trace /tmp/rl-trace.json]
import { writeFileSync } from 'node:fs';
import { startServer, launch, openGame, waitPhase, sleep } from './harness.js';
import { setup, force } from './scenes.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const { server, url } = await startServer();
const browser = await launch();
const out = {};

const mark = (page, name) => page.evaluate((n) => performance.mark(n), name);
const when = (page, fn, arg) => page.waitForFunction(fn, { timeout: 30000, polling: 50 }, arg);

async function one(label, throttle) {
  const page = await openGame(browser, url, { seed: 3, timeScale: 1, width: 1920, height: 1080 });
  await setup(page, { balance: 1000, bets: { 5: 5, 10: 5, 20: 5, 50: 2, 100: 2, 200: 1 }, chip: 5 });
  await force(page, 13);
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  // count light steps from the UI state in a rAF loop (reads JS state only, no DOM)
  await page.evaluate(() => {
    const S = window.__steps = { n: 0, last: null, on: true };
    const tick = () => {
      const L = window.__rl.app.ui.light1;
      const idx = L ? L.idx : null;
      if (idx != null && idx !== S.last) { S.n += 1; S.last = idx; }
      if (S.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await sleep(200);
  await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.stack', 'blink.user_timing'] });
  // 1. light run
  await page.evaluate(() => { performance.mark('run-start'); window.__rl.game.dispatch({ type: 'START' }); });
  await waitPhase(page, ['RESOLVING', 'GAMBLE_OFFER'], 30000);
  await mark(page, 'run-end');
  // 2. win reveal: RESOLVING -> win offer (green stop, centre, band) and the rail count-up
  await waitPhase(page, 'GAMBLE_OFFER', 30000);
  await when(page, () => window.__rl.app.pendingTasks() === 0);
  await mark(page, 'win-end');
  // 3. gamble: Gamble ×2 opens the centre panel, a pick, one flip (stored as a win) and its reveal
  // (one input per task, as a player would press G, R and G; a gap of 300 ms between them)
  await page.evaluate(() => window.__rl.game.dispatch({ type: 'GAMBLE_OPEN' }));
  await sleep(300);
  await page.evaluate(() => window.__rl.game.dispatch({ type: 'PICK', colour: 'red' }));
  await sleep(300);
  await page.evaluate(() => { window.__rl.game.test.forceNextGamble('red'); window.__rl.game.dispatch({ type: 'GAMBLE_FLIP' }); });
  await when(page, () => !window.__rl.game.state.gamble.revealing && window.__rl.app.pendingTasks() === 0);
  await mark(page, 'gamble-end');
  // 4. collect: payout count-up back to betting
  await page.evaluate(() => window.__rl.game.dispatch({ type: 'COLLECT' }));
  await waitPhase(page, 'BETTING', 30000);
  await when(page, () => window.__rl.app.pendingTasks() === 0);
  await mark(page, 'collect-end');
  const buf = Buffer.from(await page.tracing.stop());
  const steps = await page.evaluate(() => { window.__steps.on = false; return window.__steps.n; });
  const won = await page.evaluate(() => window.__rl.game.state.round.currentWin);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();

  const trace = JSON.parse(buf.toString());
  if (args.trace && throttle === 1) writeFileSync(args.trace, buf);
  const ev = trace.traceEvents || trace;
  const at = (n) => ev.find((e) => e.name === n && e.cat.includes('user_timing')).ts;
  const T = { start: at('run-start'), run: at('run-end'), win: at('win-end'), gamble: at('gamble-end'), collect: at('collect-end') };
  // the renderer main thread = the thread that ran our rAF callbacks
  const fire0 = ev.filter((e) => e.name === 'FireAnimationFrame' && e.ts >= T.start && e.ts <= T.run);
  const main = fire0.length ? `${fire0[0].pid}:${fire0[0].tid}` : null;
  const ms = (us) => Math.round(us / 10) / 100;
  const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

  function segment(t0, t1, { skipFirstFrame = false } = {}) {
    const inSeg = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.ts >= t0 && e.ts <= t1);
    const named = (n) => inSeg.filter((e) => e.name === n && e.ph === 'X');
    const fire = named('FireAnimationFrame');
    // a layout is "forced" when it runs inside script (a synchronous layout read), not in the frame's lifecycle
    const scripts = inSeg.filter((e) => ['FunctionCall', 'FireAnimationFrame', 'EvaluateScript', 'TimerFire', 'EventDispatch'].includes(e.name) && e.ph === 'X');
    const inside = (e) => scripts.some((s) => e.ts >= s.ts && e.ts + (e.dur || 0) <= s.ts + s.dur);
    const layouts = named('Layout');
    // the run skips START's one-off re-render (rail, centre copy, credits tween start): the first frame
    const firstEnd = skipFirstFrame && fire.length ? fire[0].ts + fire[0].dur : t0;
    const runLayouts = layouts.filter((e) => e.ts > firstEnd);
    const dirty = runLayouts.map((e) => e.args?.beginData?.dirtyObjects ?? null).filter((x) => x != null);
    const total = runLayouts.map((e) => e.args?.beginData?.totalObjects ?? null).filter((x) => x != null);
    const tasks = inSeg.filter((e) => (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask') && e.ph === 'X');
    const fireDur = fire.map((e) => e.dur);
    return {
      ms: ms(t1 - t0), animationFrames: fire.length,
      layoutEvents: layouts.length, forcedLayoutsFromScript: layouts.filter(inside).length,
      layoutDirtyObjects: { max: Math.max(0, ...dirty), median: pct(dirty, 0.5) },
      layoutTotalObjects: { max: Math.max(0, ...total), median: pct(total, 0.5) },
      layoutTimeMs: { total: ms(runLayouts.reduce((a, e) => a + e.dur, 0)), max: ms(Math.max(0, ...runLayouts.map((e) => e.dur))) },
      styleRecalcs: named('UpdateLayoutTree').length, paints: named('Paint').length,
      rafScriptMs: { median: ms(pct(fireDur, 0.5)), p95: ms(pct(fireDur, 0.95)), max: ms(Math.max(0, ...fireDur)) },
      longestTaskMs: ms(Math.max(0, ...tasks.map((e) => e.dur))),
      longTasksOver50ms: tasks.filter((e) => e.dur > 50000).length,
    };
  }
  const run = segment(T.start, T.run, { skipFirstFrame: true });
  run.lightSteps = steps;
  // batch 7: the 300 ms credits count-up after START's own render (its one full layout is skipped). Each tween frame
  // should lay out only the contained credits box (a partial layout of a few objects), never the document.
  {
    const all = ev.filter((e) => `${e.pid}:${e.tid}` === main && e.name === 'Layout' && e.ph === 'X' && e.ts >= T.start && e.ts <= T.start + 300000);
    const cu = all.slice(1);
    const objs = cu.map((e) => e.args?.beginData?.totalObjects ?? 0);
    run.countUp = { layouts: cu.length, fullLayouts: cu.filter((e) => e.args?.beginData?.partialLayout === false).length, maxObjects: Math.max(0, ...objs), maxMs: ms(Math.max(0, ...cu.map((e) => e.dur))) };
  }
  run.layoutsPerStep = Math.round(((run.layoutEvents - 1) / steps) * 100) / 100;
  const segs = { run, winReveal: segment(T.run, T.win), gamble: segment(T.win, T.gamble), collect: segment(T.gamble, T.collect) };
  out[label] = {
    cpuThrottle: throttle, collected: won, ...segs,
    longTasksOver50msTotal: Object.values(segs).reduce((a, s) => a + s.longTasksOver50ms, 0),
    longestTaskMsTotal: Math.max(...Object.values(segs).map((s) => s.longestTaskMs)),
  };
}

try {
  await one('desktop', 1);
  await one('cpu4x', 4);
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(out, null, 2));
for (const [k, v] of Object.entries(out)) {
  console.log(`\n${k}: long tasks > 50 ms: ${v.longTasksOver50msTotal}, longest task ${v.longestTaskMsTotal} ms`);
  const cu = v.run.countUp;
  console.log(`  count-up  ${cu.layouts} layouts in the first 300 ms (full ${cu.fullLayouts}, max ${cu.maxObjects} objects, max ${cu.maxMs} ms)`);
  for (const s of ['run', 'winReveal', 'gamble', 'collect']) {
    const x = v[s];
    console.log(`  ${s.padEnd(9)} ${String(x.ms).padStart(8)} ms | layouts ${x.layoutEvents} (forced ${x.forcedLayoutsFromScript}, ${x.layoutTimeMs.total} ms, max ${x.layoutTimeMs.max}) | rAF script median/p95/max ${x.rafScriptMs.median}/${x.rafScriptMs.p95}/${x.rafScriptMs.max} ms | longest task ${x.longestTaskMs} ms | long ${x.longTasksOver50ms}`);
  }
}
