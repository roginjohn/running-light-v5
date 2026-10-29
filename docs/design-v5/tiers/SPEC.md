# Running Light v5 · tier betting layout spec

Status: design only. Nothing in `src/` has changed. Rules come from `math-v5/MATH-SPEC-C.md` (approved). The mocks in
`mocks/` are the reference and `png/` holds their renders. `render.mjs` re-renders them and checks the numeric rules
below; results are in `measurements.json`.

Style: the v3 look (`src/data/design-tokens-v3.json` → `src/styles/tokens.css`): flat fills, 1 px borders, no shadows
or glows. Mobile rules come from v4 (`origin/v4/batch-1-design:docs/design-v4/mobile/`): 44 px tap targets, 12 px
minimum text, 14 px body copy, safe-area insets. There is no seasonal theme. All credits are simulated play credits.

## 1. Rules shown in the UI (MATH-SPEC-C)

| Tier | Squares | Square numbers | Chance per light | Share of stops |
|---|---|---|---|---|
| 200x | 1 | 8 | 1 in 218.3 | 0.46% |
| 100x | 2 | 21, 46 | 1 in 109.1 | 0.92% |
| 50x | 3 | 3, 29, 38 | 1 in 54.56 | 1.83% |
| 20x | 4 | 13, 17, 33, 42 | 1 in 21.83 | 4.58% |
| 10x | 8 | 5, 11, 15, 24, 27, 35, 40, 49 | 1 in 10.91 | 9.16% |
| 5x | 12 | 1, 6, 7, 9, 18, 20, 23, 26, 32, 36, 43, 48 | 1 in 5.46 | 18.33% |
| Blank | 20 | 2, 4, 10, 12, 14, 16, 19, 22, 25, 28, 30, 31, 34, 37, 39, 41, 44, 45, 47, 50 | no win | 64.72% |
| **Total** | **50** | | | 100% |

Payback is 95.4% on every tier spot. In Double Run (1 in 25 rounds) a second light stops on a different square, and
each light pays on its own. Limits: 1,000 per tier spot and 1,000 per round. Chips are 1, 5, 10, 25, 50, 100 and 500.
Players start with 10,000 and get a free refill to 10,000. Gamble is off above 300,000.

## 2. Layout decisions

1. **The board is display-only.** Players can no longer bet on single squares. The 50 squares are a `<div>` ring with
   no tap targets, and every bet goes on one of six **tier spots**.
2. **Tier spots sit in the ring's centre.** The centre uses the ring's inner grid cells (`grid-area: 2 / 2 / -2 / -2`),
   so no square can overlap it, as in v4 §3.3. The spots are a 3 × 2 grid on desktop and 2 × 3 on phones, ordered
   200x → 5x, rarest first.
3. **Each spot shows:** the multiplier (mono, the largest text), "1 in X" per light, the square count, and the current
   bet ("Bet 25" or "No bet"). A spot with a bet gets a blue border. After a round, a winning spot turns solid green
   and shows "Won N", and spots that had a bet but lost fade to 60%. On ≤ 700 px tall phones the square count is
   hidden to make room; the paytable still shows it.
4. **Blank squares are marked as no-win in three ways, not by colour alone:** a darker fill with diagonal hatching,
   a dashed border, and a ⊘ glyph. On desktop the square also reads "No win". A legend under the spots reads
   "Blank square · no win · 20 of 50".
5. **Tier inks reuse v3 colours.** 5x is grey and 10x light grey. 20x and 50x are blue; 50x also has a navy border.
   100x is white on navy, and 200x is white on navy with a white border. Because the label text always names the
   tier, colour is never the only cue.
6. **Results:**
   - A lit square that pays is solid green.
   - A lit blank square is white, the v3 lit colour.
   - In a win, the other squares of the winning tier get a green outline, so players can see that any square of
     the tier would have paid.
   - In Double Run, the two lit squares carry "1" and "2" badges. The headline lists both lights and what each paid.
   - When nothing wins, a red "No win" pill shows with the headline "Blank square", and the bets are kept for
     "Start again".
