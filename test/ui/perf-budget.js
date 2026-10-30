// v5 batch 7: the perf budget. Sizes of dist/ (raw and gzip), load timing with puppeteer (median of 5 fresh, uncached loads,
// plain and at 4x CPU), the DOM size on the betting screen and the requests made. Exits 1 if a budget is broken. v5 batch 8:
// the DOM budget is 500 (v3's 400 predates v5's ring and spots) and is now a hard one. Writes docs/design-v5/batch-8/perf.json.
// Budgets are design-v3/perf-notes.md, with its JS line adapted: that budget excludes the engine, this one is the whole
// bundle, so it is the v3 batch 7 figure (32.47 KB) plus a small allowance. Run: npm run perf:budget (builds first)
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { startServer, launch } from './harness.js';

const ROOT = new URL('../../', import.meta.url);
const DIST = path.resolve(new URL('dist/', ROOT).pathname);
const OUT = path.resolve(new URL('docs/design-v5/batch-8/perf.json', ROOT).pathname);
const KB = 1000;
const BUDGET = { jsGzipKB: 36, cssGzipKB: 8, fontsKB: 80, fontFiles: 3, largestAssetKB: 100, domNodes: 500, fcpMs: 300, loadMs: 1000, loadMs4x: 3000, externalRequests: 0 };

const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(DIST).map((p) => {
  const body = readFileSync(p);
  return { file: path.relative(DIST, p).replace(/-[\w-]{8}(\.\w+)$/, '$1'), raw: body.length, gzip: /\.woff2$/.test(p) ? body.length : gzipSync(body, { level: 9 }).length };
}).sort((a, b) => b.raw - a.raw);
const sum = (re, k) => files.filter((f) => re.test(f.file)).reduce((a, f) => a + f[k], 0);
const sizes = {
  jsRaw: sum(/\.js$/, 'raw'), jsGzip: sum(/\.js$/, 'gzip'), cssRaw: sum(/\.css$/, 'raw'), cssGzip: sum(/\.css$/, 'gzip'),
  htmlRaw: sum(/\.html$/, 'raw'), htmlGzip: sum(/\.html$/, 'gzip'), fonts: sum(/\.woff2$/, 'raw'), fontFiles: files.filter((f) => /\.woff2$/.test(f.file)).length,
  totalGzip: files.filter((f) => /\.(js|css|html|woff2)$/.test(f.file)).reduce((a, f) => a + f.gzip, 0),
};

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const { server, url } = await startServer();
const browser = await launch();
async function load(cpu) {
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1920, height: 1080 });
  const cdp = await page.createCDPSession();
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const external = [], all = [];
  page.on('request', (r) => { const u = r.url(); all.push(u); if (!u.startsWith(url) && !/^(data|blob):/.test(u)) external.push(u); });
  const t = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  // Start screen on screen = ready for the first gesture
  await page.waitForFunction(() => document.querySelector('#loading.done') && document.querySelector('[data-id="start-play"]'), { timeout: 20000 });
  const wall = Date.now() - t;
  const m = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
    const res = performance.getEntriesByType('resource');
    return { domContentLoaded: n.domContentLoadedEventEnd, load: n.loadEventEnd, firstPaint: p['first-paint'], firstContentfulPaint: p['first-contentful-paint'], transferKB: (n.transferSize + res.reduce((a, r) => a + r.transferSize, 0)) / 1000 };
  });
  // the betting screen, once the hidden type warm-up box has gone
  await page.click('[data-id="start-play"]');
  await page.waitForFunction(() => !document.querySelector('.warm') && document.querySelector('[data-id="tier-200"]'), { timeout: 20000 });
  m.domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
  await page.close();
  return { ...m, ready: wall, external, requests: all.length };
}
const runs = async (cpu) => { const out = []; for (let i = 0; i < 5; i++) out.push(await load(cpu)); return out; };
const med = (rs) => Object.fromEntries(['firstPaint', 'firstContentfulPaint', 'domContentLoaded', 'load', 'ready'].map((k) => [k, Math.round(median(rs.map((r) => r[k])))]));
const plain = await runs(1), slow = await runs(4);
await browser.close();
server.close();

const timing = { cpu1x: med(plain), cpu4x: med(slow), requests: plain[0].requests, transferKB: Math.round(plain[0].transferKB * 100) / 100, domNodesBetting: plain[0].domNodes, external: [...new Set(plain.concat(slow).flatMap((r) => r.external))] };
const largest = files.filter((f) => !/\.map$/.test(f.file))[0];
const checks = [
  ['JS gzip', sizes.jsGzip / KB, BUDGET.jsGzipKB], ['CSS gzip', sizes.cssGzip / KB, BUDGET.cssGzipKB],
  ['Fonts', sizes.fonts / KB, BUDGET.fontsKB], ['Font files', sizes.fontFiles, BUDGET.fontFiles],
  [`Largest asset (${largest.file}, raw)`, largest.raw / KB, BUDGET.largestAssetKB],
  ['DOM nodes, betting screen', timing.domNodesBetting, BUDGET.domNodes],
  ['First contentful paint, 1x CPU (ms)', timing.cpu1x.firstContentfulPaint, BUDGET.fcpMs],
  ['Ready, 1x CPU (ms)', timing.cpu1x.ready, BUDGET.loadMs], ['Ready, 4x CPU (ms)', timing.cpu4x.ready, BUDGET.loadMs4x],
  ['External requests', timing.external.length, BUDGET.externalRequests],
].map(([name, value, budget, soft = false]) => ({ name, value: Math.round(value * 100) / 100, budget, pass: value <= budget, soft }));

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ files, sizes, timing, checks }, null, 2)}\n`);
for (const f of files) console.log(`${f.file.padEnd(46)} ${String(f.raw).padStart(7)} raw ${String(f.gzip).padStart(7)} gzip`);
console.log(`\nload, median of 5 (ms): 1x ${JSON.stringify(timing.cpu1x)}\n                        4x ${JSON.stringify(timing.cpu4x)}`);
console.log(`${timing.requests} requests; ${timing.transferKB} KB over the wire from the uncompressing test server, ${Math.round(sizes.totalGzip / 100) / 10} KB if gzipped; ${timing.domNodesBetting} DOM nodes\n`);
for (const c of checks) console.log(`${c.pass ? 'ok  ' : c.soft ? 'OVER' : 'FAIL'} ${c.name}: ${c.value} (budget ${c.budget})`);
if (checks.some((c) => !c.pass && !c.soft)) process.exit(1);
