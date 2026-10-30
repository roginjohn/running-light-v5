# v3 Batch 2: page frame and bottom bar

Branch `v3/batch-2-frame`. Not committed. This batch changes the page frame, the bottom bar, stacking (z-index) and the purple v2 tints in `src/styles.css`. Rail controls, the track and centre display, result states, overlays and small screens are not restyled. Nothing under `src/engine/` was touched.

## What moved where
| Before (v2) | After (v3 batch 2) |
|---|---|
| Top header bar (`#r-hdr`: bunting, logo "Running Light", play-credits pill, tagline) | **Removed.** There is no top bar. The board starts at the top of the frame. |
| Logo + "Running Light" (header, left) | Bottom bar, centre: the v3 mark (a ring of 8 squares) + **Running Light** |
| Tagline "Play credits only · No real money value" (header, right) | Bottom bar, centre, after the title: `Running Light · Play credits only · No real money value`. Below 640 px of frame width only "· Play credits only" is shown. |
| Play-credits pill with balance and "+N" delta (header, centre) | Top of the rail: a **Play credits … 1,000** line (`#r-credits`, `data-role="balance"`, the delta shows as green "+N"). In tablet portrait it is at the top of the left dock panel. It has its own region, so the balance count-up only repaints that line. Batch 3 can merge it into the "Bet amount / Credits" row. |
| Utility bar inside the stage (`#r-util`: sound, settings, paytable, help, lock line, keyboard hints) | **Replaced** by the bottom bar (`#r-bar`) across the full frame width. |
| ↳ Sound icon | Bottom bar left (1st). Toggles mute, now a `role="switch"` with `aria-checked`. |
| ↳ Settings icon | Bottom bar left (2nd). Opens Settings. |
| ↳ Paytable icon (`icon-info`) + How to play icon (`icon-help`) | One **stats** icon (`icon-stats`), bottom bar left (3rd). It opens the Info window on the Paytable tab, and the Help tab is next to it. |
| — | **Results (scales) icon** (`icon-results`), bottom bar right. It opens the "How results are decided" panel. |
| ↳ Lock line "Info & Settings unlock when the round ends / open again after you collect" | Lock badges stay on the locked icons. The reason moved into each icon's `aria-label` and `title` ("Settings: unlocks when the round ends"). |
| ↳ Keyboard hints (desktop) | Dropped from the bar. They are all still listed in Help → Keyboard. |
| Stage panel (bordered card with a radial tint) | The game area is now the frame itself (bg-frame). `#r-stage` is just the positioning box. |
| Rail panel (bordered card, 356–440 px) | 230 px rail column on the bg-rail fill, with a 1 px divider (`.frame-rail`). The controls sit directly in it. |
| "Your bets" slip in the rail (desktop) | Not shown in the 230 px rail (bets stay visible as badges on the board). It is still in the tablet-portrait dock. |

No star icon was added. The v2 `logoMark` export (the purple/amber bulb mark) was removed because nothing uses it any more.

## Frame (tokens.md §4)
- Page: flat `bg-page` (the radial amber/cyan gradients are gone).
- Frame: centred, `min(1600, W−32) × min(980, H−32)`, radius 8, `bg-frame`. At 1920×1080 this is 1600×980 at (160, 50). At 1280×720 it is 1248×688 at (16, 16).
- Rail: 230 px `bg-rail` plus a 1 px `divider` border. The game area starts at frame.x + 231.
- Bottom bar: 40 px, full frame width, `bg-bottombar`, bottom corners rounded. Icons are 18 px in 32 px hit boxes, text is label-sm 12/600 in text-muted, and the title is text-primary. Hover and "sound on" use a bg-input fill. These are instant class swaps with no colour transitions.
- Tablet portrait: game area, then the dock, then the bottom bar, all inside the frame.
- The track is centred in the game area. No 56 px "Last results / Last bets" row is reserved yet; that row belongs to batch 4.

## Rail controls in the new container (not restyled)
The v2 components are unchanged except where the 230 px width forces a different variant:
- Undo / Clear / Rebet are text-only (no icon or key cap; this matches the mockup). Collect and Gamble ×2 stack vertically.
- Main button 64 px at 1920 (56 px elsewhere) with a smaller label size, so "Start · N credits on N squares · Space" fits.
- 1280×720 and 1024×768 use the existing compact field variant (as tablet-landscape already did). The shorter Total bet / Last win cards drop their note lines there. 1920 keeps the full fields with notes.
- Known batch-3 items: the "LAST WIN" label wraps beside the "UNCOLLECTED" tag in the narrow rail. The chips are still the v2 SVGs.

## Results panel
UI-only modal (`ui.results`; the engine has no state for it). It has the same lock as Settings/Info: disabled from START until the round settles. Esc or ✕ closes it and focus returns to the icon. While it is open the board is inert and game keys are ignored (M still mutes). Copy, with numbers read from `engine/config.js`:
- Drawn first: the result is drawn and saved on this device at START, before the light runs. The animation only shows it, and reloading shows the same result.
- Weighted by 1 ÷ multiplier: weights 80 / 20 / 4 / 2 / 1 of 2,093.
- Double Run 1 in 25 (the second light never stops on the first square). Gamble 50/50 is drawn before the flip.
- RTP about 95.45% (theoretical long-run average). The randomness is the browser's crypto RNG, and nothing is sent anywhere.
- No outcome-verification wording anywhere. A unit test greps `index.html`, `src/main.js` and `src/ui/` for "provabl", and a UI test checks the rendered DOM.

