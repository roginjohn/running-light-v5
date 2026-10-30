// v2 UI tests (puppeteer-core + installed Google Chrome): interaction, state copy, locks, layout at
// 1920x1080 / 1280x720 / 1024x768 / 768x1024 (touch), WIN-tag geometry, recovery, console and network checks.
// Run: npm run test:ui (builds first)
// v5: the ring is display-only (batch 4); bets go on the six tier spots in the centre (data-id tier-5 … tier-200, batch 5).
// Squares used: #1/#6 5x, #5/#15/#24/#27/#40 10x, #13/#17/#33 20x, #3/#29 50x, #21/#46 100x, #8 200x, #2/#12/#30 blank.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openGame, waitPhase, state, sleep, clickId, centerOf } from './harness.js';
import { setup, playTo, dispatch, settle, force, staged, BETS } from './scenes.js';
import { MAX_GAMBLES, GAMBLE_CAP } from '../../src/engine/config.js';

let server, url, browser;
const issues = [];
before(async () => {
  ({ server, url } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser.close();
  server.close();
});

async function fresh(opts = {}) {
  const page = await openGame(browser, url, { seed: 11, timeScale: 4, ...opts });
  page.__done = () => { issues.push(...page.__issues); return page.close(); };
  return page;
}
const bets = async (page) => (await state(page)).bets;
const text = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
const toastText = (page) => text(page, '#r-toast');
const attr = (page, id, a) => page.evaluate((i, x) => document.querySelector(`[data-id="${i}"]`)?.getAttribute(x) ?? null, id, a);

const SIZES = [[1920, 1080, 'desktop-xl'], [1280, 720, 'desktop'], [1024, 768, 'tablet-landscape'], [768, 1024, 'tablet-portrait']];

// ------------------------------------------------------------------ betting
test('bets by mouse: click on a tier spot adds, right-click and Shift+click remove (floor 0); the bet shows on the spot', async () => {
  const page = await fresh();
  await clickId(page, 'chip-5');
  await clickId(page, 'tier-20');
  await clickId(page, 'tier-20');
  assert.deepEqual(await bets(page), { 20: 10 });
  await clickId(page, 'tier-20', { button: 'right' });
  assert.deepEqual(await bets(page), { 20: 5 });
  assert.equal(await attr(page, 'tier-20', 'aria-label'), '20x spot, 1 in 21.83 per light, 4 squares, your bet 5');
  assert.equal(await text(page, '[data-id="tier-20"] .sb'), 'Bet 5');
  await page.keyboard.down('Shift');
  await clickId(page, 'tier-20');
  await page.keyboard.up('Shift');
  assert.deepEqual(await bets(page), {});
  await clickId(page, 'tier-20', { button: 'right' });
  assert.deepEqual(await bets(page), {});
  assert.equal(await text(page, '[data-id="tier-20"] .sb'), 'No bet');
  await page.__done();
});

test('tier spots (betting mock): six buttons, 200x to 5x, each with multiplier, 1 in X, squares and bet; blue border on a bet; the old pays row is gone', async () => {
  const page = await fresh();
  await setup(page, { balance: 10000, bets: { 100: 5, 5: 100 }, chip: 25, history: [] });
  const g = await page.evaluate(() => ({
    spots: [...document.querySelectorAll('#r-centre .spot')].map((e) => [e.tagName, e.dataset.id, ...['.sm', '.so', '.sq', '.sb'].map((s) => e.querySelector(s).textContent)]),
    border: [getComputedStyle(document.querySelector('[data-id="tier-100"]')).borderTopColor, getComputedStyle(document.querySelector('[data-id="tier-200"]')).borderTopColor],
    cols: new Set([...document.querySelectorAll('.spot')].map((e) => Math.round(e.getBoundingClientRect().left))).size,
    old: document.querySelectorAll('.pays, .pay, .betin').length, big: document.querySelectorAll('#r-centre .big').length,
    headline: document.querySelector('[data-role="headline"]').textContent, inRing: document.querySelector('#r-centre .centre .spots') !== null,
  }));
  assert.deepEqual(g.spots, [
    ['BUTTON', 'tier-200', '200x', '1 in 218.3', '1 square', 'No bet'],
    ['BUTTON', 'tier-100', '100x', '1 in 109.1', '2 squares', 'Bet 5'],
    ['BUTTON', 'tier-50', '50x', '1 in 54.56', '3 squares', 'No bet'],
    ['BUTTON', 'tier-20', '20x', '1 in 21.83', '4 squares', 'No bet'],
    ['BUTTON', 'tier-10', '10x', '1 in 10.91', '8 squares', 'No bet'],
    ['BUTTON', 'tier-5', '5x', '1 in 5.46', '12 squares', 'Bet 100'],
  ]);
  assert.equal(g.border[0], 'rgb(13, 110, 253)', 'a bet adds the accent-blue border');
  assert.notEqual(g.border[1], g.border[0], 'no border change without a bet');
  assert.equal(g.cols, 3, '3 x 2 on desktop');
  assert.deepEqual([g.old, g.big, g.headline, g.inRing], [0, 0, 'Pick a tier spot', true]);
  await page.__done();
});

test('controls: all seven chips add their full value; total "N / 1,000", Undo, Clear, Start "N on K spots"; no Rebet, 1/2 or x2', async () => {
  const page = await fresh();
  const none = await page.evaluate(() => document.querySelectorAll('[data-id="btn-rebet"], [data-id="btn-half"], [data-id="btn-double"]').length);
  assert.equal(none, 0);
  assert.doesNotMatch(await text(page, '#r-controls'), /Rebet/);
  for (const v of [1, 5, 10, 25, 50, 100, 500]) {
    await clickId(page, `chip-${v}`);
    await clickId(page, 'tier-50');
    assert.equal((await bets(page))[50], [1, 6, 16, 41, 91, 191, 691][[1, 5, 10, 25, 50, 100, 500].indexOf(v)], `chip ${v}`);
  }
  assert.equal(await text(page, '[data-role="total"]'), '691 / 1,000');
  assert.equal(await text(page, '[data-role="bet-hint"]'), 'Max 1,000 per spot');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start691 on 1 spot$/);
  await clickId(page, 'chip-5');
  await clickId(page, 'tier-200');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start696 on 2 spots$/);
  await clickId(page, 'btn-undo');
  assert.deepEqual(await bets(page), { 50: 691 });
  await clickId(page, 'btn-clear');
  assert.deepEqual(await bets(page), {});
  assert.equal(await attr(page, 'btn-start', 'aria-disabled'), 'true', 'no bet: Start off');
  await clickId(page, 'btn-undo');
  assert.deepEqual(await bets(page), { 50: 691 }, 'Undo brings back a Clear');
  await page.__done();
});

test('bets persist between rounds (win, gamble loss, no win, reload): "Start again" replays them; R does nothing', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: { 20: 5, 50: 1 }, chip: 5, history: [] });
  await playTo(page, 13); // a win, collected
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  assert.deepEqual(await bets(page), { 20: 5, 50: 1 }, 'kept after Collect');
  assert.equal((await state(page)).ghosts, false);
  assert.equal(await attr(page, 'btn-undo', 'aria-disabled'), 'true', 'no undo step');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'btn-start', 'focus on Start');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start again6 on 2 spots$/);
  await page.keyboard.press('r');
  assert.equal(await text(page, '#r-toast'), '', 'no "restored" toast');
  await clickId(page, 'tier-10');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start/);
  assert.doesNotMatch(await text(page, '[data-id="btn-start"]'), /again/, 'changed bets: plain Start');
  await clickId(page, 'btn-undo');
  await playTo(page, 13); // a win lost in the gamble
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await waitPhase(page, 'BETTING', 15000);
  await settle(page);
  assert.deepEqual(await bets(page), { 20: 5, 50: 1 }, 'kept after a lost gamble');
  await playTo(page, 2, null, 'BETTING'); // no win
  assert.deepEqual(await bets(page), { 20: 5, 50: 1 }, 'kept after no win');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.spot.lost')].map((e) => e.dataset.id)), ['tier-50', 'tier-20'], 'spots that bet and lost fade');
  await clickId(page, 'tier-20');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.spot.lost').length), 0, 'the fade ends when the bets change');
  await clickId(page, 'btn-undo');
  await openGame(browser, url, { seed: 11, keepStorage: true }, page);
  assert.deepEqual(await bets(page), { 20: 5, 50: 1 }, 'kept after a reload');
  await playTo(page, 13);
  assert.deepEqual((await state(page)).round.bets, { 20: 5, 50: 1 }, 'the kept bets are what START plays');
  await page.__done();
});

test('touch screens hide the shortcut list (media rule); it stays on a mouse and keyboard screen', async () => {
  const page = await fresh({ width: 1280, height: 720 });
  await dispatch(page, { type: 'OPEN_INFO', tab: 'settings' });
  const shown = () => page.evaluate(() => getComputedStyle(document.querySelector('.keylist')).display);
  assert.equal(await shown(), 'block');
  assert.match(await text(page, '.keylist'), /1–7Chip/);
  assert.doesNotMatch(await text(page, '.keylist'), /Rebet/);
  // headless Chrome cannot emulate hover: none, so check the rule the page really loaded
  const rule = await page.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r.type === CSSRule.MEDIA_RULE && r.conditionText === '(hover: none) and (pointer: coarse)').flatMap((r) => [...r.cssRules]).map((r) => [r.selectorText, r.style.display]));
  assert.deepEqual(rule, [['.keylist, .gk', 'none']]);
  await page.__done();
});

test('display-only ring: clicks, right-clicks and taps on squares place no bet; tiles are not focusable or labelled controls', async () => {
  const page = await fresh();
  await clickId(page, 'chip-5');
  for (const n of [13, 8, 12]) {
    await clickId(page, `sq-${n}`);
    await clickId(page, `sq-${n}`, { button: 'right' });
  }
  assert.deepEqual(await bets(page), {}, 'no bet from the ring');
  const ring = await page.evaluate(() => {
    const t = document.getElementById('r-track');
    const tiles = [...t.children];
    return {
      hidden: t.getAttribute('aria-hidden'), tags: [...new Set(tiles.map((e) => e.tagName))],
      targets: tiles.filter((e) => e.classList.contains('hit') || e.hasAttribute('tabindex') || e.hasAttribute('role') || e.hasAttribute('aria-label')).length,
      pointer: getComputedStyle(tiles[0]).pointerEvents, summary: t.previousElementSibling.textContent,
    };
  });
  assert.deepEqual([ring.hidden, ring.tags, ring.targets, ring.pointer], ['true', ['DIV'], 0, 'none']);
  assert.match(ring.summary, /50 display squares.*30 tier squares and 20 blank squares/);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('#r-track')), null, 'Tab never lands on a square');
  await page.__done();
});

test('blank squares (mockups): hatching, dashed border, no-win glyph and "No win" on desktop; legend under the spots', async () => {
  const page = await fresh();
  const b = await page.evaluate(() => {
    const t = document.querySelector('[data-id="sq-2"]');
    const cs = getComputedStyle(t);
    const blanks = [...document.querySelectorAll('.tile.qblank')].map((e) => Number(e.dataset.id.slice(3)));
    return { bg: cs.backgroundColor, hatch: cs.backgroundImage, style: cs.borderTopStyle, border: cs.borderTopColor, glyph: !!t.querySelector('.noglyph'), word: t.querySelector('.nwt').textContent, wordD: getComputedStyle(t.querySelector('.nwt')).display, blanks, legend: document.querySelector('#r-centre .bkey').textContent };
  });
  assert.equal(b.bg, 'rgb(19, 24, 30)');
  assert.match(b.hatch, /repeating-linear-gradient/);
  assert.deepEqual([b.style, b.border, b.glyph, b.word, b.wordD], ['dashed', 'rgb(107, 117, 128)', true, 'No win', 'block']);
  assert.deepEqual(b.blanks, [2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50]);
  assert.equal(b.legend, 'Blank square · no win · 20 of 50');
  await page.__done();
});

test('tier and chip colours come from the tokens: six distinct label colours, violet and amber chips', async () => {
  const page = await fresh();
  const c = await page.evaluate(() => {
    const m = (n) => getComputedStyle(document.querySelector(`[data-id="sq-${n}"] .m`)).color;
    const chip = (v) => getComputedStyle(document.querySelector(`[data-id="chip-${v}"] .face`)).fill;
    return { tiers: [1, 5, 13, 3, 21, 8].map(m), chips: [chip(100), chip(500)], text: document.body.innerText };
  });
  assert.deepEqual(c.tiers, ['rgb(154, 165, 177)', 'rgb(94, 234, 212)', 'rgb(110, 168, 254)', 'rgb(240, 171, 252)', 'rgb(253, 224, 71)', 'rgb(255, 255, 255)']);
  assert.equal(new Set(c.tiers).size, 6);
  assert.deepEqual(c.chips, ['rgb(133, 72, 239)', 'rgb(180, 83, 9)']);
  assert.doesNotMatch(c.text, /fair|provabl/i);
  await page.__done();
});

