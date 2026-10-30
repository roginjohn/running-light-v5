# v3 Batch 3: left panel (rail) controls

Branch `v3/batch-3-rail`. Not committed. This batch restyles every rail control to the flat v3 look (desktop rail and the tablet-portrait dock) and changes the bet field, 1/2, x2 and "Last bets" behaviour. The track, centre display, result states and overlays are not restyled. Nothing under `src/engine/` was touched (`git diff main -- src/engine` is empty).

## What changed in the rail
| Before (batch 2) | After (batch 3) |
|---|---|
| "Play credits … 1,000" line at the top of the rail | One row: **Bet amount** (left) · **Credits 1,000** (right, still its own `#r-credits` region, so the count-up only repaints that line; the green "+N" delta stays) |
| "CHIP · selected: 5" caps label, v2 chip SVGs (Plus Jakarta Sans 800 numerals, gradient rims), key numbers under the chips, selected chip lifted with an amber glow | **Chip value** label; flat v3 chips drawn inline (`icons.js chipFace`: `chip-*` fill, 8 white edge stripes, value in Poppins 700), 34 px (40 px on tablet). Selected = 2 px white ring on a 2 px gap; no lift, no glow. Disabled = 40 % opacity. Keys 1–5 are still in the aria-label and Help |
| "TOTAL BET 20 / 200" card with a progress bar and a note | **Bet field** (40 px, bg-input, border-input, radius 6): green coin dot, the **total bet on the board**, then **1/2** and **x2**. Under it: "6 squares · 20 / 200 per round" (or "1–10 per square · max 200 per round" with no bets) |
| Start: light-blue (`#6ea8fe`) gradient look with dark text, 64 / 56 px | **Start**: accent-blue `#0d6efd`, white text, hover/press `#0b5ed7`, 52 px (48 at 1280×720, 56 on tablet). Label 14/700, sub-line 12/600 ("20 credits on 6 squares · Space") |
| Collect (light blue) + Gamble ×2 (grey card) stacked | **Collect 2,400 / Add to credits · Enter**: accent-green `#16a34a` with dark `#06210f` text (white on this green fails AA). **Gamble ×2 / Fair 50/50 · 3 of 3 left · G**: accent-blue. Locked states (Running…, In gamble, Paying…, Place a bet) use btn-disabled `#3a3f45` / `#9aa2ab` |
| Undo / Clear / Rebet with v2 raised fills; Rebet highlight with an amber glow ring | 32 px secondary buttons (bg-input, border-input, radius 6), disabled text = text-dim. Rebet highlight = accent-blue border only |
| — | **Last bets**: the total bet of each of the last 5 rounds, newest first (newest highlighted) |
| "LAST WIN" card (big number, Uncollected tag wrapping) | **Rail note** (component sheet): "Uncollected win 2,400 / collect it or gamble it", "Last win 0 / no win this round", "This round … / so far · second light running", "gamble lost". It only shows once there is something to report |
| Disclaimer in a bordered box with a shield icon | Plain label-sm text at the rail bottom: **Play credits only.** No real money value. Free refill to 1,000 whenever you run out. |
| Tablet dock: two bordered panels, "Your bets" slip | The rail as a 2-column block under a 1 px divider (tokens.md §4): left = bet field, last bets, note; right = chips, Start/Collect/Gamble, Undo/Clear/Rebet; disclaimer across the bottom. The slip was dropped (bets stay visible as badges on the board) |

The gamble dialog's Collect button uses the same green Collect style, and all `.btn.cta` modal buttons (Refill, Continue, Reload, Play, Back to the board) now use the same flat accent-blue. Those dialogs are not otherwise restyled (batches 5/6).

