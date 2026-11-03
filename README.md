# Running Light v5

Browser version of the Philippine perya "Running Light" bulb-track game: a light runs around a ring of 50 bulb squares
and stops on one of them. In v5 you bet on **multiplier tiers** (5x to 200x), not on single squares.

**Simulated play credits only. No real money.** Credits can't be bought, sold or cashed out, and there are no payments,
accounts, backend or analytics. Fonts are bundled and the page makes no external requests.

Play it: **https://roginjohn.github.io/running-light-v5/**

Official specs: [`docs/design-v5/v5-development-spec.md`](docs/design-v5/v5-development-spec.md) (development plan) and
[`docs/design-v5/MATH-SPEC-C.md`](docs/design-v5/MATH-SPEC-C.md) (math). Release history: [`CHANGELOG.md`](CHANGELOG.md).

## The game

- The ring has **50 squares**: **30 tier squares and 20 blank squares**. Blank squares are hatched, have a dashed edge
  and ⊘, and pay nothing. The ring is display-only: you can't bet by clicking a square.
- In the centre are **six tier spots**: 5x, 10x, 20x, 50x, 100x, 200x. You bet on a spot, and it pays when the light
  stops on **any** square of that tier: **multiplier × your bet on that spot** (a bet of 5 on 10x pays 50).
- **Double Run:** 1 round in 25, a second light runs and stops on a different square. Each light pays on its own, so
  both lights on your tier pay twice (shown as "×2"), and two different tiers each pay.
- **Squares are not equally likely.** Each square has a stop weight (total weight 10476), and one blank square is about
  7 times as likely as the 200x square. The paytable and the "1 in X" on each spot already include this.

### Paytable

From [MATH-SPEC-C §2](docs/design-v5/MATH-SPEC-C.md) and `src/engine/config.js`:

| Tier | Squares | Square numbers | Weight per square | Chance per light | Exact payback |
|---|---|---|---|---|---|
| 200x | 1 | 8 | 48 | 0.46% (1 in 218.3) | 95.383% |
| 100x | 2 | 21, 46 | 48 | 0.92% (1 in 109.1) | 95.383% |
| 50x | 3 | 3, 29, 38 | 64 | 1.83% (1 in 54.56) | 95.377% |
| 20x | 4 | 13, 17, 33, 42 | 120 | 4.58% (1 in 21.83) | 95.357% |
| 10x | 8 | 5, 11, 15, 24, 27, 35, 40, 49 | 120 | 9.16% (1 in 10.91) | 95.357% |
| 5x | 12 | 1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48 | 160 | 18.33% (1 in 5.46) | 95.343% |
| Blank | 20 | 2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50 | 339 | 64.72% | — |
| **Total** | **50** | | **10476** | 100% | |

- The exact payback includes Double Run. It spreads only 0.04 pp across the tiers (95.34–95.38%), so the game shows
  one figure: **95.4%** on every tier spot. Payback is the theoretical long-run average, not a promise for any session.
- About 64% of rounds pay nothing on any tier (MATH-SPEC-C §7).
- Squares are numbered from #1 at the top-left, clockwise, on a 16-9-16-9 ring (MATH-SPEC-C §3).

### Limits

From [MATH-SPEC-C §5](docs/design-v5/MATH-SPEC-C.md), [dev spec §2.4](docs/design-v5/v5-development-spec.md) and `src/engine/config.js`:

