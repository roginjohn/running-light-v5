// v3 rail controls (batch 3): "Last bets" round totals, rail sizes from the tokens, flat Start/Collect colours, and Plus Jakarta Sans fully removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { recordTotal, loadTotals, saveTotals, BET_TOTALS_KEY } from '../../src/ui/bettotals.js';
import { computeLayout } from '../../src/ui/layout.js';
import { SPOT_ORDER, lightOdds } from '../../src/ui/track.js';
import { mapKey } from '../../src/ui/keys.js';
import { CHIPS } from '../../src/engine/config.js';
import { memoryBackend } from '../../src/engine/storage.js';

const DOC = JSON.parse(readFileSync(new URL('../../docs/design-v3/tokens.json', import.meta.url), 'utf8'));
const STYLES = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const i = STYLES.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule ${sel}`);
  return STYLES.slice(i, STYLES.indexOf('}', i));
};

// ------------------------------------------------------------------ last bets
test('last bets: round totals newest first, at most 5, a roundId is counted once', () => {
  let l = [];
  for (const [id, t] of [['a', 10], ['b', 30], ['c', 15], ['d', 20], ['e', 20], ['f', 40]]) l = recordTotal(l, id, t);
  assert.deepEqual(l.map((e) => e.t), [40, 20, 20, 15, 30]);
  assert.equal(recordTotal(l, 'f', 40), l, 'same round again: unchanged');
  assert.equal(recordTotal(l, 'g', 0), l, 'no bet: unchanged');
});

test('last bets persist in their own storage key; unreadable data is ignored', () => {
  const be = memoryBackend();
  saveTotals(be, [{ id: 'r1', t: 20 }]);
  assert.deepEqual(loadTotals(be), [{ id: 'r1', t: 20 }]);
  be.setItem(BET_TOTALS_KEY, '{oops');
  assert.deepEqual(loadTotals(be), []);
  be.setItem(BET_TOTALS_KEY, JSON.stringify([{ id: 'x', t: -3 }]));
  assert.deepEqual(loadTotals(be), []);
  assert.ok(!BET_TOTALS_KEY.startsWith('rl.v1.'), 'not one of the engine keys');
});

// ------------------------------------------------------------------ sizes and look
test('v5 rail sizes: 320 px rail, 56 px chips, secondary 52 (44 at 1280), primary 60 (52 at 1280); tablets keep the v3 tokens; phones 44 px chips', () => {
  const xl = computeLayout(1920, 1080).rail, d = computeLayout(1280, 720).rail, tl = computeLayout(1024, 768).rail, t = computeLayout(768, 1024).dock, p = computeLayout(360, 640).dock;
  assert.deepEqual([xl.w, xl.chip, xl.actH, xl.mainH, xl.pad, xl.gapY], [320, 56, 52, 60, 20, 12]);
  assert.deepEqual([d.w, d.chip, d.actH, d.mainH, d.pad], [320, 56, 44, 52, 16]);
  assert.deepEqual([tl.w, tl.chip, tl.actH], [DOC.size['rail-width'], DOC.size.chip, DOC.size['button-secondary-height']]);
  assert.deepEqual([t.chip, t.actH, t.mainH], [44, 44, 56]); // v5 batch 8: 44 px tap targets (dev spec §4), up from v3's chip-768 of 40
  assert.deepEqual([p.chip, p.actH, p.mainH], [44, 52, 52]);
});

test('Start is accent-blue with white text, Collect accent-green with dark text; no amber/light-blue gradients', () => {
  const pri = rule('.btn:is(.cta, .pri, .gam, .collect)');
  assert.match(pri, /background: var\(--c-accent-blue\)/);
  assert.match(pri, /color: var\(--c-text-strong\)/);
  const col = rule('.btn.collect');
  assert.match(col, /background: var\(--c-accent-green\)/);
  assert.match(col, /color: var\(--c-text-on-green\)/);
  assert.doesNotMatch(STYLES, /\.btn\.cta \{[^}]*amber/);
  assert.doesNotMatch(STYLES, /--sh-cta/);
});

test('no glows or shadows on the rail controls', () => {
  for (const sel of ['.rail, .dock', '.tbet', '.spot', '.spot.has', '.spot.won', '.btn', '.btn.sec', '.chip', '.chip.sel::after', '.rnote', '.lb', '.lb.new', '.credits']) {
    assert.doesNotMatch(rule(sel), /box-shadow|text-shadow|filter|gradient/, sel);
  }
  assert.doesNotMatch(STYLES, /\.chip\.sel \{[^}]*transform/, 'no chip lift');
});

test('tier spots: ordered 200x to 5x, with the exact chance per light from tiers/SPEC.md §1', () => {
  assert.deepEqual(SPOT_ORDER, [200, 100, 50, 20, 10, 5]);
  assert.deepEqual(SPOT_ORDER.map(lightOdds), ['1 in 218.3', '1 in 109.1', '1 in 54.56', '1 in 21.83', '1 in 10.91', '1 in 5.46']);
});

test('keys 1-7 pick the seven chips; R does nothing while betting (no Rebet), and stays Red in the gamble', () => {
  for (const [i, v] of CHIPS.entries()) assert.deepEqual(mapKey({ key: String(i + 1) }, { phase: 'BETTING' }).action, { type: 'SELECT_CHIP', value: v });
  assert.equal(CHIPS.length, 7);
  assert.equal(mapKey({ key: '8' }, { phase: 'BETTING' }), null);
  assert.equal(mapKey({ key: 'r' }, { phase: 'BETTING' }), null);
  assert.deepEqual(mapKey({ key: 'r' }, { phase: 'GAMBLE' }).action, { type: 'PICK', colour: 'red' });
});

test('touch screens hide the shortcut list', () => {
  assert.match(STYLES, /@media \(hover: none\) and \(pointer: coarse\) \{\s*\.keylist, \.gk \{ display: none; \}/);
});

test('Plus Jakarta Sans is gone: no font file, @font-face, preload, licence, copy step or dependency', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  assert.deepEqual(readdirSync(new URL('../../src/assets/fonts/', import.meta.url)).filter((f) => /jakarta/i.test(f)), []);
  assert.equal(existsSync(new URL('../../public/fonts/LICENSE-PlusJakartaSans-OFL.txt', import.meta.url)), false);
  assert.equal(existsSync(new URL('../../src/assets/v2/chips', import.meta.url)) && readdirSync(new URL('../../src/assets/v2/chips', import.meta.url)).length > 0, false, 'v2 chip SVGs removed');
  for (const f of ['src/styles.css', 'src/main.js', 'scripts/copy-v2-assets.js', 'scripts/copy-v3-fonts.js', 'package.json', 'src/ui/icons.js']) {
    assert.doesNotMatch(read(f).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''), /jakarta/i, f);
  }
});
