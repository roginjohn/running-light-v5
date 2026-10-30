// v3 batch 5 result states: the big multiplier per result (win colour, Double Run "100.00x + 20.00x", 00.00x after a
// loss), and the result CSS: flat win / loss stops with no glow, pulse, chase or WIN tag on any tile, the old v2
// result rules gone, and the gamble flip as one transform-only disc.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bigValue, bigResult } from '../../src/ui/track.js';
import { computeLayout, layoutVars } from '../../src/ui/layout.js';

const STYLES = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const CSS = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...CSS.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const keyframes = Object.fromEntries([...CSS.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => [m[1], m[2]]));
const props = (body) => body.split(';').map((d) => d.split(':')[0].trim()).filter(Boolean);

// v5 batch 2: bets are keyed by tier (#13 is 20x, #3 and #29 50x, #21 100x, #33 20x, #40 10x, #1/#6 5x, #2/#30 blank)
const round = (o) => ({ s1: 13, s2: null, doubleRun: false, bets: { 20: 5, 50: 2 }, gambles: [], currentWin: 100, baseWin: 100, ...o });
const S = (phase, r) => ({ phase, round: r });
const UI = (o = {}) => ({ light1: null, light2: null, gambleLoss: null, ...o });

test('big number: winning multiplier in the win colour; 00.00 after a loss; never a stop before the light gets there', () => {
  assert.equal(bigValue(S('GAMBLE_OFFER', round()), UI()), '20.00');
  assert.deepEqual(bigResult(S('GAMBLE_OFFER', round()), UI()), { win: true, extra: null });
  assert.deepEqual(bigResult(S('GAMBLE', round()), UI()), { win: true, extra: null });
  assert.deepEqual(bigResult(S('PAYOUT', round()), UI()), { win: true, extra: null }, 'collected: still the won look');
  // loss (loss.png): the stop is shown while it resolves, then 00.00x grey
  const lost = round({ s1: 1, bets: { 20: 5 } });
  assert.equal(bigValue(S('RESOLVING', lost), UI()), '05.00');
  assert.equal(bigValue(S('BETTING', lost), UI({ showLastStop: true })), '00.00');
  assert.deepEqual(bigResult(S('BETTING', lost), UI({ showLastStop: true })), { win: false, extra: null });
  // a blank stop reads 00.00 throughout
  assert.equal(bigValue(S('RESOLVING', round({ s1: 2 })), UI()), '00.00');
  // gamble lost: not the win colour
  assert.deepEqual(bigResult(S('PAYOUT', round({ currentWin: 0 })), UI({ gambleLoss: { pick: 'red', result: 'white' } })), { win: false, extra: null });
  // while the light runs: the square under it, whatever is stored
  assert.equal(bigValue(S('SPINNING', round()), UI({ light1: { idx: 29 } })), '50.00');
  assert.equal(bigValue(S('SPINNING', round()), UI({ light1: { idx: 30 } })), '00.00', 'blank square under the light');
  assert.equal(bigValue(S('SPINNING', round()), UI()), '00.00', 'before the first frame: nothing leaks');
});

test('big number in a Double Run: "100.00x + 20.00x" only when both lights won', () => {
  const both = round({ s1: 21, s2: 33, doubleRun: true, bets: { 100: 2, 20: 5 }, baseWin: 300, currentWin: 300 });
  assert.equal(bigValue(S('GAMBLE_OFFER', both), UI()), '100.00');
  assert.deepEqual(bigResult(S('GAMBLE_OFFER', both), UI()), { win: true, extra: '20.00' });
  const first = round({ s1: 21, s2: 33, doubleRun: true, bets: { 100: 2 } });
  assert.deepEqual(bigResult(S('GAMBLE_OFFER', first), UI()), { win: true, extra: null });
  const second = round({ s1: 21, s2: 33, doubleRun: true, bets: { 20: 5 } });
  assert.equal(bigValue(S('GAMBLE_OFFER', second), UI()), '20.00', 'only the second light won');
  // both lights on the same tier
  const same = round({ s1: 1, s2: 6, doubleRun: true, bets: { 5: 10 }, baseWin: 100, currentWin: 100 });
  assert.deepEqual(bigResult(S('GAMBLE_OFFER', same), UI()), { win: true, extra: '05.00' });
  // the second light running: its square, not a stored result
  assert.equal(bigValue(S('DOUBLE_RUN', both), UI({ light2: { idx: 40 } })), '10.00');
  const none = round({ s1: 21, s2: 33, doubleRun: true, bets: { 50: 1 } });
  assert.equal(bigValue(S('BETTING', none), UI({ showLastStop: true })), '00.00');
});

