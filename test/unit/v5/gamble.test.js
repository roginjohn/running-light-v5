// v5 §6 gamble cap at 300,000 (dev spec §2.4, §5.5). Unskipped in batch 2. Gamble flow is unchanged from v3.
// A gamble may never produce a win above the cap: offered only while win × 2 <= 300,000 (win <= 150,000).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

test('gamble: offered only while the doubled win is within the 300,000 cap (win <= 150,000)', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  assert.equal(gambleBlockReason(1, 0), null);
  assert.equal(gambleBlockReason(C.GAMBLE_CAP / 2, 0), null, '150,000 -> 300,000 is allowed');
  assert.equal(gambleBlockReason(C.GAMBLE_CAP / 2 + 1, 0), 'cap');
  assert.equal(gambleBlockReason(C.GAMBLE_CAP, 0), 'cap');
  assert.equal(gambleBlockReason(0, 0), 'nowin', 'nothing to gamble');
});

test('gamble: at most 3 gambles per win', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  for (let used = 0; used < C.MAX_GAMBLES; used++) assert.equal(gambleBlockReason(100, used), null, `used ${used}`);
  assert.equal(gambleBlockReason(100, C.MAX_GAMBLES), 'max');
});

test('gamble: the 200,000 max win is not gambleable (400,000 would exceed the cap)', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  assert.equal(gambleBlockReason(C.MAX_WIN, 0), 'cap');
});

test('gamble: 100,000 can gamble once to 200,000, then not again', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  assert.equal(gambleBlockReason(100000, 0), null);
  assert.equal(gambleBlockReason(200000, 1), 'cap');
});

test('gamble: no win reachable through gambling ever exceeds the cap', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  for (const base of [1, 37, 1000, 37500, 75000, 100000, 150000, 200000]) {
    let win = base, used = 0;
    while (gambleBlockReason(win, used) === null) { win *= 2; used++; }
    assert.ok(win === base || win <= C.GAMBLE_CAP, `${base} -> ${win}`);
    assert.ok(used <= C.MAX_GAMBLES);
  }
});

test('gamble: the 50/50 draw is unchanged (seeded, roughly even)', async () => {
  const { gambleDraw } = await import('../../../src/engine/outcome.js');
  const { createSeededRng } = await import('../../../src/engine/rng.js');
  const rng = createSeededRng(99);
  const N = 100_000;
  const counts = {};
  for (let k = 0; k < N; k++) { const c = gambleDraw(rng); counts[c] = (counts[c] || 0) + 1; }
  const v = Object.values(counts);
  assert.equal(v.length, 2);
  assert.ok(Math.abs(v[0] - N / 2) <= 4 * Math.sqrt(N / 4));
});
