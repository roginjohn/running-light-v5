// v5 batch 7: accessibility checks on the rendered game (dev spec §4). Contrast, type sizes and tap targets are measured
// in every state at the three spec viewports; the live region, reduced motion and keyboard are driven for real.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, openGame, waitPhase, state, clickId } from './harness.js';
import { setup, playTo, dispatch, settle, force, timeToPhase } from './scenes.js';
import { SCENES, AUDIT_ONLY, VIEWPORTS, audit, aria, layoutCheck, pause } from './a11y-audit.js';

let server, url, browser;
before(async () => {
  ({ server, url } = await startServer());
  browser = await launch();
});
after(async () => {
  await browser.close();
  server.close();
});

const open = (opts = {}) => openGame(browser, url, { seed: 1, timeScale: 8, ...opts });
const live = (page) => page.evaluate(() => document.getElementById('live').textContent);
const finish = async (page) => {
  assert.deepEqual(page.__issues, [], 'no console errors or external requests');
  await page.close();
};
/** Everything #live said from now on. */
const recordLive = (page) => page.evaluate(() => {
  const said = window.__said = [];
  new MutationObserver(() => said.push(document.getElementById('live').textContent)).observe(document.getElementById('live'), { childList: true, characterData: true, subtree: true });
});
const said = (page) => page.evaluate(() => window.__said);
const BETS = { 200: 25, 20: 25, 10: 50, 5: 100 };

for (const [w, h, touch] of VIEWPORTS) {
  test(`audit ${w}x${h}: text 4.5:1, state borders and cues 3:1, text >= 12 px, body >= 14 px, ${touch ? '44 px targets, ' : ''}no overflow, in every state`, async () => {
    const problems = [];
    for (const [name, scene] of Object.entries({ ...SCENES, ...AUDIT_ONLY })) {
      const page = await open({ width: w, height: h, touch });
      await scene(page);
      await pause();
      const a = await page.evaluate(audit, { touch });
      const c = await page.evaluate(layoutCheck);
      for (const k of ['text', 'nonText', 'font', 'body', 'tap']) for (const x of a[k]) problems.push(`${name} ${k}: ${x}`);
      if (c.scrollW > c.w || c.scrollH > c.h) problems.push(`${name}: page overflow`);
      for (const x of [...c.off, ...c.clipped]) problems.push(`${name} layout: ${x}`);
      if (a.textPairs.length === 0) problems.push(`${name}: no text measured`);
      assert.deepEqual(page.__issues, [], name);
      await page.close();
    }
    assert.deepEqual(problems, []);
  });
}

test('roles: one polite live region, every control named, the ring hidden and not focusable, spots and chips grouped, dialogs modal', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: { 200: 25 }, chip: 25 });
  const a = await page.evaluate(aria);
  assert.deepEqual(a.lives, ['live'], 'the only live region');
  assert.equal(a.live.polite, 'polite');
  assert.deepEqual(a.noName, []);
  assert.equal(a.ringHidden, 'true');
  assert.equal(a.ringFocusable, 0);
  assert.deepEqual(a.groups, [['group', 'Tier bet spots'], ['radiogroup', 'Chip value']]);
  assert.ok(a.h1 >= 1);
  assert.match(await page.evaluate(() => document.querySelector('[data-id="tier-200"]').getAttribute('aria-label')), /^200x spot, 1 in 218\.3 per light, 1 square, your bet 25$/);
  assert.match(await page.evaluate(() => document.querySelector('#app > p.sr-only').textContent), /50 display squares/);
  await dispatch(page, { type: 'OPEN_INFO', tab: 'paytable' });
  const d = await page.evaluate(() => ({
    ...JSON.parse(JSON.stringify(document.querySelector('#r-modal [role="dialog"]') ? { modal: document.querySelector('#r-modal [role="dialog"]').getAttribute('aria-modal') } : {})),
    tablist: document.querySelector('[role="tablist"]').getAttribute('aria-label'),
    panel: document.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby'),
    controls: document.getElementById('tab-paytable').getAttribute('aria-controls'),
    panelId: document.querySelector('[role="tabpanel"]').id,
    inert: document.getElementById('r-centre').inert,
  }));
  assert.deepEqual(d, { modal: 'true', tablist: 'Game info sections', panel: 'tab-paytable', controls: 'info-panel', panelId: 'info-panel', inert: true });
  await finish(page);
});

test('live region: a win, a no-win on a blank, and a no-win on a tier with no bet', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: BETS, chip: 25 });
  await playTo(page, 8);
  assert.equal(await live(page), 'Light stopped on square 8, 200x. Won 5,000. Collect or gamble.');
  await dispatch(page, { type: 'COLLECT' });
  await waitPhase(page, 'BETTING');
  await settle(page);
  await playTo(page, 30, null, 'BETTING');
  assert.equal(await live(page), 'Light stopped on square 30, a blank square. No win. Your bets are kept.');
  await setup(page, { balance: 10000, history: [], bets: { 20: 5 }, chip: 5 });
  await playTo(page, 6, null, 'BETTING');
  assert.equal(await live(page), 'Light stopped on square 6, 5x. No bet on 5x. No win. Your bets are kept.');
  await finish(page);
});

