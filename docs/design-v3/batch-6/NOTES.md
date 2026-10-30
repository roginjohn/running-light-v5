# v3 Batch 6: overlays and small screens

Branch `v3/batch-6-overlays`. Not committed. This batch restyles the Settings / Paytable / Help window, the Refill, Error and Recovery dialogs, the results panel, and the loading and start screens to the flat v3 look of `settings-paytable-help.png`, `refill.png` and `error.png`, removes the last v2 glows (including the bulb ring), rewrites the Help gamble text to match the engine, and rechecks the small-screen layouts against `betting-1280x720.png` and `betting-768x1024.png`. The credits count-up and the win-reveal split are not touched (batch 7). Nothing under `src/engine/` was touched (`git diff main -- src/engine` is empty). Play credits only.

## What changed
| Before (batch 5) | After (batch 6) |
|---|---|
| **Info window**: v2 modal (`.modal`, 220 ms scale-in), big display title, a pill tab bar with icons (Settings / Paytable / How to play), one tab at a time. Settings rows with icons, mint toggles, amber sliders and a dashed amber "PLACEHOLDER" badge; Paytable with a per-stop column, rule cards with icons, a mint RTP card and a board mini-map; Help with amber number discs, a key table and "Touch tips" | settings-paytable-help.png: **one "Running Light · Game info" window** (1180 wide at 1920), header with the v3 mark and a close button, then **three columns: Settings · Paytable · Help**, and a footer "Esc closes this window · Outcome is decided and saved before the light runs". Settings: Sound / Music / Sound effects / Reduced motion / Turbo (disabled, "Placeholder – pending approval") as flat rows with **accent-blue switches and sliders**, plus a compact **Keys** list. Paytable: Pays pill · Squares · Hit chance per round · **Square numbers**, then the notes (stake, Double Run, Gamble, Limits, RTP ≈95.45%). Help: four numbered steps, **How the gamble works**, and the navy play-credits note. Below 1600 px wide the same sections show **one at a time behind a segmented control** (Manual/Auto style); on tablet portrait the window is a **bottom sheet** |
| Refill: 96 px **bulb ring** of 12 lit bulbs (radial gradients + glow), display title, amber "1,000" in a field, 76 px button | refill.png: 420 px flat dialog **centred on the game area**, with the scrim over the game area only (the rail and bar stay lit). Navy icon disc, "Out of play credits", body, a divider row "Free refill · 1,000 credits", the 52 px blue **Refill 1,000 / Free · Enter**, "Play credits only. No real money value." |
| Error: coral-tinted modal border, info notice box | error.png: 460 px flat dialog with a **3 px accent-red top edge**, red-tinted icon disc, "…reloading **won’t change the outcome or charge you again**.", the saved round on one **mono** line ("Round in progress: bet 20 · 6 squares · credits 980 · code E-STORAGE-WRITE"), **Reload / Restores your round · Enter**, play-credits footer. Codes unchanged (E-CORRUPT-ROUND, E-STORAGE-WRITE, …). "1 squares" is now "1 square" |
| Recovery (not mocked) and the results panel: v2 modals | The same flat dialog: Recovery with label/value rows and **Continue**; the results panel with the Game info header/footer and the bullet list (see below) |
| Dialog entrance: `modalin` (scale .96, 220 ms) / `sheetin` (40 px slide, 260 ms), replayed on every re-render (each tab switch, toggle and slider step rebuilt the dialog) | **One `dlgin`: 160 ms opacity + translateY(4 px)** (tokens.md §5), played **once per dialog**: a re-render of the same dialog adds `.still` (no replay). Reduced motion: none |
| Start screen: bunting, a 300 px ring of 20 bulbs **re-rendered every 90 ms** by a ticker task, display title with an amber "Light", amber CR pill | A flat card: the v3 mark + "Running Light", one line of copy, "Credits 1,000", **Play / Turns sound on · Enter**, How to play · Sound: on, footer. **No ticker** (the region is rendered once; `startRingTicker` and `ui.ringStep` removed) |
| Loading: bunting, a 16-bulb ring stepping every 90 ms, amber gradient bar, "Warming up the bulbs…" | The v3 mark (48 px) and title, a 4 px flat accent-blue progress bar, "Loading… / Loading sounds…" and the percentage. Rotate / fatal screens use the same flat type |
| 768×1024: the frame filled the screen, so the dock stretched and left ~200 px empty under Undo / Clear / Rebet | betting-768x1024.png: **the frame hugs track + dock + bar and is centred** (dock content height 246 px, enough for the tallest state, Collect + Gamble). Not below 600 px wide (the narrow fallback still fills the screen) |
| "1st" / "2nd" on tablet tiles (38–39 px): 2–3 px from a 2-digit badge, touching the multiplier; on the 18 px fallback tile the badge covered the marker | Tablet: the stop's bet badge sits on the tile's top-right **corner (in the 6 px gap)** and the marker moves up 1 px: **5–7 px** from a "10" badge and 4 px above the multiplier. Below 30 px tiles the marker is hidden (`--mk-d`; the result cards still say "1 · #21" / "2 · #46"). 1920 and 1280 unchanged (13–18 / 7–9 px) |
| Empty-board rail hint "1–10 per square · max 200 per round" (cut off with an ellipsis at 1920) | "1–10 per square · 200 per round" (refill.png) |

