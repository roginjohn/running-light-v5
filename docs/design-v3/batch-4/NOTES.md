# v3 Batch 4: track and centre display

Branch `v3/batch-4-track`. Not committed. This batch restyles the 50-square track and the centre display to the flat v3 look, adds the top row ("Last results" / "Last bets") above the track, and makes the running light a class-only highlight. Result states (win/loss/gamble/Double Run visuals), overlays and small-screen layouts are not restyled (batches 5–6). Manual/Auto tabs are still absent and the button wording is unchanged. Nothing under `src/engine/` was touched (`git diff main -- src/engine` is empty).

## What changed
| Before (batch 3) | After (batch 4) |
|---|---|
| v2 tiles: bulb disc with radial gradients and glows, coloured multiplier band, amber bet badge with a drop shadow, square numbers 13–17 px | **Flat squares** (tokens.md §1): `tile` fill, 1 px `tile-border`, radius 6. Square number top-left (label-xs, muted), multiplier bottom-centre (tile-mult 12/11/10 px) in the tier colour: 24x `#8a94a0`, 96x `#c3cad2`, 480x/960x `#6ea8fe`, 1920x white on a navy tile. 960x squares get the navy border. **Bet badge**: accent-blue circle, white 11/700, 18 px (16 at 1280, 15 on tablet). Ghost (Rebet) badge: blue outline |
| Track pitch from v2 factors (84×80 cells at 1920, not square) | **Pitch formula from tokens.md §4**: `pitch = clamp(40, floor(min(boxW/16, boxH/11)), 70)`, `tile = pitch − 6`, centred in the box under the top row. 70/64 at 1920×1080, 54/48 at 1280×720, 45/39 at 1024×768, 44/38 at 768×1024. Square numbers are hidden at 48 px tiles and below (they stay in the aria-label and the tooltip) |
| Light step: amber 2 px border + glowing bulb, trail bulbs, a 120 ms `background` transition on every tile; during a run every unlit square got a veil + lock icon (innerHTML change per step) | **Running light = class swaps only.** `lit` = `tile-lit` fill `#e9eef3` with dark text (instant). Trail = one `::before` white overlay per tile, faded by **opacity only**: `trail1` .34 (instant), `trail2` fades to .20 in 120 ms, and leaving the trail fades to 0 in 120 ms (the third token step, .10, is passed through by that fade). No veil/lock while running (running.png); squares stay `aria-disabled`. A step touches at most 4 tiles: new lit, lit→trail1, trail1→trail2, trail2→none |
| — | **Landing square**: when a run stops, the stored stop keeps the lit fill and gets `land`, a one-off 260 ms `transform: scale(1.12 → 1)` pop (none in reduced motion) |
| Centre: v2 panel with border, display-font headline 56 px ("RUNNING…"), note pill, pays legend cards with hit chances, "Last 10 rounds" history cards | **Centre (betting.png / running.png)**: status pills (Betting open = grey; Running = accent-blue fill), Double Run pill, the **big mono number = the MULTIPLIER** (JetBrains Mono 600, 88/64/52 px, `#6a7480`, small "x"), title 18/700 ("Place your bets", "Running…"), label-md muted sub line with the bold value ("Credits 1,000 − 20 bet = **980**"), and the pays row (24x … 1920x pills with "21 squares" … "1 square"). No panel fill, border or glow |
| "Last bets" in the rail (under Undo/Clear/Rebet); history inside the centre panel | **Top row above the track** (56 px, 44 at 1280 and on tablet): "Last results:" left (newest first, newest outlined, won rounds green-outlined, Double Run as "960x · 24x"), "Last bets:" right (round totals, newest first, newest highlighted). Pills that do not fit wrap onto a hidden second line, so no pill is ever cut in half. Removed from the rail and the tablet dock |

### Big number rules (open question 3, first reading)
- Betting: `00.00x`.
- While a light runs: the multiplier of the square under the light (`24.00x`, `96.00x`, `480.00x`, `960.00x`, `1920.00x`), updated with `textContent` at most once per step, only when the text changes.
- After the stop (RESOLVING, Double Run, offer, gamble, payout): the stopped square's multiplier (the winning one if any). Before the light's first frame it stays `00.00x`, so the stored result is never shown early.
- Win colour (`big-number-win`) and the Double Run `960.00x + 24.00x` form are result-state visuals and are left for batch 5.