## Behaviour
- **Bet field = TOTAL bet across all squares**, not the chip value (open question 1, first reading). It is an `<output>` (read-only). Chips still set how much one click/tap adds.
- **1/2** halves every square's bet, rounding down, never below 1. It is disabled when every square is already at 1.
- **x2** doubles every square, clamped to **10 per square**, then to **min(200, balance)** for the round. When the round or balance cap cuts in, the room left is shared one credit at a time in square order, so the squares stay within 1 of each other (30 squares × 5 → 20 × 7 + 10 × 6 = 200). The engine's toast explains the cap that applied ("Max bet reached – 10 per square", "Round limit reached – 200 per round", "Not enough credits"). x2 is disabled when nothing can grow.
- The limits come from `engine/config.js` (`MIN_BET`, `MAX_PER_SQUARE`, `MAX_PER_ROUND`) via the pure helper `src/ui/betscale.js`. The engine has no "scale bets" action and is locked, so `app.js` applies the result as the engine's own bet handlers do: one Undo step, ghosts cleared, only while betting is open (`canBet` and the engine's own `canDispatch` check). START still re-validates the total against 200 and the balance inside the engine.
- **Last bets** shows `round.totalBet` for each round, newest first, at most 5 (open question 2, first reading). The engine history stores stops and wins but not the bet, so `src/ui/bettotals.js` records the total at START, keyed by roundId (a restored round is not counted twice). It keeps the list in its own key `rl.v3.betTotals`, with unreadable data ignored. On a first load with no list, it is seeded from the saved last bets. (v5 moved this list to `rl.v5.betTotals`; see `docs/design-v5/v5-development-spec.md` §2.5. Mentions of the v3 key in these notes describe v3.)

## Fonts
Plus Jakarta Sans 800 is no longer used (it was only for the v2 chip numerals), so it was removed everywhere: `src/assets/fonts/plus-jakarta-sans-latin-800-normal.woff2` (11.9 KB), its `@font-face`, the boot preload in `main.js`, `public/fonts/LICENSE-PlusJakartaSans-OFL.txt`, the copy step in `scripts/copy-v2-assets.js`, and the `@fontsource/plus-jakarta-sans` devDependency (package.json + lock). The five v2 chip SVGs were deleted too. The bundle now has only Poppins 600 (8.0 KB), Poppins 700 (7.8 KB) and JetBrains Mono 600 (21.9 KB): 37.7 KB in total.

## No glows / shadows
Removed from the rail: chip-selected glow and lift, Rebet amber glow ring, the button `filter: brightness` hover, the CTA gradient, the Last-win card's green gradient, and the disclaimer box. The only ring left is the 2 px white focus/selected outline (tokens.md §3). A unit test checks the rail rules, and a UI test checks every rail element's computed `box-shadow`, `text-shadow` and `filter` are all none.

## Changed files
| File | Change |
|---|---|
| `src/ui/betscale.js` | **New.** `halveBets`, `doubleBets` (pure; engine limits; returns `{ bets, changed, limit }`). |
| `src/ui/bettotals.js` | **New.** `recordTotal`, `loadTotals`, `saveTotals` for "Last bets" (`rl.v3.betTotals`). |
| `src/ui/view.js` | New rail/dock markup: `betField`, `chipRow` (v3 chips), `mainButtons` (Start / Collect + Gamble ×2), `actionRow`, `lastBets`, `railNote`, plain disclaimer, 2-column dock. Credits line is now "Credits N" at the right of the "Bet amount" row. Modal Collect uses `.btn.collect`. Removed `totalBetField`, `lastWinField`, `betSlip` and the v2 chip import. |
| `src/ui/app.js` | `scaleBets('half' / 'double')` for `btn-half` / `btn-double` (toast, sound, one undo step, announcement); records each round's total at START and on load (`ui.betTotals`). |
| `src/ui/icons.js` | `chipFace(v)` (v3 flat chip); v2 chips dropped from the SVG glob. |
| `src/ui/layout.js` | Rail sizes from the tokens: pad 16/12, gap 12, input 40, chip 34 (40 tablet), secondary 32, primary 52/48/56. Unused `fieldH`/`actF`/`mainF`/`compact` removed. |
| `src/styles.css` | New flat rail/dock rules (`.rail`, `.dock`, `.betin`, `.acts`, `.mains`, `.lastbets`, `.rnote`, `.rdisc`, v3 `.chip`). Buttons: flat accent-blue primary, green Collect, btn-disabled colours, no filter/glow. Removed the `.panel`, compact/pending field and `.rw` rules and the Plus Jakarta `@font-face`. |
| `src/main.js` | Font preload list: Poppins 600/700 and JetBrains Mono 600 only. |
| `scripts/copy-v2-assets.js` | No longer copies the v2 chips or Plus Jakarta Sans. |
| `package.json`, `package-lock.json` | − `@fontsource/plus-jakarta-sans`; + `screenshots:v3` script. |
| `src/assets/fonts/plus-jakarta-sans-latin-800-normal.woff2`, `public/fonts/LICENSE-PlusJakartaSans-OFL.txt`, `src/assets/v2/chips/*.svg` | Deleted. |
| `test/unit/rail.test.js` | **New** (13 tests): x2 per-square / round / balance clamps (+ an exhaustive limit sweep), 1/2 floor at 1, last-bets order/dedupe/storage, rail sizes vs tokens, Start/Collect colours, no rail shadows, Plus Jakarta Sans gone. |
| `test/ui/ui.test.js` | + 4 tests: total-bet display, 1/2 · x2 clamping (10 per square, 200 per round, balance; toasts; Undo; disabled states; START plays the scaled bets), last bets per round, rail look (computed colours, sizes, no shadows). Updated: credits text (`Credits 1,000`), 1/2 and x2 in the lock check, font check (only the 3 v3 faces are registered). |
| `test/ui/screenshots-v3.js` | **New.** The batch-2 approach as a script: mockup betting scene (20 on 6 squares, chip 5, last bets 20 20 15 30 10) at 1920×1080, 1280×720 and 768×1024, plus `compare-*.png` (build left, mockup right, same height). `npm run build && npm run screenshots:v3`. |
| `docs/design-v3/batch-3/` | This file, `betting-{1920x1080,1280x720,768x1024}.png` and `compare-betting-{1920x1080,1280x720,768x1024}.png`. |