test('live region: Double Run says both lights, a double hit is named, and the first light is said while the second runs', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: BETS, chip: 25 });
  await recordLive(page);
  await playTo(page, 6, 24);
  assert.ok((await said(page)).includes('Double Run! Light 1 stopped on square 6, 5x, pays 500. A second light is running.'), 'first light');
  assert.equal(await live(page), 'Double Run. Light 1 stopped on square 6, 5x, pays 500. Light 2 stopped on square 24, 10x, pays 500. Won 1,000. Collect or gamble.');
  await dispatch(page, { type: 'COLLECT' });
  await waitPhase(page, 'BETTING');
  await settle(page);
  await playTo(page, 6, 7);
  assert.equal(await live(page), 'Double Run. Double hit on 5x, both lights pay. Light 1 stopped on square 6, 5x, pays 500. Light 2 stopped on square 7, 5x, pays 500. Won 1,000. Collect or gamble.');
  await finish(page);
});

test('live region: gamble opened, flipping, won and lost, and collected', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: BETS, chip: 25 });
  await recordLive(page);
  await playTo(page, 13);
  await dispatch(page, { type: 'GAMBLE_OPEN' });
  await dispatch(page, { type: 'PICK', colour: 'red' });
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('red'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => !window.__rl.game.state.gamble.revealing);
  await settle(page);
  const after1 = await said(page);
  assert.ok(after1.includes('Double or nothing. Pick red or white, then gamble.'));
  assert.ok(after1.includes('Flipping. If red lights, your win doubles.'));
  assert.equal(await live(page), 'Gamble won. Match, red lit. Your win is now 1,000. Gamble again or collect.');
  await page.evaluate(() => window.__rl.game.test.forceNextGamble('white'));
  await dispatch(page, { type: 'GAMBLE_FLIP' });
  await page.waitForFunction(() => window.__rl.app.ui.gambleLoss);
  assert.equal(await live(page), 'Gamble lost. No match, white lit and your pick was red. The 1,000 win is gone. Your credits stay at 9,800.');
  await finish(page);
});

test('live region: collecting says the amount, and a win over the gamble limit does not offer the gamble', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: { 200: 1000 }, chip: 500 });
  await playTo(page, 8);
  assert.equal(await live(page), 'Light stopped on square 8, 200x. Won 200,000. Collect your win.');
  await dispatch(page, { type: 'COLLECT' });
  assert.match(await live(page), /^200,000 collected\. Added to your credits: 9,000 to 209,000\.$/);
  await finish(page);
});

test('prefers-reduced-motion: wins over a saved "off", locks the Settings switch, no count-up, no running animations, light <= 0.8 s', async () => {
  const page = await open({
    reducedMotion: true, timeScale: 1,
    presetStorage: { 'rl.v5.settings': JSON.stringify({ mute: true, reducedMotion: false, music: 60, sfx: 80 }) },
  });
  assert.equal((await state(page)).settings.reducedMotion, false, 'saved choice is kept, not overwritten');
  assert.ok(await page.evaluate(() => document.getElementById('app').classList.contains('reduced')));
  await dispatch(page, { type: 'OPEN_INFO', tab: 'settings' });
  assert.deepEqual(await page.evaluate(() => {
    const t = document.querySelector('[data-id="tg-rm"]');
    return [t.getAttribute('aria-checked'), t.getAttribute('aria-disabled'), t.closest('.srow').textContent];
  }), ['true', 'true', 'Reduced motionOn: follows your system setting']);
  await dispatch(page, { type: 'CLOSE_INFO' });
  await setup(page, { balance: 10000, history: [], bets: { 20: 5 }, chip: 5 });
  await force(page, 13);
  const run = await timeToPhase(page, 'RESOLVING');
  assert.ok(run.ms <= 800 + run.maxGap + 100, `light took ${run.ms} ms (longest frame ${run.maxGap} ms)`);
  assert.equal(await page.evaluate(() => window.__rl.app.ui.displayBalance), null, 'no credits count-up');
  await waitPhase(page, 'GAMBLE_OFFER');
  await settle(page);
  assert.deepEqual(await page.evaluate(() => document.getAnimations().map((a) => a.animationName || a.transitionProperty)), [], 'nothing animating on the result');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.tile.trail1, .tile.trail2').length), 0);
  await finish(page);
});

test('prefers-reduced-motion: changing the system setting takes effect at once; without it the Settings switch still works', async () => {
  const page = await open();
  const has = () => page.evaluate(() => document.getElementById('app').classList.contains('reduced'));
  assert.equal(await has(), false);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => document.getElementById('app').classList.contains('reduced'));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await page.waitForFunction(() => !document.getElementById('app').classList.contains('reduced'));
  await dispatch(page, { type: 'OPEN_INFO', tab: 'settings' });
  assert.equal(await page.evaluate(() => document.querySelector('[data-id="tg-rm"]').getAttribute('aria-disabled')), null);
  await clickId(page, 'tg-rm');
  assert.equal(await has(), true);
  await finish(page);
});

test('keyboard: chips have one tab stop and arrows move the selection; Tab reaches the spots; Enter bets; keys 1-7 pick a chip', async () => {
  const page = await open();
  await setup(page, { balance: 10000, history: [], bets: {}, chip: 25 });
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.chip')].filter((c) => c.tabIndex === 0).map((c) => c.dataset.id)), ['chip-25']);
  await page.evaluate(() => window.__rl.app.focusId('chip-25'));
  await page.keyboard.press('ArrowRight');
  assert.equal((await state(page)).chip, 50);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'chip-50');
  await page.keyboard.press('ArrowLeft');
  assert.equal((await state(page)).chip, 25);
  await page.keyboard.press('1');
  assert.equal((await state(page)).chip, 1);
  await page.evaluate(() => window.__rl.app.focusId('tier-200'));
  await page.keyboard.press('Enter');
  assert.deepEqual((await state(page)).bets, { 200: 1 });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.id), 'tier-100');
  // a visible ring on the focused control, for keyboard users
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).boxShadow), 'none');
  await finish(page);
});
