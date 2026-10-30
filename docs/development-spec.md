# Running Light: Final Development Specification (Stage Seven, for Development Session Two)

From: Online Casino Game Specialist (agent id `7cde1a84-18b1-4ca9-82f8-bfdbfe60ec03`), for Rogin John · Date: 2026-10-22 (Asia/Manila)
Project root: `/workspace/casino-games/running-light/` · **Write all code to `/workspace/casino-games/running-light/game/`**

> This document is **self-contained**. You (Claude CLI Specialist, new development session) have no memory of earlier sessions. Everything you need is restated here. Where a file is referenced, it is the approved visual source of truth and you must open it.
> **Authorisation:** this session is for implementation, integration and testing only. The design (Session One, revision 1) and every rule below were **approved by Rogin on 2026-10-22**. Do not change approved gameplay, math or design without approval. Raise unclear or design-changing issues (see §G) instead of inventing a solution.

---
## A. Project Overview
- **Title:** Running Light (working title; keep the logo as live text so it is easy to rename).
- **Concept:** a digital version of the Philippine perya (local carnival) "Running Light" game. The player bets play credits on numbered squares of a 50-square bulb track. A light runs around the track, slows and stops on one square. Bets on that square win its multiplier. Rare **Double Run** rounds light a second square. After any win the player may **gamble** (double-or-nothing, pick red or white).
- **Objectives:** a polished, faithful reproduction of the approved mockups. Exact, testable math. Robust state handling (no duplicate actions, no redraw on refresh).
- **Platform:** **desktop browser only**, 16:9, 1920×1080 reference stage, scaled uniformly (letterboxed) down to a 1280×720 minimum. Mouse + keyboard. Current Chrome, Edge and Firefox (Safari is best-effort).
- **Credits:** **simulated play credits only.** No real money, no payments, no purchases, no wallets, no cash-out, no accounts, no backend.
- **Tech stack (not specified by Rogin; recommendation):** a **static front-end build with no backend**, runnable by opening a local static server (e.g. `npx serve game/dist` or `python3 -m http.server`). Suggested: TypeScript + Vite, DOM/SVG/CSS rendering (the assets are SVG), Vitest for unit tests, Playwright for screenshots. **First inspect `/workspace/casino-games/running-light/`**, check which tools are installed on the box (node, npm, python, browsers), then choose the simplest viable stack and **report your choice and the reasons**. Keep the pure game logic (math, RNG mapping, state machine, persistence) in a framework-free module that runs in Node, so the simulation and tests exercise the exact code the UI uses.
- **Required deliverables** (all under `game/`):
  1. Source code + build config, plus a README (how to install, run, test and build).
  2. A built static bundle (`game/dist/`), playable offline: fonts and assets bundled locally, no CDN at runtime.
  3. Unit/integration tests and a seeded simulation script (§E), with saved outputs in `game/test-results/`.
  4. Screenshots of key states in `game/test-results/screenshots/`, each next to its mockup for comparison (§E4).
  5. Audio files (or a documented procedural Web Audio implementation), with a licence/source record per file.
  6. An implementation report (`game/IMPLEMENTATION-REPORT.md`) in the format of §H.

## B. Approved Game Design

### B1. Paytable, layout and weights [approved]
Multiplier = **total return including the stake** (e.g. 5 credits on a 96x square returns 480).

| Tier | Count | Integer stop weight per square | Per light stop | Per round incl. Double Run |
|---|---|---|---|---|
| 24x | 21 | 80 | 80/2093 = 3.8223% | ≈1 in 25 (3.9742%) |
| 96x | 19 | 20 | 0.9556% | ≈1 in 101 (0.9947%) |
| 480x | 7 | 4 | 0.1911% | ≈1 in 503 (0.1990%) |
| 960x | 2 | 2 | 0.0956% | ≈1 in 1,005 (0.0995%) |
| 1920x | 1 | 1 | 0.0478% | ≈1 in 2,010 (0.0498%) |

