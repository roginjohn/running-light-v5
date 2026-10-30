// v3 track and centre display (batch 4): the big multiplier, the running-light classes (a step changes at most 4
// tiles, by class only), the light CSS (transform/opacity only, no glows, no layout properties), the pitch
// formula from tokens.md §4, and the v2 bulb/centre rules gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bigMult, bigValue, lightClass } from '../../src/ui/track.js';
import { planFirstRunV2, planSecondRunV2, advance } from '../../src/ui/lightplan.js';
import { computeLayout } from '../../src/ui/layout.js';
import { MULT } from '../../src/engine/config.js';

const DOC = JSON.parse(readFileSync(new URL('../../docs/design-v3/tokens.json', import.meta.url), 'utf8'));
const STYLES = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const ui0 = () => ({ light1: null, light2: null, gambleLoss: null });
const round = (o) => ({ s1: 13, s2: null, bets: { 20: 5 }, doubleRun: false, ...o }); // v5: tier-keyed, #13 is 20x

test('big number: multiplier format 00.00 / 05.00 / 50.00 / 200.00', () => {
  assert.equal(bigMult(0), '00.00');
  assert.deepEqual([5, 10, 20, 50, 100, 200].map(bigMult), ['05.00', '10.00', '20.00', '50.00', '100.00', '200.00']);
});

test('big number: 00.00 while betting, the multiplier under the light while running, then the stop', () => {
  const ui = ui0();
  assert.equal(bigValue({ phase: 'BETTING', round: null }, ui), '00.00');
  // START dispatched but the first frame has not drawn the light yet: never leak the stored stop
  const r = round({ s1: 8 });
  assert.equal(bigValue({ phase: 'SPINNING', round: r }, ui), '00.00');
  for (const n of [1, 2, 3, 21, 8]) {
    ui.light1 = { idx: n, trail: null, level: null };
    assert.equal(bigValue({ phase: 'SPINNING', round: r }, ui), bigMult(MULT[n]), `light on #${n}`);
  }
  ui.light1 = null;
  assert.equal(bigValue({ phase: 'RESOLVING', round: r }, ui), '200.00');
  assert.equal(bigValue({ phase: 'GAMBLE_OFFER', round: round({ s1: 13 }) }, ui), '20.00');
  // a new round after the result: back to idle
  assert.equal(bigValue({ phase: 'BETTING', round: round({ s1: 13 }) }, ui), '00.00');
  // the second light wins over the first while it runs
  ui.light1 = { idx: 3, done: true };
  ui.light2 = { idx: 21, trail: null, level: null };
  assert.equal(bigValue({ phase: 'DOUBLE_RUN', round: round({ s1: 3, s2: 21, doubleRun: true }) }, ui), '100.00');
});

test('light classes: lit, two trail steps, landing, reduced-motion fade levels, second light', () => {
  const ui = ui0();
  ui.light1 = { idx: 30, trail: [29, 28], level: null };
  assert.deepEqual([30, 29, 28, 27, 31].map((n) => lightClass(n, ui)), ['lit', 'trail1', 'trail2', null, null]);
  ui.light1 = { idx: 30, trail: null, level: null, done: true };
  assert.equal(lightClass(30, ui), 'lit land', 'the landing square is marked once the run stops');
  ui.light1 = { idx: 30, trail: null, level: 0.3 };
  assert.equal(lightClass(30, ui), 'lvl1');
  ui.light1 = { idx: 30, trail: null, level: 0.7 };
  assert.equal(lightClass(30, ui), 'lvl2');
  ui.light1 = { idx: 3, done: true };
  ui.light2 = { idx: 21, trail: [20, 19] };
  assert.deepEqual([21, 20, 19, 3].map((n) => lightClass(n, ui)), ['lit2', 'trailc1', 'trailc2', 'lit land']);
});

