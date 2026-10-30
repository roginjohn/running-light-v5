// Responsive layout. Pure: viewport size -> region rectangles and tile geometry. The track pitch is fitted to the
// available space and clamped to the token values (never larger).
// v3 frame (batch 2, tokens.md §4): a centred frame (max 1600x980, 16 px minimum page margin) holding the rail
// (320 px on desktop, 230 px at tablet-landscape widths, + 1 px divider) and the game area, with a 40 px bottom bar
// across the full frame width. Tablet portrait stacks game area, control dock and bottom bar inside the same frame.
// Phones (v5 batch 4, tiers/SPEC.md §2.9): under 600 px wide in portrait the frame fills the screen, the bar moves to
// the top, a compact dock sits at the bottom, and the ring is 11x16 (12x15 at 700 px tall or less).

// v5 batch 5: maxW 1680 (v3: 1600) keeps the 80 px pitch beside the 320 px rail (tiers/SPEC.md §2.7, §2.9).
export const FRAME = { maxW: 1680, maxH: 980, margin: 16, rail: 230, desktopRail: 320, divider: 1, bar: 40 };
export const TRACK = { gap: 6, pitchMin: 40, pitchMax: 80 }; // v5: 80 px max pitch, 74 px squares at 1920x1080 (tiers/SPEC.md §2.9)
export const TOP_ROW = { h: 56, hSmall: 44 };
export const PHONE = { bar: 44, gap: 3, marginX: 12, marginY: 6, dockH: 124, smallH: 700 };
// big mono multiplier (tokens.md §2): 88 desktop, 64 at 1280x720, 52 on tablet portrait, 32 on phones
export const BIG_F = { 'desktop-xl': 88, desktop: 64, 'tablet-landscape': 64, 'tablet-portrait': 52, phone: 32 };

// Rail controls (v5 batch 5, tiers/SPEC.md §2.7): desktop chips 56 in a 4 + 3 grid, secondary button 52 (44 at 1280),
// primary button 60 (52 at 1280); tablets keep the v3 sizes (chip 34 / 40, secondary 32, primary 48 / 56); phones
// have 44 px chips in one row and 52 px buttons.
// disc = gamble disc size in the navy gamble panel of the centre (v3 batch 5).
const BPS = {
  'desktop-xl': {
    s: 1, disc: 96,
    rail: { w: FRAME.desktopRail, pad: 20, chip: 56, gapY: 12, actH: 52, mainH: 60 },
  },
  desktop: {
    s: 0.8, disc: 72,
    rail: { w: FRAME.desktopRail, pad: 16, chip: 56, gapY: 12, actH: 44, mainH: 52 },
  },
  'tablet-landscape': {
    s: 0.8, disc: 64,
    rail: { w: FRAME.rail, pad: 12, chip: 34, gapY: 12, actH: 32, mainH: 48 },
  },
  'tablet-portrait': {
    s: 0.85, disc: 56,
    // fitH: the dock's content height (12 px padding, chips 62 + 12 + Collect / Gamble 120 in the tallest state,
    // 12 + the one-line disclaimer 16), used to size the frame to its content (betting-768x1024.png)
    dock: { minH: 390, fitH: 246, chip: 40, gapY: 12, actH: 32, mainH: 56 },
  },
  phone: {
    s: 0.85, disc: 40,
    dock: { chip: 44, gapY: 8, actH: 52, mainH: 52 },
  },
};

export const COLS = 16;
export const ROWS = 11;

/** Ring shape [cols, rows]: 16x11 on desktop and tablet, 11x16 on phones, 12x15 on phones 700 px tall or less. */
export function ringShape(bp, h) {
  if (bp !== 'phone') return [COLS, ROWS];
  return h <= PHONE.smallH ? [12, 15] : [11, 16];
}

export function breakpointFor(w, h) {
  if (w < 600 && h > w) return 'phone';
  if (w < 900 && h > w) return 'tablet-portrait';
  if (w < 1200) return 'tablet-landscape';
  if (w < 1600) return 'desktop';
  return 'desktop-xl';
}