Total weight = 21·80 + 19·20 + 7·4 + 2·2 + 1 = **2,093**.

**Fixed layout (approved default).** Numbering: #1 is top-left and runs clockwise. Top row #1–16 left→right (grid col n−1, row 0). Right column #17–25 top→bottom (col 15, row n−16). Bottom row #26–41 right→left (col 15−(n−26), row 10). Left column #42–50 bottom→top (col 0, row 10−(n−41)). Grid pitch 76 px from origin (46,114), square face 70×70.

| Tier | Squares |
|---|---|
| ★1920x | 8 |
| 960x | 21, 46 |
| 480x | 3, 13, 18, 29, 34, 40, 49 |
| 96x | 2, 5, 7, 10, 12, 15, 17, 20, 23, 25, 27, 30, 32, 35, 37, 39, 42, 44, 47 |
| 24x | all others: 1, 4, 6, 9, 11, 14, 16, 19, 22, 24, 26, 28, 31, 33, 36, 38, 41, 43, 45, 48, 50 |

The machine-readable source is `design/session-one/design-tokens.json → board-arrangement`. Assert at startup and in tests that it matches this table and the counts 21/19/7/2/1.

### B2. Outcome generation (exact algorithm) [approved]
- **RNG:** `crypto.getRandomValues` (Node: `crypto.webcrypto` or `crypto.randomInt`). `randInt(n)`: draw a uint32 `x`; reject while `x ≥ floor(2^32/n)·n`; return `x mod n`. Never use `Math.random` in production. Inject the RNG behind an interface so tests and the simulation can use a **seeded PRNG** (e.g. xoshiro128** / sfc32 with a documented seed). The seeded PRNG is test mode only and must not be selectable by players.
- **Per round, in this order, all before any animation:**
  1. `s1 = weightedPick(weights)`: `r = randInt(2093)`, then walk squares 1..50 accumulating weights and pick the first square where `cumulative > r`.
  2. `doubleRun = (randInt(25) === 0)` (probability exactly 1/25).
  3. If `doubleRun`: `s2 = weightedPick(weights with s1's weight set to 0)`, using `randInt(2093 − w[s1])`. Therefore `s2 ≠ s1` always, and P(s2=j | s1) = w_j / (2093 − w_{s1}). If not, `s2 = null` (no draw).
- **Payout:** `win = Σ_{i ∈ {s1, s2}, i ≠ null} bet[i] · mult[i]`. A square pays at most once (s1≠s2 guarantees this). Integer arithmetic only.
- **Theoretical RTP** (exact analysis in `math/model.py`, `math/results.md`): per square 95.381% (24x) – 95.526% (1920x). **95.451%** for an even bet on all 50 squares. Base game without Double Run 91.734%. Max base round win at limits: 10·1920 + 10·960 = **28,800**.

### B3. Gamble (double-or-nothing) [approved]
- Offered after any round with `win > 0` (state GAMBLE_OFFER). The player chooses **Collect** or **Gamble ×2** (in the right panel, replacing START).
- Gamble opens the **flip modal**. The player must **pick RED or WHITE** (no default on flip 1; the pick persists between flips and can be changed before each flip). Pressing GAMBLE then draws `result = randInt(2) === 0 ? 'red' : 'white'` (exactly 50/50). The draw is stored **before** the 1.2 s reveal.
- Match → `win = win × 2`, `gamblesUsed += 1`. Back to the offer inside the modal (pick again or Collect). Mismatch → `win = 0` → PAYOUT(0).
- **Max 3 gambles** per round. **Cap 30,000:** Gamble is disabled (tooltip "Doubling would exceed the 30,000 cap") when `2 × win > 30,000`. It is also disabled after 3 gambles (tooltip). The cap never truncates a win; it only disables further gambling. An even 50/50 gamble leaves RTP unchanged.
- Collect is always available in GAMBLE_OFFER and in the modal between flips.