test('bets by keyboard: 1-7 chips, Enter add, Backspace remove, arrows move between the tier spots, Z/C', async () => {
  const page = await fresh();
  await page.evaluate(() => window.__rl.app.focusId('tier-10'));
  for (const [k, v] of [['3', 10], ['6', 100], ['7', 500]]) {
    await page.keyboard.press(k);
    assert.equal((await state(page)).chip, v);
  }
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight'); // 10x -> 5x (rarest first)
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.deepEqual(await bets(page), { 10: 1, 5: 2 });
  await page.keyboard.press('Backspace');
  assert.deepEqual(await bets(page), { 10: 1, 5: 1 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  assert.deepEqual(await bets(page), { 10: 2, 5: 1 });
  await page.keyboard.press('z');
  assert.deepEqual(await bets(page), { 10: 1, 5: 1 });
  await page.keyboard.press('c');
  assert.deepEqual(await bets(page), {});
  assert.match(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), /^10x spot/);
  assert.ok(await page.evaluate(() => document.getElementById('app').classList.contains('kbd')), 'keyboard focus ring shown');
  await page.__done();
});

test('limit toasts: 1,000 per tier, 1,000 per round, not enough credits (also announced)', async () => {
  const page = await fresh();
  await clickId(page, 'chip-500');
  await clickId(page, 'tier-5');
  await clickId(page, 'tier-5');
  assert.equal((await bets(page))[5], 1000);
  await clickId(page, 'tier-5');
  assert.equal((await bets(page))[5], 1000);
  assert.match(await toastText(page), /Max bet reached – 1,000 per tier/);
  await setup(page, { balance: 10000, bets: { 5: 500, 10: 500 }, chip: 1 });
  await clickId(page, 'tier-20');
  assert.match(await toastText(page), /Round limit reached – 1,000 per round/);
  await setup(page, { balance: 3, bets: {}, chip: 5 });
  await clickId(page, 'tier-50');
  assert.equal((await bets(page))[50], 3);
  assert.match(await toastText(page), /Not enough credits/);
  assert.match(await text(page, '#live'), /Not enough credits/);
  await page.__done();
});

test('Start over the balance: off with a visible "Not enough credits" hint; no round by click or Enter; removing bets turns it back on', async () => {
  const page = await fresh();
  await setup(page, { balance: 100, bets: { 5: 150 }, chip: 50, history: [] });
  const hint = () => text(page, '[data-id="btn-start"] [data-role="start-hint"]');
  assert.equal(await attr(page, 'btn-start', 'aria-disabled'), 'true');
  assert.equal(await hint(), 'Not enough credits');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start · 150/);
  assert.equal(await attr(page, 'btn-clear', 'aria-disabled'), null, 'bets can still be cleared');
  await clickId(page, 'btn-start');
  assert.deepEqual([(await state(page)).phase, (await state(page)).balance], ['BETTING', 100], 'click: no round');
  await page.keyboard.press('Enter');
  assert.deepEqual([(await state(page)).phase, (await state(page)).balance], ['BETTING', 100], 'Enter: no round');
  await clickId(page, 'tier-5', { button: 'right' });
  assert.deepEqual(await bets(page), { 5: 100 });
  assert.equal(await attr(page, 'btn-start', 'aria-disabled'), null, 'exactly the balance: on');
  assert.equal(await hint(), '');
  assert.match(await text(page, '[data-id="btn-start"]'), /^Start100 on 1 spot$/);
  await page.__done();
});

test('Start over the balance: kept bets after a no-win turn "Start again" off, hint fully on screen (desktop, tablet and phone)', async () => {
  for (const size of [{ width: 1280, height: 720 }, { width: 768, height: 1024, touch: true }, { width: 360, height: 640, touch: true }]) {
    const page = await fresh(size);
    await setup(page, { balance: 300, bets: { 5: 100, 200: 100 }, chip: 1, history: [] });
    await playTo(page, 2, null, 'BETTING');
    assert.equal((await state(page)).balance, 100);
    assert.deepEqual(await bets(page), { 5: 100, 200: 100 }, 'bets are kept');
    assert.equal(await attr(page, 'btn-start', 'aria-disabled'), 'true');
    const g = await page.evaluate(() => {
      const el = document.querySelector('[data-role="start-hint"]'), b = el.getBoundingClientRect(), p = el.closest('.btn').getBoundingClientRect(), cs = getComputedStyle(el);
      return { text: el.textContent, label: el.previousElementSibling.textContent, color: cs.color, fits: el.scrollWidth <= el.clientWidth + 1, inside: b.width > 0 && b.left >= p.left && b.right <= p.right && b.top >= p.top && b.bottom <= p.bottom, inView: p.bottom <= innerHeight && p.right <= innerWidth };
    });
    assert.deepEqual(g, { text: 'Not enough credits', label: 'Start again · 200', color: 'rgb(230, 234, 238)', fits: true, inside: true, inView: true }, `${size.width}`);
    await page.__done();
  }
});

test('faded losing spots: 85% over the frame fill, labels in text-primary, at desktop and phone', async () => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 360, height: 800, touch: true }]) {
    const page = await fresh(size);
    await setup(page, { balance: 1000, bets: { 5: 1, 200: 1 }, chip: 1, history: [] });
    await playTo(page, 2, null, 'BETTING');
    const g = await page.evaluate(() => [...document.querySelectorAll('.spot.lost')].map((e) => {
      const b = e.getBoundingClientRect();
      // .frame has pointer-events: none, so hit testing skips it: the first opaque fill found under the spot is the
      // page behind the frame, which shows nothing else is painted between the spot and the frame
      const under = document.elementsFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const next = under.slice(under.indexOf(e) + 1).map((u) => getComputedStyle(u).backgroundColor).find((c) => !/^rgba\(.*, 0\)$|transparent/.test(c));
      const fe = document.querySelector('.frame'), f = fe.getBoundingClientRect();
      const inFrame = b.left >= f.left && b.right <= f.right && b.top >= f.top && b.bottom <= f.bottom;
      return [e.dataset.id, getComputedStyle(e).opacity, getComputedStyle(e.querySelector('.sq')).color, getComputedStyle(e.querySelector('.sb')).color, getComputedStyle(e.querySelector('.sb b')).color, next, inFrame, getComputedStyle(fe).backgroundColor];
    }));
    const P = 'rgb(230, 234, 238)', B = 'rgb(110, 168, 254)', PAGE = 'rgb(15, 18, 22)', F = 'rgb(26, 31, 38)';
    assert.deepEqual(g, [['tier-200', '0.85', P, P, B, PAGE, true, F], ['tier-5', '0.85', P, P, B, PAGE, true, F]], `${size.width}`);
    await page.__done();
  }
});

test('START locks squares and controls; bottom-bar Settings/Stats/Results locked (lock badge + reason) through SPINNING..PAYOUT; double-click START -> one round', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 20: 1, 5: 1 }, chip: 1, history: [] });
  const b0 = (await state(page)).balance;
  await force(page, 13);
  const p = await centerOf(page, 'btn-start');
  await page.mouse.click(p.x, p.y, { clickCount: 2 });
  await page.mouse.click(p.x, p.y);
  const s = await state(page);
  assert.equal(s.phase, 'SPINNING');
  assert.equal(s.balance, b0 - 2, 'deducted once');
  const locked = await page.evaluate(() => [...document.querySelectorAll('.spot')].every((e) => e.getAttribute('aria-disabled') === 'true'));
  assert.ok(locked, 'all tier spots locked');
  for (const id of ['chip-1', 'btn-undo', 'btn-clear', 'btn-start', 'icon-settings', 'icon-stats', 'icon-results']) assert.equal(await attr(page, id, 'aria-disabled'), 'true', id);
  assert.equal(await attr(page, 'icon-sound', 'aria-disabled'), null, 'Sound stays live');
  assert.equal(await page.evaluate(() => document.querySelectorAll('#r-bar .ibtn .lk').length), 3, 'lock badges');
  assert.match(await attr(page, 'icon-settings', 'aria-label'), /Settings: unlocks when the round ends/);
  assert.match(await text(page, '#r-centre'), /RUNNING…/i);
  assert.match(await text(page, '#r-centre'), /Credits 1,000 − 2 bet = 998/i);
  await clickId(page, 'tier-5');
  assert.deepEqual((await state(page)).round.bets, { 5: 1, 20: 1 });
  await waitPhase(page, 'GAMBLE_OFFER', 15000);
  assert.equal((await state(page)).history.length, 1, 'one round');
  await staged(page); // the bar is rendered one frame after the board and centre (batch 7)
  assert.match(await attr(page, 'icon-stats', 'aria-label'), /Paytable and help: opens again after you collect/);
  assert.equal((await dispatch(page, { type: 'OPEN_INFO', tab: 'settings' })).ok, false);
  await clickId(page, 'btn-collect');
  assert.equal((await state(page)).phase, 'PAYOUT');
  assert.equal(await attr(page, 'icon-settings', 'aria-disabled'), 'true', 'still locked in PAYOUT');
  await waitPhase(page, 'BETTING');
  await settle(page);
  assert.equal(await attr(page, 'icon-settings', 'aria-disabled'), null, 'unlocked after settle');
  await page.__done();
});

test('light run (normal motion) takes 4-6 s and lands on the stored stop', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 50: 1 }, history: [] });
  await force(page, 30);
  const t0 = Date.now();
  await dispatch(page, { type: 'START' });
  await waitPhase(page, 'RESOLVING', 10000);
  const dt = Date.now() - t0;
  assert.ok(dt >= 3900 && dt <= 6600, `light took ${dt} ms`);
  assert.equal(await page.evaluate(() => window.__rl.app.ui.light1.idx), 30);
  await page.__done();
});

// ------------------------------------------------------------------ win, gamble, payout
test('win -> gamble (R/W pick, G, Space on focused Gamble, Enter collect) -> payout copy, toast and credits delta', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: { 20: 5 }, chip: 5, history: [] });
  await playTo(page, 13);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'btn-collect', 'Collect is the initial focus');
  assert.match(await text(page, '#r-centre'), /YOU WIN 100/i);
  assert.match(await text(page, '#r-centre'), /#13\s*20x\s*Bet × pays\s*5 × 20 = 100/i);
  assert.match(await text(page, '#r-controls'), /Uncollected/);
  await page.keyboard.press('g');
  await waitPhase(page, 'GAMBLE');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'btn-collect');
  await staged(page);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'btn-collect', 'still on Collect once the gamble rail is in');
  assert.match(await text(page, '#r-centre'), /Double or nothing · flip 1/);
  assert.equal(await text(page, '#r-modal'), '', 'the gamble lives in the centre, not in a dialog');
  assert.equal(await attr(page, 'btn-flip', 'aria-disabled'), 'true', 'no pick yet');
  await page.keyboard.press('g');
  assert.equal((await state(page)).round.gambles.length, 0);
  await page.keyboard.press('r');
  assert.equal((await state(page)).gamble.pick, 'red');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'pick-red');
  assert.match(await text(page, '[data-id="btn-flip"]'), /Gamble on red\s*100 → 200 or 0 · G/);
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await page.keyboard.press('g');
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing && window.__rl.game.state.round.gambles.length === 1);
  await staged(page);
  assert.equal((await state(page)).round.currentWin, 200);
  assert.match(await text(page, '#r-centre'), /Match! Red lit\. Your win is now 200\./);
  assert.match(await text(page, '#r-centre'), /Flip 1: you picked Red · Red lit · 100 → 200/);
  await page.keyboard.press('w');
  await page.evaluate(() => window.__rl.app.focusId('pick-red'));
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'pick-white', 'Tab moves red -> white');
  await page.evaluate(() => window.__rl.app.focusId('btn-flip'));
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await page.keyboard.press(' '); // Space presses the focused Gamble button
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing && window.__rl.game.state.round.gambles.length === 2);
  assert.equal((await state(page)).round.currentWin, 400);
  const bal = (await state(page)).balance;
  await page.evaluate(() => { window.__rl.app.ui.toast = null; });
  await page.keyboard.press('Enter'); // Collect
  assert.equal((await state(page)).phase, 'PAYOUT');
  assert.match(await text(page, '#r-centre'), /\+400 COLLECTED/i);
  assert.match(await text(page, '#r-centre'), /Added to your credits: 995 → 1,395/i);
  assert.match(await text(page, '#r-credits'), /\+400/, 'credits delta in the rail');
  assert.match(await toastText(page), /\+400 added to your credits/);
  await waitPhase(page, 'BETTING');
  const s = await state(page);
  assert.equal(s.balance, bal + 400);
  assert.equal(s.round.settled, true);
  await page.__done();
});

test('gamble flip lose: No match in the centre panel, credits unchanged, auto-continue after 3 s; button path too', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 20: 5 }, chip: 5, history: [] });
  await playTo(page, 13);
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => window.__rl.app.ui.gambleLoss);
  const t0 = Date.now();
  await staged(page); // the rail follows the centre one frame later (batch 7)
  const m = await text(page, '#r-centre');
  assert.match(m, /Gamble lost/);
  assert.match(m, /No match\. White lit\. Your pick was Red, so the 100 gamble is lost\./);
  assert.match(m, /Gamble lost\s*100\s*Credits\s*995/);
  assert.match(m, /Your credits stay at 995\. Nothing else was taken\./);
  const look = await page.evaluate(() => ({
    flip: document.querySelector('#r-centre .flip').className, pill: getComputedStyle(document.querySelector('#r-centre [data-role="status"]')).color,
    lost: getComputedStyle(document.querySelector('#r-centre .gc .lost')).color, picks: [...document.querySelectorAll('#r-centre .pick')].map((p) => p.getAttribute('aria-disabled')),
  }));
  assert.equal(look.flip, 'flip w', 'the disc rests on the white face');
  assert.deepEqual([look.pill, look.lost], ['rgb(248, 113, 113)', 'rgb(248, 113, 113)'], 'red text (accent-red-text)');
  assert.deepEqual(look.picks, ['true', 'true'], 'discs locked');
  assert.match(await text(page, '[data-id="btn-back"]'), /Back to the board\s*continues in 3 s · Enter/);
  assert.match(await text(page, '#r-controls'), /gamble lost/);
  assert.equal((await state(page)).balance, 995);
  await waitPhase(page, 'BETTING', 6000);
  const dt = Date.now() - t0;
  assert.ok(dt >= 2700 && dt < 4500, `auto-continue after ${dt} ms`);
  assert.equal(await text(page, '#r-modal'), '');
  assert.doesNotMatch(await text(page, '#r-centre'), /No match/, 'back to the board');
  // button path (Enter) at the next loss
  await setup(page, { balance: 1000, bets: { 20: 5 }, chip: 5 });
  await playTo(page, 13);
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'white' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => window.__rl.app.ui.gambleLoss);
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).phase, 'BETTING');
  await page.__done();
});

