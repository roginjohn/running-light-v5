# Batch workflow (v5)

- Repo: `roginjohn/running-light-v5`, seeded from `roginjohn/running-light` main @ a760ce5 (tag `v3-import`).
- The v3 repo `roginjohn/running-light` is frozen. Never push there.
- `main`: source code. Only tested batches get merged here.
- `gh-pages`: the built site. Only updated on a deliberate publish (see below).
- Each batch gets its own branch: `v5/batch-N-<name>`. Once it passes the checks below **and Rogin approves**, it is
  merged into `main` and tagged `v5-batch-N`. No merge or tag without Rogin's approval.
- Plan and math: `docs/design-v5/` (start at its `README.md`).

## Locked
v5 math locked = MATH-SPEC-C (`docs/design-v5/MATH-SPEC-C.md`): tiers 5/10/20/50/100/200x, 30 tier squares + 20
blanks, total weight 10476, Double Run 1/25, gamble max 3 / 300,000 cap, limits 1,000 per tier and 1,000 per round.
`src/engine/` is changed only in batch 2 (math) and batch 3 (`storage.js` only). After batch 2,
`git diff v5-batch-2 -- src/engine` must be empty for every UI batch, except the batch-3 change to `storage.js` and the
batch-7 one-line comment on `gambleDraw` in `outcome.js`.
Any other engine change needs Rogin's approval. Play credits only.

Do not delete the v1 files or the `rl.v1.*` storage keys without Rogin's approval.

## Checks for every batch
1. `npm test`: all unit tests pass. The v5 tests in `test/unit/v5/` start skipped (`{ skip: 'v5 batch N' }`); each
   batch unskips its own and they must pass.
2. `npm run test:ui`: no console errors and no external requests. Includes `test/ui/a11y.test.js`, the measured contrast,
   type size, tap target, live region and reduced-motion checks.
3. `npm run sim:quick`: seeded 1M rounds, RTP 95.4% ± 0.3 (from batch 2 on). Run the full `npm run sim` for
   batches 2 and 6.
4. From batch 3 on: `git diff v5-batch-2 -- src/engine` is empty (batch 3: `storage.js` only; batch 7: the `gambleDraw` comment).
5. Screenshots compared against `docs/design-v5/tiers/png/`.

## v5 batches
1. `v5/batch-1-docs-tests-scaffold`: design docs, CONTRIBUTING, skipped Math C test fixtures. No engine change.
2. `v5/batch-2-engine-math`: config, weighted draw, Double Run, tier bets, settlement, gamble cap, exact RTP and sim
   tests. The engine is then locked.
3. `v5/batch-3-storage-migration`: `rl.v5.*` keys, 10,000 reset, settings carry-over, one-time toast, refill.
4. `v5/batch-4-board-display`: display-only ring, blank squares and legend, tier and chip tokens, phone ring shapes.
5. `v5/batch-5-tier-spots-controls`: six tier spots, 7 chips, totals, Undo/Clear/Start, keys 1–7.
6. `v5/batch-6-results-paytable`: win, no-win and Double Run states, Collect/Gamble, paytable, help text; full sim.
7. `v5/batch-7-a11y-perf-polish`: ARIA, reduced motion, contrast audit, screenshots, perf budget, banned words.
8. `v5/batch-8-release-candidate`: full regression, build, preview for Rogin.

## Publish
Publishing to `gh-pages` needs Rogin's separate approval (after batch 8, tag `v5.0`). Then `npm run build` and copy
`dist/` to the `gh-pages` branch. Rollback: re-publish from tag `v3-import` (the same
commit as v3's `v3-batch-7`, the live v3).