### B4. Bets, chips, credits [approved]
- Chips: **1, 5, 10, 25, 50**. Selected chip is highlighted. Default selection is 1.
- **Per square 1–10 credits. Per round 1–200. Total bet must also be ≤ balance.** Adding a chip is **clamped** to the remaining room (square cap, round cap, balance), and a toast shows when clamped or blocked: "Max bet reached – 10 per square", "Round limit reached – 200 per round", "Not enough credits". Adding nothing (room = 0) → toast only, no state change. Chips are not disabled for limits.
- Right-click or Shift+click a square removes one chip of the selected value (floor 0). **Undo** reverts the last bet action (stack for the whole betting phase). **Clear** removes all bets. **Rebet** restores the previous round's bets if affordable and within limits (else disabled, tooltip "Not enough credits for last round's N bet").
- After a **loss**, bets stay on the board live (ready to START again). After **Collect/PAYOUT**, the last bets show as dashed **ghost** badges for Rebet and the board is empty of live bets.
- **Starting credits 1,000.** **Free refill to 1,000, unlimited, no cooldown**: when balance < 1 and no round is pending, the Refill modal opens automatically and cannot be dismissed. It only offers "Refill". Credits are integers ≥ 0.
- **Not in v1:** Reset credits, Rebet ×2, tutorial.

### B5. State machine [approved]
`INIT → (RECOVERY) → BETTING → SPINNING → RESOLVING → [DOUBLE_RUN] → (GAMBLE_OFFER ⇄ GAMBLE) → PAYOUT → BETTING`. Any state → `ERROR`. A loss goes RESOLVING → BETTING (bets kept, no PAYOUT animation needed; the round is settled with win 0).

| State | Entry actions | Accepted input | Exit |
|---|---|---|---|
| INIT | load assets/fonts, read storage, validate | none | pending unsettled round → RECOVERY; else BETTING (or Refill modal if balance < 1) |
| RECOVERY | show "Round restored" modal (09b) | Continue | to the stored phase using **stored** outcomes (no redraw) |
| BETTING | squares unlocked | chips, squares, Undo, Clear, Rebet, START, Info, Settings, Sound | valid START → SPINNING |
| SPINNING | deduct bet, draw outcome, persist record, lock squares, run light 1 | Sound/mute only | light 1 stopped → RESOLVING |
| RESOLVING | show stop, evaluate | none | doubleRun → DOUBLE_RUN; win>0 → GAMBLE_OFFER; win=0 → settle → BETTING |
| DOUBLE_RUN | banner, light 2 (2–3 s) | Sound only | stop 2 → win>0 ? GAMBLE_OFFER : settle → BETTING |
| GAMBLE_OFFER | Collect + Gamble ×2 in right panel; Last Win shows the uncollected win (gold) | Collect (Enter), Gamble (G) if allowed, Sound | Collect → PAYOUT; Gamble → GAMBLE |
| GAMBLE | flip modal, pick, then reveal | R/W/←/→ pick, G/GAMBLE (needs pick), Enter/COLLECT, Space on focused control | match → stays in modal as an offer (≤3) / Collect → PAYOUT; mismatch → PAYOUT(0) |
| PAYOUT | credit win (count-up ≤1.5 s, click to fast-forward), mark settled | none | BETTING (bets → ghosts) |
| ERROR | pause, error panel (09a) | Reload | INIT |

- Balance changes **only** at the START deduction and at PAYOUT/Refill.
- Info/Settings are disabled during SPINNING/RESOLVING/DOUBLE_RUN. Sound stays live.
- Squares are **locked** (r1 locked state: 30% night veil + padlock; lit/trail squares drawn above at full brightness) during SPINNING, RESOLVING, DOUBLE_RUN, ERROR and RECOVERY.

