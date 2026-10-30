// v3 batch 7: performance and cleanup. The credits count-up writes text only inside a contained box, result states
// render in stages, the frame scheduler never runs twice per frame, the type warm-up uses the real templates, and the
// dead v2 assets, tokens and tools are gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const STYLES = read('src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
const APP = read('src/ui/app.js');
const rule = (sel) => ([...STYLES.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => m[1].trim() === sel) || [])[2] || '';

test('credits count-up: contained box, text-only paint, no region re-render per tween frame', () => {
  assert.match(rule('.credits'), /contain: size layout style/);
  assert.match(rule('.rail'), /contain: layout paint/);
  assert.doesNotMatch(APP, /render\(\['credits'\]\)/, 'no tween re-renders the credits region');
  // START (step + end), payout and refill steps, and render() after a credits rebuild
  assert.equal((APP.match(/paintCredits\(\);/g) || []).length, 5, 'START, payout and refill tweens paint text only');
  assert.match(read('src/ui/view.js'), /const bal = s\.balance;/, 'the region markup carries the settled balance');
});

test('result states render in stages; the scheduler requests one frame at a time', () => {
  // win offer, loss, gamble open, gamble loss, gamble match, payout end
  assert.equal((APP.match(/renderStaged\(\(\) =>/g) || []).length, 6);
  // the focus moves after a result happen inside the staged callbacks, never straight after a full render
  for (const at of ["focusId('btn-collect', true)", "focusId('btn-back', ui.ringOn)", "focusId('btn-start', false)"]) {
    const i = APP.indexOf(at);
    assert.ok(i > 0, at);
    assert.ok(APP.lastIndexOf('renderStaged(', i) > APP.lastIndexOf('render();', i), `${at} runs from a staged render`);
  }
  assert.match(APP, /if \(tasks\.size && !rafId\) rafId = requestAnimationFrame\(frame\)/);
  assert.match(APP, /const at = frames \+ \(inFrame \? 1 : 2\)/);
});

test('type warm-up box: laid out but never painted or hit; ids, roles and live regions stripped from the samples', () => {
  assert.match(rule('.warm'), /visibility: hidden/);
  assert.match(rule('.warm'), /contain: strict/);
  assert.match(rule('.warm'), /pointer-events: none/);
  assert.match(read('src/ui/view.js'), /replace\(\/ \(data-id\|data-role\|role\|aria-live\|tabindex\)="\[\^"\]\*"\/g, ''\)/);
  assert.match(APP, /box\.setAttribute\('aria-hidden', 'true'\);\s*box\.inert = true;/);
});

test('dead v2 assets, tokens and tools are gone', () => {
  const v2 = new URL('../../src/assets/v2/', import.meta.url);
  assert.deepEqual(readdirSync(v2).sort(), ['icons', 'ui']);
  assert.deepEqual(readdirSync(new URL('icons/', v2)).sort(), ['alert', 'check', 'gear', 'info', 'lock', 'mute', 'reload', 'sound', 'x'].map((n) => `icon-${n}.svg`));
  assert.deepEqual(readdirSync(new URL('ui/', v2)), ['star-1920.svg']);
  assert.equal(existsSync(new URL('../../test/ui/screenshots-v2.js', import.meta.url)), false);
  assert.doesNotMatch(read('package.json') + read('scripts/run-all.js'), /screenshots-v2/);
  const tokens = read('src/styles/tokens.css');
  for (const gone of ['--c-amber', '--c-cyan', '--c-pick-', '--c-bg-1:', '--c-bg-3:', '--c-bg-4:', '--c-focus:', '-edge:var(--c-tile', '-solid:', '--r-xl:', '--r-sheet:', '--z-tags:', '--z-celebration:']) assert.ok(!tokens.includes(gone), gone);
});
