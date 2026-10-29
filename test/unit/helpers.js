import { createGame } from '../../src/engine/game.js';
import { createSeededRng, makeRng } from '../../src/engine/rng.js';
import { memoryBackend } from '../../src/engine/storage.js';

let n = 0;
export function newGame({ seed = 12345, backend = memoryBackend(), rng, persistent = true, ...rest } = {}) {
  const g = createGame({
    rng: rng || createSeededRng(seed),
    backend,
    persistent,
    testMode: true,
    now: () => 1_700_000_000_000 + n,
    idGen: () => `t${++n}`,
    ...rest,
  });
  g.init();
  return { g, backend };
}

/** Scripted RNG: returns queued randInt results (validated against n). */
export function scriptedRng(values) {
  const q = values.slice();
  return {
    randInt(nn) {
      if (!q.length) throw new Error('scripted rng exhausted');
      const v = q.shift();
      if (!(v >= 0 && v < nn)) throw new Error(`scripted value ${v} out of range for ${nn}`);
      return v;
    },
    remaining: () => q.length,
  };
}

/** Place the current chip on a tier spot (5, 10, 20, 50, 100, 200) `times` times. */
export function bet(g, tier, times = 1) {
  for (let i = 0; i < times; i++) g.dispatch({ type: 'ADD_BET', tier });
}

/** r value whose weightedPick lands on square s (first cumulative slot). */
export { makeRng };