### B6. Duplicate-action guards and validation [approved]
- Every command goes through one `dispatch(action)` that checks `state` and rejects anything not accepted in the current state. Invalid inputs cause no change.
- START: the button disables synchronously on first activation. Key auto-repeat (`event.repeat`) is ignored for all action keys. Each round has a unique `roundId` and is **settled at most once** (check `settled` before crediting). The same applies to Collect, Gamble, Refill and Continue (the first accepted action wins and buttons lock).
- Gamble is not allowed without a pick, during a reveal, after 3 gambles or above the cap.
- Validate all values read from storage (integers, ranges, known squares, consistent totals). If invalid → ERROR with a "Reload" that resets **only** the corrupt key. If balance is unreadable, fall back to 1,000 and record it in the report log.

### B7. Persistence and interrupted-round recovery [approved]
localStorage keys: `rl.v1.balance`, `rl.v1.settings` (mute, music, sfx, reducedMotion), `rl.v1.lastBets`, `rl.v1.round`, `rl.v1.history` (last 50 rounds).
- Round record: `{ roundId, bets: {square: amount}, totalBet, s1, doubleRun, s2, baseWin, gambles: [{pick, result}], currentWin, phase, settled, createdAt }`.
- **Write order:** on START, write `{balance − totalBet, round(phase SPINNING, outcomes drawn)}` in **one** `setItem` call (use one combined key, or a write-ahead record, so balance and round can never disagree; document your approach). Update `phase` at each transition. A gamble result is written **before** its reveal. At PAYOUT, write the new balance and `settled=true` together.
- **On load with an unsettled record:** the bet is already deducted. Show RECOVERY (09b). Continue shows the stored stop(s) directly (≤1.5 s short replay or instant, no full run). Then resume at the stored phase: offer again if GAMBLE_OFFER; reveal the stored result if a gamble draw exists; credit if PAYOUT. **Never redraw.** Refreshing must never change an outcome or double-credit a win.
- If localStorage is unavailable, the game runs in memory and shows a non-blocking toast "Progress won't be saved". Report it.

### B8. Player interactions and keyboard map [approved]
| Context | Key / input | Action |
|---|---|---|
| Board (BETTING) | Left-click / Enter on focused square | add selected chip |
| Board | Right-click / Shift+click / Backspace on focused square | remove one selected-chip value |
| Board | 1–5 | select chip 1/5/10/25/50 |
| Board | Space | START (when focus is not on another button) |
| Board | Ctrl+Z / Z | Undo |
| Board | C | Clear |
| Board | R | Rebet |
| Board | Tab / arrows | roving focus around the track (arrows follow track order) |
| GAMBLE_OFFER | **G** | Gamble ×2 (opens flip modal) |
| GAMBLE_OFFER / modal | **Enter** | Collect |
| Gamble modal | **R / W** or **← / →** | pick red / white (moves focus to the card). R does **not** trigger Rebet here (Rebet is disabled) |
| Gamble modal | G | gamble on current pick (ignored without a pick) |
| Anywhere | **Space** | activates the **focused button/control** (incl. the focused GAMBLE button in the modal; see fix 2) |
| Anywhere | M | mute toggle |
| Modals | Esc | close Settings/Paytable/Help only. Gamble, Refill, Error and Recovery have no close |
| 1920x jackpot | click / Space / Esc | skip the celebration |
Tab order: top bar → squares 1→50 → chips → Undo/Clear/Rebet → START. In the gamble modal: RED → WHITE → GAMBLE → COLLECT. Focus is trapped in modals. Initial focus goes to the safest action (Collect, Refill, Reload, Continue).

