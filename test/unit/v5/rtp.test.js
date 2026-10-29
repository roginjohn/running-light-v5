// v5 §6 exact RTP enumeration per tier (dev spec §5.2). Skipped until batch 2.
// Brute force over every 1-light stop and every ordered Double Run pair i ≠ j, using the engine's own tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../fixtures/math-c.js';

const SKIP = { skip: 'v5 batch 2' };

test('rtp: exact per-tier payback from the engine tables is in [95.34%, 95.39%]', SKIP, async () => {
  const E = await import('../../../src/engine/config.js');
  const [lo, hi] = C.PAYBACK_RANGE_PCT;
  for (const t of C.TIERS) {
    const pct = 100 * C.exactPayback(t, E.WEIGHTS, E.MULT);
    assert.ok(pct >= lo && pct <= hi, `${t}x ${pct.toFixed(4)}%`);
    assert.ok(Math.abs(pct - C.EXACT_PAYBACK_PCT[t]) < 0.0005, `${t}x ${pct} vs MATH-SPEC-C ${C.EXACT_PAYBACK_PCT[t]}`);
  }
});

test('rtp: engine payout() agrees with the enumeration for a 1-credit bet on each tier', SKIP, async () => {
  const E = await import('../../../src/engine/config.js');
  const { payout } = await import('../../../src/engine/outcome.js');
  const W = E.TOTAL_WEIGHT;
  const dr = 1 / E.DOUBLE_RUN_ONE_IN;
  for (const t of C.TIERS) {
    const bets = { [t]: 1 };
    let e = 0;
    for (let i = 1; i <= 50; i++) {
      const pi = E.WEIGHTS[i] / W;
      e += pi * (1 - dr) * payout(bets, i);
      for (let j = 1; j <= 50; j++) if (j !== i) e += pi * dr * (E.WEIGHTS[j] / (W - E.WEIGHTS[i])) * payout(bets, i, j);
    }
    assert.ok(Math.abs(e - C.exactPayback(t)) < 1e-12, `${t}x ${e}`);
  }
});

test('rtp: pRoundTier matches the enumerated per-round hit chance', SKIP, async () => {
  const E = await import('../../../src/engine/config.js');
  const W = E.TOTAL_WEIGHT;
  const dr = 1 / E.DOUBLE_RUN_ONE_IN;
  for (const t of C.TIERS) {
    let p = 0;
    for (let i = 1; i <= 50; i++) {
      const pi = E.WEIGHTS[i] / W;
      if (E.MULT[i] === t) { p += pi; continue; }
      for (let j = 1; j <= 50; j++) if (j !== i && E.MULT[j] === t) p += pi * dr * (E.WEIGHTS[j] / (W - E.WEIGHTS[i]));
    }
    assert.ok(Math.abs(E.pRoundTier(t) - p) < 1e-12, `${t}x`);
  }
});