## Results
- `npm test`: **75/75 pass** (62 before + 13 in `rail.test.js`).
- `npm run build`: OK. CSS 34.2 KB / **7.89 KB gzipped** (budget 8 KB); JS 36.8 KB gzipped; fonts 37.7 KB.
- `npm run test:ui`: **35/35 pass** (31 before + 4 rail tests). No console errors, no failed or external requests, fonts local. Layout checks pass at 1920×1080, 1280×720, 1024×768 and 768×1024, plus the 390×844 fallback.
- `npm run sim:quick`: RTP **95.613%** (strategy A) / **95.656%** (strategy B, max gamble), both inside 95.45 ± 0.3: PASS. Double Run 3.99% / 4.02%, gamble 49.97%, E2 PASS. These match batch 2 exactly (same seeds, engine unchanged).
- `git diff main -- src/engine`: empty.
- Fairness wording rule: the existing unit and UI checks (`/provabl/i`) cover the new files and pass.

## Differences from the mockup
- **No Manual/Auto tabs.** There were none in the game to restyle, and Auto has no function (open question 6). The rail starts with the Bet amount row instead. Add it once Q6 is decided.
- **The primary button says "Start · 20 credits on 6 squares · Space", not "Place bet · Potential Win: 2,400".** Open question 7 (Place bet = START, and how Potential Win is defined) is not decided, and the centre copy (batch 4) still says "press START". Colours and sizes follow the mockup.
- **"Last bets" sits in the rail**, under Undo/Clear/Rebet, not top-right of the game area. The 56 px "Last results / Last bets" row above the track belongs to batch 4 (it changes the track box). Move it there in batch 4.
- **The rail note** ("Uncollected win …", "Last win … / no win this round") is not in the betting mockup. It replaces the v2 Last-win card so the uncollected/lost/Double Run status stays in the rail (component sheet "rail note").
- **25 chip numeral is dark (`#06210f`)**, not white: white on `#16a34a` is 3.3:1. This keeps the batch-1 legacy mapping (`chip-25-ink`).
- **The bet field is read-only.** You cannot type a total; chips and 1/2 · x2 change it.
- **Tablet dock** is taller than in the mockup, because the frame fills the viewport and the track is width-limited. The extra space sits above the disclaimer. The "Your bets" slip was removed.
- The track, centre panel, history row and pays row are still v2 (batches 4–5), so those parts of the compares do not match yet.

## Open issues
- **1/2 and x2 bypass `engine.dispatch`.** There is no engine action for them, so the UI writes `state.bets` / `state.undo` directly, the same way the engine's own bet handlers do, guarded by `canDispatch`. The engine still enforces the limits at START. A `SCALE_BETS` engine action would be cleaner, but it needs Rogin's approval (engine is locked).
- `rl.v3.betTotals` is a new UI-only storage key. It is cosmetic, and corrupt data is ignored, never an ERROR.
- Open questions 1, 2, 6 and 7 are implemented on their first reading (total bet, totals per round, no Auto, Start label) until confirmed.
- No keyboard shortcuts for 1/2 and x2 (they are reachable with Tab and Enter/Space). Add them to Help → Keyboard if wanted.
- At 768×1024 the tile square numbers still overlap the v2 bulbs (track, batch 4).
- `README.md` still describes the v2 fonts (Bungee, Plus Jakarta Sans). Update it in batch 7 cleanup.