7. **Controls:** desktop uses a 320 px left rail: chips (4 + 3 grid, 56 px), total bet "190 / 1,000", Undo, Clear,
   and Start, whose second line reads "190 on 5 spots". Phones use a bottom dock: seven 44 px chips in one row
   (fits 360 wide), then Undo, Clear and Start. A win swaps the actions for Collect and Gamble and disables the chips.
8. **Paytable:** on desktop it is a 920 px dialog with a table (tier, squares, square numbers, chance per light,
   share of stops, payback) and Blank and Total rows. On phones it is a full-screen sheet with one card per tier and
   a scrolling body. Both show 95.4% payback, the "30 tier + 20 blank = 50" count, and the note that squares are not
   equally likely (concern 1 in MATH-SPEC-C).
9. **Ring shapes:** desktop uses 16 × 11 with an 80 px max pitch (74 px squares at 1920 × 1080). Phones use 11 × 16
   (30.5 px squares at 390 × 844), or 12 × 15 when the height is ≤ 700 px (25 px squares at 360 × 640). Phone
   squares drop the "x" and the square number so that "200" fits in 12 px text.
10. **Two new chips (100 and 500)** need fills. The mocks use violet `#6d28d9` and amber `#b45309`, defined in
    `mock.css`; they are not in the tokens yet.

## 3. Checks (`render.mjs` → `measurements.json`)

Run from the repo root: `node docs/design-v5/tiers/render.mjs`. This builds `mocks/*.html` with `build.mjs`, renders
11 PNGs with puppeteer-core and Chrome (set `CHROME=` to point at another binary), and exits with code 1 on any of:

- a tap target under 44 px on either side
- text under 12 px, or body copy (`p`, `.body`) under 14 px
- page scroll, any element off-screen (scroll boxes excepted), clipped text, a tile label wider than its tile, or a
  square overlapping the centre, top bar or dock
- banned wording in the copy (the `BANNED` list in `render.mjs`)

Last run: all 11 pages pass. The smallest tap target is 44 px, the smallest text 12 px and the smallest body copy
14 px, with no overflow. The smallest spot is 131 × 87 px at 360 × 640.

| PNG | Sizes |
|---|---|
| `betting-*` | 1920×1080, 390×844, 360×640 |
| `paytable-*` | 1920×1080, 390×844 |
| `win-*`, `double-run-*`, `no-win-*` | 1920×1080, 390×844 |

## 4. Open questions

1. **Odds wording.** The spots show "1 in X" **per light** (exact). Because of Double Run, a round hits slightly
   more often (5x: 1 in 5.28 per round). Is "per light" OK, or should the spots show per-round odds and the
   paytable show both?
2. **Payback per tier.** Exact payback runs from 95.34% to 95.38%. Is one "95.4%" figure enough, or should the
   paytable show two decimals per tier?
3. **Unequal squares.** A blank square is about 7× as likely as the 200x square. The paytable says so in plain words.
   Should the board also hint at it, for example with a stop-share bar on each spot?
4. **Tier colours.** 20x and 50x share the blue ink (only the border differs), and so do 100x and 200x (white on
   navy). Should v5 add tier tokens so each tier has its own hue?
5. **Chip fills for 100 and 500.** Violet and amber are proposals. They need contrast checks and token entries.
6. **Rebet.** The mocks drop Rebet on both layouts, because bets are kept after a round and Start again replays
   them. Should it come back as a button after Clear?
7. **Gamble details.** MATH-SPEC-C only says "as B §7" (cap 300,000). The number of gambles per win and the flip
   screen are not redesigned here; the v4 gamble flow is assumed.
8. **Double Run on the same tier.** When both lights land on one tier (0.16% of rounds), should that spot show
   "Won N × 2" or the summed amount? The mock pattern ("Won N" plus the light badges) supports either.
9. **Landscape phones and tablets** are not mocked for v5. The v4 landscape and tablet layouts would need the same
   change: tier spots in the centre and a display-only ring.
