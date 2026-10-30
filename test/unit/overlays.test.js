// v3 batch 6: overlays and small screens. The dialog / screen CSS is flat (no shadow, glow, gradient or blur; one
// 160 ms opacity + 4 px dialog entrance), the v2 modal, tab, toggle, notice and bulb-ring rules are gone, the
// tablet-portrait frame hugs its content (betting-768x1024.png), and the Double Run markers have room on small tiles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout, layoutVars } from '../../src/ui/layout.js';

const STYLES = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const CSS = STYLES.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...CSS.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const rule = (sel) => (rules.find((r) => r.sel === sel) || {}).body || '';

const OVERLAY = /\.(scrim|dwrap|dlg|dic|dtitle|drow|dcode|dbtn|dfoot|ihead|ifoot|icols|isec|ione|ih|itabs|isub|srow|tgl|sl|slider|ikeys|kc|ptab|ppill|pnotes|isteps|facts|igamble|inavy|inote|screen|brand|scard|srow2|lbar|lrow)\b|#loading/;

test('overlay and screen rules are flat: no shadow, glow, gradient, filter or blur', () => {
  const mine = rules.filter((r) => OVERLAY.test(r.sel) && !/:focus/.test(r.sel));
  assert.ok(mine.length >= 40, `${mine.length} overlay rules`);
  for (const { sel, body } of mine) assert.doesNotMatch(body, /box-shadow|text-shadow|filter|gradient|blur/, sel);
  assert.match(rule('.dlg'), /background: var\(--c-bg-frame\)/);
  assert.match(rule('.dlg'), /border: 1px solid var\(--c-border-input\)/);
  assert.match(rule('.dlg'), /border-radius: var\(--r-card\)/);
  assert.match(rule('.dlg'), /animation: dlgin 160ms/);
  assert.match(CSS, /@keyframes dlgin \{ from \{ opacity: 0; transform: translateY\(4px\); \} \}/, 'opacity + 4 px only (tokens.md §5)');
  assert.match(rule('.scrim'), /background: var\(--c-scrim\)/);
  assert.match(rule('.dlg.err'), /border-top: 3px solid var\(--c-accent-red\)/);
  assert.match(rule('.reduced .tile, .reduced .toast, .reduced .dlg'), /animation: none/);
});

test('the v2 overlay styles are gone (modal, tabs, toggle, notice, field, bulb ring, bunting, start ticker)', () => {
  for (const gone of ['.modal', '.mhead', '.mtitle', '.tabs', '.toggle', '.notice', '.field', '.sect-lbl', '.badge-ph', 'table.pt', '.kbd-table', '.ring', '.bunting', '.pc ', '.pill ', '.disp', 'modalin', 'sheetin', '--sh-glow', '--sh-modal', '.bar i']) {
    assert.ok(!CSS.includes(gone), gone);
  }
  for (const f of ['../../src/ui/view.js', '../../src/ui/app.js', '../../src/main.js', '../../index.html']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /ringBulbs|ringStep|bunting|class="amber"|gamble window/, f);
  }
});

test('768x1024: the frame hugs track + dock + bar and is centred (betting-768x1024.png); the dock fits its content', () => {
  const L = computeLayout(768, 1024);
  assert.equal(L.dock.h, L.dock.fitH);
  assert.equal(L.frame.h, L.stage.y - L.frame.y + L.stage.h + L.dock.h + 12 + 40);
  assert.ok(L.frame.h < 1024 - 32, `frame ${L.frame.h} shorter than the screen`);
  assert.ok(Math.abs(L.frame.y - (1024 - L.frame.h - L.frame.y)) <= 1, 'centred vertically');
  assert.equal(L.bar.y + L.bar.h, L.frame.y + L.frame.h);
  assert.equal(L.tile.w, computeLayout(768, 1024, null).tile.w, 'same pitch as the first pass');
  // phones (< 600 px wide) have their own layout that fills the screen
  const N = computeLayout(390, 844);
  assert.deepEqual([N.bp, N.frame.h, N.frame.w], ['phone', 844, 390]);
});

test('Double Run markers: hidden on phone tiles', () => {
  assert.equal(layoutVars(computeLayout(768, 1024))['--mk-d'], 'block');
  assert.equal(layoutVars(computeLayout(1280, 720))['--mk-d'], 'block');
  assert.equal(layoutVars(computeLayout(390, 844))['--mk-d'], 'none');
  assert.match(rule('#app:not([data-bp="desktop-xl"]) .tile .mkt'), /display: var\(--mk-d\)/);
});