### B9. Screens, layout and UI behaviour [approved design: match the mockups]
All measurements are at 1920×1080. Full detail is in `design/session-one/design-implementation-notes.md` §1–§7 (read it fully). Key regions: top bar 0,0,1920×80 (logo, centred balance plaque 460×60, icons Info/Settings/Sound). Board frame 24,92,1260×880. Centre panel 134,202,1040×660 (marquee sign, state text, Double Run lamp, mini paytable, last result). Right panel 1308,92,588×880 (Total Bet/Last Win cards, limits line, chip rack, Undo/Clear/Rebet, START or Collect+Gamble, history strip of the last 10 rounds, message slot with disclaimer/toasts). Footer key-hint bar 24,990,1872×52.
- Square states: idle, hover (tooltip after 300 ms with per-round odds), focus, bet placed (badge 1–10, always the top layer), rebet ghost, lit, trail1/trail2, winner ("★ WIN"), second-light lit/winner ("WIN 2", turquoise), dimmed (other squares after a win), locked, disabled (generic). After a loss the stop square stays lit with no dimming.
- **History:** one entry per round. A Double Run round is **ONE double-width entry** showing both squares (first left, second right) with a turquoise frame and a "DOUBLE" tab. Gambles add no entry.
- **Modals:** 74% night scrim. Balance and the Total Bet/Last Win cards stay drawn above the scrim (money never hidden). Tabbed Settings / Paytable / Help. The Paytable shows per-stop + per-round odds, the rules, a board mini-map and an **RTP ≈ 95.45% badge** ("theoretical long-run average, play credits only"). Help shows the **"Play credits only. No real money value."** disclaimer. Settings has mute, Music/SFX sliders (defaults 60/80), Reduced motion (defaults to `prefers-reduced-motion`), and **Turbo shown disabled with a "PLACEHOLDER – pending approval" badge, with no function**.
- Refill modal (07), Error (09a), Recovery (09b) as in the mockups. Loading screen as in component-sheet-2.
- Below 1280×720: show the "Please enlarge window" screen. Below a 0.8 scale you may swap key-hint text for icon key caps (approved recommendation).
- Accessibility: WCAG AA contrast (as designed). Tier is never shown by colour alone. Visible focus rings. aria-live (polite) for the state text, toasts and balance changes. Accessible name per square: "Square 12, pays 96x, your bet 5". No flashing > 3 Hz.

### B10. Visual direction [approved]
Nighttime Filipino perya: warm incandescent bulbs (~2700K glow), hand-painted plywood board, banderitas, Ferris wheel and crowd silhouettes in a blurred background. Tier colours: 24x cream, 96x turquoise, 480x marigold, 960x red, 1920x gold leaf + ★. Fonts (SIL OFL 1.1, **bundle locally**): **Lobster** (title, banners, modal titles), **Carter One** (plaques, START/COLLECT/GAMBLE, headlines), **Nunito** (all UI and numbers, `font-variant-numeric: tabular-nums`). Exact colour, type, spacing, radius, shadow, z-layer and motion values are in `design/session-one/design-tokens.json` / `design-tokens.md`. **Use the tokens. Do not hand-pick values.** Chips are painted tokens, not coins. No electrical-hazard imagery.

### B11. Animations and sound [approved]
Full per-event table: `design/session-one/animation-sound-notes.md` (implement every row 1–19 and §2–§3). Essentials:
- **Outcome first:** the light path is precomputed from the current index, 2–4 laps and the stored stop. It lands exactly on it, with no near-stop fakes, creeps or reversals. Duration 4–6 s, **independent of the outcome**: accelerate 0.6 s → cruise ≈18 squares/s → decelerate. 2-bulb trail.
- Double Run: banner 0.6 s in / 0.4 s hold / 0.3 s out, then a turquoise second light for 2–3 s that starts after the first stop and never stops on it. The first square stays lit.
- Wins: small (<100x) pulse + jingle; big (≥480x) marquee chase + confetti/bulb sparks (≤40 particles, **no coins**); 1920x jackpot ≤4 s, skippable. Win count-up ≤1.5 s. Loss: soft fade, never a buzzer.
- Gamble: pick 140 ms, flip alternation 1.2 s → settle 300 ms on the stored colour.
- **Reduced motion:** no chase/trail/particles/marquee/flash. The light reaches the stop in ≤3 steps / 0.8 s fade. Result text immediate. Count-ups instant. Gamble reveal after 0.6 s with text.
- **Sound:** BGM `bgm_perya_loop` (+ optional `amb_crowd_bed`) and the full SFX list in animation-sound-notes §3 (`sfx_click`, `sfx_chip_place`, `sfx_relay_tick`, `sfx_double_run_horn`, `sfx_win_*`, `sfx_drumroll`, `sfx_gamble_*`, `sfx_refill`, etc.). **No audio files exist yet:** create original audio (procedural Web Audio synthesis is acceptable) or use CC0 sources with each licence recorded. **Muted until the first interaction.** Master mute (M + icon), separate Music/SFX volume 0–100, persisted. BGM ducks −6 dB during the slowdown and big-win stings.

