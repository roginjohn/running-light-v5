// v5 §6 gamble cap at 300,000 (dev spec §2.4, §5.5). Unskipped in batch 2. Gamble flow is unchanged from v3.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

test('gamble: offered on a win of 300,000 or less, blocked above', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  assert.equal(gambleBlockReason(1, 0), null);
  assert.equal(gambleBlockReason(C.GAMBLE_CAP, 0), null);
  assert.notEqual(gambleBlockReason(C.GAMBLE_CAP + 1, 0), null);
  assert.notEqual(gambleBlockReason(0, 0), null, 'nothing to gamble');
});

test('gamble: at most 3 gambles per win', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  for (let used = 0; used < C.MAX_GAMBLES; used++) assert.equal(gambleBlockReason(100, used), null, `used ${used}`);
  assert.notEqual(gambleBlockReason(100, C.MAX_GAMBLES), null);
});

test('gamble: a 200,000 max win can be gambled once (400,000 > cap blocks the next)', async () => {
  const { gambleBlockReason } = await import('../../../src/engine/outcome.js');
  assert.equal(gambleBlockReason(C.MAX_WIN, 0), null);
  assert.notEqual(gambleBlockReason(2 * C.MAX_WIN, 1), null);
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
