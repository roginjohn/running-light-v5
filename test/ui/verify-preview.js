// v5 batch 8: proves the preview zip works. Extracts it to a temp folder and, from that copy, plays a real round by clicks, with
// no test hooks (production RNG), once from a local server and once from file://. Exits 1 on any failure, console error or
// external request. Run: node test/ui/verify-preview.js [path to the zip]
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { startServer, launch, clickId, sleep } from './harness.js';

const ZIP = path.resolve(process.argv[2] || '/workspace/casino-games/running-light/v5-batch8/running-light-v5-rc.zip');
const tmp = mkdtempSync(path.join(os.tmpdir(), 'rl-verify-'));
const root = path.join(tmp, 'running-light-v5-rc');
const live = (page) => page.evaluate(() => document.getElementById('live').textContent);
const balance = (page) => page.evaluate(() => document.querySelector('[data-role="balance"]').textContent);

async function playRound(browser, url) {
  const page = await browser.newPage();
  await page.bringToFront();
  const issues = [];
  page.on('console', (m) => { if (m.type() === 'error') issues.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => issues.push(`requestfailed: ${r.url()}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(url.replace(/index\.html$/, '')) && !/^(data|blob|about):/.test(u)) issues.push(`external request: ${u}`); });
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#loading.done', { timeout: 20000 });
  await page.waitForSelector('[data-id="start-play"]', { timeout: 20000 });
  if (await page.evaluate(() => !!window.__rl)) issues.push('test hooks are on');
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return ['600 20px Poppins', '700 20px Poppins', "600 20px 'JetBrains Mono'"].map((f) => document.fonts.check(f)); });
  await clickId(page, 'start-play');
  await page.waitForFunction(() => !document.querySelector('.warm') && document.querySelector('[data-id="tier-5"]'), { timeout: 20000 });
  await sleep(500);
  const before = await balance(page);
  await clickId(page, 'tier-5');
  await clickId(page, 'btn-start');
  await page.waitForFunction(() => /^(Double Run\. )?.*Light( 2)? stopped on square \d+.*(Collect|kept)/.test(document.getElementById('live').textContent), { timeout: 30000 });
  const said = await live(page);
  // a win waits for Collect; a no-win goes straight back to the board
  if (/Collect/.test(said)) await clickId(page, 'btn-collect');
  await page.waitForFunction(() => { const b = document.querySelector('[data-id="btn-start"]'); return b && /^Start/.test(b.textContent) && b.getAttribute('aria-disabled') !== 'true'; }, { timeout: 30000 });
  await sleep(1500); // the count-up
  const after = await balance(page);
  await page.close();
  if (fonts.includes(false)) issues.push(`fonts not loaded: ${fonts}`);
  if (before === after && !/Won/.test(said)) issues.push(`credits did not move on a no-win: ${before}`);
  return { said, before, after, issues };
}

let failed = false;
const browser = await launch();
try {
  execFileSync('unzip', ['-q', ZIP, '-d', tmp]);
  if (!existsSync(path.join(root, 'index.html'))) throw new Error('index.html is not in the zip');
  const { server, url } = await startServer(root);
  for (const [how, u] of [['local server', url], ['file://', pathToFileURL(path.join(root, 'index.html')).href]]) {
    const r = await playRound(browser, u);
    console.log(`${r.issues.length ? 'FAIL' : 'ok  '} ${how}: credits ${r.before} -> ${r.after}. Said: "${r.said}"`);
    for (const i of r.issues) console.log(`     ${i}`);
    failed = failed || r.issues.length > 0;
  }
  server.close();
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
if (failed) process.exit(1);