### B12. Design assets and references (reuse them)
Approved files, Session One revision 1, `design/session-one/`:
- Mockups (**match these**): `mockups/01-board-betting.png`, `02-spinning.png`, `03-win-single.png`, `04-double-run-result.png`, `05-gamble.png`, `06-loss.png`, `07-refill-modal.png`, `08a-settings.png`, `08b-paytable.png`, `08c-help.png`, `09a-error.png`, `09b-recovery.png`.
- Component sheets: `component-sheet-1.png`, `component-sheet-2.png`.
- Tokens: `design-tokens.json`, `design-tokens.md`. Notes: `design-implementation-notes.md`, `animation-sound-notes.md`, `asset-inventory.md`.
- Assets (SVG + PNG): `assets/background/perya-night-1920x1080.*`, `assets/bulbs/*` (off/on/trail1/trail2/second/red/white, gamble bulbs, warm/turquoise halos), `assets/chips/*` (chips ×5 × idle/selected/focus/disabled, bet badges, ghost badge), `assets/squares/square-{24,96,480,960,1920}x-{idle,hover,focus,lit,second,winner,winner2,dimmed,locked,disabled}.*`, `assets/plaques/*`, `assets/gamble/pick-{red,white}-{idle,hover,focus,selected,disabled}.*`, `assets/history/*`, `assets/icons/*` (info/settings/sound/muted × states, padlock, star), `assets/ui/*` (bunting, logo, marquee-sign, double-run banner, lamp on/off).
- Source SVGs of the mockups (useful for exact coordinates): `_render/svg/*.svg`. The generator scripts are in `_render/*.py` (reference only, not production code).
- Prefer the SVGs (crisp at any scale), or rebuild them faithfully in CSS/SVG using the tokens. Copy the assets you use into `game/` (do not edit files under `design/`).

### B13. Two minor fixes to apply (approved)
1. **"WIN 2" tag overlap on #13:** in mockup 04, the "WIN 2" tag on the second-light winner (#13, top row) overlaps the top board edge / neighbouring element. In the build, position winner tags so they never clip or overlap the frame, neighbouring tags or bet badges (e.g. inset the tag inside the square, or flip it below for top-row squares). Apply the same rule to "★ WIN" on every edge. Verify with a screenshot of a Double Run on #13 and on #8.
2. **Space on the focused Gamble button:** Enter is reserved for Collect inside the gamble modal, so **Space must activate whichever control is focused**, including the GAMBLE button (and pick cards). Show it in the key-hint line ("Space = press focused button").

### B14. Details that must not change without Rogin's approval
Paytable, multipliers, counts, weights, square positions; Double Run probability and exclusion rule; gamble rules (pick, 50/50, max 3, 30,000 cap); bet limits and chip values; start credits and refill rules; outcome-before-animation and no-redraw recovery; state flow and key map; layout regions and component placement; colours, fonts and tokens; history-entry design; modal content incl. the RTP badge and disclaimer; the absence of Reset credits, Rebet ×2, tutorial and Turbo functionality; the no-real-money rule. If a detail is technically infeasible, report the limitation and propose an alternative. Do not silently substitute a generic layout.