/** Track geometry: #1 top-left, clockwise; cols squares on top/bottom, rows-2 on each side. */
export function cell(n, cols = COLS, rows = ROWS) {
  const a = cols, b = cols + rows - 2, d = 2 * cols + rows - 2;
  if (n <= a) return [n - 1, 0, 'top'];
  if (n <= b) return [cols - 1, n - cols, 'right'];
  if (n <= d) return [cols - 1 - (n - b - 1), rows - 1, 'bottom'];
  return [0, rows - 1 - (n - d), 'left'];
}

/** fit (internal): { y, h, pitch } fixes the frame's vertical extent and the pitch (tablet-portrait second pass). */
export function computeLayout(W, H, fit = null) {
  const bp = breakpointFor(W, H);
  const B = BPS[bp];
  if (bp === 'phone') return phoneLayout(W, H, B);
  const dockMode = bp === 'tablet-portrait';
  const L = { bp, W, H, s: B.s, cols: COLS, rows: ROWS, dockMode, phone: false };

  const fw0 = Math.min(FRAME.maxW, W - 2 * FRAME.margin), fh0 = fit ? fit.h : Math.min(FRAME.maxH, H - 2 * FRAME.margin);
  const frame = { x: Math.round((W - fw0) / 2), y: fit ? fit.y : Math.round((H - fh0) / 2), w: fw0, h: fh0 };
  const bar = { x: frame.x, y: frame.y + frame.h - FRAME.bar, w: frame.w, h: FRAME.bar };
  const bodyH = frame.h - FRAME.bar;
  L.header = frame.y; // top edge of the playable area (tooltips and full dialogs stay below it)

  let stage, rail = null, dock = null;
  if (!dockMode) {
    rail = { ...B.rail, x: frame.x, y: frame.y, h: bodyH };
    const gx = frame.x + rail.w + FRAME.divider;
    stage = { x: gx, y: frame.y, w: frame.x + frame.w - gx, h: bodyH };
  } else {
    stage = { x: frame.x, y: frame.y, w: frame.w, h: 0 };
  }

  // Track (v3 batch 4, tokens.md §4): a top row ("Last results" / "Last bets"), then the track box. Square pitch
  // = clamp(40, floor(min(boxW / 16, boxH / 11)), 70), tile = pitch - 6, centred in the box. The 40 floor only
  // gives way when 16 squares of 40 cannot fit the width (the narrow < 600 px fallback, not a v3 layout).
  const xl = bp === 'desktop-xl';
  const padX = xl ? 24 : 16;
  const top = { x: stage.x + padX, y: stage.y, w: stage.w - 2 * padX, h: xl ? TOP_ROW.h : TOP_ROW.hSmall };
  const boxW = stage.w - 2 * padX;
  const boxH = dockMode ? bar.y - 12 - B.dock.minH - (stage.y + top.h) : stage.h - top.h;
  const fitP = Math.floor(Math.min(boxW / COLS, boxH / ROWS));
  const pitch = fit ? fit.pitch : Math.min(TRACK.pitchMax, fitP);
  const g = TRACK.gap;
  const px = pitch, py = pitch;
  const tw = px - g, th = py - g;
  const trackW = COLS * px - g, trackH = ROWS * py - g;
  if (dockMode) stage.h = top.h + trackH + 12;
  const track = {
    x: Math.round(stage.x + (stage.w - trackW) / 2),
    y: Math.round(stage.y + top.h + (dockMode ? 0 : Math.max(0, (boxH - trackH) / 2))),
    w: trackW, h: trackH,
  };
  if (dockMode) {
    const y = stage.y + stage.h;
    dock = { ...B.dock, x: frame.x + 12, y, w: frame.w - 24, h: bar.y - y - 12 };
    // v3 batch 6 (betting-768x1024.png): the frame hugs its content (track, dock, bar) and is centred, instead of
    // stretching the dock to the full height. Not below 600 px wide, where the dock text wraps (narrow fallback).
    const need = stage.y - frame.y + stage.h + B.dock.fitH + 12 + FRAME.bar;
    if (!fit && W >= 600 && need < frame.h) return computeLayout(W, H, { y: Math.round((H - need) / 2), h: need, pitch });
  }
  const tile = tileType(tw, th);
  // centre panel: the ring interior inset by 12 px (tokens.md §4)
  const inner = { x: track.x + tw + 12, y: track.y + th + 12, w: (COLS - 1) * px - tw - 24, h: (ROWS - 1) * py - th - 24 };
  L.bigF = Math.min(BIG_F[bp], Math.floor(inner.w / 5.2));
  const pos = [null];
  for (let n = 1; n <= 50; n++) {
    const [c, r, side] = cell(n);
    pos.push({ x: track.x + c * px, y: track.y + r * py, side });
  }
  Object.assign(L, { px, py, g, tile, disc: B.disc, frame, bar, stage, rail, dock, top, track, inner, pos });
  return L;
}

