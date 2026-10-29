// v5 §6 text: banned wording in the UI copy, help and paytable content (dev spec §3.8–3.9, §5.8). Skipped until batch 7.
// The engine is not scanned: its comments describe the gamble draw, not player-facing copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as C from '../../fixtures/math-c.js';

const SKIP = { skip: 'v5 batch 7' };
const ROOT = new URL('../../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
/** String literals and template text only, so identifiers and comments don't count. */
const literals = (src) => [...src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);

test('text: index.html and the src/ui copy contain no banned wording', SKIP, () => {
  const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(html, C.BANNED, 'index.html');
  for (const f of readdirSync(new URL('src/ui/', ROOT)).filter((x) => x.endsWith('.js'))) {
    for (const s of literals(read(`src/ui/${f}`))) assert.doesNotMatch(s, C.BANNED, `src/ui/${f}: "${s}"`);
  }
});

test('text: engine toasts contain no banned wording', SKIP, async () => {
  const { TOASTS } = await import('../../../src/engine/config.js');
  for (const s of Object.values(TOASTS)) assert.doesNotMatch(s, C.BANNED);
});

test('text: help and paytable say play credits only and show one 95.4% payback figure', SKIP, () => {
  const ui = readdirSync(new URL('src/ui/', ROOT)).filter((x) => x.endsWith('.js')).map((f) => read(`src/ui/${f}`)).join('\n');
  const copy = read('index.html') + ui;
  assert.match(copy, /play credits/i);
  assert.match(copy, /95\.4%/);
  assert.doesNotMatch(copy, /95\.3\d%/, 'one payback figure, not per-tier decimals');
  assert.match(copy, /30 tier \+ 20 blank = 50/);
  assert.match(copy, /not equally likely/i);
  assert.match(copy, /Blank square · no win · 20 of 50/);
});