### Help: how the gamble works
The old key table said "Pick red / white (gamble window)"; there has been no gamble window since batch 5. The Help column now says, using the engine's numbers (`MAX_GAMBLES`, `GAMBLE_CAP` from `engine/config.js`):

> - After a win, press **Gamble ×2**, pick **red** or **white**, then press Gamble on your colour.
> - Red or white is drawn at that moment, a 50/50, and saved before the disc flips.
> - **Match:** your win doubles. Gamble again or Collect. **No match:** the win is lost. Nothing else is taken.
> - Up to 3 gambles per win, and Collect is open between flips. Gamble is off when doubling would go over 30,000.

This is what the engine does: `GAMBLE_FLIP` draws `randInt(2)` (red/white) and persists the round with `pendingReveal` before the reveal; `REVEAL_DONE` doubles on a match or sets the win to 0 (the bet was already taken, the balance is not touched); `gambleBlockReason` refuses a 4th gamble and any gamble where `2 × win > 30,000`. The keys list says "R / W · ← → — Pick red / white"; the paytable note says "Gamble: 50/50 on red or white, up to 3 times per win. Off when doubling would go over 30,000."

### Results panel ("How results are decided")
Plain facts, no seed-verification wording: drawn and saved on this device before the light starts; weights 80 / 20 / 4 / 2 / 1 of 2,093 (1 ÷ multiplier); Double Run 1 in 25, never the first square; **Gamble, 50/50** (drawn when you press Gamble and saved before the flip; a match doubles, no match loses the win; up to 3, off above 30,000); RTP about 95.45%; the browser's crypto RNG, nothing sent anywhere. The forbidden phrase appears nowhere in `src/`, `index.html` or the page (unit test over the sources, UI tests over the page in every overlay and result state).

