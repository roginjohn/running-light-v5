// Shared harness: static server for dist/ + puppeteer-core driving the installed Google Chrome.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const DIST = path.resolve(new URL('../../dist/', import.meta.url).pathname);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };

export async function startServer(root = DIST) {
  if (!existsSync(path.join(root, 'index.html'))) throw new Error(`${root} has no index.html: run npm run build first`);
  const server = http.createServer(async (req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(root, u === '/' ? 'index.html' : u);
    if (!f.startsWith(root)) return res.writeHead(403).end();
    try {
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

export async function launch() {
  return puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    headless: 'new',
    protocolTimeout: 60000, // a stalled evaluate fails in a minute, not the default three
    // a page that Chrome treats as backgrounded runs rAF late or not at all, which is what the timing tests measure
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
}

// Chrome runs no requestAnimationFrame at all in a tab that is behind another one in its window, and the game's light,
// staged renders and puppeteer's default waits all run on frames, so such a page stalls until something times out. Each
// test page gets its own browser context, and so its own window: no other page, not even one left open by a failed test,
// can hide it. Closing the page closes the context. A context also gives it its own localStorage.
const openPages = new Set();
export async function newTestPage(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  openPages.add(page);
  page.close = async () => {
    openPages.delete(page);
    await ctx.close();
  };
  return page;
}
/** Close what a failed test left open (use in afterEach). */
export async function closeLeftPages() {
  await Promise.all([...openPages].map((p) => p.close()));
}
/** What to say when a wait runs out: a page that is not visible is the usual cause of a stall. */
export const pageFacts = (page) => page.evaluate(() => `visibility ${document.visibilityState}, phase ${window.__rl ? window.__rl.game.state.phase : 'not booted'}, pending tasks ${window.__rl ? window.__rl.app.pendingTasks() : '-'}`).catch((e) => `page unreadable: ${e.message}`);

/** Open the game in test mode. opts: { seed, timeScale, noStorage, width, height, reducedMotion, keepStorage, startScreen, presetStorage, touch } */
export async function openGame(browser, url, opts = {}, page = null) {
  page = page || (await newTestPage(browser));
  await page.bringToFront();
  const issues = page.__issues || [];
  if (!page.__issues) {
    page.__issues = issues;
    page.on('console', (m) => { if (m.type() === 'error') issues.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => issues.push(`requestfailed: ${r.url()}`));
    page.on('response', (r) => { if (r.status() >= 400) issues.push(`HTTP ${r.status()}: ${r.url()}`); });
    page.on('request', (r) => { const u = r.url(); if (!u.startsWith(new URL(url).origin) && !/^(data|blob|about):/.test(u)) issues.push(`external request: ${u}`); });
  }
  await page.setViewport({ width: opts.width || 1920, height: opts.height || 1080, hasTouch: !!opts.touch });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: opts.reducedMotion ? 'reduce' : 'no-preference' }]);
  const T = { seed: opts.seed ?? 1, timeScale: opts.timeScale || 1, noStorage: !!opts.noStorage, noReload: !!opts.noReload, startScreen: !!opts.startScreen };
  await page.evaluateOnNewDocument((t) => { window.__RL_TEST__ = t; }, T);
  await page.goto(url, { waitUntil: 'load' });
  if (!opts.keepStorage) {
    // let the first boot finish so it cannot touch the storage we are about to prepare
    await page.waitForFunction(() => window.__rl && window.__rl.game.state.phase !== 'INIT', { timeout: 10000 }).catch(() => {});
    await page.evaluate((pre) => { localStorage.clear(); for (const [k, v] of Object.entries(pre || {})) localStorage.setItem(k, v); }, opts.presetStorage || null);
    await page.reload({ waitUntil: 'load' });
  }
  await page.waitForFunction(() => window.__rl && window.__rl.game.state.phase !== 'INIT', { timeout: 10000 });
  await page.waitForFunction(() => document.getElementById('loading').classList.contains('done'));
  await page.evaluate(() => document.fonts.ready);
  await sleep(400); // loading screen fade-out
  const shown = await page.evaluate(() => document.visibilityState);
  if (shown !== 'visible') throw new Error(`test page is ${shown}: it would get no animation frames`);
  return page;
}

export const phase = (page) => page.evaluate(() => window.__rl.game.state.phase);
export async function waitPhase(page, p, timeout = 20000) {
  try {
    await page.waitForFunction((x) => [].concat(x).includes(window.__rl.game.state.phase), { timeout }, p);
  } catch (e) {
    throw new Error(`no phase ${p} within ${timeout} ms (${await pageFacts(page)}): ${e.message}`);
  }
}
export const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__rl.game.state)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Centre of an interactive element (by data-id) in viewport pixels. */
export async function centerOf(page, id) {
  return page.evaluate((i) => {
    const el = document.querySelector(`[data-id="${i}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}
export async function clickId(page, id, opts = {}) {
  const p = await centerOf(page, id);
  if (!p) throw new Error(`no element ${id}`);
  await page.mouse.click(p.x, p.y, opts);
}
