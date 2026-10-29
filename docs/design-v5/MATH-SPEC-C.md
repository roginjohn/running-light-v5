# Running Light — MATH-SPEC-C (bet on multipliers, ~20 blanks) — simulated credits only
Keeps MATH-SPEC.md (A) and MATH-SPEC-B.md. Repo untouched. Files: solveC.py (exact calc; `python3 solveC.py search` reruns the search), simC.mjs, sim-C-tiers.json.
Repo: the v5 work lives in `roginjohn/running-light-v5`, seeded from `roginjohn/running-light` main @ a760ce5 (tag `v3-import`). The v3 repo is frozen.

## 1. Model (same as B)
Bet on a tier spot 5x/10x/20x/50x/100x/200x. Light stops on one of 50 squares (weighted draw). Pays M × bet per light on that tier. Double Run 1 in 25: second distinct weighted stop; each light pays (both on your tier = 2 × M × bet). Blank squares pay nothing.

## 2. Board (30 tier squares + 20 blanks, total weight 10476)
| Tier | Squares | Weight/sq | One square | Stop chance (1 light) | Exact payback |
|---|---|---|---|---|---|
| 5x | 12 | 160 | 1.53% | 18.33% (1 in 5.46) | 95.343% |
| 10x | 8 | 120 | 1.15% | 9.16% (1 in 10.91) | 95.357% |
| 20x | 4 | 120 | 1.15% | 4.58% (1 in 21.83) | 95.357% |
| 50x | 3 | 64 | 0.61% | 1.83% (1 in 54.56) | 95.377% |
| 100x | 2 | 48 | 0.46% | 0.92% (1 in 109.1) | 95.383% |
| 200x | 1 | 48 | 0.46% | 0.46% (1 in 218.3) | 95.383% |
| Blank | 20 | 339 | 3.24% | 64.72% | — |
Payback spread 0.04 pp (95.34–95.38%) → show as 95.4%. Max/min square weight ratio 7.06 (blank 339 vs 100x/200x 48); among paying squares 3.3. vs B: ratio 20.2 (182 vs 9).

Why not ~1: the 200x needs ~0.46% of stops for 95.4%, and blanks must take ~65% of stops; with 20 blanks each blank is ~3.2% → ratio ≥ ~7 is forced by the math. To get ratio near 1 you'd need ~140 squares or a lower payback / fewer blanks with heavy weights. Weights decrease with rarity (5x heaviest paying square), so no high tier is "favoured".

## 3. Layout (#1 top-left, clockwise, 16-9-16-9 ring)
- 200x: 8 (top centre; neighbours 7, 9 are 5x)
- 100x: 21, 46 (mid right / mid left)
- 50x: 3, 29, 38
- 20x: 13, 17, 33, 42
- 10x: 5, 11, 15, 24, 27, 35, 40, 49
- 5x: 1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48
- Blank: 2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50 (spread on every side; only pairs 30–31, 44–45 adjacent)

## 4. Simulation (simC.mjs, 20,000,000 rounds)
| Tier | Sim payback | Exact | Sim round hit 1 in N | SD per 1-credit bet |
|---|---|---|---|---|
| 5x | 95.31% | 95.34% | 5.28 | 1.98 |
| 10x | 95.34% | 95.36% | 10.52 | 2.95 |
| 20x | 95.24% | 95.36% | 21.03 | 4.27 |
| 50x | 95.40% | 95.38% | 52.44 | 6.84 |
| 100x | 95.30% | 95.38% | 104.95 | 9.72 |
| 200x | 95.12% | 95.38% | 210.27 | 13.76 |
Double Run 4.003% (theory 4%). Rounds with no tier hit 63.8%. Rounds with both lights on the same tier: 32,355 (0.16%). All tiers within ~1 standard error (200x SE ≈ 0.31 pp).

## 5. Limits (unchanged from B)
Max 1,000 per tier and per round, chips 1/5/10/25/50/100/500, start/refill 10,000, gamble cap 300,000. Max win 200,000 (200x can't pay twice).

## 6. Build notes (vs B)
config: COUNT [12,8,4,3,2,1], WEIGHT [160,120,120,64,48,48], blank count 20 weight 339, TOTAL_WEIGHT 10476, layout §3. Tests: per-tier exact 95.34–95.39%. Everything else as B §7.

## 7. Concerns
1. Squares are still not equally likely: a blank is ~7× as likely as the 200x square (vs 20× in B). Board now shows ~40% blank squares vs 65% of stops — closer but not exact; paytable odds must stay visible.
2. 5x lost 6 squares (18→12) but is still the largest group; 10x 12→8, 20x 6→4, 50x 4→3.
3. ~64% of rounds pay nothing on any tier (same as B; inherent to 95.4% on these multipliers).
4. Never claim fairness/compliance; simulated credits only.
