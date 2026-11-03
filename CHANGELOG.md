# Changelog

Newest first. Simulated play credits only. Specs: [`docs/design-v5/v5-development-spec.md`](docs/design-v5/v5-development-spec.md)
(batch plan in §7) and [`docs/design-v5/MATH-SPEC-C.md`](docs/design-v5/MATH-SPEC-C.md).

## 2026-11-03 — CI (PR #9)

- GitHub Actions CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)), job `checks`, on every pull request and
  every push to `main`: `npm ci`, `npm test`, `npm run sim:quick`, `npm run build`, then `npm run test:ui` (UI and a11y
  tests) in Chrome stable.
- Node 22 pinned: [`.nvmrc`](.nvmrc) (read by CI) and `"engines": { "node": ">=22" }` in `package.json`.
- `main` branch protection requires the `checks` job to pass.

## v5.0 — 2026-10-31

The tier-betting release, tagged on the batch 8 code. Live at https://roginjohn.github.io/running-light-v5/.
Changes from v3 ([dev spec §2.1](docs/design-v5/v5-development-spec.md)):

- Bets go on six tier spots (5x, 10x, 20x, 50x, 100x, 200x) instead of single squares. The ring is display-only.
- MATH-SPEC-C board: 30 tier squares + 20 blank squares, total weight 10476, about 95.4% payback on every tier.
- Double Run stays 1 round in 25; the second light stops on a different square and each light pays on its own.
- Chips 1/5/10/25/50/100/500 (v3: 1/5/10/25/50); limits 1,000 per tier and 1,000 per round (v3: 10 per square, 200
  per round).
- Start and refill credits 10,000 (v3: 1,000); gamble cap 300,000 (v3: 30,000), offered on wins of 150,000 or less.
- New `rl.v5.*` storage keys; every balance starts at 10,000, `rl.v1.*` keys are left in place.

## v5-batch-8 — 2026-10-31 — release candidate (PR #8)

Notes: [`docs/design-v5/batch-8/RELEASE-CANDIDATE.md`](docs/design-v5/batch-8/RELEASE-CANDIDATE.md),
perf report [`docs/design-v5/batch-8/perf.json`](docs/design-v5/batch-8/perf.json).

- Full regression: `npm test` 179/179, `npm run test:ui` 83/83 in three runs, `sim:quick` 95.303% (Double Run 4.031%),
  20M sim (seed 20261030) 95.371% against an exact 95.367%, `sim:gamble` and `perf:budget` pass (472 DOM nodes of 500,
  now a hard budget).
- UI test stall fixed: Chrome runs no animation frames in a hidden tab, so every test page now gets its own browser
  context, `openGame` refuses a hidden page, and waits are bounded and report visibility and phase.
- Tablet 768x1024: chips, Undo/Clear, the bottom bar and dialog controls are at least 44x44, with a test across all 17
  states; the credits line no longer overlaps the total bet.
- Local preview: `npm run preview:rc` writes `running-light-v5-rc.zip`, checked by `test/ui/verify-preview.js`.
- Open: no real screen reader pass yet; tablet landscape (1024x768) controls are still under 44 px.

## v5-batch-7 — 2026-10-31 — accessibility, performance, polish

Notes: [`docs/design-v5/batch-7/COMPARISON.md`](docs/design-v5/batch-7/COMPARISON.md),
[`docs/design-v5/batch-7/contrast.md`](docs/design-v5/batch-7/contrast.md),
[`docs/design-v5/batch-7/perf.json`](docs/design-v5/batch-7/perf.json).

- Measured contrast audit across 17 states at 1920x1080, 390x844 and 360x640 (text 4.5:1 with no large-text
  allowance, non-text 3:1); `test/ui/a11y.test.js` fails on the same checks.
- Tokens moved by the audit: `big-number` `#6a7480` → `#808a96`, `btn-disabled-text` `#9aa2ab` → `#b0b7bf`, `chip-50`
  `#4b5563` → `#657080`.
- Screenshots compared by eye against the mockups (`npm run screenshots:batch7`), with 7 differences listed for a
  decision; perf budget added (`npm run perf:budget`).
- Per the plan: ARIA and live region, reduced motion, banned-word check.

## v5-batch-6 — 2026-10-30 — results and paytable

No notes file; described from the dev spec batch plan. Screenshots in `docs/design-v5/batch-6/`
(`npm run screenshots:batch6`).

- Win, no-win and Double Run states (light badges "1" and "2", "×2" for a same-tier double), Collect and Gamble.
- Paytable dialog (desktop) and sheet (phones), and the help text.
- Full 20M-round simulation.

## v5-batch-5 — 2026-10-30 — tier spots and controls (PR #5)

No notes file; described from the dev spec batch plan. Screenshots in `docs/design-v5/batch-5/`.

- The six tier spots and the chip rail/dock with 7 chips.
- Totals, Undo/Clear/Start, bets persisting between rounds, keys 1–7 for chips, shortcut list hidden on touch screens.

## v5-batch-4 — 2026-10-30 — board display (PR #4)

Notes: [`docs/design-v5/batch-4/contrast.md`](docs/design-v5/batch-4/contrast.md).

- Display-only ring, blank square styling (hatching, dashed edge, ⊘, "No win") and the legend.
- Tier colour tokens `--tier-5` … `--tier-200` and the 100/500 chip tokens, all contrast-checked by
  `scripts/gen-tokens.js` and `test/unit/v5/tokens.test.js`. Chip 100 moved from the proposed `#6d28d9` to `#8548ef`
  to reach 3:1 on the rail, frame and dock; chip 500 stays `#b45309`.
- Phone ring shapes.

## v5-batch-3 — 2026-10-30 — storage migration (PR #3)

No notes folder; described briefly from the dev spec batch plan.

- `rl.v5.*` keys, balance reset to 10,000, settings carried over from `rl.v1.settings`, the one-time "Game updated –
  credits reset to 10,000" toast, and the refill.

## v5-batch-2 — 2026-10-30 — engine math (PR #2)

No notes folder; described briefly from the dev spec batch plan.

- `config.js` to MATH-SPEC-C, the weighted draw and Double Run, bets keyed by tier, per-tier settlement, limits and
  chips, the gamble cap; exact payback and seeded simulation tests, and `scripts/simulate.js`. The engine is locked
  after this batch.

## v5-batch-1 — 2026-10-29 — docs, tests scaffold (PR #1)

No notes folder; described briefly from the dev spec batch plan.

- Approved v5 design docs copied in ([`docs/design-v5/README.md`](docs/design-v5/README.md)), CONTRIBUTING updated
  with the v5 rules and checks, MATH-SPEC-C test fixtures added as skipped tests (`test/fixtures/math-c.js`,
  `test/unit/v5/`). No engine change.

## v3-import — 2026-10-27

The starting point: `roginjohn/running-light` main @ a760ce5 (the v3 batch 7 code, "Merge pull request #7 from
roginjohn/v3/batch-7-perf"), imported to seed this repo. The v3 repo is frozen. v3 history is in `docs/design-v3/` and
[`docs/development-spec.md`](docs/development-spec.md).
