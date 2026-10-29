# Running Light v5 docs (tier betting)

The v5 work lives in `roginjohn/running-light-v5`, seeded from `roginjohn/running-light` main @ a760ce5 (tag `v3-import`).
The v3 repo is frozen. Simulated play credits only.

| File | What it is |
|---|---|
| [`MATH-SPEC-C.md`](MATH-SPEC-C.md) | Approved math: 6 tiers (5x–200x), 30 tier squares + 20 blanks, total weight 10476, ~95.4% payback per tier. The v5 engine is locked to it. |
| [`v5-development-spec.md`](v5-development-spec.md) | Development plan: engine and UI changes, accessibility, acceptance criteria, test plan, the 8 batches and rollback. Its "Repo" line predates the move to `running-light-v5`. |
| [`tiers/SPEC.md`](tiers/SPEC.md) | Approved layout spec for the tier-betting UI. |
| [`tiers/mocks/`](tiers/mocks/), [`tiers/png/`](tiers/png/) | Mockup HTML and their renders (the screenshot reference). `node docs/design-v5/tiers/render.mjs` re-renders and checks them. |

Test scaffold: `test/fixtures/math-c.js` holds the MATH-SPEC-C constants, and `test/unit/v5/` holds the §6 test plan as
skipped tests. Each batch unskips its own tests (`{ skip: 'v5 batch N' }`). See `CONTRIBUTING.md` for the batch rules.
