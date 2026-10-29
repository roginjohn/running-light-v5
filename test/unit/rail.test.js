// v3 rail controls (batch 3): 1/2 and x2 scaling clamped to the locked engine limits (v5: 1-1,000 per tier,
// 1,000 per round, the balance; bets keyed by tier through the Batch 2 adapter), "Last bets" round totals, rail
// sizes from the tokens, flat Start/Collect colours, and Plus Jakarta Sans fully removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { halveBets, doubleBets } from '../../src/ui/betscale.js';
import { recordTotal, loadTotals, saveTotals, BET_TOTALS_KEY } from '../../src/ui/bettotals.js';
import { computeLayout } from '../../src/ui/layout.js';
import { totalOf, validBets } from '../../src/engine/bets.js';
import { MAX_PER_TIER, MAX_PER_ROUND, TIERS } from '../../src/engine/config.js';
import { memoryBackend } from '../../src/engine/storage.js';
import * as C from '../fixtures/math-c.js';

const DOC = JSON.parse(readFileSync(new URL('../../docs/design-v3/tokens.json', import.meta.url), 'utf8'));
const STYLES = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const i = STYLES.indexOf(`${sel} {`);
  assert.ok(i >= 0, `rule ${sel}`);
  return STYLES.slice(i, STYLES.indexOf('}', i));
};
/** v on each of the first n tiers. */
const even = (n, v) => Object.fromEntries(TIERS.slice(0, n).map((t) => [t, v]));

// ------------------------------------------------------------------ 1/2 and x2
test('engine limits used by 1/2 and x2 are the v5 limits (1-1,000 per tier, 1,000 per round)', () => {
  assert.equal(MAX_PER_TIER, C.MAX_PER_TIER);
  assert.equal(MAX_PER_ROUND, C.MAX_PER_ROUND);
});

test('x2 doubles every tier bet and the total when nothing is capped', () => {
  const b = { 5: 20, 10: 10, 20: 50, 50: 20, 200: 4 };
  const r = doubleBets(b, 10000);
  assert.deepEqual(r.bets, { 5: 40, 10: 20, 20: 100, 50: 40, 200: 8 });
  assert.equal(totalOf(r.bets), 2 * totalOf(b));
  assert.equal(r.changed, true);
  assert.equal(r.limit, null);
  assert.deepEqual(b, { 5: 20, 10: 10, 20: 50, 50: 20, 200: 4 }, 'input not mutated');
});

test('x2 clamps each tier to 1,000 (limit "tier")', () => {
  const r = doubleBets({ 5: 600 }, 10000);
  assert.deepEqual(r.bets, { 5: 1000 });
  assert.equal(r.limit, 'tier');
  const full = doubleBets({ 5: 1000 }, 10000);
  assert.equal(full.changed, false, 'at 1,000: nothing to double');
  assert.equal(full.limit, 'tier');
});

test('x2 clamps the round to 1,000 and shares the room evenly in tier order (limit "round")', () => {
  const r = doubleBets(even(6, 100), 10000); // 600 -> would be 1,200
  assert.equal(totalOf(r.bets), 1000);
  assert.equal(r.limit, 'round');
  assert.deepEqual(r.bets, { 5: 167, 10: 167, 20: 167, 50: 167, 100: 166, 200: 166 });
  assert.ok(validBets(r.bets), 'engine accepts the result');
  const atCap = doubleBets(even(5, 200), 10000);
  assert.equal(atCap.changed, false, '1,000 already: no change');
});

test('x2 never goes over the balance (limit "credits")', () => {
  const r = doubleBets({ 5: 50, 10: 50, 20: 50 }, 250);
  assert.equal(totalOf(r.bets), 250);
  assert.deepEqual(r.bets, { 5: 84, 10: 83, 20: 83 });
  assert.equal(r.limit, 'credits');
  const broke = doubleBets({ 5: 50 }, 40); // bets left on the board after a loss can exceed the balance
  assert.equal(broke.changed, false);
  assert.equal(broke.limit, 'credits');
});

test('x2 result always respects every limit (exhaustive small cases)', () => {
  for (let n = 1; n <= 6; n++) {
    for (const v of [1, 3, 50, 100, 166, 500, 1000]) {
      if (n * v > MAX_PER_ROUND) continue;
      for (const bal of [0, 7, 600, 999, 1000, 10000]) {
        const r = doubleBets(even(n, v), bal);
        const t = totalOf(r.bets);
        assert.ok(Object.values(r.bets).every((x) => x >= 1 && x <= MAX_PER_TIER), 'per tier 1-1,000');
        assert.ok(t <= Math.max(MAX_PER_ROUND, n * v) && (t <= bal || !r.changed), `round/balance cap n=${n} v=${v} bal=${bal}`);
        assert.ok(t >= n * v, 'never lowers a bet');
        assert.ok(validBets(r.bets), 'engine accepts the result');
      }
    }
  }
});

test('1/2 halves every tier bet, rounding down, never below 1', () => {
  const r = halveBets({ 5: 1000, 10: 5, 20: 2, 50: 1 });
  assert.deepEqual(r.bets, { 5: 500, 10: 2, 20: 1, 50: 1 });
  assert.equal(r.changed, true);
  assert.equal(r.limit, null);
  const ones = halveBets({ 100: 1, 200: 1 });
  assert.equal(ones.changed, false, 'all at 1: nothing to halve');
  assert.deepEqual(halveBets({}).bets, {});
});

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
test('rail sizes follow the tokens: input 40, chip 34 (40 tablet), secondary 32, primary 52 / 48 at 1280 / 56 tablet', () => {
  const xl = computeLayout(1920, 1080).rail, d = computeLayout(1280, 720).rail, t = computeLayout(768, 1024).dock;
  assert.deepEqual([xl.inputH, xl.chip, xl.actH, xl.mainH, xl.pad, xl.gapY], [DOC.size['input-height'], DOC.size.chip, DOC.size['button-secondary-height'], DOC.size['button-primary-height'], 16, 12]);
  assert.deepEqual([d.mainH, d.pad], [48, 12]);
  assert.deepEqual([t.chip, t.mainH], [DOC.size['chip-768'], 56]);
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
  for (const sel of ['.rail, .dock', '.betin', '.btn', '.btn.sec', '.btn.sec.hi', '.chip', '.chip.sel::after', '.rnote', '.lb', '.lb.new', '.credits']) {
    assert.doesNotMatch(rule(sel), /box-shadow|text-shadow|filter|gradient/, sel);
  }
  assert.doesNotMatch(STYLES, /\.chip\.sel \{[^}]*transform/, 'no chip lift');
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