| Rule | Value |
|---|---|
| Chips | 1, 5, 10, 25, 50, 100, 500 |
| Bet | minimum 1; at most 1,000 per tier spot and 1,000 per round, and never more than your credits |
| Start credits | 10,000 |
| Refill | to 10,000 when your credits are below the minimum bet |
| Double Run | 1 round in 25 |
| Maximum single-round win | 200,000 (the 200x tier has only one square, so it can't pay twice) |
| Gamble | offered on wins of **150,000 or less**, so a doubled win never passes the **300,000** cap; at most 3 gambles per win |

## How to play

From the in-game Help (`src/ui/view.js`) and [dev spec §3](docs/design-v5/v5-development-spec.md):

1. **Pick a chip:** 1, 5, 10, 25, 50, 100 or 500 credits.
2. **Place bets:** tap a tier spot in the centre to bet on it, up to 1,000 per tier and 1,000 per round. Undo and
   Clear take bets back. The total shows as "N / 1,000".
3. **Press Start:** the light runs for 4–6 seconds and stops on one square.
4. **Collect or gamble:** you win when the light stops on a tier you bet on. Collect adds it to your credits.

**The gamble:** after a win, press **Gamble**, pick **red** or **white**, then press Gamble on your colour. Red or white
is drawn at that moment (50/50) and saved before the disc flips. **Match:** your win doubles; gamble again or Collect.
**No match:** the win is lost, nothing else is taken. Up to 3 gambles per win, with Collect open between flips.

Bets stay on the spots after a round, so "Start again" replays them (there is no Rebet). A no-win round shows a red
"No win" pill and keeps your bets.

**Keys** (also listed in Settings):

| Key | Action |
|---|---|
| Space | Start |
| 1–7 | Pick a chip (← → move between chips when one is focused) |
| Enter · Backspace | Add · remove a bet on the focused spot |
| Z · C | Undo · Clear |
| G · Enter | Gamble · Collect |
| R / W · ← → | Pick red / white in the gamble |
| M | Mute |
| Esc | Close the open window |

## Setup

Requires Node 22+ (see `.nvmrc`; `package.json` has `"engines": { "node": ">=22" }`). All commands run from the repo
root.

```bash
npm ci                  # install the dev dependencies (or: npm install)
npm run dev             # dev server, http://localhost:5173 (runs `npm run tokens` first)
npm run build           # static, offline bundle in dist/ (runs `npm run tokens` first)
npm run preview         # serve dist/ on http://localhost:4173
```

Other scripts in `package.json`:

| Script | What it does |
|---|---|
| `npm test` / `npm run test:unit` | Unit tests (`node --test`, `test/unit/**/*.test.js`) |
| `npm run test:ui` | UI and a11y tests in Chrome (`test/ui/ui.test.js`, `test/ui/a11y.test.js`); builds first |
| `npm run sim` | Seeded simulation of the real engine (`scripts/simulate.js`, default 20,000,000 rounds) |
| `npm run sim:quick` | 1,000,000-round simulation, output in `test-results/sim` |
| `npm run sim:gamble` | Gamble simulation (`scripts/sim-gamble.js`) |
| `npm run tokens` | Regenerates `src/styles/tokens.css` from the token file and runs the contrast checks |
| `npm run perf:budget` | Builds, then checks the bundle size, load time and DOM size budgets (`test/ui/perf-budget.js`) |
| `npm run perf:trace` | Chrome performance trace of one round (`test/ui/perf-trace.js`) |
| `npm run preview:rc` | Builds, then writes the local release-candidate preview zip (`scripts/build-preview.js`) |
| `npm run screenshots:batch6`, `:batch7`, `:batch8` | Builds, then regenerates that batch's screenshots under `docs/design-v5/` |
| `npm run screenshots:v3` | The v3 screenshot set (`test/ui/screenshots-v3.js`) |

The UI tests and screenshots use `puppeteer-core` with an installed Chrome: set `CHROME=/path/to/chrome` if it is not at
`/usr/bin/google-chrome`.

## Fonts and design tokens

- **Fonts** (SIL OFL 1.1, from `@fontsource/poppins` and `@fontsource/jetbrains-mono`), bundled as WOFF2 in
  `src/assets/fonts/` and loaded with `@font-face` in `src/styles.css`:
  - `poppins-latin-600-normal.woff2`, `poppins-latin-700-normal.woff2`
  - `jetbrains-mono-latin-600-normal.woff2`

  Licences: [`public/fonts/LICENSE-Poppins-OFL.txt`](public/fonts/LICENSE-Poppins-OFL.txt),
  [`public/fonts/LICENSE-JetBrainsMono-OFL.txt`](public/fonts/LICENSE-JetBrainsMono-OFL.txt).
- **Tokens:**
  - `src/data/design-tokens-v3.json`: the source token file (v3 values, plus the v5 tier colours `--tier-5` …
    `--tier-200`, the 100/500 chip colours and the contrast pairs).
  - `src/styles/tokens.css`: generated from it by `scripts/gen-tokens.js` before every `dev` and `build`. Don't edit it
    by hand. The script fails if any WCAG contrast pair is below its minimum.
  - [`docs/design-v3/tokens.json`](docs/design-v3/tokens.json) and [`docs/design-v3/tokens.md`](docs/design-v3/tokens.md):
    the approved v3 design tokens (the batch 7 contrast audit changed a few values since, see
    [`docs/design-v5/batch-7/COMPARISON.md`](docs/design-v5/batch-7/COMPARISON.md)).

## Folder map

```
src/engine/        game core, no framework (config, rng, outcome, bets, game, storage, lightpath).
                   Locked to MATH-SPEC-C, see CONTRIBUTING.md
src/ui/            app.js (controller), view.js (state -> HTML, incl. paytable and help), layout.js, track.js,
                   lightplan.js, keys.js, announce.js, bettotals.js, icons.js, audio.js
src/styles.css     styles; src/styles/tokens.css is generated
src/data/          design token files
src/assets/        fonts/ (WOFF2), v2/ (icons)
public/fonts/      font licences
scripts/           gen-tokens.js, simulate.js, sim-gamble.js, build-preview.js, run-all.js, copy-*.js
test/unit/         node:test suites (v5 suites in test/unit/v5/); test/fixtures/math-c.js
test/ui/           puppeteer UI and a11y tests, screenshots, perf budget and trace
docs/design-v5/    v5 specs, mockups (tiers/) and batch review sets (batch-4 … batch-8)
docs/design-v3/    v3 design tokens, mockups and batch notes (historical; the batch screenshots
                   are in roginjohn/running-light at tag v3.0)
docs/development-spec.md   the older v3 development spec (historical)
.github/workflows/ci.yml   CI
```

More docs: [`docs/design-v5/README.md`](docs/design-v5/README.md) (index of the v5 docs),
[`docs/design-v5/tiers/SPEC.md`](docs/design-v5/tiers/SPEC.md) (tier UI layout),
[`CONTRIBUTING.md`](CONTRIBUTING.md) (batch workflow and locked rules), [`AUDIO.md`](AUDIO.md) (procedural sound).

## Running the checks

Requires Node 22+ (see `.nvmrc`). From the repo root:

- `npm ci` — install dependencies
- `npm test` — unit tests
- `npm run sim:quick` — 1M-round simulation
- `npm run build` — production build
- `npm run test:ui` — UI and a11y tests (builds first via `pretest:ui`); needs Chrome: set `CHROME=/path/to/chrome` (default `/usr/bin/google-chrome`)

CI (`.github/workflows/ci.yml`) runs these on every pull request and on every push to `main`.