## C. Implementation Requirements
- **Functionality:** everything in B, fully playable end to end.
- **Front end / back end:** front end only. No server, APIs, analytics, telemetry or external integrations. No network requests at runtime (fonts/assets local).
- **Data model / state management:** a pure logic core (`engine`): config (paytable, layout, weights, limits), `rng` interface, `drawRound`, `payout`, `gamble`, bet operations with limit clamping, and a state machine with `dispatch` + guards. Persistence adapter (localStorage / in-memory). The UI layer subscribes to state and never computes outcomes.
- **Validation:** all bet operations clamp and validate. Reject non-integers. Storage data is validated (B6).
- **Randomness:** as B2/B3. Document the mapping, and do not make outcome-verification, certification or regulatory claims.
- **Errors:** uncaught errors and asset/storage failures → ERROR state (09a) without losing a pending round (it is recovered on reload).
- **Integrity:** balance never negative, and never changes except at START/PAYOUT/Refill. Each round is settled once. Displayed results always equal stored results (dev-mode assertion: final animated index === stored stop).
- **Performance:** steady 60 fps during the light run on a typical desktop. First load < 3 s locally. No memory growth over 1,000 rounds (history capped at 50 in storage, 10 shown).
- **Compatibility:** current Chrome/Edge/Firefox at 1280×720 to 2560×1440.

## D. Design Implementation
- Reproduce the approved mockups as accurately as practical (layout positions, sizes, colours, typography, states, copy).
- Reuse the assets in B12, and implement all components in the component sheets with all their states.
- Scaling: uniform 16:9 stage scale, letterboxed, 1280×720 minimum, then the "Please enlarge window" screen.
- Animations/effects: everything in B11 and the animation notes, including reduced motion.
- Interactions: everything in B8, plus pointer hover/tooltips and focus management.
- Protected details: B14.

## E. Testing and Acceptance Criteria
Run all tests and save the outputs in `game/test-results/`. Report pass/fail counts.

