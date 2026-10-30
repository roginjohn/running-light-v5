// v2 icons and star still in use (9 icons + the 1920x star, batch 7 removed the rest): the exported SVGs from
// design/redesign-v2/assets (copied to src/assets/v2), inlined at build time (no runtime requests). Icons are
// recoloured to `currentColor`.
const raw = import.meta.glob('../assets/v2/{icons,ui}/*.svg', { query: '?raw', import: 'default', eager: true });

const byName = {};
for (const [p, svg] of Object.entries(raw)) byName[p.split('/').pop().replace('.svg', '')] = svg;

const cc = (svg) => svg.replace(/#F6F2FF/gi, 'currentColor').replace(/fill="#241400"/i, 'fill="currentColor"');

/** Inline icon markup: <span class="ic">svg</span>. */
export function icon(name, cls = '') {
  const svg = byName[`icon-${name}`];
  if (!svg) throw new Error(`unknown icon ${name}`);
  return `<span class="ic${cls ? ` ${cls}` : ''}" aria-hidden="true">${cc(svg)}</span>`;
}
export const star = () => `<span class="ic" aria-hidden="true">${cc(byName['star-1920'])}</span>`;

// v3 flat poker chip (batch 3): chip-<v> fill, 8 white edge stripes, the value in Poppins 700 as HTML text so it uses
// the bundled UI font. Colours come from CSS (.chip.c<v>), so the markup is the same for every state.
const CHIP_R = 14.5, CHIP_C = 2 * Math.PI * CHIP_R, CHIP_DASH = 3.6;
export function chipFace(v) {
  const gap = CHIP_C / 8 - CHIP_DASH;
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><circle class="face" cx="17" cy="17" r="17"/><circle class="edge" cx="17" cy="17" r="${CHIP_R}" fill="none" stroke-width="3" stroke-dasharray="${CHIP_DASH} ${gap.toFixed(3)}" stroke-dashoffset="${CHIP_DASH / 2}" transform="rotate(-90 17 17)"/></svg><span class="cv" aria-hidden="true">${v}</span>`;
}

// v3 outline icons (18 px in 32 px hit boxes, currentColor). Drawn for v3: stats bars, results scales, and the
// Running Light mark (a ring of 8 squares around an empty centre, the first one lit).
const V3 = {
  stats: '<path d="M4 20h16M7.5 20v-5.5M12 20V7.5M16.5 20v-9"/>',
  scales: '<path d="M12 4v16M8.5 20h7M4.5 7.5h15"/><path d="M4.5 7.5 2 13.5a2.5 2.5 0 0 0 5 0zM19.5 7.5 17 13.5a2.5 2.5 0 0 0 5 0z"/>',
};
export function v3icon(name) {
  if (!V3[name]) throw new Error(`unknown v3 icon ${name}`);
  return `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${V3[name]}</svg></span>`;
}
export function v3mark() {
  let r = '';
  for (const [x, y] of [[0, 0], [6, 0], [12, 0], [12, 6], [12, 12], [6, 12], [0, 12], [0, 6]]) r += `<rect x="${x + 0.5}" y="${y + 0.5}" width="3.5" height="3.5" rx=".8"${x === 0 && y === 0 ? ' fill="currentColor"' : ''}/>`;
  return `<svg class="mark" viewBox="0 0 16.5 16.5" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${r}</svg>`;
}