/** Replays a plan frame by frame exactly as app.js runLight builds ui.light*, and returns the class diffs. */
function replay(plan, which = 'light1', base = {}) {
  const ui = { ...ui0(), ...base };
  let prev = null, prevIdx = null;
  const perStep = [], perFrame = [];
  for (let t = 0; t <= plan.durationMs + 17; t += 1000 / 60) {
    const el = Math.min(t, plan.durationMs);
    const idx = plan.indexAt(el), speed = plan.speedAt(el);
    const moving = el < plan.durationMs;
    const trail = moving && speed > 1 ? [advance(idx, -1), speed > 4 ? advance(idx, -2) : null] : null;
    ui[which] = el >= plan.durationMs ? { idx: plan.to, trail: null, level: null, done: true } : { idx, trail, level: null };
    const cls = Array.from({ length: 51 }, (_, n) => (n ? lightClass(n, ui) : null));
    if (prev) {
      const changed = cls.filter((c, n) => c !== prev[n]).length;
      perFrame.push(changed);
      if (idx !== prevIdx && (idx - prevIdx + 50) % 50 === 1) perStep.push(changed);
    }
    prev = cls;
    prevIdx = idx;
  }
  return { perStep, perFrame, last: prev };
}

test('a light step changes the class of at most 4 tiles (new lit, lit->trail1, trail1->trail2, trail2->none)', () => {
  for (const [from, to, u1, u2] of [[1, 30, 0.1, 0.9], [27, 26, 0.5, 0.5], [50, 8, 0.9, 0.1]]) {
    const { perStep, perFrame, last } = replay(planFirstRunV2(from, to, u1, u2));
    assert.ok(perStep.length > 40, 'many single-square steps sampled');
    assert.ok(Math.max(...perStep) <= 4, `max per step ${Math.max(...perStep)}`);
    assert.ok(Math.max(...perFrame) <= 6, `max per frame ${Math.max(...perFrame)} (a 60 Hz frame can cover 2 steps)`);
    assert.equal(last[to], 'lit land', 'ends lit on the stored stop');
    assert.equal(last.filter(Boolean).length, 1, 'no trail left after the stop');
  }
  const dr = replay(planSecondRunV2(3, 21, 0.5, 0.5), 'light2', { light1: { idx: 3, done: true } });
  assert.ok(Math.max(...dr.perStep) <= 4);
  assert.equal(dr.last[21], 'lit2 land');
  assert.equal(dr.last[3], 'lit land', 'the first stop stays lit');
});

const rulesFor = (re) => [...STYLES.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => re.test(m[1].trim())).map((m) => ({ sel: m[1].trim(), body: m[2] }));
const props = (body) => body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);

test('light CSS: lit / trail / land rules use only fills, colours, opacity, transform; transitions on opacity only', () => {
  const light = rulesFor(/\.tile(::before|:is\([^)]*(lit|trail|lvl)[^)]*\)|\.land)/);
  assert.ok(light.length >= 5, light.map((r) => r.sel).join(' | '));
  const allowed = new Set(['content', 'position', 'inset', 'border-radius', 'background', 'border-color', 'color', 'opacity', 'transition', 'pointer-events', 'z-index', 'animation']);
  for (const { sel, body } of light) {
    for (const p of props(body)) assert.ok(allowed.has(p), `${sel}: ${p}`);
    assert.doesNotMatch(body, /box-shadow|filter|gradient|text-shadow/, sel);
    const tr = body.match(/transition:\s*([^;]+)/);
    if (tr) assert.match(tr[1].trim(), /^(none( !important)?|opacity \d+ms[ a-z-]*)$/, `${sel}: ${tr[1]}`);
  }
  // the overlay is the only thing that fades, with the token opacities
  assert.match(STYLES, /\.tile:is\(\.trail1, \.trailc1, \.lvl2\)::before \{ opacity: var\(--o-tile-trail-1\); transition: none; \}/);
  assert.match(STYLES, /\.tile:is\(\.trail2, \.trailc2, \.lvl1\)::before \{ opacity: var\(--o-tile-trail-2\); \}/);
  assert.deepEqual(DOC.color['tile-trail-opacity'].slice(0, 2), [0.34, 0.2]);
  assert.equal(DOC.motion['trail-fade-ms'], 120);
  assert.match(STYLES, /\.tile::before \{[^}]*transition: opacity 120ms linear;/);
  // landing pop: transform only
  const land = STYLES.match(/@keyframes land \{([^@]*?\})\s*\}/);
  assert.ok(land, 'land keyframes');
  assert.deepEqual([...land[1].matchAll(/\{([^}]*)\}/g)].flatMap((m) => props(m[1])), ['transform']);
  // the tile itself never transitions a property (no background-colour animation)
  assert.doesNotMatch(rulesFor(/^\.tile$/)[0].body, /transition/);
});

