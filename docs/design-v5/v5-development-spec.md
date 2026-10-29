# Running Light v5: Development Spec (tier betting)

Status: plan only. No code has been written and nothing has been pushed. Simulated play credits only. This spec makes no claim that the game is provably fair, secure, or compliant.
Repo: `roginjohn/running-light`, base `main` @ a760ce5 (tag `v3-batch-7`, live on gh-pages 353326d).
Inputs:
- `math-v5/MATH-SPEC-C.md` (approved)
- mockups on `v5/tier-design` @ c40bdec, `docs/design-v5/tiers/` (approved)
- `src/engine/config.js`
- `CONTRIBUTING.md`

Excluded: the Christmas theme (on hold) and the v4 mobile design branch, which is only a reference for mobile rules.

## 1. Scope

In scope:
1. The player bets on 6 **tier spots** (5x, 10x, 20x, 50x, 100x, 200x) instead of on single squares. The board ring is display-only.
2. Math C board: 30 tier squares and 20 blank squares, total weight 10476, about 95.4% payback on every tier.
3. Double Run stays at 1 round in 25. The second light stops on a different square, and each light pays on its own.
4. Limits are 1,000 per tier spot and 1,000 per round. Chips are 1/5/10/25/50/100/500, which fixes the bug where the maximum bet was 10 even with a 50 chip.
5. Credits start at 10,000 and refill to 10,000. The gamble cap is 300,000.
6. UI per the approved mockups: tier spots, blank "no win" squares, the paytable with real odds, and the win, Double Run and no-win states. Desktop and phone portrait (390×844, 360×640).
7. Accessibility, tests, and docs (CONTRIBUTING update).

