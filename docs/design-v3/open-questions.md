# Running Light v3, Session One: open questions

**No reference screenshots were provided for v3.** Everything here was designed from the written spec in the session brief (Originals-style casino UI). `design/redesign-v3/reference/` was empty. Game rules, the paytable and copy come from `design/redesign-v2/development-spec-v2.md` and `copy-v2.md`, and the board arrangement comes from `game/src/engine/config.js` (read only). Nothing in `game/` or `dist/` was created, changed or deleted.

## Interpretations to confirm
1. **"Bet amount" input vs chips.** The input shows the **total bet on the board** (sum of all squares). `1/2` and `x2` halve or double every square's bet, clamped to 1–10 per square, 200 per round and the balance. Chip value sets how much one click/tap adds to a square. Is that the intended meaning, or should the input be the per-click amount (replacing chips)?
2. **"Last bets:" counts.** These are shown as the total bet of each of the last 5 rounds (newest first, highlighted). Alternative: the number of squares bet per round, or the per-tier counts. Which one?
3. **Big mono number.** It shows the **multiplier**: `00.00x` idle/lost, the multiplier under the light during the run (grey), and the winning multiplier when won (light). A Double Run win shows `960.00x + 24.00x`. Should it show credits won instead?
4. **Pays row (green active).** Pills light green only for the tier(s) that **won** this round. They are not lit for tiers you have bets on, or for the tier under the moving light. Confirm.
5. **Gamble placement.** The pick (red/white discs) lives in a navy panel in the ring centre. The buttons (Gamble ×2 / Collect) stay in the rail, where Place bet normally is. Collect is **green with dark text**, because white text on #16a34a fails contrast (3.3:1).
6. **Manual/Auto.** Auto is shown disabled (no autoplay in this version). Settings repeats "Auto play: not available". Should Auto be hidden entirely?
7. **Place bet = START.** "Place bet" starts the round (bets are placed on the board by clicking squares first). "Potential Win" = the highest single-square payout of the current bets (2,400 in the mockups). It ignores a possible Double Run second hit. Should it instead show the sum of the top two, or "up to …"?
8. **Losing stop tile.** It turns light (#e9eef3, like the moving light). Wins turn green. There is no red for losses on the board: red appears only in the "No win" pill. OK?
9. **Double Run markers.** The stops get "1st"/"2nd" in place of the square number, the cards say "1 · #21" / "2 · #33", and the history pill shows "960x · 24x".

## Items needing a decision
10. **Results icon (scales).** The bottom bar has a results icon as requested. There is no seed-verification system in the engine, so the icon should open a plain "How results are decided" panel (outcome decided and saved before the light runs, weights 80/20/4/2/1 of 2,093, 50/50 gamble). It should not imply seed verification. Confirm wording.
11. **Star icon.** Meaning unclear in a standalone game (favourite?). Keep, repurpose, or drop?
12. **Stats icon.** This needs a small stats panel (rounds, wins, biggest win, from local history). Not mocked this session.
13. **Mobile (< 600 px)** and **tablet landscape** were not mocked. 768×1024 shows the stacked rail. The 16×11 ring becomes too small on phones (v2 used an 11×16 portrait ring). Decide in Session Two.
14. **Tile square numbers** are hidden below 48 px tiles (1280×720 and 768×1024). They remain in the aria labels and the long-press sheet. Settings has a "Square numbers" toggle for desktop. Keep?
15. **States not mocked yet:** gamble win ("MATCH"), gamble loss ("NO MATCH"), payout count-up, jackpot (#8) result, recovery dialog, loading/start, toasts in context, focus states on the full screen, and the ghost/rebet state. Copy exists in `copy-v2.md`.
16. **Fonts.** Poppins + JetBrains Mono (both OFL) replace v2's Bungee + Plus Jakarta Sans. Confirm the change and the licence files to bundle.
17. **Settings gear icon path** is a common open-source (Feather-style, MIT) outline. The other icons were drawn for this mockup. The build can redraw it or include the MIT notice.
18. **Hit chance per round** in the paytable (1 in 25 / 101 / 503 / 1005 / 2010) was computed from the locked weights including Double Run (same formula as `pRound` in config.js). Please verify against the math report before shipping.