test('Double Run: mid copy (DOUBLE RUN!, first stop, This round so far) and one double history entry', async () => {
  const page = await fresh({ timeScale: 2 });
  await setup(page, { balance: 1000, bets: { 10: 5, 20: 2 }, history: [] });
  await force(page, 24, 13);
  await dispatch(page, { type: 'START' });
  await waitPhase(page, 'DOUBLE_RUN', 15000);
  const c = await text(page, '#r-centre');
  assert.match(c, /Double Run!/);
  assert.match(c, /A second light is running\. #24 stays lit, and the second light can’t stop on it\./);
  assert.match(c, /1 · #24\s*10x\s*Bet × pays\s*5 × 10 = 50/);
  assert.match(c, /Double Run on/);
  assert.equal(await text(page, '[data-id="sq-24"] .mkt'), '1st', 'first stop marked while the second light runs');
  const r = await text(page, '#r-controls');
  assert.match(r, /This round/);
  assert.match(r, /so far · second light running/);
  assert.match(r, /Double Run…/);
  await waitPhase(page, 'GAMBLE_OFFER', 15000);
  await settle(page);
  assert.match(await text(page, '#r-centre'), /YOU WIN 90/i);
  assert.match(await text(page, '#r-centre'), /Two squares won this round\./i);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.tile.win')].map((e) => [e.dataset.id, e.querySelector('.mkt').textContent])), [['sq-13', '2nd'], ['sq-24', '1st']]);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.wtag').length), 0, 'no WIN tags');
  // top row "Last results": one Double Run pill with both multipliers
  const dbl = await page.evaluate(() => [...document.querySelectorAll('#r-top [data-role="history"] .tp.kdr')].map((e) => e.textContent));
  assert.deepEqual(dbl, ['10x · 20x'], 'one Double Run entry');
  assert.match(await page.evaluate(() => document.querySelector('#r-top [data-role="history"]').getAttribute('aria-label')), /#24 10x and #13 20x/);
  await page.__done();
});

test('loss keeps the bets on the spots and says where the light stopped', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: { 20: 5, 50: 1 }, chip: 5, history: [] });
  await playTo(page, 27, null, 'BETTING');
  assert.deepEqual(await bets(page), { 50: 1, 20: 5 }, 'bets kept after a loss');
  assert.match(await text(page, '#r-centre'), /NO WIN THIS TIME/i);
  assert.match(await text(page, '#r-centre'), /The light stopped on #27 \(10x\)\. Your bets are still on the board\./i);
  assert.match(await text(page, '#r-controls'), /no win this round/);
  await page.__done();
});

test('refill at 0: dialog cannot be dismissed, Enter refills to 10,000', async () => {
  const page = await fresh();
  await setup(page, { balance: 0, bets: {}, history: [] });
  await page.evaluate(() => window.__rl.app.render());
  assert.match(await text(page, '#r-modal'), /Out of play credits/);
  await page.keyboard.press('Escape');
  assert.match(await text(page, '#r-modal'), /Out of play credits/, 'Esc does not close Refill');
  await page.evaluate(() => window.__rl.app.focusId('m-refill'));
  await page.keyboard.press('Enter');
  assert.equal((await state(page)).balance, 10000);
  await settle(page);
  assert.equal(await text(page, '#r-modal'), '');
  await page.__done();
});

// ------------------------------------------------------------------ settings, storage, recovery
test('corrupt settings key -> defaults + notice + toast (no ERROR); other keys untouched', async () => {
  const page = await fresh({ presetStorage: { 'rl.v5.settings': '{not json', 'rl.v5.balance': JSON.stringify({ v: 777, seq: 3 }) } });
  const s = await state(page);
  assert.equal(s.phase, 'BETTING');
  assert.deepEqual(s.settings, { mute: false, music: 60, sfx: 80, reducedMotion: false });
  assert.equal(s.balance, 777, 'credits not affected');
  assert.match(await toastText(page), /Settings were reset to the defaults/);
  await clickId(page, 'icon-settings');
  assert.match(await text(page, '#r-modal'), /Your saved settings couldn’t be read, so they were reset to the defaults\./);
  assert.match(await text(page, '#r-modal'), /Turbo ?Placeholder – pending approval/i);
  assert.equal(await attr(page, 'tg-turbo', 'aria-disabled'), 'true', 'Turbo is a disabled placeholder');
  // invalid (parseable) settings are reset too
  const p2 = await fresh({ presetStorage: { 'rl.v5.settings': JSON.stringify({ mute: 'yes', music: 500 }) } });
  assert.equal((await state(p2)).phase, 'BETTING');
  await p2.__done();
  await page.__done();
});

test('corrupt round key -> ERROR dialog -> Reload resets only that key', async () => {
  const page = await fresh({ noReload: true, presetStorage: { 'rl.v5.round': '{broken', 'rl.v5.balance': JSON.stringify({ v: 500, seq: 2 }) } });
  assert.equal((await state(page)).phase, 'ERROR');
  assert.match(await text(page, '#r-modal'), /Something went wrong/);
  assert.match(await text(page, '#r-modal'), /E-CORRUPT-ROUND/);
  assert.match(await text(page, '#r-centre'), /PAUSED/i);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'm-reload');
  await page.keyboard.press('Enter');
  const s = await state(page);
  assert.equal(s.phase, 'BETTING');
  assert.equal(s.balance, 500);
  assert.equal(await page.evaluate(() => localStorage.getItem('rl.v5.round')), null);
  await page.__done();
});

test('v1 -> v5 migration: a saved rl.v1.balance of 500 reloads as 10,000 with the one-time toast; v1 keys kept', async () => {
  const v1 = { 'rl.v1.balance': JSON.stringify({ v: 500, seq: 2 }), 'rl.v1.settings': JSON.stringify({ mute: true, music: 30, sfx: 50, reducedMotion: false }) };
  const page = await fresh({ timeScale: 1, presetStorage: v1 });
  const s = await state(page);
  assert.equal(s.phase, 'BETTING');
  assert.equal(s.balance, 10000);
  assert.equal(s.settings.mute, true, 'v1 settings carried over');
  assert.match(await toastText(page), /Game updated – credits reset to 10,000/);
  assert.doesNotMatch(await toastText(page), /Progress won't be saved/);
  const stored = await page.evaluate(() => ({ ...localStorage }));
  for (const [k, v] of Object.entries(v1)) assert.equal(stored[k], v, `${k} untouched`);
  assert.equal(JSON.parse(stored['rl.v5.balance']).v, 10000);
  // shown once: a second load keeps 10,000 and shows no toast
  await openGame(browser, url, { seed: 11, keepStorage: true }, page);
  assert.equal((await state(page)).balance, 10000);
  assert.doesNotMatch(await toastText(page), /Game updated/);
  assert.equal(await page.evaluate(() => localStorage.getItem('rl.v1.balance')), v1['rl.v1.balance']);
  await page.__done();
});

test('mute and volume persist across a reload', async () => {
  const page = await fresh();
  await page.keyboard.press('m');
  assert.equal((await state(page)).settings.mute, true);
  await clickId(page, 'icon-settings');
  await page.evaluate(() => window.__rl.app.focusId('sl-music'));
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.evaluate(() => window.__rl.app.focusId('sl-sfx'));
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual((await state(page)).settings, { mute: true, music: 70, sfx: 75, reducedMotion: false });
  await openGame(browser, url, { seed: 2, keepStorage: true }, page);
  assert.deepEqual((await state(page)).settings, { mute: true, music: 70, sfx: 75, reducedMotion: false });
  assert.match(await attr(page, 'icon-sound', 'aria-label'), /muted/);
  await page.__done();
});

test('reduced motion: defaults from prefers-reduced-motion; light reaches the stop in <= 0.8 s', async () => {
  const page = await fresh({ reducedMotion: true, timeScale: 1 });
  assert.equal((await state(page)).settings.reducedMotion, true);
  await setup(page, { balance: 1000, bets: { 20: 1 }, history: [] });
  await force(page, 30);
  const t0 = Date.now();
  await dispatch(page, { type: 'START' });
  await waitPhase(page, ['RESOLVING', 'BETTING']);
  assert.ok(Date.now() - t0 < 1300, `light took ${Date.now() - t0} ms`);
  assert.ok(await page.evaluate(() => document.getElementById('app').classList.contains('reduced')));
  assert.equal(await page.evaluate(() => document.querySelectorAll('.tile.trail1, .tile.trail2').length), 0, 'no trail');
  await page.__done();
});

test('Esc closes only the Info window (not the gamble dialog); Info tabs by arrows', async () => {
  const page = await fresh();
  await clickId(page, 'icon-stats');
  assert.equal((await state(page)).info, 'paytable');
  assert.match(await text(page, '#r-modal'), /≈95\.4%/);
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).info, 'help');
  assert.match(await text(page, '#r-modal'), /Play credits only\. No real money value\./);
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).info, null);
  await setup(page, { balance: 1000, bets: { 20: 1 }, history: [] });
  await playTo(page, 13);
  await page.keyboard.press('g');
  await waitPhase(page, 'GAMBLE');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).phase, 'GAMBLE');
  await page.__done();
});

test('reload mid-spin -> Recovery -> same result, no redraw, no double credit', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 5: 1, 10: 1, 20: 1, 50: 1, 100: 1, 200: 1 }, history: [] });
  await dispatch(page, { type: 'START' }); // real seeded draw
  const s0 = await state(page);
  await sleep(500);
  await openGame(browser, url, { seed: 777, keepStorage: true, timeScale: 4 }, page);
  await waitPhase(page, 'RECOVERY');
  const s1 = await state(page);
  assert.equal(s1.balance, s0.balance);
  assert.deepEqual([s1.round.s1, s1.round.s2], [s0.round.s1, s0.round.s2]);
  assert.match(await text(page, '#r-modal'), /Round restored/i);
  assert.match(await text(page, '#r-modal'), /Light running/);
  await page.keyboard.press('Enter');
  await waitPhase(page, 'GAMBLE_OFFER');
  const s2 = await state(page);
  assert.equal(s2.round.s1, s0.round.s1, 'same stop shown');
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  const credited = (await state(page)).balance;
  assert.equal(credited, s0.balance + s0.round.baseWin);
  await openGame(browser, url, { seed: 5, keepStorage: true }, page);
  assert.equal((await state(page)).phase, 'BETTING');
  assert.equal((await state(page)).balance, credited, 'no double credit');
  await page.__done();
});

test('200x jackpot: the flat win state (Jackpot pill, 200.00x), no confetti or celebration overlay; gamble off when the doubled win would exceed 300,000', async () => {
  const page = await fresh({ timeScale: 2 });
  await setup(page, { balance: 1000, bets: { 200: 1 }, history: [] });
  await force(page, 8);
  await dispatch(page, { type: 'START' });
  await waitPhase(page, 'GAMBLE_OFFER', 15000);
  await sleep(200);
  assert.match(await words(page, '#r-centre'), /^Jackpot Double Run · 1 in 25 200\.00x You win 200 /);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.confetti, .celebrate, #r-fx').length), 0);
  await settle(page, 4000); // the rail count-up and audio un-duck end; no confetti or marquee loop keeps running
  assert.equal((await state(page)).phase, 'GAMBLE_OFFER');
  assert.equal(await attr(page, 'btn-gamble', 'aria-disabled'), null, '200 can be doubled');
  // the 200,000 max win (1,000 on 200x) is not gambleable: doubling it (400,000) would exceed the 300,000 cap
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 10000, bets: { 200: 1000 }, history: [] });
  await playTo(page, 8);
  assert.equal((await state(page)).round.currentWin, 200000);
  assert.equal(await attr(page, 'btn-gamble', 'aria-disabled'), 'true', '400,000 would exceed the cap');
  assert.match(await text(page, '[data-id="btn-gamble"]'), /Gamble is off when the doubled win would exceed 300,000/);
  assert.match(await text(page, '#r-centre'), /Collect it\. Gamble is off when the doubled win would exceed 300,000 credits\./);
  assert.equal((await dispatch(page, { type: 'GAMBLE_OPEN' })).ok, false);
  // a 100,000 win (500 on 200x) may be gambled once to 200,000; the next doubling would exceed the cap
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 10000, bets: { 200: 500 }, history: [] });
  await playTo(page, 8);
  assert.equal((await state(page)).round.currentWin, 100000);
  assert.equal(await attr(page, 'btn-gamble', 'aria-disabled'), null, '200,000 is within the cap');
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  await settle(page);
  assert.equal((await state(page)).round.currentWin, 200000);
  assert.equal(await attr(page, 'btn-flip', 'aria-disabled'), 'true');
  assert.match(await text(page, '[data-id="btn-flip"]'), /Gamble is off when the doubled win would exceed 300,000/);
  assert.match(await text(page, '#r-centre'), /Your win is now 200,000\. Collect it\./);
  assert.match(await text(page, '#r-centre'), /Gamble is turned off when the doubled win would exceed 300,000 credits\./);
  await page.__done();
});

test('animation suspended mid-spin (hidden tab) -> result unchanged on return', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 20: 1 }, history: [] });
  await dispatch(page, { type: 'START' });
  const s1 = (await state(page)).round.s1;
  await sleep(700);
  await page.evaluate(() => window.__rl.app.setPaused(true));
  await sleep(2500);
  assert.equal((await state(page)).phase, 'SPINNING');
  await page.evaluate(() => window.__rl.app.setPaused(false));
  await waitPhase(page, ['GAMBLE_OFFER', 'BETTING'], 15000);
  const s = await state(page);
  assert.equal(s.round.s1, s1);
  assert.equal(await page.evaluate(() => window.__rl.app.ui.lightIndex), s.round.s2 || s.round.s1);
  await page.__done();
});