Non-goals:
- Christmas or any seasonal theme
- Real money, payments or accounts
- A server-side RNG
- Fairness, security or compliance claims
- A redesign of the gamble flow (it stays as in v3, only the cap changes)
- Landscape phone and tablet layouts beyond the current responsive behaviour (open item)
- Sound redesign
- Deleting the v1 files (needs Rogin's approval)

## 2. Engine changes (`src/engine/`, unlocked for v5 with Rogin's approval)
CONTRIBUTING's "Locked" rule is replaced by "v5 math locked = MATH-SPEC-C". After batch 2, `git diff` of `src/engine` against the batch-2 tag must be empty for every UI batch.

### 2.1 config.js
| Constant | v3 | v5 |
|---|---|---|
| TIERS | 24/96/480/960/1920 | 5,10,20,50,100,200 |
| COUNT_BY_TIER | 21/19/7/2/1 | 12,8,4,3,2,1 + BLANK_COUNT 20 |
| WEIGHT_BY_TIER (per square) | 80/20/4/2/1 | 160,120,120,64,48,48; BLANK_WEIGHT 339 |
| TOTAL_WEIGHT | 2093 | 10476 (assert) |
| SQUARES_BY_TIER | B1 table | MATH-SPEC-C §3 (200x: 8; 100x: 21,46; 50x: 3,29,38; 20x: 13,17,33,42; 10x: 5,11,15,24,27,35,40,49; 5x: 1,6,7,9,18,20,23,26,32,36,43,48) |
| BLANK_SQUARES | none | 2,4,10,12,14,16,19,22,25,28,30,31,34,37,39,41,44,45,47,50 |
| MULT[n] | tier | tier, or 0 for a blank square |
| CHIPS | 1,5,10,25,50 | 1,5,10,25,50,100,500 |
| MAX_PER_SQUARE 10 | | removed, replaced by MAX_PER_TIER 1000 |
| MAX_PER_ROUND | 200 | 1000 |
| START_CREDITS / REFILL_AMOUNT | 1000 | 10000 |
| GAMBLE_CAP | 30000 | 300000 |
| MAX_GAMBLES, DOUBLE_RUN_ONE_IN, DEFAULT_CHIP, MIN_BET | 3, 25, 1, 1 | unchanged |
| TOASTS | "10 per square", "200 per round" | "Max bet reached – 1,000 per tier", "Round limit reached – 1,000 per round" |

Other config changes:
- `assertConfig` checks that the tiers plus the blanks cover squares 1–50 exactly once, the counts, and that TOTAL_WEIGHT is 10476.
- `assertArrangement` accepts a `"blank"` label.
- Add `pStopTier(t)`, which is the count times the weight divided by 10476, and `pRoundTier(t)`.
- `squarePos` and the ring geometry stay the same. Phone ring shapes are a UI concern.

### 2.2 RNG and weighted stops (rng.js, outcome.js)
- Production keeps using `crypto.getRandomValues`. Seeded sfc32 is for tests and simulation only, and the player can never choose it.
- The draw is weighted over the 50 squares with the new weights. It must use rejection sampling (a uint32 below `floor(2^32/10476)*10476`) to avoid modulo bias. Check the existing implementation and keep it if it already does this.
- Double Run: with probability 1/25, the engine makes a second weighted draw that excludes the first square (redraw or renormalise; this is the same logic as today).

### 2.3 Bets (bets.js)
- The bet map key is a tier (5, 10, 20, 50, 100, 200), not a square. `isSquare` becomes `isTier`.
- A bet is rejected or clamped when tier+chip goes over 1,000, when the round total goes over 1,000, or when the bet is more than the balance. Each case shows the matching toast.
- Validation is all-integer. Unknown keys are dropped.

### 2.4 Settlement (game.js / outcome.js `payout`)
- `payout = Σ over lights L of MULT[L] × bet[MULT[L]]`. A blank square pays 0.
- If both lights land on the same tier, that tier pays 2 × M × bet. The maximum single-round win is 200,000, because the 200x tier has only one square.
- The result object lists, for each light, the square, the tier (or blank) and the amount, plus the total. The UI uses it for the "×2" display.
- Gamble: offered on a win of 300,000 or less, at most 3 gambles, with the existing fair 50/50 logic. Only the cap changes.

### 2.5 Storage, balance reset and migration (storage.js)
- New keys `rl.v5.*` (balance, settings, lastBets, round, history).
- First v5 load:
  - If `rl.v5.balance` is missing, set the balance to 10,000. Old v1 balances are **not** carried over.
  - Settings (sound and similar) are copied from `rl.v1.settings`.
  - lastBets, round and history from v1 are ignored, because they are square-keyed and can't be mapped.
  - The `rl.v1.*` keys are not deleted in v5. Leave them in place, since deleting them is out of scope without Rogin's OK.
- If an in-progress round saved under v1 is found, it is discarded with no payout. There is a one-time toast: "Game updated – credits reset to 10,000".
- When the balance is below the minimum bet, the refill sets it to 10,000.
- Storage that won't load or is corrupt falls back to 10,000 and the in-memory backend. The existing "Progress won't be saved" toast stays.

## 3. UI changes (per `docs/design-v5/tiers/SPEC.md`)
1. **Ring:**
   - It is display-only, with no click, hover or keyboard bet targets on squares.
   - Squares show their tier label. Phone squares drop the "x" and the number.
   - Blank squares get hatching, a dashed border and ⊘, plus "No win" on desktop.
   - Ring shapes: 16×11 on desktop, 11×16 on phones, and 12×15 at 700 px tall or less.
2. **Tier spots** sit in the ring's centre (3×2 on desktop, 2×3 on phones), ordered 200x → 5x. Each spot shows:
   - the multiplier
   - "1 in X" per light (218.3 / 109.1 / 54.56 / 21.83 / 10.91 / 5.46)
   - the square count (hidden at 700 px tall or less)
   - the bet ("Bet N" or "No bet")
   States: a bet adds a blue border, a win turns the spot green with "Won N", and a spot that bet and lost fades to 60%.
3. **Legend:** "Blank square · no win · 20 of 50".
4. **Tier colours:** every tier gets its own token (`--tier-5` … `--tier-200`) in `design-tokens-v3.json` → tokens.css. Text and border contrast must be at least 4.5:1 (text) and 3:1 (UI). The tier label always names the tier, so colour is never the only cue.
5. **Chips:** 7 chips. Desktop has a 4+3 grid of 56 px chips. Phones have one row of 44 px chips. 100 = violet `#6d28d9` and 500 = amber `#b45309` become tokens after the contrast check. Keyboard keys 1–7 pick a chip, and the touch-screen shortcut list is hidden (fix from the v3 audit).
6. **Controls:** total "N / 1,000", Undo, Clear, and Start, with "N on K spots" on Start's second line. After a win, Collect and Gamble replace the actions and the chips are disabled. Bets persist between rounds, and "Start again" replays them. There is **no Rebet**.
7. **Results:**
   - A paying lit square turns green. A lit blank square is white.
   - The other squares of the winning tier get a green outline.
   - In Double Run, the lit squares carry "1" and "2" badges and the headline lists both lights. If both land on the same tier, the spot shows the total and "×2".
   - When nothing wins, a red "No win" pill shows with the "Blank square" headline (or a tier with no bet), and the bets are kept.
8. **Paytable:** a 920 px dialog on desktop and a full-screen card sheet on phones. It shows tier, squares, square numbers, the chance per light and the share of stops, plus Blank and Total rows. It shows **one 95.4% payback figure**, "30 tier + 20 blank = 50", the note that squares are not equally likely, and the Double Run note ("In Double Run (1 in 25 rounds) a second light can pay too, so a round hits slightly more often").
9. **Text:** help explains multiplier betting and blanks, says play credits only, and contains no fairness or compliance wording. A banned-word check runs in tests.
10. **Performance:** the v3 budgets are kept. No heavy animation. Fonts load locally and the page makes no external requests.

## 4. Accessibility
- Tier spots are `<button>`s with an accessible name, for example "200x, 1 in 218, bet 25".
- Chips are a radiogroup. Results are announced through an `aria-live="polite"` region (for example "Light stopped on square 8, 200x. Won 5,000").
- The ring is `aria-hidden` apart from a text summary.
- Tap targets are at least 44 px. Text is at least 12 px and body text at least 14 px. The page doesn't overflow at 360×640.
- Keyboard: Tab through the spots, Enter/Space to bet, 1–7 for chips, the Start key unchanged.
- `prefers-reduced-motion` shortens the light animation. Visible focus rings.
- Contrast: AA for all tier, chip and blank tokens, checked by a unit test on the token values.

## 5. Acceptance criteria
1. The engine constants match §2.1, and `assertConfig` passes with TOTAL_WEIGHT 10476.
2. Exact per-tier payback, from enumerating every 1-light and Double Run outcome, is in [95.34%, 95.39%] for every tier.
3. A seeded 10M-round simulation gives each tier's payback within ±0.5 pp of 95.4% (±1.0 pp for 100x/200x), and Double Run within 4% ± 0.05.
4. Bets of up to 1,000 on one tier and 1,000 in a round are accepted, and the 1,001st credit is refused with a toast. The 50/100/500 chips add their full value.
5. A blank square pays 0. Two lights on the same tier pay 2×. Two different tiers each pay. The gamble is offered only on wins of 300,000 or less.
6. A fresh load or an existing v1 save gives a balance of exactly 10,000, the v1 keys are untouched, and the toast is shown once.
7. The UI matches the mockup PNGs at 1920×1080, 390×844 and 360×640 (visual review by Rogin). The ring can't be tapped to bet.
8. No console errors, no external requests, no banned wording, and the accessibility checks in §4 pass.
9. `npm test`, `npm run test:ui` and `npm run sim:quick` (target 95.4% ± 0.3) all pass on each batch.

## 6. Test plan
**Unit tests (node:test).** math.test.js is rewritten:
- config invariants
- exact RTP enumeration per tier (formula with DR: E = M·[p_t + (1/25)·Σ_i p_i·(p_t − [i∈t]·p_i)/(1−p_i)]… implemented by brute-force over the ordered pairs i≠j)
- a weighted draw frequency check (seeded 1M draws, each square within 4σ)
- the rejection sampler has no modulo bias
- Double Run excludes the first square

Other unit tests:
- bets: limits, chips, balance, and undo/clear
- settlement: blank, same tier, two tiers, and the 200,000 maximum
- gamble cap at 300,000
- storage: fresh load, v1 migration, corrupt data, memory fallback, refill
- tokens: contrast ratios
- text: banned words

**Seeded simulation.**
- `scripts/simulate.js` is updated for tier bets.
- `sim:quick` is 1M rounds with a fixed seed, so the output is deterministic and is snapshotted.
- The full `sim` is 20M rounds, run on batches 2 and 6.

**UI (puppeteer, test/ui).**
- Placing chips on spots updates the totals, and the limit toasts appear.
- Clicking a square does nothing.
- A forced seed shows the win, the no-win and Double Run (same-tier ×2 and two tiers) as in the mockups.
- Collect, Gamble and the cap.
- Bets persist after a round. Paytable open/close and focus trap.
- Phone viewports at 390×844 and 360×640: no overflow, 44 px targets, shortcut list hidden.
- Migration: seed a `rl.v1.balance` of 500, then reload and expect 10,000 plus the toast.
- No console errors or external requests.
- Screenshot comparison against `docs/design-v5/tiers/png`.

## 7. Batches (branch `v5/batch-N-<name>`, merged and tagged `v5-batch-N` only after the checks pass and Rogin approves)
1. **v5/batch-1-docs-tests-scaffold:**
   - copy the approved design docs to main
   - update CONTRIBUTING (v5 rules and checks)
   - add failing-safe test fixtures for Math C (skipped)
   - no engine change
2. **v5/batch-2-engine-math:**
   - config.js, the weighted draw and Double Run
   - per-tier settlement, bets keyed by tier, limits and chips, gamble cap
   - exact RTP plus seeded sim tests, and simulate.js
   - the engine is complete and then locked; the UI keeps working through a temporary adapter
3. **v5/batch-3-storage-migration:** the `rl.v5` keys, the 10,000 reset, settings carry-over, the one-time toast, and the refill.
4. **v5/batch-4-board-display:**
   - the display-only ring
   - blank square styling and the legend
   - tier colour tokens (contrast-checked) and the 100/500 chip tokens
   - phone ring shapes
5. **v5/batch-5-tier-spots-controls:**
   - the six spots and the chip rail/dock with 7 chips
   - totals, Undo/Clear/Start, bets persisting, keys 1–7, and touch hiding the shortcuts
6. **v5/batch-6-results-paytable:** the win, no-win and Double Run states (badges, ×2), Collect/Gamble, the paytable dialog and sheet, and help text; the full 20M sim.
7. **v5/batch-7-a11y-perf-polish:** ARIA and live region, reduced motion, the contrast audit, screenshots against the mockups, the perf budget, and the banned-word check.
8. **v5/batch-8-release-candidate:** a full regression, the build, and a preview for Rogin. **Publishing to gh-pages needs Rogin's separate approval** (tag `v5.0`).

Every batch is checked with `npm test`, `npm run test:ui` and `sim:quick`. From batch 3 on, `git diff v5-batch-2 -- src/engine` must be empty, apart from the batch-3 change to storage.js. Each batch also gets a design screenshot review.

## 8. Rollback
- The v5 work stays on branches until it is merged. Tags `v5-batch-N` mark each step.
- If the live site breaks, re-publish gh-pages from tag `v3-batch-7` (the current live v3) by building it and copying `dist/` to gh-pages. `v2-baseline` remains the older fallback.
- `main` can be reset with `git revert` of the v5 merges. Nothing is force-pushed without Rogin's OK.
- Player saves: v1 keys are kept, so going back to v3 restores the old v3 balances.

## 9. Open items for Rogin
1. Landscape phones and tablets aren't mocked for v5. The plan follows the current responsive approach. Should they be mocked first (v4 option A playable vs B rotate)?
2. The 100/500 chip colours (violet/amber) and the new per-tier colours are pending contrast checks. Should he review swatches?
3. Should the board hint at unequal odds (for example a stop-share bar on each spot), or is the paytable enough?
4. The migration resets every saved balance to 10,000 and leaves old v1 data in the browser. Is that OK? (Deleting old keys or files needs his approval.)
5. Gamble flow details (3 gambles, 50/50) stay as in v3. Confirm.
6. Do the defaults stand? These are odds shown per light, one 95.4%, no Rebet, and "×2" for a same-tier double.
7. A publish date and a separate publish approval after batch 8.