## z-index (deferred from batch 1)
- `gen-tokens.js` now emits the v3 `z` tokens verbatim (`--z-track 1, --z-light-layer 2, --z-centre 3, --z-toast 20, --z-scrim 30, --z-dialog 31`).
- `legacy.z` now holds only the layers v3 does not name, slotted between them: `frame 0, tags 4, focus 5, hud 10, tooltip 25, celebration 32, screen 40`. The colliding v2 `--z-toast: 70` / `--z-scrim: 90` are gone. The generator throws if a legacy name repeats a v3 one.
- Every `z-index` in `styles.css` is now a `--z-*` token. Exceptions are the small numbers inside `.tile` and `.he`, which are their own stacking contexts. Removed hard-coded values: 20/24/25 (tiles), 25 (centre), 30 (util), 35 (tags), 111 (celebrate), 300 (screens), 6 (focus) and `--z-hud-over-scrim`.
- Order (unit-tested): track < light-layer < centre < tags < hud (rail, credits, bottom bar) < toast < tooltip < scrim < dialog < celebration < screen.

## v2 colours removed from `src/styles.css`
All purple tints were replaced with v3 tokens:
- Page `.bg` gradients → bg-page.
- Header gradient → removed.
- Tile gradient `#221C3E` / `#2A2350` → tile / tile-border. Tile hover `#2E2752` → bg-input. Lit/win tile `#3A2E40 → #2B2340` → tile.
- Off bulb `#5A4F86…#2A2342` → bulb-off. Trail end stops `#4A3D45` / `#34405A` → bulb-off-rim.
- Ghost badge, key caps, disabled secondary button (`rgba(10,8,21)` / `rgba(28,23,52)`) → bg-card-pill / bg-segment. Disabled icon border `rgba(47,40,82)` → divider.
- Centre panel `rgba(10,8,21,.55)` → bg-frame. Tooltip `#0F0C1E` → bg-frame. Toasts `#241226` / `#0F2620` → bg-card.
- Gamble white idle disc `#8D8A99 / #3E3B50` → border-input. Header delta mint tint → accent-green-text.

A unit test fails if any of those values come back. **Still hard-coded (left for their batches):**
- Amber/mint/cyan/coral rgba glows and tints on tiles, pills, fields and notices, plus the warm/cyan bulb gradients (batch 4/5).
- Gamble/celebration gradients (batch 6).
- The bunting and confetti colours in `view.js` (start/loading screens, batch 6).

## Changed files
| File | Change |
|---|---|
| `index.html` | `#r-bg`, `#r-hdr`, `#r-util` → `#r-frame`, `#r-credits`, `#r-bar`. |
| `src/ui/layout.js` | `FRAME` constants. Frame/rail/stage/bar/dock geometry inside the frame. Rails are 230 px. `L.header` is now the frame top. |
| `src/ui/view.js` | `header()` → `pageFrame()`, `credits()`. `util()` → `bottomBar()`. New `resultsModal()`. Rail container class, text-only action row and stacked offer buttons in the rail, bet slip removed from the rail. Full-window dialogs dim the whole page. |
| `src/ui/app.js` | Regions, results panel open/close/keys, `icon-stats` / `icon-results` / `f-close` actions, focus returns to the opening icon, balance tweens repaint `credits`. |
| `src/ui/icons.js` | `v3icon('stats' / 'scales')` and `v3mark()` (inline SVG, currentColor). Removed the unused `logoMark`. |
| `src/styles.css` | Frame, rail, credits and bottom-bar styles. z-index on tokens. Purple v2 colours replaced. `.facts` list for the results panel. Removed header/logo/balance/tagline/util styles. |
| `src/data/design-tokens-v3.json` | `legacy.z` rebased onto the v3 scale (note updated). |
| `scripts/gen-tokens.js` | Emits the v3 `z` tokens and rejects legacy/v3 name collisions. |
| `src/styles/tokens.css` | Regenerated. |
| `test/unit/frame.test.js` | **New.** Frame constants vs tokens.json; geometry at 1920/1280/1024/768; no "provably". |
| `test/unit/tokens-v3.test.js` | + z-index test, + no-purple-tint test. |
| `test/ui/ui.test.js` | Selectors updated (`#r-hdr` → `#r-credits`; `#r-util` lock line → icon `aria-label`; `icon-info` / `icon-help` → `icon-stats` / `icon-results`; small-text scan covers `#r-bar` and `#r-credits`). + 4 tests: frame geometry and fills at 1920/1280, bottom-bar contents (no star), icon actions, results panel. Console-error and external-request checks are unchanged. |
| `docs/design-v3/batch-2/` | This file and screenshots: `betting-1920x1080.png`, `betting-1280x720.png`, `win-1920x1080.png`, and one of the results panel. |

## Results
- `npm test`: **62/62 pass** (54 before + 6 frame tests + 2 token tests).
- `npm run build`: OK. CSS 7.5 KB gzipped (budget 8 KB).
- `npm run test:ui`: **31/31 pass**: no console errors, no failed or external requests, fonts local. Layout checks pass at 1920×1080, 1280×720, 1024×768 and 768×1024, plus the 390×844 fallback.
- `npm run sim:quick`: RTP **95.613%** (strategy A) / **95.656%** (strategy B, max gamble), both inside 95.45 ± 0.3: PASS. Double Run 3.99% / 4.02%, gamble 49.97%, E2 PASS.
- `git diff main -- src/engine`: empty.
- Screenshots compared by eye with `betting.png`, `betting-1280x720.png` and `win-gamble-offer.png`. The frame, rail column, divider, bottom bar layout and centre text match. The rail contents, track and centre still look v2 (batches 3–5).