test('storage unavailable -> plays in memory with a "Progress won\'t be saved" toast', async () => {
  const page = await fresh({ noStorage: true });
  assert.match(await toastText(page), /Progress won't be saved on this device/);
  await clickId(page, 'tier-5');
  assert.deepEqual(await bets(page), { 5: 1 });
  await page.__done();
});

test('Start screen (flag on): PLAY is the first gesture, unlocks audio, then the board', async () => {
  const page = await fresh({ startScreen: true });
  assert.equal(await page.evaluate(() => document.getElementById('r-start').hidden), false);
  assert.match(await text(page, '#r-start'), /PLAY/i);
  assert.match(await text(page, '#r-start'), /10,000/);
  assert.equal(await page.evaluate(() => window.__rl.app.audio.unlocked), false);
  assert.equal(await page.evaluate(() => document.getElementById('r-track').inert), true, 'board inert behind the start screen');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.getElementById('r-start').hidden), true);
  assert.equal(await page.evaluate(() => window.__rl.app.audio.unlocked), true, 'PLAY unlocks audio');
  await clickId(page, 'tier-10');
  assert.deepEqual(await bets(page), { 10: 1 });
  await page.__done();
});

// ------------------------------------------------------------------ v3 frame and bottom bar (batch 2)
test('frame: centred rounded frame, 320 px rail + 1 px divider, game area, 40 px bottom bar; v2 header removed', async () => {
  for (const [w, h, fw, fh] of [[1920, 1080, 1680, 980], [1280, 720, 1248, 688]]) {
    const page = await fresh({ width: w, height: h });
    const g = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().toJSON() : null; };
      const cs = (s) => getComputedStyle(document.querySelector(s));
      return {
        frame: r('.frame'), rail: r('.frame-rail'), bar: r('.bbar'), controls: r('#r-controls .rail'), credits: r('.credits'), stage: r('#r-stage'),
        page: getComputedStyle(document.body).backgroundColor, frameBg: cs('.frame').backgroundColor, frameR: cs('.frame').borderTopLeftRadius,
        railBg: cs('.frame-rail').backgroundColor, divider: `${cs('.frame-rail').borderRightWidth} ${cs('.frame-rail').borderRightColor}`, barBg: cs('.frame-bar').backgroundColor,
        header: !!document.querySelector('#r-hdr, .header, .balance, .tagline'),
      };
    });
    assert.deepEqual([g.frame.width, g.frame.height], [fw, fh]);
    assert.deepEqual([g.frame.left, g.frame.top], [(w - fw) / 2, (h - fh) / 2], 'centred');
    assert.equal(g.frameR, '8px');
    assert.equal(g.page, 'rgb(15, 18, 22)', 'bg-page');
    assert.equal(g.frameBg, 'rgb(26, 31, 38)', 'bg-frame');
    assert.equal(g.railBg, 'rgb(28, 34, 42)', 'bg-rail');
    assert.equal(g.divider, '1px rgb(42, 49, 58)', 'divider');
    assert.equal(g.barBg, 'rgb(31, 38, 46)', 'bg-bottombar');
    assert.equal(g.rail.width, 321, 'rail 320 + 1 px divider');
    assert.deepEqual([g.controls.left, g.controls.width], [g.frame.left, 320], 'rail controls sit in the rail');
    assert.equal(g.stage.left, g.frame.left + 321, 'game area right of the divider');
    assert.deepEqual([g.bar.left, g.bar.width, g.bar.height, g.bar.bottom], [g.frame.left, fw, 40, g.frame.bottom]);
    assert.ok(g.credits.left >= g.rail.left && g.credits.right <= g.rail.right && g.credits.top < g.controls.top + 40, 'credits at the top of the rail');
    assert.equal(g.header, false, 'no v2 header bar or play-credits pill');
    assert.match(await text(page, '#r-credits'), /Credits\s*10,000/);
    await page.__done();
  }
});

test('bottom bar: sound, settings, stats left; title centre; results panel right; no star icon', async () => {
  const page = await fresh();
  const bar = await page.evaluate(() => {
    const b = document.querySelector('.bbar');
    const ids = (s) => [...b.querySelectorAll(`${s} [data-id]`)].map((e) => e.dataset.id);
    return { left: ids('.bb-l'), right: ids('.bb-r'), centre: b.querySelector('.bb-c').textContent.replace(/\s+/g, ' ').trim(), all: b.querySelectorAll('button').length, html: b.innerHTML };
  });
  assert.deepEqual(bar.left, ['icon-sound', 'icon-settings', 'icon-stats']);
  assert.deepEqual(bar.right, ['icon-results']);
  assert.equal(bar.all, 4);
  assert.equal(bar.centre, 'Running Light · Play credits only · No real money value');
  assert.doesNotMatch(bar.html, /star/i, 'no star icon');
  await page.__done();
});

test('bottom bar actions: sound toggles mute, settings opens Settings, stats opens Paytable/Help, Esc returns focus', async () => {
  const page = await fresh();
  assert.equal((await state(page)).settings.mute, false);
  await clickId(page, 'icon-sound');
  assert.equal((await state(page)).settings.mute, true);
  assert.equal(await attr(page, 'icon-sound', 'aria-checked'), 'false');
  await clickId(page, 'icon-sound');
  assert.equal((await state(page)).settings.mute, false);
  await clickId(page, 'icon-settings');
  assert.equal((await state(page)).info, 'settings');
  await page.keyboard.press('Escape');
  assert.equal((await state(page)).info, null);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'icon-settings');
  await clickId(page, 'icon-stats');
  assert.equal((await state(page)).info, 'paytable');
  assert.match(await text(page, '#r-modal'), /≈95\.4%/);
  await clickId(page, 'tab-help');
  assert.equal((await state(page)).info, 'help');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'icon-stats');
  await page.__done();
});

test('results panel: how results are decided (drawn first, square weights incl. blanks, RTP ~95.4%), no provably-fair claim; Esc/close', async () => {
  const page = await fresh();
  await clickId(page, 'icon-results');
  const m = await text(page, '#r-modal');
  assert.match(m, /How results are decided/);
  assert.match(m, /drawn and saved on this device before the light starts/);
  assert.match(m, /Squares are not equally likely: weights 160 \/ 120 \/ 120 \/ 64 \/ 48 \/ 48 per square for 5x \/ 10x \/ 20x \/ 50x \/ 100x \/ 200x, and 339 for each of the 20 blank squares, of 10,476\./);
  assert.match(m, /RTP about 95\.4%/);
  assert.match(m, /Double Run, 1 in 25/);
  assert.doesNotMatch(await page.evaluate(() => document.body.innerHTML), /provabl/i);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'f-close');
  assert.equal(await page.evaluate(() => document.getElementById('r-track').inert), true, 'board inert behind the panel');
  await page.keyboard.press('3'); // game keys are ignored while the panel is open
  assert.equal((await state(page)).chip, 1, 'chip key ignored');
  assert.match(await text(page, '#r-modal'), /How results are decided/, 'still open');
  await page.keyboard.press('Escape');
  assert.equal(await text(page, '#r-modal'), '');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'icon-results');
  await clickId(page, 'icon-results');
  await clickId(page, 'f-close');
  assert.equal(await text(page, '#r-modal'), '');
  await setup(page, { balance: 1000, bets: { 20: 1 }, history: [] });
  await playTo(page, 13);
  await clickId(page, 'icon-results'); // locked while a win is uncollected
  assert.equal(await text(page, '#r-modal'), '');
  await page.__done();
});

// ------------------------------------------------------------------ v3 overlays and small screens (batch 6)
/** The open dialog's look, and every element in it that still has a shadow, filter, text shadow or gradient. */
const dialogLook = (page) => page.evaluate(() => {
  const d = document.querySelector('#r-modal .dlg');
  const cs = getComputedStyle(d);
  const sc = document.querySelector('#r-modal .scrim');
  const all = [d, ...d.querySelectorAll('*'), sc];
  const bad = all.filter((e) => { const c = getComputedStyle(e); return e !== document.activeElement && (c.boxShadow !== 'none' || c.filter !== 'none' || c.textShadow !== 'none' || /gradient/.test(c.backgroundImage)); }).map((e) => e.className);
  const r = (e) => e.getBoundingClientRect().toJSON();
  return {
    label: d.getAttribute('aria-label'), bg: cs.backgroundColor, border: `${cs.borderLeftWidth} ${cs.borderLeftColor}`, top: `${cs.borderTopWidth} ${cs.borderTopColor}`,
    radius: cs.borderBottomRightRadius, bad, scrimBg: getComputedStyle(sc).backgroundColor, scrim: r(sc), box: r(d), stage: r(document.getElementById('r-stage')),
    ring: document.querySelectorAll('.ring, .bunting, .bulb').length, inert: document.getElementById('r-track').inert,
  };
});
const FLAT = { bg: 'rgb(26, 31, 38)', border: '1px rgb(47, 55, 66)', radius: '8px', bad: [], scrimBg: 'rgba(15, 18, 22, 0.78)', ring: 0, inert: true };
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const textOf = (page, sel) => page.evaluate((s) => (document.querySelector(s)?.innerText || '').replace(/\s+/g, ' ').trim(), sel);

test('overlays (refill.png, error.png, settings-paytable-help.png): flat bg-frame dialogs, 1 px border, flat scrim; no shadow, glow, gradient or bulb ring', async () => {
  const page = await fresh();
  // Game info at 1920: one window, three columns (Settings | Paytable | Help), header and footer
  await clickId(page, 'icon-settings');
  let d = await dialogLook(page);
  assert.deepEqual(pick(d, Object.keys(FLAT)), FLAT, 'game info');
  assert.equal(d.label, 'Game info');
  assert.deepEqual([d.scrim.width, d.scrim.height], [1920, 1080], 'scrim over the whole page');
  assert.ok(Math.abs(d.box.left + d.box.width / 2 - 960) <= 1 && d.box.width === 1180, 'centred, 1180 wide');
  const info = await page.evaluate(() => ({
    cols: [...document.querySelectorAll('#r-modal .icols .isec .ih')].map((e) => e.textContent),
    tablist: !!document.querySelector('#r-modal [role="tablist"]'),
    head: document.querySelector('#r-modal .ihead h2').textContent,
    foot: [...document.querySelectorAll('#r-modal .ifoot span')].map((e) => e.textContent),
    rows: [...document.querySelectorAll('#r-modal .ptab tr')].slice(1).map((tr) => [...tr.cells].map((c) => c.textContent)),
    toggle: getComputedStyle(document.querySelector('[data-id="tg-mute"]')).backgroundColor,
    focus: document.activeElement.dataset.id,
  }));
  assert.deepEqual(info.cols, ['Settings', 'Paytable', 'Help']);
  assert.equal(info.tablist, false, 'no tabs when all three sections fit');
  assert.equal(info.head, 'Running Light · Game info');
  assert.deepEqual(info.foot, ['Esc closes this window', 'Outcome is decided and saved before the light runs']);
  assert.deepEqual(info.rows[0], ['200x', '1', '1 in 210', '8']);
  assert.deepEqual(info.rows[1], ['100x', '2', '1 in 210', '21, 46']);
  assert.equal(info.rows.length, 6);
  assert.equal(info.toggle, 'rgb(13, 110, 253)', 'Sound on: accent-blue switch');
  assert.equal(info.focus, 'tab-settings');
  await page.keyboard.press('ArrowRight'); // arrows still move between the sections (the engine's Info tab)
  assert.equal((await state(page)).info, 'paytable');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'tab-paytable');
  assert.deepEqual(await page.evaluate(() => { const e = document.querySelector('#r-modal .dlg'); return [e.classList.contains('still'), e.getAnimations().length]; }), [true, 0], 're-rendering the same dialog does not replay its entrance');
  await page.keyboard.press('Escape');
  // results panel: the same flat dialog
  await clickId(page, 'icon-results');
  d = await dialogLook(page);
  assert.deepEqual(pick(d, Object.keys(FLAT)), FLAT, 'results panel');
  assert.equal(d.label, 'How results are decided');
  await page.keyboard.press('Escape');
  // refill: dims and centres on the game area only (the rail and bar stay lit, as in refill.png)
  await setup(page, { balance: 0, bets: {}, history: [] });
  await page.evaluate(() => window.__rl.app.render());
  d = await dialogLook(page);
  assert.deepEqual(pick(d, Object.keys(FLAT)), FLAT, 'refill');
  assert.equal(d.label, 'Out of play credits');
  assert.deepEqual([d.scrim.left, d.scrim.top, d.scrim.width, d.scrim.height], [d.stage.left, d.stage.top, d.stage.width, d.stage.height], 'scrim = game area');
  assert.ok(Math.abs(d.box.left + d.box.width / 2 - (d.stage.left + d.stage.width / 2)) <= 1 && d.box.width === 420, 'centred in the game area, 420 wide');
  assert.equal(await textOf(page, '#r-modal .dlg'), 'Out of play credits Take a free refill and keep playing. Refills are unlimited, with no waiting and no cost. Free refill 10,000 credits Refill 10,000 Free · Enter Play credits only. No real money value.');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="m-refill"]')).backgroundColor), 'rgb(13, 110, 253)', 'accent-blue Refill');
  await page.evaluate(() => window.__rl.app.focusId('m-refill'));
  await page.keyboard.press('Enter');
  await settle(page);
  // error: red top edge, the saved round on one mono line, Reload focused
  await setup(page, { balance: 1000, bets: { 20: 5 }, history: [] });
  await force(page, 30);
  await dispatch(page, { type: 'START' });
  await dispatch(page, { type: 'FAIL', message: 'storage setItem failed' });
  d = await dialogLook(page);
  assert.deepEqual(pick(d, Object.keys(FLAT)), FLAT, 'error');
  assert.equal(d.label, 'Something went wrong');
  assert.equal(d.top, '3px rgb(220, 38, 38)', 'accent-red top edge');
  const err = await page.evaluate(() => ({ code: document.querySelector('[data-role="error-code"]').textContent, font: getComputedStyle(document.querySelector('[data-role="error-code"]')).fontFamily, focus: document.activeElement.dataset.id }));
  assert.equal(err.code, 'Round in progress: bet 5 · 1 tier · credits 995 · code E-STORAGE-WRITE');
  assert.match(err.font, /^"JetBrains Mono"/);
  assert.equal(err.focus, 'm-reload');
  assert.match(await textOf(page, '#r-modal'), /reloading won’t change the outcome or charge you again\. .* Reload Restores your round · Enter Play credits only\. No real money value\.$/);
  await page.__done();
});