## Changed files
| File | Change |
|---|---|
| `src/ui/track.js` | **New.** Pure helpers: `winners` (moved from view.js), `lightClass` (lit / trail1 / trail2 / second light / lvl1-2 / `land`), `bigMult`, `bigValue`. No DOM, so they are unit-tested under node. |
| `src/ui/layout.js` | Pitch formula (`TRACK`), top row (`TOP_ROW`, `L.top`), centre = ring interior inset 12, big-number size per breakpoint (`BIG_F`, `L.bigF`), tile type sizes (`showNum`, `mult`, `badge`). v2 tile sizes (`num`, `bulb`, `band`, `lock`, …) and the v2 cell factors removed. CSS vars: `--num-d`, `--mult-f`, `--badge`, `--big-f`. |
| `src/ui/view.js` | `tileStatic` (number + multiplier, no bulb/band); `tileLook` adds the tier class `q<m>`, uses `lightClass`, no veil/lock while running; new `topRow`; new `centre` (pills, empty big-number span, title, sub, result lines, pays row); `historyRow` and `lastBets` (rail) removed; copy: "then press **Start**", bold credits value. |
| `src/ui/app.js` | New `top` region (also made inert under dialogs). `paintBig()` writes the big number after every render, only on change, and never via the centre's markup, so a step never rebuilds the centre. The per-frame `tabIndex` write on all 50 tiles is now skipped when unchanged. |
| `index.html` | `#r-top` region. |
| `src/styles.css` | New flat tile, light, landing, centre, pill, pays and top-row rules; `#r-track { contain: layout paint }`; `.big { contain: strict }` with a fixed size. **Removed** v2 track/centre CSS: bulb (5 rules + gradients/glows), lock, band, `badgepop`, trail bulb rules (cyan and warm), `fade`/`lvl` bulb rules, the `background` transition on tiles, `.pill.st*`, `.pill.dr*`, `.pill.res*`, `.pill .dot`, `.headline*` (+ `bannerin`), `.legend`, `.lg`, `.hist`, `.he*`, rail `.lastbets` rules. Kept for batch 5: `.tile.win`, `.win2`, `.pulse`, `.chase`, `.veil`, `.wtag`. |
| `package.json` | `perf:trace` script. |
| `test/unit/track.test.js` | **New** (7 tests): big-number format and phases (incl. no early leak), light classes, a replayed run (3 first-light plans + a Double Run plan) changes ≤ 4 tiles per step and ends `lit land` on the stored stop, light CSS uses only fills/colours/opacity/transform with opacity-only transitions and token opacities, big number mono + strict containment, v2 rules gone, pitch formula / top row / tile type / big-number sizes. |
| `test/unit/rail.test.js` | Last-bets selector moved (`.lb`, `.lb.new`). |
| `test/ui/ui.test.js` | + 3 tests: **multiplier display** (00.00x idle, 88 px mono `#6a7480` strict-contained; every sampled run frame shows the multiplier of the lit square; 96.00x after stopping on #30), **highlight** (MutationObserver over the game regions during a real run: the only mutations are tile `class` attributes and the big-number text; ≤ 6 tiles per 60 Hz frame and ≤ 2 frames over 4; ≤ 1 big-number write per frame; **zero** layout reads — `getBoundingClientRect`, `offset*`, `client*`, `scroll*`, `getComputedStyle`, … are wrapped and counted; lit = `#e9eef3`/dark text/no shadow; trail1 overlay .34, trail2 opacity-only 120 ms; no veil), **top row + tiles** (results newest first, bets right, above the track; tier colours, navy 1920x, blue 18 px badges, 64 px tiles with numbers). Updated: centre copy assertions are case-insensitive (same copy, no uppercase transform), Double Run history checked in the top row, last bets read from `#r-top` and absent from the rail. |
| `test/ui/screenshots-v3.js` | Extended: `betting` and `running` scenes at the three sizes, compare images (running vs `running.png`, letterboxed where the aspect differs), default output `docs/design-v3/batch-4`, mockup history (24x 96x 24x 480x 24x 24x 96x 24x). |
| `test/ui/perf-trace.js` | **New.** Puppeteer Tracing (`devtools.timeline`) of one full light run at 1920×1080, normal and 4× CPU throttle; prints Layout / forced-layout / style / paint counts and frame script times. |
| `docs/design-v3/batch-4/` | This file, `betting-*.png`, `running-*.png` and `compare-*.png` at 1920×1080, 1280×720 and 768×1024. |

## Results
- `npm test`: **82/82 pass** (75 before + 7 in `track.test.js`).
- `npm run build`: OK. **CSS 32.84 KB / 7.71 KB gzipped** (budget 8 KB, was 7.89 KB; not raised). JS 36.34 KB gzipped. Fonts unchanged (37.7 KB).
- `npm run test:ui`: **38/38 pass** (35 before + 3 new). No console errors, no failed or external requests. Layout checks pass at 1920×1080, 1280×720, 1024×768, 768×1024 and the 390×844 fallback (50 tiles, no overlaps, all in view, WIN tags clear of tiles).
- `npm run sim:quick` (1M rounds): RTP **95.613%** (A) / **95.656%** (B), both PASS (95.45 ± 0.3); Double Run 3.99% / 4.02%; gamble 49.97%; E2 PASS. Identical to batch 3 (same seeds, engine unchanged).
- `npm run sim` (full, 5M rounds, required for batch 4): RTP **95.469%** (A) / **95.597%** (B), both PASS; Double Run 3.996% / 3.995%; gamble 49.979%; E2 PASS.
- `git diff main -- src/engine`: empty. No outcome-verification wording (existing `/provabl/i` checks pass over the new files).

## Performance evidence
`npm run build && npm run perf:trace` — Chrome trace (`devtools.timeline` + `disabled-by-default-devtools.timeline`) from START until the light stops, 1920×1080, timeScale 1, stored stop #30, the mockup's 6 bets.

| | Desktop (no throttle) | 4× CPU throttle |
|---|---|---|
| Run length / light steps | 5.77 s / 80 steps | 5.78 s / 80 steps |
| **Forced (synchronous) layouts from script** | **0** | **0** |
| Layout events in the run | 90 (1.13 per step) | 89 (1.11 per step) |
| … of which per light step (big-number text) | 78 × **4 dirty / 55 objects**, 1 layout root (the contained `.big`) | same |
| … START's one-off re-render (rail/centre copy) | 1 × 238 dirty / 830 objects | same |
| … credits count-up (first 300 ms, rail) | 11 × 9 dirty / 830 objects | same |
| Layout time, total / max | 8.8 ms / 1.3 ms | 33.1 ms / 4.5 ms |
| Script per rAF callback, median / p95 / max | 0.05 / 0.14 / 0.87 ms (max 3.1 ms in a second run) | 0.06 / 0.82 / 4.14 ms (max 5.7 ms in a second run) |
| Long tasks > 50 ms | 0 | 0 |
| Style recalcs / paints in the run | 346 / 423 | 346 / 424 |

Reading: there is no layout thrash. No layout is ever forced from script, and the per-step code does no layout reads at all (the UI test wraps every layout-reading API and counts **0** calls during a real run). Each step causes at most one ordinary in-frame layout, and it is confined to the strictly contained big-number box (55 objects, 4 dirty; median 0.07 ms, p95 0.14 ms, max 0.19 ms unthrottled); the 78 step layouts for 80 steps are because #50 → #1 → … keeps the same "24.00" text twice, so no write happens. Tile changes are class swaps that only cause style recalc + paint. The only full-document layouts in the run are START's one-off render and the batch-3 credits count-up during the first 300 ms. Frame script time stays well under the 8 ms / 16 ms budget even at 4× throttle. (rAF callback counts in the raw trace include the harness's own polling loops, so they are not frames.)

## Differences from the mockup
- **No Manual/Auto tabs**, and the primary button still says **Start · 20 credits on 6 squares · Space** (Running…: "controls locked"), not "Place bet · Potential Win: 2,400" (open questions 6 and 7, unchanged as asked). The centre sub line therefore says "then press **Start**".
- **Tablet pitch is 44, not 45** (39 → 38 px tiles): with a 736 px frame and 12 px padding the box is 712 px wide, `floor(712/16) = 44`. The mockup used a slightly wider box.
- **Trail**: 2 class steps (.34, .20) plus a 120 ms opacity fade-out instead of 3 class steps, to keep a step at ≤ 4 tile changes (perf-notes budget ≤ 5 elements per step, with the big number as the 5th).
- **Last results** shows up to 10 rounds, newest first with the newest outlined in white; "won" rounds get a green outline. The mockup's green-outlined 480x is reproduced only when that round had a win (the screenshot history has no wins).
- **Result states keep their batch-3 copy** in the new flat centre (title 18/700 with a green/blue tone, result lines as plain label-md text). Their v3 visuals (win colour on the big number, pays pills lit green, result cards, navy gamble band, `960.00x + 24.00x`) are batch 5. The v2 headline glow and Double Run banner animation are gone with the v2 centre CSS.
- **The running screenshots at 1280×720 and 768×1024** are compared against `running.png` (1920×1080 only), letterboxed; there is no running mockup at those sizes.

## Open issues
- **Credits count-up layouts**: the 300 ms balance tween at START relayouts the whole document (11 small layouts, 9 dirty objects). perf-notes asks for `contain: layout paint` on `.rail`; adding it (and `contain: strict` on `.credits`) is a rail change, so it is left for batch 7 (performance).
- **Win tile visuals** (`.tile.win`, `.win2`, `.chase`, `.pulse`, WIN tags) still use v2 glows/rings: batch 5. They are not used during a run.
- Open question 3 (big number = multiplier) is implemented on its first reading.
- Tile hover on a lit tile in BETTING (the last stop shown after a loss) swaps to the hover fill; batch 5 decides the post-loss look.
- Reduced motion: the fade plan maps level < .5 / ≥ .5 to the two trail overlay opacities, then lit; no landing pop, no transitions.
