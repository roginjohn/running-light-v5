// v5 "Last bets" storage: totals live in rl.v5.betTotals and start empty. Old rl.v3.betTotals (and every rl.v1.* key)
// is never read for display, written or removed. test/ui/ui.test.js checks the same on screen, including the seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryBackend } from '../../../src/engine/storage.js';
import { BET_TOTALS_KEY, loadTotals, saveTotals, recordTotal } from '../../../src/ui/bettotals.js';
import { newGame } from '../helpers.js';

const V3_KEY = 'rl.v3.betTotals';
// valid for the old reader, with spacing and key order JSON.stringify would not produce, so a rewrite would show
const V3_RAW = '[ {"t":777, "id":"old-1"},\n  {"t":40, "id":null} ]';
const OLD_SAVE = { [V3_KEY]: V3_RAW, 'rl.v1.balance': '{"v":500,"seq":2}', 'rl.v1.lastBets': '{"8":10}' };

/** Backend that records every read, write and remove. */
function spyBackend(initial) {
  const inner = memoryBackend(initial);
  const reads = [], writes = [];
  return {
    ...inner,
    getItem: (k) => { reads.push(k); return inner.getItem(k); },
    setItem: (k, v) => { writes.push(k); inner.setItem(k, v); },
    removeItem: (k) => { writes.push(k); inner.removeItem(k); },
    reads,
    writes,
  };
}
const assertOldKeysUntouched = (backend) => {
  for (const [k, v] of Object.entries(OLD_SAVE)) assert.equal(backend.dump()[k], v, `${k} byte-for-byte`);
};

test('bet totals: the storage key is rl.v5.betTotals', () => {
  assert.equal(BET_TOTALS_KEY, 'rl.v5.betTotals');
});

test('bet totals: a saved rl.v3.betTotals is ignored (totals start empty) and left untouched', () => {
  const backend = spyBackend(OLD_SAVE);
  assert.deepEqual(loadTotals(backend), []);
  assert.deepEqual(backend.reads, ['rl.v5.betTotals'], 'only the v5 key is read');
  assert.deepEqual(backend.writes, [], 'loading writes nothing');
  assertOldKeysUntouched(backend);
});

test('bet totals: new totals are written to rl.v5.betTotals only; old keys stay byte-for-byte', () => {
  const backend = spyBackend(OLD_SAVE);
  const list = recordTotal(loadTotals(backend), 'r1', 25);
  saveTotals(backend, list);
  assert.deepEqual(backend.writes, ['rl.v5.betTotals']);
  assert.deepEqual(JSON.parse(backend.getItem('rl.v5.betTotals')), [{ id: 'r1', t: 25 }]);
  assert.deepEqual(loadTotals(backend), [{ id: 'r1', t: 25 }], 'reads back only the new total');
  assertOldKeysUntouched(backend);
});

test('bet totals: the v1 -> v5 migration does not copy or touch rl.v3.betTotals', () => {
  const backend = spyBackend(OLD_SAVE);
  const { g } = newGame({ backend });
  assert.equal(g.state.lastBets, null, 'no v1 last bets to seed the totals from');
  assert.equal(backend.dump()['rl.v5.betTotals'], undefined);
  assert.deepEqual(backend.writes.filter((k) => !k.startsWith('rl.v5.')), []);
  assertOldKeysUntouched(backend);
});
