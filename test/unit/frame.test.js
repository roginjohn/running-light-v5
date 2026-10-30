// v3 page frame (batch 2): frame, rail, divider, game area and bottom bar geometry from tokens.md §4, and the
// copy rule (no "provably fair" claim anywhere in the UI).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { computeLayout, FRAME } from '../../src/ui/layout.js';

const DOC = JSON.parse(readFileSync(new URL('../../docs/design-v3/tokens.json', import.meta.url), 'utf8'));

test('frame constants match the v3 tokens', () => {
  assert.equal(FRAME.maxW, 1680, 'v5: wider than the v3 1,600, for the 320 px rail');
  assert.equal(FRAME.desktopRail, 320, 'tiers/SPEC.md §2.7');
  assert.equal(FRAME.maxH, DOC.layout['frame-max-height']);
  assert.equal(FRAME.margin, DOC.layout['frame-margin-min']);
  assert.equal(FRAME.rail, DOC.size['rail-width']);
  assert.equal(FRAME.bar, DOC.size['bottombar-height']);
  assert.equal(FRAME.divider, DOC.border.hairline);
});

for (const [W, H, fw, fh, rw] of [[1920, 1080, 1680, 980, 320], [1280, 720, 1248, 688, 320], [1024, 768, 992, 736, 230]]) {
  test(`${W}x${H}: centred frame ${fw}x${fh}, rail ${rw} + divider, game area, 40 px bottom bar`, () => {
    const L = computeLayout(W, H);
    assert.deepEqual([L.frame.w, L.frame.h], [fw, fh]);
    assert.equal(L.frame.x, (W - fw) / 2);
    assert.equal(L.frame.y, (H - fh) / 2);
    assert.ok(L.frame.x >= 16 && L.frame.y >= 16, '16 px minimum margin');
    assert.deepEqual([L.rail.x, L.rail.y, L.rail.w, L.rail.h], [L.frame.x, L.frame.y, rw, fh - 40]);
    assert.equal(L.stage.x, L.frame.x + rw + 1, 'game area starts after the 1 px divider');
    assert.equal(L.stage.x + L.stage.w, L.frame.x + fw);
    assert.deepEqual([L.bar.x, L.bar.y, L.bar.w, L.bar.h], [L.frame.x, L.frame.y + fh - 40, fw, 40]);
    assert.ok(L.track.y + L.track.h <= L.bar.y, 'track above the bottom bar');
    assert.ok(L.track.x >= L.stage.x, 'track inside the game area');
  });
}

test('1920x1080: 74 px squares (80 px pitch) beside the 320 px rail (tiers/SPEC.md §2.9)', () => {
  assert.deepEqual([computeLayout(1920, 1080).tile.w, computeLayout(1920, 1080).px], [74, 80]);
});

test('768x1024 (tablet portrait): game area, dock and bottom bar stacked inside the frame', () => {
  const L = computeLayout(768, 1024);
  assert.equal(L.rail, null);
  assert.ok(L.dock.y >= L.track.y + L.track.h);
  assert.ok(L.dock.y + L.dock.h <= L.bar.y);
  assert.equal(L.bar.y + L.bar.h, L.frame.y + L.frame.h);
});

test('no "provably fair" claim anywhere in the UI source or page', () => {
  const files = ['../../index.html', '../../src/main.js', ...readdirSync(new URL('../../src/ui/', import.meta.url)).map((f) => `../../src/ui/${f}`)];
  for (const f of files) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /provabl/i, f);
});