test('no glow or pulse on tiles: no box-shadow, filter, drop-shadow, gradient or animation but the landing pop', () => {
  // every rule that styles a tile (or anything inside / on it), except the keyboard focus ring
  const tileRules = rules.filter((r) => /\.tile|\.q\d+/.test(r.sel) && !/:focus/.test(r.sel));
  assert.ok(tileRules.length >= 15, `${tileRules.length} tile rules`);
  for (const { sel, body } of tileRules) {
    assert.doesNotMatch(body, /box-shadow|filter|drop-shadow|gradient|text-shadow|mask/, sel);
    const anim = body.match(/animation(?:-name)?:\s*([^;]+)/);
    if (anim) assert.match(anim[1].trim(), /^(land\b|none)/, `${sel}: only the landing pop animates a tile (${anim[1]})`);
  }
  // the v2 result look is gone: glows, rings, pulse / chase keyframes, WIN tags, the veil, the second-win tile
  for (const gone of ['.wtag', 'tagin', 'tpulse', '@keyframes chase', '--chase', '.tile.pulse', '.tile.chase', '.win2', '.veil', '.confetti', '.celebrate', 'drop-shadow', '.pick .pb', '.btn.red', '.btn.whitec', '.cres']) {
    assert.ok(!CSS.includes(gone), gone);
  }
  // batch 6: the v2 modalin (scale) / sheetin (40 px slide) became one dlgin (160 ms opacity + 4 px)
  assert.deepEqual(Object.keys(keyframes).sort(), ['cfade', 'dlgin', 'flipr', 'flipw', 'land', 'toastin', 'toastout'].sort(), 'keyframes');
});

test('win / loss stops are flat token fills (component sheet): green with dark text, tile-lit; markers 1st / 2nd', () => {
  const win = rules.find((r) => r.sel === '.tile.win');
  assert.ok(win);
  assert.match(win.body, /background: var\(--c-accent-green\)/);
  assert.match(win.body, /color: var\(--c-text-on-green\)/);
  assert.match(rules.find((r) => r.sel === '.tile.win .m').body, /color: var\(--c-text-on-green\)/);
  assert.match(rules.find((r) => r.sel === '.tile:is(.lit, .lit2)').body, /background: var\(--c-tile-lit\)/);
  assert.match(rules.find((r) => r.sel === '.tile.mk .num').body, /display: none/);
  // the ring is display-only: no hover look on a square
  assert.ok(!rules.some((r) => /\.tile[^,]*:hover/.test(r.sel)));
});

test('result centre: light big number, green pays pill, navy band and panel, flat discs; the flip turns by transform only', () => {
  const find = (sel) => rules.find((r) => r.sel === sel)?.body || assert.fail(`rule ${sel}`);
  assert.match(find('.big.win'), /color: var\(--c-big-number-win\)/);
  assert.match(find('.spot.won'), /background: var\(--c-accent-green\);.*color: var\(--c-text-on-green\)/);
  assert.match(find('.gband, .gpanel'), /background: var\(--c-bg-panel-navy\); border: 1px solid var\(--c-border-panel-navy\)/);
  assert.match(find('.disc, .coin .f'), /background: var\(--c-gamble-red\); border: 4px solid var\(--c-gamble-red-edge\)/);
  for (const { sel, body } of rules.filter((r) => /\.(gband|gpanel|ghead|gdiscs|pick|disc|coin|flip|gc|gmsg|card|cards|spot|spots|big)\b/.test(r.sel))) {
    assert.doesNotMatch(body, /box-shadow|filter|gradient|text-shadow/, sel);
  }
  // one disc with two faces, 700 ms rotateY ending on the stored face; will-change only while it flips
  assert.match(find('.flip.go .coin'), /will-change: transform; animation: flipr 700ms/);
  assert.deepEqual(rules.filter((r) => /will-change/.test(r.body)).map((r) => r.sel), ['.flip.go .coin']);
  for (const k of ['flipr', 'flipw']) assert.deepEqual([...keyframes[k].matchAll(/\{([^}]*)\}/g)].flatMap((m) => props(m[1])), ['transform', 'transform'], k);
  assert.match(keyframes.flipr, /rotateY\(1440deg\)/, 'red: whole turns, front face');
  assert.match(keyframes.flipw, /rotateY\(1620deg\)/, 'white: ends on the back face');
  assert.match(find('.coin .f'), /backface-visibility: hidden/);
  assert.match(find('.reduced .flip.go .coin'), /animation: cfade 120ms/, 'reduced motion: 120 ms crossfade, no rotation');
  assert.deepEqual([...keyframes.cfade.matchAll(/\{([^}]*)\}/g)].flatMap((m) => props(m[1])), ['opacity']);
});

test('gamble disc size per breakpoint; WIN tag geometry removed from the layout', () => {
  assert.deepEqual([[1920, 1080], [1280, 720], [1024, 768], [768, 1024]].map(([w, h]) => computeLayout(w, h).disc), [96, 72, 64, 56]);
  const v = layoutVars(computeLayout(1920, 1080));
  assert.equal(v['--disc'], '96px');
  assert.ok(!('--tag-h' in v) && !('--tag-f' in v));
  assert.equal(computeLayout(1920, 1080).tag, undefined);
});