test('Game info on smaller screens: tabs at 1280x720 and 1024x768, a bottom sheet at 768x1024; inside the viewport', async () => {
  for (const [w, h] of [[1280, 720], [1024, 768], [768, 1024]]) {
    const page = await fresh({ width: w, height: h, touch: w < 900 });
    await clickId(page, 'icon-stats');
    await sleep(250); // the 160 ms entrance (4 px rise) has ended
    const g = () => page.evaluate(() => {
      const d = document.querySelector('#r-modal .dlg').getBoundingClientRect();
      return { d: [d.left, d.top, d.right, d.bottom].map(Math.round), tabs: [...document.querySelectorAll('#r-modal [role="tab"]')].map((t) => `${t.textContent}:${t.getAttribute('aria-selected')}`), secs: document.querySelectorAll('#r-modal .isec').length, scroll: document.documentElement.scrollWidth };
    });
    let r = await g();
    assert.deepEqual(r.tabs, ['Settings:false', 'Paytable:true', 'Help:false'], `${w}: tabs`);
    assert.equal(r.secs, 1, `${w}: one section at a time`);
    assert.ok(r.d[0] >= 0 && r.d[1] >= 0 && r.d[2] <= w && r.d[3] <= h && r.scroll <= w, `${w}: dialog inside the viewport ${r.d}`);
    if (w === 768) assert.deepEqual([r.d[0], r.d[2], r.d[3]], [0, 768, 1024], 'tablet portrait: a full-width bottom sheet');
    await clickId(page, 'tab-help');
    assert.equal((await state(page)).info, 'help');
    assert.match(await text(page, '#r-modal [data-role="help-gamble"]'), /a 50\/50/);
    r = await g();
    assert.ok(r.d[1] >= 0 && r.d[3] <= h, `${w}: help inside the viewport`);
    await page.__done();
  }
});

test('Help explains the gamble the way the engine plays it (50/50 drawn and saved on Gamble, ×2 or lose the win, max 3, 300,000 cap)', async () => {
  const page = await fresh();
  await clickId(page, 'icon-stats');
  const g = await textOf(page, '#r-modal [data-role="help-gamble"]');
  assert.equal(g, [
    'After a win, press Gamble ×2, pick red or white, then press Gamble on your colour.',
    'Red or white is drawn at that moment, a 50/50, and saved before the disc flips.',
    'Match: your win doubles. Gamble again or Collect. No match: the win is lost. Nothing else is taken.',
    `Up to ${MAX_GAMBLES} gambles per win, and Collect is open between flips. Gamble is off if the doubled win would exceed ${GAMBLE_CAP.toLocaleString('en-US')}.`,
  ].join(' '));
  const all = await textOf(page, '#r-modal');
  assert.doesNotMatch(all, /gamble window/i, 'no "gamble window" (there is none since batch 5)');
  assert.match(all, /Gamble: 50\/50 on red or white, up to 3 times per win\. Off if the doubled win would exceed 300,000\./, 'paytable gamble line');
  assert.match(all, /R \/ W ← → Pick red \/ white/, 'keys: the pick, not a window');
  // the copy matches play: the draw is stored when Gamble is pressed, a match doubles, the max stops a 4th
  await page.keyboard.press('Escape');
  await setup(page, { balance: 1000, bets: { 20: 5 }, history: [] });
  await playTo(page, 13); // 20x: 100
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  const stored = await state(page);
  assert.deepEqual([stored.round.gambles, stored.round.pendingReveal, stored.round.currentWin], [[{ pick: 'red', result: 'red' }], true, 100], 'drawn and saved before the flip shows it');
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  assert.equal((await state(page)).round.currentWin, 200, 'match doubles');
  await settle(page);
  await dispatch(page, { type: 'PICK', colour: 'white' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  await settle(page);
  assert.equal((await state(page)).round.currentWin, 400);
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  assert.equal((await dispatch(page, { type: 'GAMBLE_FLIP' })).ok, true, 'a third gamble (400 -> 800, under the cap)');
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  await settle(page);
  assert.equal((await state(page)).round.currentWin, 800);
  await dispatch(page, { type: 'PICK', colour: 'red' });
  assert.equal((await dispatch(page, { type: 'GAMBLE_FLIP' })).ok, false, 'no fourth gamble');
  assert.match(await textOf(page, '#r-centre .gmsg'), /^No gambles left for this win\. Collect your win\.$/);
  await page.__done();
});

test('start and loading screens: flat v3 mark and plain controls; no bulb ring, glow or ticker re-render', async () => {
  const page = await fresh({ startScreen: true });
  const look = (sel) => page.evaluate((s) => {
    const root = document.querySelector(s);
    const bad = [...root.querySelectorAll('*')].filter((e) => { const c = getComputedStyle(e); return e !== document.activeElement && (c.boxShadow !== 'none' || c.filter !== 'none' || c.textShadow !== 'none' || /gradient/.test(c.backgroundImage)); }).map((e) => e.className);
    return { bad, ring: root.querySelectorAll('.ring, .bunting, i.on').length, mark: root.querySelectorAll('svg.mark').length, h1: getComputedStyle(root.querySelector('h1')).fontFamily, text: root.innerText.replace(/\s+/g, ' ').trim() };
  }, sel);
  const st = await look('#r-start');
  assert.deepEqual([st.bad, st.ring, st.mark], [[], 0, 1]);
  assert.match(st.h1, /^Poppins/);
  assert.equal(st.text, 'Running Light Bet play credits on a 50-square track. The light runs, slows and stops on one square. Credits 10,000 Play Turns sound on · Enter How to play Sound: on Play credits only · No real money value · Free refill to 10,000');
  const before = await page.evaluate(() => document.getElementById('r-start').innerHTML);
  await sleep(500);
  assert.equal(await page.evaluate(() => document.getElementById('r-start').innerHTML), before, 'no ticker: the start screen is not re-rendered');
  assert.equal(await page.evaluate(() => window.__rl.app.pendingTasks()), 0, 'no animation tasks');
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.__rlShowLoading(0.5, 3, 'Loading sounds…'));
  const ld = await look('#loading');
  assert.deepEqual([ld.bad, ld.ring, ld.mark], [[], 0, 1]);
  assert.match(ld.h1, /^Poppins/, 'not the mono big-number font');
  assert.equal(ld.text, 'Running Light Loading sounds… 50% Play credits only · No real money value');
  assert.equal(await page.evaluate(() => [document.querySelector('#loading .lbar i').style.width, document.getElementById('loading').getAttribute('aria-valuenow')].join()), '50%,50');
  await page.__done();
});

// ------------------------------------------------------------------ v3 rail controls (batch 3)
const railText = (page, role) => text(page, `#r-controls [data-role="${role}"]`);

test('total card shows the TOTAL bet across all spots against the 1,000 round limit', async () => {
  const page = await fresh();
  assert.equal(await railText(page, 'total'), '0 / 1,000');
  await clickId(page, 'chip-5');
  await clickId(page, 'tier-50');
  await clickId(page, 'tier-20');
  await clickId(page, 'chip-1');
  await clickId(page, 'tier-200');
  assert.deepEqual(await bets(page), { 50: 5, 200: 1, 20: 5 });
  assert.equal(await railText(page, 'total'), '11 / 1,000', 'sum of all spots, not the chip');
  assert.match(await text(page, '[data-id="btn-start"]'), /Start\s*11 on 3 spots/);
  assert.match(await text(page, '#r-credits'), /Credits\s*10,000/);
  await setup(page, { balance: 10000, bets: { 5: 200, 10: 200, 20: 200, 50: 200, 100: 200 }, chip: 1 });
  assert.equal(await railText(page, 'total'), '1,000 / 1,000');
  await page.__done();
});

test('last bets (top row, right of "Last results"): each round shows its TOTAL bet, newest first; none in the rail', async () => {
  const page = await fresh();
  assert.match(await text(page, '#r-top [data-role="last-bets"]'), /Last bets:\s*None yet/);
  assert.equal(await page.evaluate(() => document.querySelector('#r-controls [data-role="last-bets"]')), null, 'moved out of the rail');
  await setup(page, { balance: 1000, bets: { 20: 5, 50: 1 }, chip: 1, history: [] });
  await playTo(page, 27, null, 'BETTING'); // loss: bets stay on the board
  await clickId(page, 'chip-5');
  await clickId(page, 'tier-200');
  await clickId(page, 'chip-1');
  await clickId(page, 'tier-200');
  await playTo(page, 27, null, 'BETTING');
  const lbs = await page.evaluate(() => [...document.querySelectorAll('#r-top [data-role="last-bets"] .lb')].map((e) => [e.textContent, e.classList.contains('new')]));
  assert.deepEqual(lbs, [['12', true], ['6', false]]);
  assert.match(await page.evaluate(() => document.querySelector('[data-role="last-bets"]').getAttribute('aria-label')), /newest first: 12, 6/);
  await page.__done();
});

// valid for the old reader, with spacing and key order JSON.stringify would not produce, so a rewrite would show
const OLD_TOTALS = { 'rl.v3.betTotals': '[ {"t":777, "id":"old-1"},\n  {"t":40, "id":null} ]' };
const lastBetsShown = (page) => page.evaluate(() => [...document.querySelectorAll('#r-top [data-role="last-bets"] .lb')].map((e) => e.textContent));
const stored = (page) => page.evaluate(() => ({ ...localStorage }));

test('last bets: a saved rl.v3.betTotals is ignored and untouched; new totals go to rl.v5.betTotals', async () => {
  const old = { ...OLD_TOTALS, 'rl.v1.balance': JSON.stringify({ v: 500, seq: 2 }), 'rl.v1.lastBets': JSON.stringify({ 8: 10 }) };
  const page = await fresh({ presetStorage: old });
  assert.match(await text(page, '#r-top [data-role="last-bets"]'), /Last bets:\s*None yet/);
  assert.deepEqual(await page.evaluate(() => window.__rl.app.ui.betTotals), []);
  assert.equal((await stored(page))['rl.v5.betTotals'], undefined, 'no old total copied or seeded');
  await setup(page, { balance: 1000, bets: { 20: 5, 50: 1 }, chip: 1, history: [] });
  await playTo(page, 27, null, 'BETTING');
  assert.deepEqual(await lastBetsShown(page), ['6']);
  assert.deepEqual(JSON.parse((await stored(page))['rl.v5.betTotals']).map((e) => e.t), [6]);
  // after a reload: still only the new total, and the old keys are still byte-for-byte the same
  await openGame(browser, url, { seed: 11, keepStorage: true }, page);
  assert.deepEqual(await lastBetsShown(page), ['6']);
  const after = await stored(page);
  for (const [k, v] of Object.entries(old)) assert.equal(after[k], v, `${k} untouched`);
  await page.__done();
});

test('last bets: the first-load seed uses the saved rl.v5.lastBets, never rl.v3.betTotals', async () => {
  const page = await fresh({ presetStorage: { ...OLD_TOTALS, 'rl.v5.lastBets': JSON.stringify({ 20: 5 }) } });
  assert.deepEqual(await lastBetsShown(page), ['5']);
  const after = await stored(page);
  assert.deepEqual(JSON.parse(after['rl.v5.betTotals']), [{ id: null, t: 5 }]);
  assert.equal(after['rl.v3.betTotals'], OLD_TOTALS['rl.v3.betTotals']);
  await page.__done();
});

test('rail look (1920): flat token colours, blue Start, green Collect with dark text, blue Gamble; token sizes; no shadows', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: { 20: 5 }, chip: 5, history: [] });
  const look = await page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.querySelector(`[data-id="${id}"]`));
    const h = (sel) => document.querySelector(sel).getBoundingClientRect().height;
    const shadows = [...document.querySelectorAll('#r-controls *, #r-controls .chip')].flatMap((e) => [getComputedStyle(e), getComputedStyle(e, '::after')]).filter((s) => s.boxShadow !== 'none' || s.textShadow !== 'none' || s.filter !== 'none').length;
    return {
      start: [cs('btn-start').backgroundColor, cs('btn-start').color], main: h('[data-id="btn-start"]'), act: h('[data-id="btn-undo"]'), chip: h('[data-id="chip-5"]'),
      sel: getComputedStyle(document.querySelector('[data-id="chip-5"]'), '::after').borderTopColor, shadows,
    };
  });
  assert.deepEqual(look.start, ['rgb(13, 110, 253)', 'rgb(255, 255, 255)'], 'Start: accent-blue, white text');
  assert.deepEqual([look.main, look.act, look.chip], [60, 52, 56]);
  assert.equal(look.sel, 'rgb(255, 255, 255)', 'selected chip: white ring');
  assert.equal(look.shadows, 0, 'no box/text shadows or filters in the rail');
  await playTo(page, 13);
  const win = await page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.querySelector(`[data-id="${id}"]`));
    return { collect: [cs('btn-collect').backgroundColor, cs('btn-collect').color], gamble: cs('btn-gamble').backgroundColor };
  });
  assert.deepEqual(win.collect, ['rgb(22, 163, 74)', 'rgb(6, 33, 15)'], 'Collect: accent-green, dark text');
  assert.equal(win.gamble, 'rgb(13, 110, 253)');
  assert.match(await text(page, '[data-id="btn-collect"]'), /Collect 100/);
  assert.match(await text(page, '[data-id="btn-gamble"]'), /50\/50 · 3 of 3 left/);
  await page.__done();
});

// ------------------------------------------------------------------ v3 track and centre display (batch 4)
/** In-page probe: records every DOM mutation in the game regions (one batch per MutationObserver callback, i.e.
 *  per animation frame) with the lit square and the big number at that moment, and counts layout reads
 *  (getBoundingClientRect, offset*, client*, scroll*, getComputedStyle, ...) while it is on. */