## Changed files
| File | Change |
|---|---|
| `src/ui/view.js` | Dialogs rewritten: `dialog()` shell (scrim + centring wrapper + `.dlg`, sheet on tablet portrait, game-area scrim for Refill), `refillModal`, `errorModal`, `recoveryModal`, `resultsModal`, `infoModal` (3 columns at desktop-xl, tabs below; section headings are the `tab-*` focus targets in the column view), `settingsBody`, `paytableBody`, `helpBody`, `startScreen`, `loadingScreen`. Removed: `bunting`, `ringBulbs`, the v2 `frame` / `open` / `bigBtn` helpers, the mini-map and the per-stop column. Empty-board rail hint wording; `plural()` |
| `src/ui/app.js` | Start-screen ring ticker removed; the dialog entrance plays once per dialog (`shownModal`, `.still`) |
| `src/ui/layout.js` | Tablet portrait: frame sized to its content and centred (second pass with the same pitch); `--mk-d` |
| `src/main.js`, `index.html` | Loading label; flat rotate / fatal screens (no display font or amber span) |
| `src/styles.css` | **Added**: `.dwrap`, `.dlg`, `dlgin`, `.dic`, `.dtitle`, `.drow`, `.dcode`, `.dbtn`, `.dfoot`, Game info (`.ihead`, `.ifoot`, `.icols`, `.isec`, `.itabs`, `.srow`, `.tgl`, `.slider`, `.ikeys`, `.ptab`, `.ppill`, `.pnotes`, `.isteps`, `.igamble`, `.inavy`, `.inote`), screens (`.brand`, `.scard`, `.lbar`), tablet marker / corner badge. **Removed**: `.modal` + `modalin` / `sheetin`, `.mhead` / `.mtitle` / `.mic` / `.grab` / `.mbody`, v2 `.tabs`, `.toggle`, v2 `.slider`, `.notice*`, `.field` / `.val` / `.bar`, `.sect-lbl`, `.badge-ph`, `table.pt`, `.kbd-table`, `.ring` (bulb ring with radial gradients and glows), `.bunting`, `.pc`, `.pill`, `.abs`, `.disp`, colour utilities, `.btn .row1`, the v2 `.ibtn` bevel, `box-shadow` on `.tip` / `.toast` |
| `src/data/design-tokens-v3.json` → `src/styles/tokens.css` | Legacy `--sh-panel/raised/cta/modal/glow-*` and `--c-bulb-*` removed (nothing uses them now) |
| `src/ui/render.js` | Dead v1 file (not bundled): its stale "gamble window" string reworded |
| `test/unit/overlays.test.js` | **New** (4 tests): overlay/screen CSS flat (no shadow, glow, gradient, filter, blur; 160 ms opacity + 4 px entrance; scrim token; red error edge); the v2 overlay styles, bulb ring, bunting and ticker gone; 768×1024 frame hugs its content and is centred (390×844 still fills); marker visibility and the tablet corner badge |
| `test/unit/results.test.js` | Keyframe list: `dlgin` replaces `modalin` / `sheetin` |
| `test/ui/ui.test.js` | **+4 tests**: **overlays** (Game info 3 columns, header/footer, paytable rows, blue switch, arrows move between sections, no entrance replay; results panel; Refill on the game area with its exact copy; Error with the red edge, mono line and Reload focused; every dialog: bg-frame, 1 px border-input, 8 px radius, flat scrim, nothing with a shadow / filter / gradient, no bulb ring, board inert); **Game info on smaller screens** (tabs at 1280×720 and 1024×768, a full-width bottom sheet at 768×1024, inside the viewport, Help reachable); **Help gamble text** (exact copy from the engine constants, no "gamble window", and played through: draw stored before the reveal, match doubles, a 3rd gamble allowed, no 4th); **start and loading screens** (flat, the mark, Poppins title, no ring, no re-render or tasks). **Updated**: Turbo placeholder wording, the keyframe list, the empty-board hint, and the four layout tests (a 2-digit bet on the Double Run stop; markers clear of the badge and the multiplier, inside the tile) |
| `test/ui/screenshots-v3.js` | Overlay scenes (`refill`, `error`, `settings-paytable-help`, `results-panel`, `start`, `loading`), default output `docs/design-v3/batch-6`, compare images only for mocked scenes |

## Checks
- `npm test`: **92/92 pass** (88 before + 4 in `overlays.test.js`).
- `npm run test:ui`: **47/47 pass** (43 before + 4 new; 7 updated: Turbo wording, keyframe list, empty-board hint, and the four per-size layout tests). No console errors, no failed or external requests. Layout checks pass at 1920×1080, 1280×720, 1024×768, 768×1024 and the 390×844 fallback.
- `npm run sim:quick` (1M rounds): RTP **95.613%** (A) / **95.656%** (B), both PASS (95.45 ± 0.3); Double Run 3.986% / 4.024%; gamble win rate 49.972% PASS; E2 PASS. Identical to batch 5 (same seeds, engine unchanged).
- `npm run sim` (full, required for batch 6 by CONTRIBUTING, 5M rounds each): RTP **95.469%** (A) / **95.597%** (B), PASS; Double Run 3.996% / 3.995%; s1 = s2 never; gamble 49.979% over 8,748,181 flips PASS; E2 PASS.
- `git diff main -- src/engine`: empty.
- No forbidden wording and no "gamble window" in `src/`, `index.html` or the page.