/** Tile type: square numbers hidden at 48 px tiles and below, multiplier 20 / 14 / 12 (12 px minimum, SPEC.md), and
 *  "No win" in words from 44 px tiles up (the glyph alone below that). */
function tileType(w, h) {
  return { w, h, showNum: w > 48, mult: w >= 60 ? 20 : w >= 44 ? 14 : 12, noWinText: w >= 44, noGlyph: w >= 44 ? 16 : 12, dy: w >= 60 ? 8 : w >= 36 ? 5 : 0 };
}

/** Phone portrait: bar on top, the ring in the middle, the compact dock at the bottom. No top row, no page margin. */
function phoneLayout(W, H, B) {
  const [cols, rows] = ringShape('phone', H);
  const frame = { x: 0, y: 0, w: W, h: H };
  const bar = { x: 0, y: 0, w: W, h: PHONE.bar };
  const dock = { ...B.dock, x: 0, y: H - PHONE.dockH, w: W, h: PHONE.dockH };
  const stage = { x: 0, y: bar.h, w: W, h: dock.y - bar.h };
  const pitch = Math.floor(Math.min((W - 2 * PHONE.marginX + PHONE.gap) / cols, (stage.h - 2 * PHONE.marginY + PHONE.gap) / rows));
  const g = PHONE.gap;
  const tw = pitch - g;
  const track = { w: cols * pitch - g, h: rows * pitch - g };
  track.x = Math.round((W - track.w) / 2);
  track.y = Math.round(stage.y + (stage.h - track.h) / 2);
  const pos = [null];
  for (let n = 1; n <= 50; n++) {
    const [c, r, side] = cell(n, cols, rows);
    pos.push({ x: track.x + c * pitch, y: track.y + r * pitch, side });
  }
  const inner = { x: track.x + pitch + 2, y: track.y + pitch + 2, w: (cols - 2) * pitch - g - 4, h: (rows - 2) * pitch - g - 4 };
  return {
    bp: 'phone', W, H, s: B.s, cols, rows, dockMode: true, phone: true, small: H <= PHONE.smallH, header: 0,
    px: pitch, py: pitch, g, tile: tileType(tw, tw), disc: B.disc, frame, bar, stage, rail: null, dock, top: null, track, inner, pos,
    bigF: BIG_F.phone,
  };
}

/** CSS custom properties for the current layout (applied on #app). */
export function layoutVars(L) {
  const t = L.tile;
  const v = {
    '--s': L.s, '--tw': `${t.w}px`, '--th': `${t.h}px`, '--num-d': t.showNum ? 'block' : 'none', '--mult-f': `${t.mult}px`,
    '--big-f': `${L.bigF}px`, '--disc': `${L.disc}px`, '--mk-d': t.w >= 36 ? 'block' : 'none',
    '--nw-d': t.noWinText ? 'block' : 'none', '--no-s': `${t.noGlyph}px`, '--m-dy': `${t.dy}px`,
  };
  const c = L.rail || L.dock;
  Object.assign(v, {
    '--chip': `${c.chip}px`, '--gap-y': `${c.gapY}px`, '--rail-pad': `${c.pad || 0}px`,
    '--act-h': `${c.actH}px`, '--main-h': `${c.mainH}px`,
  });
  return v;
}