async function installRunProbe(page) {
  await page.evaluate(() => {
    const P = window.__probe = { on: false, reads: {}, batches: [] };
    const count = (name) => { if (P.on) P.reads[name] = (P.reads[name] || 0) + 1; };
    for (const m of ['getBoundingClientRect', 'getClientRects', 'scrollIntoView']) {
      const orig = Element.prototype[m];
      Element.prototype[m] = function (...a) { count(m); return orig.apply(this, a); };
    }
    for (const p of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft', 'innerText']) {
      const proto = p in HTMLElement.prototype && Object.getOwnPropertyDescriptor(HTMLElement.prototype, p) ? HTMLElement.prototype : Element.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, p);
      Object.defineProperty(proto, p, { ...d, get() { count(p); return d.get.call(this); } });
    }
    const gcs = window.getComputedStyle;
    window.getComputedStyle = (...a) => { count('getComputedStyle'); return gcs(...a); };
    const what = (n) => (n.nodeType === 3 ? n.parentElement : n);
    const mo = new MutationObserver((recs) => {
      if (!P.on) return;
      const lit = document.querySelector('#r-track .tile.lit, #r-track .tile.lit2');
      P.batches.push({
        lit: lit ? lit.dataset.id : null, litMult: lit ? lit.querySelector('.m').textContent : null,
        big: document.querySelector('[data-role="big"]').textContent,
        recs: recs.map((r) => {
          const el = what(r.target);
          return { type: r.type, attr: r.attributeName, region: el.closest('[id^="r-"]').id, tile: el.classList.contains('tile') ? el.dataset.id : null, role: el.dataset.role || null, cls: el.className };
        }),
      });
    });
    for (const id of ['r-track', 'r-centre', 'r-top', 'r-controls', 'r-frame', 'r-bar']) mo.observe(document.getElementById(id), { subtree: true, attributes: true, childList: true, characterData: true });
  });
}

test('centre: no big number while betting (mock); during a round it is the multiplier under the light, then the stop', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 50: 1, 200: 1 }, history: [] });
  assert.equal(await page.evaluate(() => document.querySelector('#r-centre .big')), null);
  assert.match((await text(page, '#r-centre')).replace(/\s+/g, ' '), /Betting open ?Double Run · 1 in 25 ?Pick a tier spot ?Win if the light stops on any square of that tier\. ?200x ?1 in 218\.3 ?1 square ?Bet 1.*5x ?1 in 5\.46 ?12 squares ?No bet ?Blank square · no win · 20 of 50/);
  await installRunProbe(page);
  await force(page, 29);
  await page.evaluate(() => { window.__probe.on = true; });
  await dispatch(page, { type: 'START' });
  const big = await page.evaluate(() => {
    window.__probe.on = false; // our own getComputedStyle call is not the app's
    const cs = getComputedStyle(document.querySelector('#r-centre .big'));
    const out = { font: cs.fontFamily, size: cs.fontSize, color: cs.color, contain: cs.contain };
    window.__probe.on = true;
    return out;
  });
  assert.match(big.font, /^"JetBrains Mono"/);
  assert.deepEqual([big.size, big.color, big.contain], ['88px', 'rgb(106, 116, 128)', 'strict'], 'big-number 88 px, #6a7480, contained');
  await waitPhase(page, ['RESOLVING', 'GAMBLE_OFFER']);
  const P = await page.evaluate(() => { window.__probe.on = false; return window.__probe; });
  const running = P.batches.filter((b) => b.lit);
  assert.ok(running.length > 30, `sampled ${running.length} frames`);
  // a blank square reads 00.00
  for (const b of running) assert.equal(`${b.big}x`, `${(b.litMult === 'No win' ? '0' : b.litMult.replace('x', '')).padStart(2, '0')}.00x`, `${b.lit}: big ${b.big} vs ${b.litMult}`);
  assert.match(await text(page, '#r-centre'), /Running|You win/);
  await settle(page);
  assert.equal(await text(page, '#r-centre .big'), '50.00x', 'stopped on #29 (50x)');
  await page.__done();
});

test('light run: each step changes only tile classes (<= 4 tiles) and the big number text; no layout reads; flat lit / trail look', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: { 20: 1, 50: 2 }, history: [] });
  await installRunProbe(page);
  await force(page, 30);
  await page.evaluate(() => { window.__probe.on = true; });
  await dispatch(page, { type: 'START' });
  // mid-run look: lit = tile-lit fill with dark text, trail = white ::before overlay by opacity, no glow, no veil
  await page.waitForFunction(() => document.querySelector('#r-track .tile.trail2'), { timeout: 5000 });
  const look = await page.evaluate(() => {
    window.__probe.on = false; // our own getComputedStyle calls below are not the app's
    const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
    const lit = cs('#r-track .tile.lit');
    const out = {
      lit: [lit.backgroundColor, lit.color, lit.boxShadow], litM: cs('#r-track .tile.lit .m').color,
      t1: cs('#r-track .tile.trail1', '::before').opacity,
      t2: [cs('#r-track .tile.trail2', '::before').transitionProperty, cs('#r-track .tile.trail2', '::before').transitionDuration],
      veils: document.querySelectorAll('#r-track .veil, #r-track .lock').length,
      shadows: [...document.querySelectorAll('#r-track .tile')].filter((t) => getComputedStyle(t).boxShadow !== 'none' || getComputedStyle(t).filter !== 'none').length,
    };
    window.__probe.on = true;
    return out;
  });
  assert.deepEqual(look.lit, ['rgb(233, 238, 243)', 'rgb(15, 18, 22)', 'none'], 'lit: #e9eef3, dark text, no glow');
  assert.equal(look.litM, 'rgb(15, 18, 22)');
  assert.equal(look.t1, '0.34', 'trail step 1: white overlay at .34, instant');
  assert.deepEqual(look.t2, ['opacity', '0.12s'], 'trail step 2 fades by opacity only, 120 ms');
  assert.equal(look.veils, 0, 'no lock veil while running');
  assert.equal(look.shadows, 0);
  await waitPhase(page, ['RESOLVING', 'GAMBLE_OFFER']);
  const P = await page.evaluate(() => { window.__probe.on = false; return window.__probe; });
  // only the frames of the light run itself (START's one-off rail/centre re-render comes before the first lit frame)
  const first = P.batches.findIndex((b) => b.lit);
  const run = P.batches.slice(first);
  assert.ok(run.length > 30);
  const recs = run.flatMap((b) => b.recs);
  const bad = recs.filter((r) => !((r.region === 'r-track' && r.type === 'attributes' && r.attr === 'class' && r.tile) || (r.region === 'r-centre' && r.role === 'big' && r.type === 'childList')));
  assert.deepEqual(bad.slice(0, 5), [], 'a light step only swaps tile classes and the big number text');
  const perFrame = run.map((b) => new Set(b.recs.filter((r) => r.tile).map((r) => r.tile)).size);
  assert.ok(Math.max(...perFrame) <= 6, `tiles changed per frame: max ${Math.max(...perFrame)}`);
  assert.ok(perFrame.filter((n) => n > 4).length <= 2, `frames over 4 tiles: ${perFrame.filter((n) => n > 4).length} (only when one 60 Hz frame covers two squares)`);
  assert.ok(Math.max(...run.map((b) => b.recs.filter((r) => r.role === 'big').length)) <= 1, 'big number written at most once per frame');
  assert.deepEqual(P.reads, {}, 'no layout reads while the light runs');
  // the landing square: lit + land on the stored stop
  const landed = await page.evaluate(() => [...document.querySelectorAll('#r-track .tile.land')].map((e) => e.dataset.id));
  assert.ok(landed.length <= 1 && (landed.length === 0 || landed[0] === 'sq-30'), `landing ${landed}`);
  await page.__done();
});

test('top row: "Last results:" newest first (tier colours, newest outlined) and "Last bets:" right; tiles flat with tier colours and no bet badges', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: { 200: 1, 100: 2, 50: 2 }, history: [1, 2, 3, 8] });
  const top = await page.evaluate(() => {
    const t = document.querySelector('#r-top .toprow');
    const res = [...t.querySelectorAll('[data-role="history"] .tp')].map((e) => [e.textContent, e.classList.contains('new')]);
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { res, lr: r('#r-top [data-role="history"]').left < r('#r-top [data-role="last-bets"]').left, above: r('#r-top .toprow').bottom <= r('[data-id="sq-1"]').top };
  });
  assert.deepEqual(top.res, [['200x', true], ['50x', false], ['–', false], ['5x', false]]);
  assert.ok(top.lr && top.above, 'results left, bets right, above the track');
  const tiles = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    return {
      t200: [cs('[data-id="sq-8"]').backgroundColor, cs('[data-id="sq-8"] .m').color, cs('[data-id="sq-8"]').borderTopColor], t100: [cs('[data-id="sq-21"]').backgroundColor, cs('[data-id="sq-21"] .m').color], t5: cs('[data-id="sq-1"] .m').color,
      badges: document.querySelectorAll('#r-track .bet').length,
      num: cs('[data-id="sq-1"] .num').display, size: document.querySelector('[data-id="sq-1"]').getBoundingClientRect().width,
    };
  });
  assert.deepEqual(tiles.t200, ['rgb(20, 41, 74)', 'rgb(255, 255, 255)', 'rgb(255, 255, 255)'], '200x: navy tile, white label and border');
  assert.deepEqual(tiles.t100, ['rgb(20, 41, 74)', 'rgb(253, 224, 71)'], '100x: navy tile, gold label');
  assert.equal(tiles.t5, 'rgb(154, 165, 177)');
  assert.equal(tiles.badges, 0, 'the ring shows no bets');
  assert.deepEqual([tiles.num, tiles.size], ['block', 74], '74 px tiles with square numbers at 1920x1080 (SPEC.md §2.9)');
  await page.__done();
});

// ------------------------------------------------------------------ v3 result states (batch 5)
const MOCK_BETS = { 5: 5, 10: 5, 20: 5, 50: 2, 100: 2, 200: 1 }; // 20 credits on the 6 tiers
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const words = (page, sel) => page.evaluate((s) => document.querySelector(s).innerText.replace(/\s+/g, ' ').trim(), sel);
/** Computed look of a tile (and its badge / marker) by square number. */
const tileStyle = (page, n) => page.evaluate((i) => {
  const t = document.querySelector(`[data-id="sq-${i}"]`);
  const cs = getComputedStyle(t);
  const b = t.querySelector('.bet');
  return { cls: t.className, bg: cs.backgroundColor, color: cs.color, m: getComputedStyle(t.querySelector('.m')).color, badge: b ? getComputedStyle(b).backgroundColor : null, mark: t.querySelector('.mkt')?.textContent || null, num: getComputedStyle(t.querySelector('.num')).display };
}, n);
const centreLook = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(`#r-centre ${s}`);
  return {
    pills: [...document.querySelectorAll('#r-centre .cp')].map((p) => [p.textContent, getComputedStyle(p).color, getComputedStyle(p).backgroundColor]),
    big: q('.big')?.textContent ?? null, bigColor: q('.big') ? getComputedStyle(q('.big')).color : null, big2: q('.big2')?.textContent ?? null,
    on: [...document.querySelectorAll('#r-centre .spot.won')].map((b) => [b.querySelector('.sm').textContent, getComputedStyle(b).backgroundColor, getComputedStyle(b).color, b.querySelector('.sb').textContent]),
    cards: [...document.querySelectorAll('#r-centre .card')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
    band: q('.gband') ? q('.gband').innerText.replace(/\s+/g, ' ').trim() : null, bandBg: q('.gband') ? getComputedStyle(q('.gband')).backgroundColor : null,
  };
});
const GREEN = 'rgb(22, 163, 74)', ON_GREEN = 'rgb(6, 33, 15)';

test('result: win + gamble offer (win-gamble-offer.png): light 20.00x, green stop and pays pill, result card, navy band, Collect / Gamble ×2', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5, history: [] });
  await playTo(page, 13);
  const c = await centreLook(page);
  assert.deepEqual(c.pills.map((p) => p[0]), ['Win', 'Double Run · 1 in 25']);
  assert.equal(c.pills[0][1], 'rgb(74, 222, 128)', 'Win pill: green text');
  assert.deepEqual([c.big, c.bigColor, c.big2], ['20.00x', 'rgb(230, 234, 238)', null], 'the multiplier stays the big number, light when won');
  assert.match((await words(page, '#r-centre .ctxt')), /^You win 100 Collect it, or gamble it on a 50\/50\.$/);
  assert.deepEqual(c.on, [['20x', GREEN, ON_GREEN, 'Won 100']], 'only the won spot is green');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.spot.lost').length), 5, 'the spots that bet and lost fade');
  assert.deepEqual(c.cards, ['#13 20x Bet × pays 5 × 20 = 100']);
  assert.equal(c.band, 'Double or nothing 50/50 · Win → 200 · Lose → 0 3 of 3 left');
  assert.equal(c.bandBg, 'rgb(20, 41, 74)', 'navy band');
  const t = await tileStyle(page, 13);
  assert.deepEqual([t.bg, t.color, t.m, t.badge, t.mark], [GREEN, ON_GREEN, ON_GREEN, null, null], 'win stop: flat green, dark text, no badge on the ring');
  const other = await tileStyle(page, 3);
  assert.deepEqual([other.bg, other.cls.includes('veil')], ['rgb(35, 42, 51)', false], 'other squares keep their look (no veil)');
  // rail: note above the Collect (green) / Gamble ×2 (blue) stack; Undo / Clear / Rebet hidden until settled
  const rail = await page.evaluate(() => [...document.querySelectorAll('#r-controls .rnote, #r-controls .mains .btn, #r-controls .acts')].map((e) => e.dataset.id || e.className));
  assert.deepEqual(rail, ['rnote', 'btn-collect', 'btn-gamble']);
  assert.equal((await words(page, '#r-controls .rnote')), 'Uncollected win 100');
  assert.match((await words(page, '[data-id="btn-collect"]')), /^Collect 100 Add to credits · Enter$/);
  assert.match((await words(page, '[data-id="btn-gamble"]')), /^Gamble ×2 50\/50 · 3 of 3 left · G$/);
  await page.__done();
});

