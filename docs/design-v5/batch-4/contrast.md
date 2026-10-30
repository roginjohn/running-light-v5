# v5 batch 4: contrast check

Computed with the WCAG 2.1 formula by `contrastChecks` in `scripts/gen-tokens.js` from `src/data/design-tokens-v3.json`. The
build fails if a pair drops below its minimum, and `test/unit/v5/tokens.test.js` checks them too. AA minimum: 4.5:1 for text, 3:1 for
UI parts (borders, glyphs, chip fills). Regenerate with `node docs/design-v5/batch-4/render.mjs`.

| Colour name | Hex | Background hex | Ratio | AA pass |
|---|---|---|---|---|
| tier-5 on tile | `#9aa5b1` | `#232a33` | 5.79:1 | Pass (min 4.5:1) |
| tier-5 on bg-frame (last results pill) | `#9aa5b1` | `#1a1f26` | 6.62:1 | Pass (min 4.5:1) |
| tier-5 on bg-card-pill (tier button, paytable pill) | `#9aa5b1` | `#151a20` | 6.99:1 | Pass (min 4.5:1) |
| tier-10 on tile | `#5eead4` | `#232a33` | 9.79:1 | Pass (min 4.5:1) |
| tier-10 on bg-frame (last results pill) | `#5eead4` | `#1a1f26` | 11.20:1 | Pass (min 4.5:1) |
| tier-10 on bg-card-pill (tier button, paytable pill) | `#5eead4` | `#151a20` | 11.82:1 | Pass (min 4.5:1) |
| tier-20 on tile | `#6ea8fe` | `#232a33` | 5.99:1 | Pass (min 4.5:1) |
| tier-20 on bg-frame (last results pill) | `#6ea8fe` | `#1a1f26` | 6.86:1 | Pass (min 4.5:1) |
| tier-20 on bg-card-pill (tier button, paytable pill) | `#6ea8fe` | `#151a20` | 7.24:1 | Pass (min 4.5:1) |
| tier-50 on tile | `#f0abfc` | `#232a33` | 8.23:1 | Pass (min 4.5:1) |
| tier-50 on bg-frame (last results pill) | `#f0abfc` | `#1a1f26` | 9.41:1 | Pass (min 4.5:1) |
| tier-50 on bg-card-pill (tier button, paytable pill) | `#f0abfc` | `#151a20` | 9.94:1 | Pass (min 4.5:1) |
| tier-100 on tile-jackpot | `#fde047` | `#14294a` | 11.02:1 | Pass (min 4.5:1) |
| tier-100 on bg-frame (last results pill) | `#fde047` | `#1a1f26` | 12.56:1 | Pass (min 4.5:1) |
| tier-100 on bg-card-pill (tier button, paytable pill) | `#fde047` | `#151a20` | 13.27:1 | Pass (min 4.5:1) |
| tier-100 on bg-panel-navy (last results pill) | `#fde047` | `#14294a` | 11.02:1 | Pass (min 4.5:1) |
| tier-200 on tile-jackpot | `#ffffff` | `#14294a` | 14.52:1 | Pass (min 4.5:1) |
| tier-200 on bg-frame (last results pill) | `#ffffff` | `#1a1f26` | 16.56:1 | Pass (min 4.5:1) |
| tier-200 on bg-card-pill (tier button, paytable pill) | `#ffffff` | `#151a20` | 17.49:1 | Pass (min 4.5:1) |
| tier-200 on bg-panel-navy (last results pill) | `#ffffff` | `#14294a` | 14.52:1 | Pass (min 4.5:1) |
| text-muted square number on tile | `#8a94a0` | `#232a33` | 4.70:1 | Pass (min 4.5:1) |
| text-muted square number on tile-jackpot | `#8a94a0` | `#14294a` | 4.72:1 | Pass (min 4.5:1) |
| No win label (text-muted) on tile-blank | `#8a94a0` | `#13181e` | 5.80:1 | Pass (min 4.5:1) |
| No win label (text-muted) on tile-blank-hatch | `#8a94a0` | `#21262c` | 4.95:1 | Pass (min 4.5:1) |
| tile-blank-edge (dashed border, no-win glyph) on tile-blank | `#6b7580` | `#13181e` | 3.81:1 | Pass (min 3:1) |
| tile-blank-edge (dashed border, no-win glyph) on tile-blank-hatch | `#6b7580` | `#21262c` | 3.25:1 | Pass (min 3:1) |
| tile-blank-edge vs bg-frame | `#6b7580` | `#1a1f26` | 3.53:1 | Pass (min 3:1) |
| text-muted legend on bg-frame | `#8a94a0` | `#1a1f26` | 5.38:1 | Pass (min 4.5:1) |
| chip-100 numeral | `#ffffff` | `#8548ef` | 5.04:1 | Pass (min 4.5:1) |
| chip-edge on chip-100 | `#ffffff` | `#8548ef` | 5.04:1 | Pass (min 3:1) |
| chip-100 fill vs bg-rail | `#8548ef` | `#1c222a` | 3.18:1 | Pass (min 3:1) |
| chip-100 fill vs bg-frame | `#8548ef` | `#1a1f26` | 3.29:1 | Pass (min 3:1) |
| chip-100 fill vs bg-bottombar | `#8548ef` | `#1f262e` | 3.03:1 | Pass (min 3:1) |
| chip-500 numeral | `#ffffff` | `#b45309` | 5.02:1 | Pass (min 4.5:1) |
| chip-edge on chip-500 | `#ffffff` | `#b45309` | 5.02:1 | Pass (min 3:1) |
| chip-500 fill vs bg-rail | `#b45309` | `#1c222a` | 3.19:1 | Pass (min 3:1) |
| chip-500 fill vs bg-frame | `#b45309` | `#1a1f26` | 3.30:1 | Pass (min 3:1) |
| chip-500 fill vs bg-bottombar | `#b45309` | `#1f262e` | 3.04:1 | Pass (min 3:1) |

Notes:

- Chip 100: the proposed violet `#6d28d9` passes with its white label (7.10:1) but is only 2.15–2.33:1 on the rail, frame and dock surfaces, so it fails the 3:1 UI minimum. `#8548ef` passes all of them. Amber `#b45309` passes as proposed.
- Blank squares are checked against both the base fill and the lighter hatch stripe, because text and the glyph cross both.
- Chip numerals sit on the fill, so they are held to the 4.5:1 text minimum, not the large-text one.