## CSS size
`npm run build`: **CSS 32.02 KB / 7.04 KB gzipped** (budget 8 KB, not raised; batch 5 was 7.35 KB, so **−0.31 KB** after adding the dialog, Game info and screen styles, because the v2 modal / tabs / toggle / notice / field / bulb-ring / bunting rules and the unused legacy shadow tokens were removed). JS 32.61 KB gzipped (was 34.84). Fonts unchanged.

## Performance
`npm run build && npm run perf:trace` (1920×1080, the batch-5 round: light run → win reveal → Gamble ×2, pick, one flip → Collect), six runs. The win-reveal row covers all six; the other rows cover the four runs whose full per-segment output was kept:

| Segment | Desktop: longest task / long tasks > 50 ms | 4× CPU: longest task / long tasks > 50 ms | Forced layouts |
|---|---|---|---|
| Light run | 5.9–6.6 ms / **0** | 23.8–28.3 ms / **0** | 0 |
| Win reveal + rail count-up | 27.5–32.6 ms / **0** | **43.8–52.0 ms** / 0 in 3 runs, 1 in 3 runs (50.3, 51.2, 52.0 ms) | 1 |
| Gamble | 12.5–16.4 ms / **0** | 20.7–39.1 ms / **0** | 1 |
| Collect + payout | 9.2–11.8 ms / **0** | 26.7–31.4 ms / **0** | 1 |

- Desktop speed: **0 long tasks** in every run.
- 4× CPU: the **win-reveal frame** (one full render of the rail, centre and track when the result appears) is 43.8–52.0 ms, so in half the runs it crosses 50 ms by up to 2 ms. Batch 5 measured the same frame at 44.7 ms in one run. Batch 6 does not change that render path (the modal region is empty there; `.still` only runs when a dialog is re-rendered), so this reads as run-to-run noise on a frame that already sat near the limit. Splitting it is the batch-7 item and was left alone, as asked.
- One 4× run (run 3) also reported a single **107.9 ms** task in a segment other than the win reveal. Only its summary line was kept, so the segment is not known. It did not happen in the other five runs, and it is not explained.
- Overlays add no running animation: the start / loading bulb ticker re-render (every 90 ms on the start screen) is gone, and the dialog entrance is one 160 ms opacity/transform animation that no longer replays on every slider step or tab switch.

## Differences from the mockups
- **Game info is taller** (780 px vs ~560 at 1920): Settings has a **Keys** list, and Help has **How the gamble works**. The mockup's **Square numbers** and **Keyboard hints** switches and the **Auto play** row are not built (the engine has no such settings; Turbo stays the approved disabled placeholder). The Settings rows add **Music** and **Sound effects** sliders (existing settings).
- **"Press Start"** in Help and on the start screen, not "Place bet", and no Manual/Auto tabs (open questions 6–7, unchanged since batch 3).
- **Game info below 1600 px wide** (not mocked) uses tabs with the same sections; tablet portrait uses a bottom sheet.
- **Error**: the mockup keeps the light on #30 behind the dialog; the build clears the running light when the game pauses (unchanged behaviour), so no square is lit. Codes use the existing `E-STORAGE-WRITE` form, not `E_STORE_WRITE`.
- **Start, loading, results panel and recovery** have no mockups; they reuse the dialog and type tokens.
- **768×1024**: frame margin 16 and track pitch 44 (mockup 12 / 45), so the frame starts 4 px higher and tiles are 1 px smaller. The top row's "Last bets:" shows 4 pills (mockup 3).
- Compare images for Game info at 1280×720 and 768×1024 use the 1920×1080 mockup, letterboxed.

## Open issues
- **4× CPU win-reveal frame** at 44–52 ms (see Performance): batch 7 (split the render).
- **Credits count-up layouts** (batch-4 open issue): batch 7.
- `src/ui/render.js` and `src/ui/svg.js` are dead v1 code (not imported or bundled); delete them in the batch-7 cleanup.
- The Keys list also shows on touch layouts; it could be hidden there.
- A temporary probe script, `test/ui/_mkprobe.js`, could not be deleted from this session (the shell asks for approval to remove files). It is not run by any npm script; delete it before committing.