test('result: gamble flip (gamble-flip.png): navy panel in the centre, one 700 ms rotateY disc, centre rebuilt only at start/end; flip win doubles', async () => {
  const page = await fresh({ timeScale: 1 });
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5, history: [] });
  await playTo(page, 13);
  await page.evaluate(() => { window.__rl.app.ui.displayWin = null; });
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'white' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => window.__rl.game.state.round.gambles.length === 1 && !window.__rl.game.state.gamble.revealing);
  await settle(page);
  assert.equal((await state(page)).round.currentWin, 200, 'flip win doubles 100 -> 200');
  assert.match((await words(page, '#r-centre')), /Match! White lit\. Your win is now 200\. Gamble again or collect\./);
  assert.equal(await page.evaluate(() => document.querySelector('#r-centre .flip').className), 'flip w', 'disc rests on the result');
  // flip 2 at real speed: watch the centre region while the stored result is revealed
  await page.evaluate(() => {
    window.__rl.app.ui.displayWin = null;
    const P = window.__flipProbe = { rewrites: 0, on: true };
    new MutationObserver((recs) => { if (P.on && recs.some((r) => r.type === 'childList' && r.target.id === 'r-centre')) P.rewrites += 1; }).observe(document.getElementById('r-centre'), { childList: true });
  });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  const mid = await page.evaluate(() => {
    const coin = document.querySelector('#r-centre .flip.go .coin');
    const a = coin ? coin.getAnimations()[0] : null;
    const cs = coin ? getComputedStyle(coin) : null;
    const q = (s) => document.querySelector(s);
    return {
      anim: a ? [a.animationName, a.effect.getTiming().duration] : null, will: cs && cs.willChange,
      head: q('#r-centre .ghead').innerText.replace(/\s+/g, ' ').trim(), pills: [...document.querySelectorAll('#r-centre .cp')].map((p) => p.textContent),
      msg: q('#r-centre .gmsg').textContent, cards: [...document.querySelectorAll('#r-centre .gc')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
      recap: q('#r-centre .grec').textContent, note: q('#r-centre .gnote').textContent,
      sel: [...document.querySelectorAll('#r-centre .pick')].map((p) => [p.dataset.id, p.getAttribute('aria-checked'), p.innerText.replace(/\s+/g, ' ').trim()]),
      flipBtn: [q('[data-id="btn-flip"]').innerText.replace(/\s+/g, ' ').trim(), q('[data-id="btn-flip"]').getAttribute('aria-disabled')],
      collect: [q('[data-id="btn-collect"]').innerText.replace(/\s+/g, ' ').trim(), q('[data-id="btn-collect"]').getAttribute('aria-disabled'), getComputedStyle(q('[data-id="btn-collect"]')).backgroundColor],
      note2: q('#r-controls .rnote').innerText.replace(/\s+/g, ' ').trim(), big: q('#r-centre .big'), panel: getComputedStyle(q('#r-centre .gpanel')).backgroundColor,
    };
  });
  assert.deepEqual(mid.anim, ['flipr', 700], 'one disc, 700 ms, ending on the stored (red) face');
  assert.equal(mid.will, 'transform', 'will-change only while it flips');
  assert.equal(mid.head, 'Double or nothing · flip 2 2 of 3 left');
  assert.deepEqual(mid.pills, ['Gamble', '#13 · 20x · won 100']);
  assert.equal(mid.msg, 'Flipping… If red lights, your win doubles.');
  assert.deepEqual(mid.cards, ['Current win 200', 'Red lights 400', 'White lights 0']);
  assert.equal(mid.recap, 'Flip 1: you picked White · White lit · 100 → 200');
  assert.equal(mid.note, 'Gamble is turned off when the doubled win would exceed 300,000 credits.');
  assert.deepEqual(mid.sel, [['pick-red', 'true', 'Red Your pick'], ['pick-white', 'false', 'White key W / →']]);
  assert.deepEqual(mid.flipBtn, ['Flipping… Red · 200 → 400 or 0', 'true']);
  assert.deepEqual(mid.collect, ['Collect 200 After the flip · Enter', 'true', 'rgba(0, 0, 0, 0)'], 'Collect locked (outline) during the flip');
  assert.equal(mid.note2, 'In gamble 200 · not collected');
  assert.equal(mid.big, null, 'no big number in the gamble');
  assert.equal(mid.panel, 'rgb(20, 41, 74)');
  await page.waitForFunction(() => window.__rl.game.state.round.gambles.length === 2 && !window.__rl.game.state.gamble.revealing);
  const rewrites = await page.evaluate(() => { window.__flipProbe.on = false; return window.__flipProbe.rewrites; });
  assert.ok(rewrites <= 4, `centre rebuilt ${rewrites} times for one flip (start, rest, result)`);
  assert.equal((await state(page)).round.currentWin, 400);
  assert.match(await text(page, '#r-centre .gmsg'), /Match! Red lit\. Your win is now 400\./);
  await page.__done();
});

test('result: loss on a blank square (loss.png): No win pill, 00.00x grey, light stop tile that keeps its look on hover, "Blank · no win" card', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5, history: [] });
  await playTo(page, 2, null, 'BETTING');
  const c = await centreLook(page);
  assert.deepEqual(c.pills.map((p) => p[0]), ['No win', 'Double Run · 1 in 25']);
  assert.equal(c.pills[0][1], 'rgb(248, 113, 113)', 'No win: red text');
  assert.deepEqual([c.big, c.bigColor], [null, null], 'loss: back to the spots, no big number');
  assert.equal((await words(page, '#r-centre .ctxt')), 'No win this time The light stopped on #2 (blank). Your bets are still on the board. Press Start to play them again.');
  assert.deepEqual(c.on, [], 'no spot won');
  assert.deepEqual(c.cards, []);
  assert.equal(c.band, null);
  const t = await tileStyle(page, 2);
  assert.deepEqual([t.bg, t.m], ['rgb(233, 238, 243)', 'rgb(15, 18, 22)'], 'loss stop: tile-lit fill, dark text');
  const p = await centerOf(page, 'sq-2');
  await page.mouse.move(p.x, p.y);
  await sleep(100);
  assert.equal((await tileStyle(page, 2)).bg, 'rgb(233, 238, 243)', 'hover keeps the lit look');
  assert.deepEqual(await bets(page), MOCK_BETS, 'bets stay on the board');
  assert.match((await words(page, '[data-id="btn-start"]')), /^Start again 20 on 6 spots$/);
  await page.__done();
});

test('result: Double Run (double-run-result.png): "100.00x + 20.00x", both stops green with 1st / 2nd, two cards, both tiers lit', async () => {
  const page = await fresh();
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5, history: [] });
  await playTo(page, 21, 33);
  const c = await centreLook(page);
  assert.deepEqual(c.pills.map((p) => p[0]), ['Double Run win', 'Double Run on']);
  assert.deepEqual([c.pills[0][1], c.pills[1][2]], ['rgb(74, 222, 128)', 'rgb(13, 110, 253)']);
  assert.deepEqual([c.big, c.bigColor, c.big2], ['100.00x', 'rgb(230, 234, 238)', '+ 20.00x']);
  assert.equal((await words(page, '#r-centre .ctxt')), 'You win 300 Two squares won this round. A second light ran and could not stop on #21.');
  assert.deepEqual(c.on.map((x) => [x[0], x[3]]), [['100x', 'Won 200'], ['20x', 'Won 100']]);
  assert.deepEqual(c.cards, ['1 · #21 100x Bet × pays 2 × 100 = 200', '2 · #33 20x Bet × pays 5 × 20 = 100']);
  assert.equal(c.band, 'Double or nothing 50/50 · Win → 600 · Lose → 0 3 of 3 left');
  for (const [n, mark] of [[21, '1st'], [33, '2nd']]) {
    const t = await tileStyle(page, n);
    assert.deepEqual([t.bg, t.color, t.mark, t.num], [GREEN, ON_GREEN, mark, 'none'], `#${n}`);
  }
  assert.equal((await words(page, '#r-controls .rnote')), 'Uncollected win 300 · 2 squares');
  assert.match((await words(page, '[data-id="btn-collect"]')), /^Collect 300/);
  // a Double Run that misses both: both stops light, marked, two "No … bet" cards
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 1000, bets: { 50: 2 }, chip: 5 });
  await playTo(page, 21, 33, 'BETTING');
  const l = await centreLook(page);
  assert.deepEqual([l.pills[0][0], l.big, l.big2], ['No win', null, null]);
  assert.deepEqual(l.cards, []);
  assert.match(await words(page, '#r-centre .ctxt'), /The lights stopped on #21 and #33\./);
  assert.deepEqual([(await tileStyle(page, 21)).mark, (await tileStyle(page, 33)).bg], ['1st', 'rgb(233, 238, 243)']);
  await page.__done();
});

test('no glow, pulse or WIN tag remains on tiles in any result state (win, gamble, Double Run, loss)', async () => {
  const page = await fresh();
  // the stylesheet: no v2 glow / pulse / chase / tag keyframes or rules are loaded at all
  const sheet = await page.evaluate(() => {
    const all = [...document.styleSheets].flatMap((s) => [...s.cssRules]);
    return {
      keyframes: all.filter((r) => r.type === CSSRule.KEYFRAMES_RULE).map((r) => r.name).sort(),
      tileGlow: all.filter((r) => r.selectorText && /\.tile|\.q\d/.test(r.selectorText) && !/:focus/.test(r.selectorText) && /box-shadow|filter|drop-shadow/.test(r.style.cssText)).map((r) => r.selectorText),
      tags: all.filter((r) => r.selectorText && /wtag|pulse|chase|win2|veil|celebrate|confetti/.test(r.selectorText)).map((r) => r.selectorText),
    };
  });
  assert.deepEqual(sheet.keyframes, ['cfade', 'dlgin', 'flipr', 'flipw', 'land', 'toastin', 'toastout']);
  assert.deepEqual(sheet.tileGlow, []);
  assert.deepEqual(sheet.tags, []);
  const scan = (label) => page.evaluate((l) => {
    const bad = [];
    for (const t of document.querySelectorAll('#r-track .tile')) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(t, pseudo);
        if (cs.boxShadow !== 'none') bad.push(`${t.dataset.id}${pseudo || ''} box-shadow ${cs.boxShadow}`);
        if (cs.filter !== 'none') bad.push(`${t.dataset.id}${pseudo || ''} filter ${cs.filter}`);
        if (!['none', 'land'].includes(cs.animationName)) bad.push(`${t.dataset.id}${pseudo || ''} animation ${cs.animationName}`);
        if (pseudo && cs.backgroundImage !== 'none') bad.push(`${t.dataset.id}${pseudo} gradient`);
      }
      if (/\b(pulse|chase|win2|fade)\b/.test(t.className)) bad.push(`${t.dataset.id} class ${t.className}`);
      if (t.querySelector('.veil, .lock')) bad.push(`${t.dataset.id} veil`);
    }
    if (document.querySelectorAll('.wtag, #r-tags, .confetti, .celebrate').length) bad.push('WIN tag / celebration element');
    if (/\bWIN\b/.test(document.getElementById('r-track').textContent)) bad.push('WIN text on the track');
    if (/provabl/i.test(document.body.textContent)) bad.push('provably-fair wording');
    return bad.map((b) => `${l}: ${b}`);
  }, label);
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5, history: [] });
  await playTo(page, 13); // 20x
  assert.deepEqual(await scan('win'), []);
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  assert.deepEqual(await scan('gamble flip'), []);
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 1000, bets: MOCK_BETS, chip: 5 });
  await playTo(page, 21, 33);
  assert.deepEqual(await scan('Double Run'), []);
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 1000, bets: { 5: 5 }, chip: 5 });
  await playTo(page, 1); // 5x
  assert.deepEqual(await scan('small win'), []);
  await page.keyboard.press('Enter');
  await waitPhase(page, 'BETTING');
  await settle(page);
  await setup(page, { balance: 1000, bets: { 5: 5 }, chip: 5 });
  await playTo(page, 2, null, 'BETTING'); // blank
  assert.deepEqual(await scan('loss'), []);
  await page.__done();
});

