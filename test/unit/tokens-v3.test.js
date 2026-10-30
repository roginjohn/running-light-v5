// v3 design tokens: every WCAG contrast pair passes (recomputed), the v3 sections match docs/design-v3/tokens.json,
// board arrangement matches config.js, the generated tokens.css is in sync with the JSON, and every token variable
// the components use is defined.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { contrastChecks, tokensCss, TOKENS_PATH } from '../../scripts/gen-tokens.js';
import { assertArrangement } from '../../src/engine/config.js';

const T = JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
const DOC = JSON.parse(readFileSync(new URL('../../docs/design-v3/tokens.json', import.meta.url), 'utf8'));
const CSS = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');

test('v3 contrast pairs (tokens.md §1 + legacy v2 names) all meet their WCAG ratio', () => {
  const checks = contrastChecks(T);
  assert.equal(checks.length, 89); // v5 batch 4: six tiers on each surface, plus blank and chip pairs; batch 5: tier spot pairs, faded spot pairs, Start hint
  for (const c of checks) assert.ok(c.pass, `${c.name}: ${c.ratio} < ${c.need}`);
});

test('v3 colour, font, type, space, radius and border match docs/design-v3/tokens.json', () => {
  for (const k of ['font', 'type', 'space', 'radius', 'border', 'shadow', 'paytable', 'rules']) assert.deepEqual(T[k], DOC[k], k);
  // v5 batch 4: the v3 tier colours became six v5 tiers; blank square and 100 / 500 chip tokens were added; batch 5: the losing spot fade
  const v3Only = /^tier-(24|96|480|960|1920)$/, v5Only = /^(tier-(5|10|20|50|100|200)|tile-blank(-hatch|-edge)?|chip-(100|500)|spot-lost-opacity)$/;
  const keep = (o, drop) => Object.fromEntries(Object.entries(o).filter(([k]) => !drop.test(k)));
  assert.deepEqual(keep(T.color, v5Only), keep(DOC.color, v3Only), 'color');
});

test('board-arrangement equals the v5 Math C layout in config.js (counts 12/8/4/3/2/1 + 20 blank, weight 10,476)', () => {
  assert.equal(assertArrangement(T['board-arrangement']), true);
  assert.deepEqual(T['board-arrangement-check'], { counts: { 5: 12, 10: 8, 20: 4, 50: 3, 100: 2, 200: 1, blank: 20 }, totalWeight: 10476 });
});

test('src/styles/tokens.css is generated from the current tokens', () => {
  assert.equal(CSS, tokensCss(T));
});

test('every token variable used by the UI is defined in tokens.css', () => {
  const defined = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]));
  const files = ['../../src/styles.css', ...readdirSync(new URL('../../src/ui/', import.meta.url)).map((f) => `../../src/ui/${f}`)];
  const used = new Set();
  for (const f of files) for (const m of readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/var\((--(?:(?:c|r|sh|z|f|sp|fs|fw|lh|b|o)-[a-z0-9-]+|t\d+(?:-[a-z]+)?))\)/g)) used.add(m[1]);
  const missing = [...used].filter((v) => !defined.has(v));
  assert.deepEqual(missing, []);
});

test('v3 fonts: Poppins and JetBrains Mono, no v2 display font', () => {
  assert.match(CSS, /--f-sans:Poppins,/);
  assert.match(CSS, /--f-mono:"JetBrains Mono",/);
  assert.doesNotMatch(CSS, /Bungee|Plus Jakarta Sans/);
});

test('z-index: v3 z tokens emitted verbatim; extra layers never reuse a v3 name; styles.css uses only --z-* tokens', () => {
  assert.deepEqual(T.z, DOC.z);
  for (const [k, v] of Object.entries(T.z)) assert.match(CSS, new RegExp(`--z-${k}:${v};`));
  for (const k of Object.keys(T.legacy.z)) assert.ok(!(k in T.z), `legacy.z.${k} collides with v3 z`);
  const defs = [...CSS.matchAll(/^\s*--z-([a-z-]+):/gm)].map((m) => m[1]);
  assert.equal(new Set(defs).size, defs.length, 'each --z-* defined once');
  const z = { ...T.z, ...T.legacy.z };
  assert.ok(z.track < z['light-layer'] && z['light-layer'] < z.centre && z.centre < z.focus && z.focus < z.hud && z.hud < z.toast && z.toast < z.tooltip && z.tooltip < z.scrim && z.scrim < z.dialog && z.dialog < z.screen, 'stacking order');
  assert.ok(!('tags' in z) && !('celebration' in z), 'v2 WIN-tag and celebration layers removed (batch 7)');
  const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
  const levels = [...styles.matchAll(/^([^{}\n]*)\{[^}]*z-index:\s*([^;}]+)/gm)].filter((m) => !/var\(--z-/.test(m[2]));
  // numbers are allowed only inside a tile or history entry, which are their own stacking contexts
  assert.deepEqual(levels.map((m) => m[1].trim()).filter((sel) => !/^\.(tile|he) /.test(sel)), []);
});

test('no purple v2 tints left in styles.css', () => {
  const styles = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
  for (const c of ['#221C3E', '#2A2350', '#2E2752', '#3A2E40', '#2B2340', '#0F0C1E', '#241226', '#5A4F86', '#2A2342', '#3E3B50', '#8D8A99', '#4A3D45', 'rgba(10,8,21', 'rgba(19,16,36', 'rgba(28,23,52', 'rgba(47,40,82']) {
    assert.ok(!styles.includes(c), c);
  }
});
