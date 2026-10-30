# v5 batch 7: screenshots against the approved mockups

App: `docs/design-v5/batch-7/<state>-<WxH>.png` (`npm run screenshots:batch7`). Mockups: `docs/design-v5/tiers/png/`, re-rendered
in this batch after `mock.css` moved to the real tier and chip tokens. I compared the betting, Double Run, no-win and paytable
pairs by eye, plus the app's win and gamble shots. It was not a pixel diff. The final visual review is Rogin's (dev spec §5.7).

The mockups cover the betting state at all three sizes and the other states at 1920x1080 and 390x844. So the app's
360x640 result and paytable shots, and the double hit and gamble shots at every size, have no mockup to compare with.
They were checked by the measured audit only.

## Matches
- Ring: shapes, square order, tier labels and colours, blank hatching, dashed edge and glyph, "No win" on desktop.
- Tier spots: order, multiplier, "1 in X", square count at every size, the bet, blue border, green win, faded loss.
- Win and Double Run: green stops, green outline on the tier's other squares, "1" and "2" badges, headline, sub line.
- No win: red pill, "Blank square", white lit square, bets kept, "Start again".
- Paytable rows, Blank and Total rows, the 95.4% figure, "30 tier + 20 blank = 50", the unequal-squares note.
- Legend text, and Collect and Gamble replacing the actions.

## Differences that need a decision
| # | Where | Mockup | App |
|---|---|---|---|
| 1 | All sizes | Top bar with brand, credits, a labelled Paytable button and sound | The v3 frame: a bottom bar on desktop, an icon bar on phones, credits in the rail or bar, no brand on phones |
| 2 | Desktop | Full-bleed page, 320 px rail | The v3 frame with a margin around it and a larger rail. Squares stay about 74 px |
| 3 | Desktop | No history row | "Last results" and "Last bets" row above the ring (carried over from v3) |
| 4 | Phones | Paytable is one tap on a labelled button | Paytable is behind an unlabelled chart icon |
| 5 | Phones | Paytable is a full-screen sheet (also dev spec §3.8) | A bottom sheet with a small gap at the top, under Settings / Paytable / Help tabs |
| 6 | Phones | Ring fills the space between top bar and dock | The ring has unused space above and below it at 390x844 |
| 7 | Paytable | A Payback column showing 95.4% on every row | No column: one figure, as dev spec §3.8 asks. Tabs and a footer are added |

## Small differences, left as they are
- Status pills have a leading dot, and "Betting open" is grey rather than blue.
- Chips use white edge stripes instead of a dashed ring.
- The centre sub line is muted grey; in the mockup it is near-white.
- The app adds key hints on Collect and Gamble, and "Add to credits" under Collect.
- The rail note reads "Play credits only. No real money value…" instead of "Simulated play credits only."
- In these shots Undo looks disabled because the test harness places the bets directly, so there is no undo history. In play it is enabled.

## Colours changed in this batch, away from the earlier approved values
The contrast audit (`contrast.md`) moved these tokens, so they now differ from `docs/design-v3/tokens.json`:

| Token | Was | Now | Why |
|---|---|---|---|
| `big-number` | `#6a7480` (3.49:1) | `#808a96` (4.73:1) | Text needs 4.5:1 with no large-text allowance |
| `btn-disabled-text` | `#9aa2ab` (4.11:1) | `#b0b7bf` (5.25:1) | A disabled Start still gives guidance ("Place a bet") |
| `chip-50` | `#4b5563` (2.02:1 on the dock) | `#657080` (3.04:1) | Chip fill needs 3:1 on the rail, frame and dock |

The slider rail and used gamble pips now use `text-dim`, and an off switch has a `text-muted` edge, all for 3:1.
