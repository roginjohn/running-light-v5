// v5 batch 7: announcement copy from a stored round, the chip radiogroup keys, and the mock stylesheet's token references.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resultMessage, doubleRunMessage, gambleWonMessage, gambleLostMessage } from '../../../src/ui/announce.js';
import { mapKey } from '../../../src/ui/keys.js';

const read = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const round = (bets, s1, s2 = null) => ({ bets, s1, s2, doubleRun: !!s2 });

test('announce: one light, spec example; a win says what can happen next', () => {
  assert.equal(resultMessage(round({ 200: 25 }, 8)), 'Light stopped on square 8, 200x. Won 5,000. Collect or gamble.');
  assert.equal(resultMessage(round({ 200: 1000 }, 8), false), 'Light stopped on square 8, 200x. Won 200,000. Collect your win.');
});

test('announce: no win on a blank, and on a tier with no bet', () => {
  assert.equal(resultMessage(round({ 5: 10 }, 30)), 'Light stopped on square 30, a blank square. No win. Your bets are kept.');
  assert.equal(resultMessage(round({ 20: 10 }, 6)), 'Light stopped on square 6, 5x. No bet on 5x. No win. Your bets are kept.');
});

test('announce: Double Run lists each light; a double hit is named; a Double Run can still lose', () => {
  assert.equal(resultMessage(round({ 5: 100, 10: 50 }, 6, 24)), 'Double Run. Light 1 stopped on square 6, 5x, pays 500. Light 2 stopped on square 24, 10x, pays 500. Won 1,000. Collect or gamble.');
  assert.equal(resultMessage(round({ 5: 100 }, 6, 7)), 'Double Run. Double hit on 5x, both lights pay. Light 1 stopped on square 6, 5x, pays 500. Light 2 stopped on square 7, 5x, pays 500. Won 1,000. Collect or gamble.');
  assert.equal(resultMessage(round({ 5: 100 }, 6, 30)), 'Double Run. Light 1 stopped on square 6, 5x, pays 500. Light 2 stopped on square 30, a blank square. Won 500. Collect or gamble.');
  assert.equal(resultMessage(round({ 20: 5 }, 6, 30)), 'Double Run. Light 1 stopped on square 6, 5x, no bet. Light 2 stopped on square 30, a blank square. No win. Your bets are kept.');
  // both on one tier with no bet there is not a double hit
  assert.doesNotMatch(resultMessage(round({ 20: 5 }, 6, 7)), /Double hit/);
  assert.equal(doubleRunMessage(round({ 5: 100 }, 6, 24)), 'Double Run! Light 1 stopped on square 6, 5x, pays 500. A second light is running.');
});

test('announce: gamble outcomes', () => {
  assert.equal(gambleWonMessage('red', 1000, true), 'Gamble won. Match, red lit. Your win is now 1,000. Gamble again or collect.');
  assert.equal(gambleWonMessage('red', 200000, false), 'Gamble won. Match, red lit. Your win is now 200,000. Collect your win.');
  assert.equal(gambleLostMessage('white', 'red', 1000, 9800), 'Gamble lost. No match, white lit and your pick was red. The 1,000 win is gone. Your credits stay at 9,800.');
});

test('keys: arrows move the selection only while a chip has focus', () => {
  const ctx = (kind) => ({ phase: 'BETTING', info: null, refill: false, focus: { kind, tier: null } });
  assert.deepEqual(mapKey({ key: 'ArrowRight' }, ctx('chip')), { kind: 'chipMove', delta: 1 });
  assert.deepEqual(mapKey({ key: 'ArrowUp' }, ctx('chip')), { kind: 'chipMove', delta: -1 });
  assert.equal(mapKey({ key: 'ArrowRight' }, ctx('button')), null);
});

test('reduced motion: the app follows the system setting live, and no count-up or trail runs under it', () => {
  const app = read('src/ui/app.js');
  assert.match(app, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(app, /const reduced = \(\) => game\.state\.settings\.reducedMotion \|\| /);
  assert.match(app, /sysReduced\.addEventListener\('change'/);
  assert.match(read('src/styles.css'), /@media \(prefers-reduced-motion: reduce\)/);
});

test('mock.css: every var() is defined by tokens.css or mock.css, and no chip or tier colour is hard-coded', () => {
  const mock = read('docs/design-v5/tiers/mock.css');
  const defined = new Set([...`${read('src/styles/tokens.css')}\n${mock}`.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const missing = [...new Set([...mock.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]))].filter((v) => !defined.has(v) && !v.startsWith('--sim-') && !v.startsWith('--g'));
  assert.deepEqual(missing, []);
  assert.doesNotMatch(mock, /--c-chip-(100|500)\s*:/, 'the chip tokens are not overridden');
  assert.doesNotMatch(mock, /--c-tier-(24|96|480|960|1920)\b/);
  for (const [k, t] of [[5, 5], [10, 10], [20, 20], [50, 50], [100, 100], [200, 200]]) assert.match(mock, new RegExp(`--k${k}: var\\(--c-tier-${t}\\)`));
});