// ------------------------------------------------------------------ layout per breakpoint
for (const [w, h, bp] of SIZES) {
  test(`layout ${w}x${h} -> ${bp}: 50 tiles on screen, no overlaps, controls visible; result centre and gamble panel fit`, async () => {
    const page = await fresh({ width: w, height: h, touch: w < 900 });
    const geo = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.tile')].map((e) => ({ id: e.dataset.id, ...r(e).toJSON() }));
      let overlaps = 0;
      for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps++;
      }
      const inView = tiles.every((t) => t.left >= 0 && t.top >= 0 && t.right <= innerWidth && t.bottom <= innerHeight);
      const start = r(document.querySelector('[data-id="btn-start"]'));
      return { bp: document.getElementById('app').dataset.bp, n: tiles.length, overlaps, inView, startVisible: start.bottom <= innerHeight && start.right <= innerWidth && start.width > 0, scrollW: document.documentElement.scrollWidth, small: [...document.querySelectorAll('#r-controls *, #r-centre *, #r-bar *, #r-credits *, #r-track *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 9).map((e) => `${e.className}:${e.textContent.trim().slice(0, 12)}:${getComputedStyle(e).fontSize}`) };
    });
    assert.equal(geo.bp, bp);
    assert.equal(geo.n, 50);
    assert.equal(geo.overlaps, 0);
    assert.ok(geo.inView, 'all tiles inside the viewport');
    assert.ok(geo.startVisible, 'START visible');
    assert.ok(geo.scrollW <= w, 'no horizontal overflow');
    assert.deepEqual(geo.small, [], 'no text below the 9 px token minimum');
    // track order: #1 top-left, clockwise
    const pos = await page.evaluate(() => Object.fromEntries([1, 16, 17, 25, 26, 41, 42, 50].map((n) => { const b = document.querySelector(`[data-id="sq-${n}"]`).getBoundingClientRect(); return [n, [Math.round(b.left), Math.round(b.top)]]; })));
    assert.ok(pos[1][0] < pos[16][0] && pos[1][1] === pos[16][1], 'top row 1..16 left to right');
    assert.ok(pos[17][1] < pos[25][1] && pos[17][0] === pos[16][0], 'right column 17..25 downward');
    assert.ok(pos[26][0] > pos[41][0], 'bottom row 26..41 right to left');
    assert.ok(pos[42][1] > pos[50][1] && pos[50][0] === pos[1][0], 'left column 42..50 upward');
    // result states (Double Run #21 + #46, then the gamble panel): everything inside the ring interior, no text
    // clipped, the 1st / 2nd markers clear of the bet badges, no WIN tags
    const fits = () => page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const box = r(document.querySelector('#r-centre .centre'));
      const kids = [...document.querySelectorAll('#r-centre .centre *')].filter((e) => r(e).width > 0);
      const out = kids.filter((e) => { const b = r(e); return b.left < box.left - 0.5 || b.right > box.right + 0.5 || b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5; }).map((e) => e.className || e.tagName);
      const clipped = kids.filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className);
      const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      // batch 6: markers clear of the badge (a 2-digit one on #21) and of the multiplier, and inside their tile
      const marks = [...document.querySelectorAll('.tile .mkt')].filter((m) => { const t = m.parentElement.parentElement, b = t.querySelector('.bet'), M = r(m), T = r(t); return (b && hit(M, r(b))) || hit(M, r(t.querySelector('.m'))) || (M.width > 0 && (M.left < T.left || M.top < T.top)); }).length;
      return { out, clipped, marks, tags: document.querySelectorAll('.wtag').length };
    });
    await setup(page, { bets: { ...BETS, 100: 10 } }); // both lights on 100x (2-digit badges)
    await playTo(page, 21, 46);
    assert.deepEqual(await fits(), { out: [], clipped: [], marks: 0, tags: 0 }, 'Double Run result');
    await dispatch(page, { type: 'GAMBLE_OPEN' });
    await dispatch(page, { type: 'PICK', colour: 'red' });
    await settle(page);
    const f = await fits();
    assert.deepEqual([f.out, f.clipped], [[], []], 'gamble panel');
    await page.__done();
  });
}

test('touch (768x1024): a tap on a tier spot adds the chip; a tap or long-press on a square does nothing', async () => {
  const page = await fresh({ width: 768, height: 1024, touch: true });
  const q = await centerOf(page, 'tier-20');
  await page.touchscreen.tap(q.x, q.y);
  assert.deepEqual(await bets(page), { 20: 1 });
  const p = await centerOf(page, 'sq-13');
  await page.touchscreen.tap(p.x, p.y);
  await page.touchscreen.touchStart(p.x, p.y);
  await sleep(600);
  await page.touchscreen.touchEnd();
  await sleep(100);
  assert.deepEqual(await bets(page), { 20: 1 });
  assert.equal(await page.evaluate(() => document.querySelectorAll('.tip').length), 0, 'no square sheet');
  await page.__done();
});

// ------------------------------------------------------------------ v5 phone ring shapes (batch 4)
const PHONES = [[390, 844, 11, 16, 30], [360, 640, 12, 15, 25]];
for (const [w, h, cols, rows, size] of PHONES) {
  test(`phone ${w}x${h}: ${cols}x${rows} ring of ${size} px squares, labels without "x" or number, 44 px targets, no overflow; result states fit`, async () => {
    const page = await fresh({ width: w, height: h, touch: true });
    const g = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('.tile')];
      const box = tiles.map((e) => r(e));
      const xs = new Set(box.map((b) => Math.round(b.left))), ys = new Set(box.map((b) => Math.round(b.top)));
      let overlaps = 0;
      for (let i = 0; i < 50; i++) for (let j = i + 1; j < 50; j++) if (box[i].left < box[j].right && box[j].left < box[i].right && box[i].top < box[j].bottom && box[j].top < box[i].bottom) overlaps++;
      const small = [...document.querySelectorAll('#r-controls .hit, #r-centre .hit, #r-bar .hit')].filter((e) => { const b = r(e); return b.width < 44 || b.height < 44; }).map((e) => e.dataset.id);
      const wide = tiles.filter((e) => r(e.querySelector('.m')).width > r(e).width - 2).map((e) => e.dataset.id);
      const inner = r(document.querySelector('#r-centre .centre'));
      const hitsCentre = box.filter((b) => b.left < inner.right && inner.left < b.right && b.top < inner.bottom && inner.top < b.bottom).length;
      const dock = r(document.querySelector('.dock.ph')), bar = r(document.querySelector('.bbar'));
      const fontMin = Math.min(...[...document.querySelectorAll('#r-track *, #r-centre *, #r-controls *, #r-credits *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && r(e).width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize)));
      return {
        bp: document.getElementById('app').dataset.bp, cols: xs.size, rows: ys.size, w: box[0].width, overlaps, small, wide, hitsCentre, fontMin,
        inView: box.every((b) => b.left >= 0 && b.right <= innerWidth && b.top >= bar.bottom && b.bottom <= dock.top),
        dockInView: dock.bottom <= innerHeight && [...document.querySelectorAll('.dock.ph .hit')].every((e) => r(e).left >= 0 && r(e).right <= innerWidth && r(e).bottom <= innerHeight), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        num: getComputedStyle(tiles[0].querySelector('.num')).display, x: getComputedStyle(tiles[0].querySelector('.x')).display, word: getComputedStyle(tiles[1].querySelector('.nwt')).display, glyph: r(tiles[1].querySelector('.noglyph')).width,
        chips: [...document.querySelectorAll('.chip')].map((e) => Math.round(r(e).top)), chipW: r(document.querySelector('.chip')).width, credits: document.querySelector('#r-credits').innerText.replace(/\s+/g, ' ').trim(),
      };
    });
    assert.deepEqual([g.bp, g.cols, g.rows, g.w], ['phone', cols, rows, size]);
    assert.equal(g.overlaps, 0);
    assert.ok(g.inView, 'all squares between the bar and the dock');
    assert.ok(g.dockInView, 'dock and every control in it on screen');
    assert.deepEqual(g.scroll, [w, h], 'no page overflow');
    assert.deepEqual(g.small, [], 'tap targets at least 44 px');
    assert.deepEqual(g.wide, [], 'labels fit their squares');
    assert.equal(g.hitsCentre, 0, 'no square overlaps the centre');
    assert.ok(g.fontMin >= 12, `text at least 12 px (${g.fontMin})`);
    assert.deepEqual([g.num, g.x, g.word], ['none', 'none', 'none'], 'no square number, "x" or "No win" word on phones');
    assert.equal(g.glyph, 12, 'the no-win glyph stays');
    assert.equal(new Set(g.chips).size, 1, 'seven chips in one row');
    assert.equal(g.chipW, 44);
    assert.equal(g.credits, 'Play credits 10,000');
    // #1 top-left, clockwise around the phone ring
    const pos = await page.evaluate((c, ro) => {
      const at = (n) => { const b = document.querySelector(`[data-id="sq-${n}"]`).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; };
      return { first: at(1), topEnd: at(c), rightEnd: at(c + ro - 1), botEnd: at(2 * c + ro - 2), last: at(50) };
    }, cols, rows);
    assert.equal(pos.first[1], pos.topEnd[1], 'top row');
    assert.equal(pos.topEnd[0], pos.rightEnd[0], 'right column');
    assert.equal(pos.rightEnd[1], pos.botEnd[1], 'bottom row');
    assert.equal(pos.last[0], pos.first[0], 'left column back to #1');
    // 2 x 3 spots with their bet on screen, the total on Start; a tap on a spot bets, a tap on a square does not
    const sp = await page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const spots = [...document.querySelectorAll('.spot')];
      return { cols: new Set(spots.map((e) => Math.round(r(e).left))).size, rows: new Set(spots.map((e) => Math.round(r(e).top))).size, sq: getComputedStyle(spots[0].querySelector('.sq')).display, body: parseFloat(getComputedStyle(document.querySelector('.centre.open .csub')).fontSize), total: document.querySelector('.tbet') };
    });
    assert.deepEqual([sp.cols, sp.rows, sp.sq], [2, 3, h <= 700 ? 'none' : 'block'], 'square count hidden at 700 px tall or less');
    assert.equal(sp.body, 14);
    assert.equal(sp.total, null, 'phones show the total on Start only');
    const q = await centerOf(page, 'tier-200');
    await page.touchscreen.tap(q.x, q.y);
    const p = await centerOf(page, 'sq-13');
    await page.touchscreen.tap(p.x, p.y);
    assert.deepEqual(await bets(page), { 200: 1 });
    // result states fit inside the ring
    const fits = () => page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const box = r(document.querySelector('#r-centre .centre'));
      const kids = [...document.querySelectorAll('#r-centre .centre *')].filter((e) => r(e).width > 0);
      return kids.filter((e) => { const b = r(e); return b.left < box.left - 0.5 || b.right > box.right + 0.5 || b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5; }).map((e) => e.className || e.tagName);
    });
    await setup(page, { bets: { ...BETS, 100: 10 } });
    await playTo(page, 21, 46);
    const onScreen = () => page.evaluate(() => [...document.querySelectorAll('.dock.ph .hit')].filter((e) => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth || b.bottom > innerHeight; }).map((e) => e.dataset.id));
    assert.deepEqual(await fits(), [], 'Double Run result');
    assert.deepEqual(await onScreen(), [], 'Collect and Gamble on screen');
    await dispatch(page, { type: 'GAMBLE_OPEN' });
    await dispatch(page, { type: 'PICK', colour: 'red' });
    await settle(page);
    assert.deepEqual(await fits(), [], 'gamble panel');
    assert.deepEqual(await onScreen(), [], 'gamble controls on screen');
    await page.__done();
  });
}

test('below 320 wide shows Rotate / enlarge', async () => {
  const page = await fresh({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.getElementById('rotate').hidden), true);
  await page.setViewport({ width: 300, height: 600 });
  await sleep(150);
  assert.equal(await page.evaluate(() => document.getElementById('rotate').hidden), false);
  assert.match(await text(page, '#rotate'), /Turn your phone upright, or make the window bigger/);
  await page.__done();
});

// ------------------------------------------------------------------ batch 7: performance
test('performance: the type warm-up leaves nothing behind; the credits count-up writes only the balance text; a win renders board and centre first, then the rail', async () => {
  const page = await fresh({ timeScale: 1 });
  await page.waitForFunction(() => !document.querySelector('#app > .warm'), { timeout: 5000 });
  const dup = await page.evaluate(() => { const ids = [...document.querySelectorAll('[data-id]')].map((e) => e.dataset.id); return ids.filter((x, i) => ids.indexOf(x) !== i); });
  assert.deepEqual(dup, [], 'no duplicate controls');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#r-credits .credits')).contain), 'size layout style');
  await setup(page, { balance: 1000, bets: { 20: 5 }, chip: 5, history: [] });
  await force(page, 13);
  await page.evaluate(() => {
    const P = window.__cu = { recs: [], frames: 0, first: {} };
    const tick = () => { P.frames += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    new MutationObserver((rs) => { for (const r of rs) { const el = r.target.nodeType === 3 ? r.target.parentElement : r.target; P.recs.push({ type: r.type, role: el.dataset.role || el.className }); } })
      .observe(document.getElementById('r-credits'), { subtree: true, childList: true, characterData: true, attributes: true });
    for (const id of ['r-centre', 'r-controls']) {
      new MutationObserver(() => { if (window.__rl.game.state.phase === 'GAMBLE_OFFER' && P.first[id] == null) P.first[id] = P.frames; })
        .observe(document.getElementById(id), { subtree: true, childList: true, characterData: true, attributes: true });
    }
    window.__rl.game.dispatch({ type: 'START' });
  });
  await sleep(450);
  const cu = await page.evaluate(() => window.__cu.recs);
  // START's own render rebuilds the region once (the settled balance changes); every tween frame after it only
  // replaces the balance text
  const kinds = cu.map((r) => `${r.type}:${r.role}`);
  assert.equal(kinds[0], 'childList:', 'one region rebuild at START');
  assert.ok(kinds.length >= 4, `${kinds.length - 1} count-up writes`);
  assert.deepEqual([...new Set(kinds.slice(1))], ['childList:balance'], 'tween frames replace only the balance text; the region is not rebuilt');
  assert.equal(await text(page, '#r-credits [data-role="balance"]'), '995');
  await waitPhase(page, 'GAMBLE_OFFER', 15000);
  await settle(page);
  const first = await page.evaluate(() => window.__cu.first);
  assert.ok(first['r-centre'] != null && first['r-controls'] != null, JSON.stringify(first));
  assert.ok(first['r-centre'] < first['r-controls'], `centre in frame ${first['r-centre']}, rail in frame ${first['r-controls']}`);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'btn-collect', 'focus moves once the rail is in');
  await page.__done();
});

test('no console errors, no failed or external requests, fonts loaded locally (Poppins + JetBrains Mono)', async () => {
  const page = await fresh();
  const fonts = await page.evaluate(() => ['600 20px Poppins', '700 20px Poppins', "600 20px 'JetBrains Mono'"].map((f) => document.fonts.check(f)));
  assert.deepEqual(fonts, [true, true, true]);
  const faces = await page.evaluate(() => [...document.fonts].map((f) => `${f.family.replace(/"/g, '')} ${f.weight}`).sort());
  assert.deepEqual(faces, ['JetBrains Mono 600', 'Poppins 600', 'Poppins 700'], 'only the v3 faces (no Plus Jakarta Sans)');
  const external = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => !n.startsWith(location.origin) && !n.startsWith('data:')));
  assert.deepEqual(external, [], 'no external requests');
  await page.__done();
  assert.deepEqual(issues, [], 'console errors / failed or external requests across all UI tests');
});