test('phone ring shapes (SPEC.md §2.9): 11x16, 12x15 at 700 px tall or less, 16x11 from 600 px wide or in landscape', () => {
  for (const [W, H, cols, rows, tile] of [[390, 844, 11, 16, 30], [360, 640, 12, 15, 25], [430, 932, 11, 16, 34]]) {
    const L = computeLayout(W, H);
    assert.deepEqual([L.bp, L.cols, L.rows, L.tile.w], ['phone', cols, rows, tile], `${W}x${H}`);
    const at = new Set(L.pos.slice(1).map((p) => `${p.x},${p.y}`));
    assert.equal(at.size, 50, 'every square has its own cell');
    assert.deepEqual([L.pos[1].x, L.pos[1].y], [L.track.x, L.track.y], '#1 top-left');
    assert.equal(L.pos[cols].x, L.track.x + (cols - 1) * L.px, 'top row runs left to right');
    assert.equal(L.pos[50].x, L.track.x, 'the left column ends under #1');
    assert.equal(L.pos[50].y, L.track.y + L.py);
    assert.ok(L.track.y >= L.bar.y + L.bar.h && L.track.y + L.track.h <= L.dock.y, 'between bar and dock');
    assert.ok(L.track.x >= 0 && L.track.x + L.track.w <= W);
    assert.equal(L.tile.showNum, false);
    assert.equal(L.tile.noWinText, false);
    assert.ok(L.inner.x >= L.track.x + L.tile.w && L.inner.y >= L.track.y + L.tile.h, 'centre clear of the ring');
  }
  for (const [W, H, bp] of [[768, 1024, 'tablet-portrait'], [844, 390, 'tablet-landscape'], [600, 900, 'tablet-portrait'], [1920, 1080, 'desktop-xl']]) {
    assert.deepEqual([computeLayout(W, H).bp, computeLayout(W, H).cols, computeLayout(W, H).rows], [bp, 16, 11], `${W}x${H}`);
  }
});

test('big number CSS: mono, fixed size with strict containment; v2 bulb, lock, headline, legend and history rules gone', () => {
  const big = rulesFor(/^\.big$/)[0].body;
  assert.match(big, /contain: strict/);
  assert.match(big, /width: [\d.]+ch/);
  assert.match(big, /var\(--f-mono\)/);
  assert.match(big, /color: var\(--c-big-number\)/);
  for (const gone of ['.bulb', '.tile .lock', '.headline', '.legend ', '.lg ', '.hist', '.he ', '.band', 'badgepop', '.pill.st', '.lastbets .lb']) {
    assert.ok(!STYLES.includes(gone), gone);
  }
  assert.match(STYLES, /#r-track \{[^}]*contain: layout paint/);
});

test('track geometry follows tokens.md §4: pitch = min(floor(min(boxW/16, boxH/11)), 80), tile = pitch - 6', () => {
  for (const [W, H, pitch] of [[1920, 1080, 80], [1280, 720, 54], [1024, 768, 45], [768, 1024, 44]]) {
    const L = computeLayout(W, H);
    assert.equal(L.px, pitch, `${W}x${H}`);
    assert.equal(L.tile.w, pitch - 6);
    assert.equal(L.track.w, 16 * pitch - 6);
    assert.equal(L.track.h, 11 * pitch - 6);
    assert.ok(L.track.y >= L.top.y + L.top.h, 'track below the top row');
    assert.ok(L.track.y + L.track.h <= (L.rail ? L.bar.y : L.dock.y), 'track above the bar / dock');
    assert.ok(L.inner.x > L.track.x + L.tile.w && L.inner.x + L.inner.w < L.track.x + L.track.w - L.tile.w, 'centre inside the ring');
  }
  assert.equal(computeLayout(1920, 1080).top.h, 56);
  assert.equal(computeLayout(1280, 720).top.h, 44);
  // tile type: numbers hidden at 48 px tiles and below, multiplier 20 / 14 / 12
  assert.deepEqual(['1920x1080', '1280x720', '768x1024'].map((s) => { const [w, h] = s.split('x').map(Number); const t = computeLayout(w, h).tile; return [t.showNum, t.mult]; }),
    [[true, 20], [false, 14], [false, 12]]);
  assert.deepEqual([1920, 1280, 768].map((w) => computeLayout(w, w === 768 ? 1024 : w * 9 / 16).bigF), [DOC.type['big-number'].size, DOC.type['big-number-1280'].size, DOC.type['big-number-768'].size]);
});
