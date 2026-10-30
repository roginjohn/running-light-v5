# v3 Batch 7: performance and cleanup

Branch `v3/batch-7-perf`. Not merged, not published (`gh-pages` untouched). This batch does two things. It splits the win reveal and the other result renders across frames, so no task goes over 50 ms with the CPU slowed 4×. It also makes the credits count-up write only text inside a contained box. It removes dead v2 assets, tokens and tools. Nothing under `src/engine/` was touched (`git diff main -- src/engine` is empty). Play credits only.

Decisions kept as asked: **Square numbers**, **Keyboard hints** and **Auto play** stay unbuilt; the button and Help still say **Press Start**; there are no Manual/Auto tabs.

## Summary
| Before (batch 6) | After (batch 7) |
|---|---|
| Win reveal: one rAF callback re-rendered the board, centre, rail, top row and bar, then focused Collect. The focus forced a synchronous layout of all the new text, 20–42 ms at 4× CPU, and the task took **57–80 ms** at 4× | **Staged render** (`renderStaged`). The board and centre render in this frame, then the rail, top row and bar in the next, then the focus move one frame later on a clean layout. The same applies to a loss, Gamble ×2, a gamble win or loss, and the end of a payout. Each stage renders the current state, and each focus step checks the phase first |
| The first time a result appeared, Blink shaped its text from a cold cache (fonts at new sizes, new words): 11–26 ms of `ShapeText` in one frame at 4×. A warm repeat of the same frame took 15–18 ms instead of 28–46 | **Type warm-up** (`warmType`, `V.warmSamples`). Once after boot, in idle callbacks, the real result templates are laid out with a sample round (not the player's) in a hidden box: win offer, gamble, gamble match, payout, loss. The box is `visibility: hidden; contain: strict`, inert and `aria-hidden`, with ids, roles and live regions stripped. It is removed after the last sample. It sits outside the animation tasks, so `pendingTasks()` and the regions are not touched |
| Frame scheduler: a task added during a frame requested a second `requestAnimationFrame`. From then on `frame()` ran **twice per frame** (every tween and light step ran twice) until the task list emptied | One frame request at a time (`if (tasks.size && !rafId)`). `nextFrame(cb)` counts real frames |
| Credits count-up (300 ms at START, payout, refill): `render(['credits'])` rebuilt the region every frame. That gave a full-document layout each frame (batch 4: 11 layouts × 830 objects) | `paintCredits()` writes only the balance text. The region's markup carries the settled balance, and `.credits` is `contain: size layout style` (a relayout boundary; no paint containment, so a long "+N" delta is not clipped). Each tween frame is now a **partial layout of 6 objects** (0.04–0.09 ms desktop, ≤ 0.87 ms at 4×), with **0 full layouts**. `.rail` gets `contain: layout paint` (perf-notes) |
| v2 leftovers: 6 bulb SVGs, 4 gamble-disc SVGs, the logo mark, 16 unused icons (all icons were inlined into the bundle), `test/ui/screenshots-v2.js` (WIN-tag checks, compares against `../design/redesign-v2`), the `npm run screenshots` alias, 17 unused legacy colour aliases, tier `-edge`/`-solid` aliases, radius `xs`/`xl`/`sheet`, z `tags`/`celebration`, and 13 contrast pairs that only checked those dead names | Deleted. `src/assets/v2/` keeps the 9 icons still used (alert, check, gear, info, lock, mute, reload, sound, x) and the 1920x star. `scripts/copy-v2-assets.js` copies only those 10 files, so it cannot restore deleted ones. `run-all.js` uses `screenshots-v3.js` and `test-results/v3/` |

## Changed files
| File | Change |
|---|---|
| `src/ui/app.js` | Scheduler: one rAF at a time, a frame counter, `nextFrame()`. `renderStaged(focus)` for win offer, loss, `GAMBLE_OPEN`, gamble loss, gamble match and `PAYOUT_DONE`. `paintCredits()` replaces `render(['credits'])` in the START, payout and refill tweens. `warmType()` runs once from `onInit`. Header says v3 |
| `src/ui/view.js` | `credits()` markup carries the settled balance (`s.balance`). New `warmSamples(s, L)` (result templates from a sample round, ids, roles and live regions stripped). Header says v3 |
| `src/ui/icons.js` | Comment only (the glob now finds 9 icons + the star) |
| `src/styles.css` | `.credits { contain: size layout style }`, `.rail { contain: layout paint }`, `.warm` (hidden, strictly contained warm-up box) |
| `src/data/design-tokens-v3.json`, `scripts/gen-tokens.js` → `src/styles/tokens.css` | Unused legacy names removed (see Summary). Contrast pairs: 46 → 33, all pass. The legacy note is updated |
| `src/assets/v2/` | **Deleted**: `bulbs/` (6), `gamble/` (4), `ui/logo-mark.svg`, and icons bolt, clear, clock, gift, help, kbd, menu, motion, music, play, rebet, sfx, shield, star, table, undo |
| `scripts/copy-v2-assets.js` | Copies only the 10 kept files |
| `scripts/run-all.js`, `package.json`, `README.md` | `screenshots-v2` removed (`npm run screenshots` alias gone; `npm run screenshots:v3` stays). README commands and layout lines updated for the removed files |
| `test/ui/screenshots-v2.js` | **Deleted** (v2 tool) |
| `test/ui/screenshots-v3.js` | Default output `docs/design-v3/batch-7`. New `--small <scenes>` option limits the 1280×720 / 768×1024 captures |
| `test/ui/perf-trace.js` | New **count-up** line: layouts in the first 300 ms after START's own render (count, full layouts, largest object count) |
| `test/ui/scenes.js` | `staged(page)`: waits out a staged render (4 frames) |
| `test/ui/ui.test.js` | **+1 test** (warm-up leaves nothing behind and no duplicate controls; the count-up replaces only the balance text after START's one region render; the win shows the centre before the rail; Collect is focused). **3 updated**: wait for the staged rail before reading the bar label (lock test), the `btn-flip` state (win → gamble) and the Back button (gamble loss) |
| `test/unit/perf.test.js` | **New** (4 tests): credits / rail containment and text-only tweens; six staged renders with focus inside them; one-rAF scheduler; warm-up box rules; dead v2 assets, tokens and the v2 screenshot tool gone |
| `test/unit/tokens-v3.test.js` | 33 contrast pairs; the stacking order without `tags` / `celebration` |

## Checks
- `npm test`: **96/96 pass** (92 before + 4 in `perf.test.js`).
- `npm run test:ui`: **48/48 pass** (47 + 1), run 4 times in a row after the final change. No console errors, no failed or external requests.
- `npm run sim:quick` (1M rounds): RTP **95.613%** (A) / **95.656%** (B), both PASS (95.45 ± 0.3). Double Run 3.986% / 4.024%, s1 = s2 never, gamble 49.972% PASS, E2 PASS. Identical to batch 6 (same seeds, engine unchanged). CONTRIBUTING asks for the full `npm run sim` only in batches 4 and 6, so it was not run.
- `git diff main -- src/engine`: empty.
- Production build (`npm run build`) loads with no console output of any kind (`test/ui/smoke.js` logs every message type) and is the build every UI test runs against.
- No forbidden wording anywhere (unit and UI tests from batch 6 still pass).

## Performance
`npm run build && npm run perf:trace` (1920×1080: light run → win reveal → Gamble ×2, pick, one flip → Collect), **3 consecutive runs** on the final code. Longest task / long tasks > 50 ms:

| Segment | Run 1 desktop | Run 1 4× | Run 2 desktop | Run 2 4× | Run 3 desktop | Run 3 4× |
|---|---|---|---|---|---|---|
| Light run | 6.79 / 0 | 22.04 / 0 | 5.63 / 0 | 23.76 / 0 | 6.50 / 0 | 25.36 / 0 |
| **Win reveal** | 4.35 / 0 | **22.90 / 0** | 3.53 / 0 | **16.68 / 0** | 4.03 / 0 | **16.85 / 0** |
| **Gamble** | 3.73 / 0 | **17.85 / 0** | 4.12 / 0 | **16.52 / 0** | 3.84 / 0 | **16.32 / 0** |
| **Collect** | 5.27 / 0 | **22.51 / 0** | 4.84 / 0 | **22.82 / 0** | 5.28 / 0 | **22.10 / 0** |
| Credits count-up (layouts / full / max objects) | 11 / 0 / 6 | 10 / 0 / 6 | 11 / 0 / 6 | 11 / 0 / 6 | 11 / 0 / 6 | 10 / 0 / 6 |

**0 long tasks in every segment of all 6 traces.** For comparison, the first trace of this batch, before any change: 4× win reveal **73.86 ms** (1 long task), gamble 38.56 ms, collect 46.33 ms. Desktop win reveal was 36.2 ms. Forced layouts per segment stay at 1 (win reveal, collect) and 2 (gamble: the focus restore when the rail is replaced after Pick and the flip), each ≤ 5 ms at 4×.

## The one-off 175 ms gamble task (forced layout max 61 ms)
That run's full trace was not kept, so this is inferred from what was measured here. It was **not reproduced**: 10 extra throttled probe rounds plus 4 `perf:trace` runs, before and after the fixes.

- **Where a forced layout comes from in the gamble segment.** Gamble ×2, Pick and the flip are input tasks: the engine dispatch, then a render that replaces the rail with `innerHTML`. `setRegion` then re-focuses the button that had focus (Collect / Gamble), and that focus forces a synchronous layout inside the input task. That is the segment's forced layout.
- **Why it can be big.** On the first Gamble ×2 of a session, that layout shapes the gamble panel's text from a cold cache. Before this batch it was 11–19 ms at 4×, and 8–16 ms of that was `ShapeText`.
- **Why it can be much bigger in one run.** Some probe runs showed whole frames 2–5× slower than usual in every phase: a 5-object layout took 3.6 ms, an HTML parse took 21 ms instead of ~2, a light-run frame took 48 ms instead of 10–14. That looks like CPU contention on the host. CDP's 4× throttle multiplies whatever the host gives the renderer, so a cold 15–19 ms forced layout in such a frame lands at ~60 ms. That matches the 61 ms seen.
- **The remaining ~114 ms** of that task could not be attributed without its trace.
- **Fixes in this batch.** (1) The warm-up now shapes the gamble templates (Gamble ×2, flips, match, loss) at boot, so the first gamble no longer shapes from cold. (2) Gamble ×2 is staged: the centre comes first and the rail two frames later, so the remaining forced layout only covers the rail. (3) The scheduler no longer runs every task twice per frame. After these, the gamble segment's longest 4× task is 16–18 ms.

## Sizes vs batch 1
`npm run build` (Vite's sizes, kB = 1,000 bytes; fonts are WOFF2 and not gzipped again):

| | Batch 1 | Batch 6 | **Batch 7** |
|---|---|---|---|
| JS (gzip) | not recorded (earliest record: batch 3, 36.8 KB) | 32.61 KB (93.74 raw) | **32.47 KB** (90.33 raw) |
| CSS (gzip) | not recorded (earliest record: batch 2, 7.5 KB) | 7.04 KB (32.02 raw) | **6.91 KB** (31.18 raw) |
| Fonts | 49.6 KB in 4 files (Poppins 600 8.0, Poppins 700 7.8, JetBrains Mono 600 21.9, Plus Jakarta Sans 800 11.9) | 37.68 KB in 3 files | **37.68 KB** in 3 files (−11.9 KB vs batch 1: Plus Jakarta Sans removed in batch 3) |
| HTML (gzip) | – | 0.68 KB | 0.68 KB |
| **Total transferred (gzip + WOFF2)** | – | 78.01 KB | **77.74 KB** |

`docs/design-v3/batch-1/NOTES.md` records only the font sizes, so JS and CSS are compared with the earliest batches that recorded them. I tried to rebuild the `v3-batch-1` tag for exact numbers, but this session cannot create a git worktree, so that was not done. The JS shrank by 3.4 KB raw even with the staging and warm-up code, because the 16 unused icons were being inlined into the bundle. CSS stays under its 8 KB budget. Fonts are within 80 KB / 3 files.

## Screenshots
`node test/ui/screenshots-v3.js --out docs/design-v3/batch-7 --scenes betting,running,win-gamble-offer,gamble-flip,loss,double-run-result,refill,settings-paytable-help,error,start,loading --small betting`: all 11 states at 1920×1080, plus betting at 1280×720 and 768×1024, with `compare-*.png` (build | mockup) for the mocked ones. No console or network issues. Checked by eye against batch 6: no visual change, which is what this batch intends. The staged render and the warm-up are invisible once a state has settled.

## Files I would still delete (not deleted here)
- `src/ui/render.js`, `src/ui/svg.js`: retired v1 SVG renderer (not imported or bundled).
- `src/data/design-tokens.json`: v1 tokens. Only `test/unit/math.test.js` (E1.1 arrangement check, which duplicates the v3 check in `tokens-v3.test.js`) and `svg.js` read it, so delete it together with that test case.
- `test/ui/screenshots.js`: v1 screenshot script (session-one mockups).
- `test/ui/_debug.js`: scratch helper from the v2 session.
- `scripts/copy-v2-assets.js`: copies from `../design/redesign-v2`, outside this repo. The 10 files it would copy are already here, so it is only needed if those assets change.
- `IMPLEMENTATION-REPORT.md` and most of `README.md`: they still describe the v2 "Perya After Dark" build (fonts, bulbs, WIN tags). Rewrite or remove before publishing; only the lines naming deleted files were fixed here.

## Open issues
- **Host noise.** All 3 consecutive `perf:trace` runs are clean, with the worst 4× task at 25.4 ms (light run) and 22.9 ms (results), so there is about 2× headroom. A host that is 2–5× slower for a moment (seen in some probe runs) can still push a frame past 50 ms. The trace measures one round per run, so it cannot rule that out.
- **Staged results.** The rail, top row and bar now follow the centre by one frame (two after an input), and focus by one more. Keys pressed in that window act on the still-focused button and are not lost (tests cover Collect focus after Gamble ×2). Three UI tests now wait for the staged rail (`staged()`).
- **Tooltip and toast are still v2-styled.** Inline sizes, `.tb` tier bands and `--c-text-hi` / `--c-line-hi` / `--c-coral` / `--c-mint` aliases, rgba toast borders. They are why the remaining legacy aliases exist. Not mocked in v3.
- **JS budget.** perf-notes asks for ≤ 25 KB gzipped for the UI layer, excluding the engine. The whole bundle (engine + UI) is 32.47 KB, and the engine share was not measured separately.
- **No `<link rel="preload">` for the two Poppins files** (batch-1 leftover, perf-notes). Vite hashes the font URLs, so this needs a small build plugin or `public/` fonts. Not done.
- The Keys list also shows on touch layouts (carried from batch 6).
- Full `npm run sim` was not run (CONTRIBUTING requires it for batches 4 and 6 only; the engine is unchanged).
- Scratch probes used during this batch lived in `/tmp` (outside the repo) and were deleted. None are in the repo.
