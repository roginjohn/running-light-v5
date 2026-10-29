// v5 §6 weighted draw, rejection sampler and Double Run (dev spec §2.2). Skipped until batch 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

const SKIP = { skip: 'v5 batch 2' };
const engine = async () => ({
  ...(await import('../../../src/engine/outcome.js')),
  ...(await import('../../../src/engine/rng.js')),
});

test('draw: seeded 1M weighted draws, every square within 4σ of its weight', SKIP, async () => {
  const { weightedPick, createSeededRng } = await engine();
  const rng = createSeededRng(20261029);
  const N = 1_000_000;
  const hits = new Array(51).fill(0);
  for (let k = 0; k < N; k++) hits[weightedPick(rng.randInt(C.TOTAL_WEIGHT))]++;
  for (let n = 1; n <= 50; n++) {
    const p = C.WEIGHTS[n] / C.TOTAL_WEIGHT;
    const sd = Math.sqrt(N * p * (1 - p));
    assert.ok(Math.abs(hits[n] - N * p) <= 4 * sd, `square ${n}: ${hits[n]} vs ${N * p}`);
  }
});

test('draw: weightedPick maps r = 0 … 10475 onto squares in proportion to the weights', SKIP, async () => {
  const { weightedPick } = await engine();
  const hits = new Array(51).fill(0);
  for (let r = 0; r < C.TOTAL_WEIGHT; r++) hits[weightedPick(r)]++;
  assert.deepEqual(hits, [...C.WEIGHTS]);
  assert.throws(() => weightedPick(C.TOTAL_WEIGHT));
});

test('draw: randInt(10476) rejects uint32 values at or above floor(2^32/10476)·10476 (no modulo bias)', SKIP, async () => {
  const { makeRng } = await engine();
  const limit = Math.floor(0x100000000 / C.TOTAL_WEIGHT) * C.TOTAL_WEIGHT;
  const q = [limit, 0xffffffff, limit - 1];
  const rng = makeRng(() => q.shift());
  assert.equal(rng.randInt(C.TOTAL_WEIGHT), (limit - 1) % C.TOTAL_WEIGHT);
  assert.equal(q.length, 0, 'both values in the biased tail were redrawn');
});

test('draw: Double Run is 1 in 25 and its second stop never equals the first', SKIP, async () => {
  const { drawRound, createSeededRng } = await engine();
  const rng = createSeededRng(7);
  const N = 200_000;
  let dr = 0;
  for (let k = 0; k < N; k++) {
    const r = drawRound(rng);
    if (r.doubleRun) {
      dr++;
      assert.ok(r.s2 >= 1 && r.s2 <= 50);
      assert.notEqual(r.s2, r.s1);
    } else assert.equal(r.s2, null);
  }
  const p = 1 / C.DOUBLE_RUN_ONE_IN;
  assert.ok(Math.abs(dr - N * p) <= 4 * Math.sqrt(N * p * (1 - p)), `double runs ${dr}`);
});

test('draw: production RNG uses crypto.getRandomValues', SKIP, async () => {
  const { createCryptoRng } = await engine();
  const orig = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  let calls = 0;
  globalThis.crypto.getRandomValues = (a) => { calls++; return orig(a); };
  try {
    createCryptoRng().randInt(C.TOTAL_WEIGHT);
  } finally {
    globalThis.crypto.getRandomValues = orig;
  }
  assert.ok(calls > 0);
});