**E1. Unit tests (all must pass):**
1. Paytable/layout: 50 squares, counts 21/19/7/2/1, positions exactly as in B1, multipliers 24/96/480/960/1920, total weight 2,093.
2. Weights/mapping: `weightedPick` maps every `r` in 0..2092 to the correct square (exhaustive check). `randInt` rejection logic is unbiased (boundary tests with a mocked uint32 source).
3. Double Run: trigger iff `randInt(25)===0`. `s2 ≠ s1` always (exhaustive over every s1 and r). The conditional distribution of s2 equals w_j/(2093−w_{s1}).
4. Payout: single win, loss, Double Run hitting 0/1/2 bet squares, max 28,800 case (10 on #8 + 10 on #21 with Double Run), integer results.
5. Gamble: even mapping (randInt(2)); match doubles, mismatch zeroes; no gamble without a pick; max 3; disabled when 2×win > 30,000 (e.g. win 15,000 allowed → 30,000; win 15,001 blocked); Collect always works.
6. Bet limits: per square 10, per round 200, balance limit, clamping amounts and toasts, remove floor 0, Undo/Clear/Rebet behaviour incl. unaffordable Rebet.
7. State transitions: every valid transition, and every invalid action rejected in every state (table-driven). Duplicate START/Collect/Gamble/Refill/Continue within the same tick produce exactly one effect. `event.repeat` ignored.
8. Recovery: a simulated reload at every phase (SPINNING, RESOLVING, DOUBLE_RUN, GAMBLE_OFFER, GAMBLE before and after the draw, PAYOUT before and after the credit) restores the same outcome. There is no redraw and no double credit. Balance is consistent. Corrupt storage → ERROR → reset of only that key.
9. Refill: only when balance < 1 and no pending round; resets to exactly 1,000; unlimited.

**E2. Seeded simulation through the real game logic:** a script that drives the actual engine/state machine (not a reimplementation) with a seeded RNG, for **at least 1,000,000 rounds** (recommended 5,000,000: the standard error for the all-50 strategy is ≈0.19 pp at 1M and ≈0.085 pp at 5M). Strategy A: 1 credit on all 50 squares, always Collect, with balance kept topped up (simulation hook). Pass: **overall RTP within 95.45% ± 0.3 pp**. Also report the per-tier RTP and hit rate against B1 (z-scores), the Double Run rate against 4%, and s1==s2 occurrences (must be 0). Strategy B: always gamble the maximum allowed. RTP must stay within the same band and the gamble win rate must be 50% ± 0.2 pp. Record the seed, round count, runtime and the full output.

**E3. UI interaction tests (Playwright or equivalent):** place/remove bets by mouse and keyboard; limit toasts; START locks squares and controls; double-click START → one round; a full single-win → gamble (pick R/W, G, Space on the focused GAMBLE, Enter Collect) → payout flow; loss keeps bets; Rebet ghosts; refill flow at balance 0; mute/volume persist across a reload; reduced-motion mode; Esc closes only info modals; reload mid-spin → Recovery → same result.

**E4. Screenshot comparison:** capture at 1920×1080 (use a seeded/forced outcome in test mode) the states matching mockups 01–09b (01, 02, 03, 04, 05, 06, 07, 08a, 08b, 08c, 09a, 09b), plus a fix-1 check (Double Run winners on #13 and #8). Save them as `screenshots/NN-name.png`, each next to its mockup. Provide a side-by-side or diff image and a short per-screen note listing visible differences. Also capture 01 at 1280×720.

**E5. Edge cases:** bet exactly 200 across many squares; balance smaller than the chip; last credit bet; win at the cap boundary; Double Run where s2 is unbet; 1920x jackpot skip; storage unavailable; tab hidden mid-spin (the result is unchanged when you return).

**E6. Regression and assets:** all tests rerun green after the final fixes. Every referenced asset loads (no 404s, no console errors). Fonts load locally.

**Acceptance:** all of E1 passes; E2 is within tolerance; E3 flows pass; E4 screens closely match the mockups with differences documented; no console errors; B13 fixes verified; nothing in B14 changed.

## F. Scope Boundaries
- **In scope:** the desktop browser game in A–E; the static build; local persistence; audio creation; tests and report.
- **Out of scope:** mobile/touch layouts; Turbo/Skip functionality (placeholder row only); tutorial/onboarding; Reset credits; Rebet ×2; accounts, leaderboards, achievements, multiplayer; backend/APIs/analytics; **any real-money feature, payment, purchase, wallet, deposit, withdrawal or cash value**; reshuffled layouts; reviewing the YouTube reference video.
- **Approved assumptions:** fixed layout (default, approved for build); Turbo placeholder only; working title.
- **Dependencies:** Node/npm (or what is on the box), open-source dev tooling, locally bundled OFL fonts. **No external services.**
- **Known limitations:** client-side only (credits can be edited in devtools; acceptable for play credits); audio still to be produced; theoretical RTP is a long-run figure.
- **Requires Rogin's approval before modification:** everything in B14, plus any new feature or dependency on an external service.

## G. Development Session Instructions (Stage Eight)
1. Read this entire specification, then the referenced design files.
2. Inspect `/workspace/casino-games/running-light/` and the box tooling before changing anything. Do not modify `spec/`, `math/` or `design/`.
3. Confirm the available assets, dependencies and constraints. **List any blockers before proceeding.**
4. Choose and report the simplest viable static stack (§A).
5. Implement the logic core first, with tests (E1, E2), then the UI, interactions, animations, sound and persistence.
6. Reuse the approved assets and match the mockups. Apply the B13 fixes.
7. Handle invalid input, errors and edge cases (B6, E5).
8. Run all tests, fix defects and rerun.
9. Do not make major design or gameplay changes. If something is technically unclear or would change the approved design, stop that item, note it as a question, and continue with the rest. Do not invent a solution.
10. Do not contact Rogin or other agents.

## H. Return to the Online Casino Game Specialist
Return results **directly to the Online Casino Game Specialist (agent id `7cde1a84-18b1-4ca9-82f8-bfdbfe60ec03`)**. Write `game/IMPLEMENTATION-REPORT.md` and include in your reply: implementation status; chosen stack and why; completed features; test results (counts, simulation RTP with seed and rounds, gamble win rate); screenshot comparison notes; deviations from this spec; remaining defects/limitations; open questions/blockers; how to run; and the file list. Do not claim results you did not run.
