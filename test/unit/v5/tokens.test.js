// v5 §6 tokens: contrast ratios for the tier, chip and blank tokens (dev spec §3.4–3.5, §4). Unskipped in batch 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../../fixtures/math-c.js';

const gen = () => import('../../../scripts/gen-tokens.js');
const tokens = async () => {
  const { TOKENS_PATH } = await gen();
  return JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
};

test('tokens: every tier has its own --tier-N colour', async () => {
  const T = await tokens();
  for (const t of C.TIERS) assert.ok(T.color[`tier-${t}`], `tier-${t}`);
  const fills = C.TIERS.map((t) => JSON.stringify(T.color[`tier-${t}`]));
  assert.equal(new Set(fills).size, C.TIERS.length, 'each tier has a distinct token');
});

test('tokens: tier, blank and chip contrast pairs are listed and meet AA (4.5:1 text, 3:1 UI)', async () => {
  const { contrastChecks } = await gen();
  const T = await tokens();
  const checks = contrastChecks(T);
  const needed = [...C.TIERS.map((t) => `tier-${t}`), 'tile-blank', 'chip-100', 'chip-500'];
  for (const name of needed) {
    const mine = checks.filter((c) => c.name.includes(name));
    assert.ok(mine.length > 0, `no contrast pair for ${name}`);
    for (const c of mine) {
      assert.ok(c.pass, `${c.name}: ${c.ratio} < ${c.need}`);
      assert.ok(c.need >= C.CONTRAST_MIN.ui);
    }
  }
});

test('tokens: the 100 and 500 chip fills are tokens and pass 4.5:1 against their label', async () => {
  const { contrastChecks } = await gen();
  const T = await tokens();
  for (const chip of [100, 500]) {
    assert.ok(T.color[`chip-${chip}`], `chip-${chip}`);
    const text = contrastChecks(T).filter((c) => c.name.includes(`chip-${chip}`) && c.kind !== 'ui');
    assert.ok(text.length > 0);
    for (const c of text) assert.ok(c.ratio >= C.CONTRAST_MIN.text, `${c.name}: ${c.ratio}`);
  }
});

test('tokens: the chip fills match the fixture; blank square label and edge are checked on its hatch stripes too', async () => {
  const { contrastChecks } = await gen();
  const T = await tokens();
  for (const chip of [100, 500]) assert.equal(T.color[`chip-${chip}`], C.CHIP_FILLS[chip]);
  const names = contrastChecks(T).map((c) => c.name);
  assert.ok(names.some((n) => /text-muted.*tile-blank-hatch/.test(n)));
  assert.ok(names.some((n) => /tile-blank-edge.*tile-blank-hatch/.test(n)));
  for (const bg of ['bg-rail', 'bg-frame', 'bg-bottombar']) for (const chip of [100, 500]) assert.ok(names.includes(`chip-${chip} fill vs ${bg}`));
});

test('tokens: the old v3 tier tokens (24 … 1920) are gone', async () => {
  const T = await tokens();
  for (const t of [24, 96, 480, 960, 1920]) assert.equal(T.color[`tier-${t}`], undefined, `tier-${t}`);
});
