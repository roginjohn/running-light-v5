# v5 batch 8: release candidate notes

Simulated credits only. Nothing here has been pushed, merged, tagged or published.

## Regression (run on the code at `7101df7`; this file is the only later change)
| Check | Result |
|---|---|
| `npm test` | 179 of 179 pass |
| `npm run test:ui`, run 1 | 83 of 83 pass, 405.5 s |
| `npm run test:ui`, run 2 | 83 of 83 pass, 404.2 s |
| `npm run test:ui`, run 3 | 83 of 83 pass, 405.4 s |
| `npm run sim:quick` (1M) | 95.303% (band 95.4 ± 0.3): PASS. Double Run 4.031% |
| 20M sim, seed 20261030 | 95.371% (exact 95.367%): PASS. Double Run 4.008%; s1 == s2 never |
| `npm run sim:gamble` | PASS |
| `npm run perf:budget` | All budgets met. 472 DOM nodes of 500 (`perf.json`) |

20M payback per tier: 5x 95.351%, 10x 95.389%, 20x 95.537%, 50x 95.149%, 100x 95.180%, 200x 95.620%.

## The UI test stall
Measured with the light run on a page in each condition:

| Condition | Result |
|---|---|
| Idle, page in front | 5.8–6.0 s, longest frame 17–50 ms |
| 16 busy threads on 8 cores, page in front | 5.8–6.0 s, longest frame 17 ms |
| The six light-run tests, 32 busy threads, 6 runs | All pass |
| Another tab in front of the page | Stalled every time (6 of 6): page hidden, no animation frames |
| Page in its own browser context, other tab open | 5.8–6.0 s, longest frame 17 ms |

Chrome runs no animation frames in a tab behind another one. The light, the staged renders and puppeteer's default waits all run on frames, and `timeToPhase` and `staged` had no time limit, so a hidden page waited until the protocol timeout. Slow frames, which batch 7 hardened against, are not the cause.

The fix removes that failure: every test page has its own browser context and so its own window, `openGame` refuses a hidden page, waits are bounded and report visibility and phase, and pages left by a failed test are closed.

**Limit of this finding:** the stall was reproduced on purpose by hiding a page. It did not happen by itself here: the unfixed suite passed 79 of 79 once, and 120 tab close-and-open cycles never hid a page. What hid a page in the earlier flaky runs was not observed. If a stall ever comes back, its error message now names the page's visibility and phase.

## Tablet (768x1024)
Chips, Undo and Clear, the bottom bar, and the dialog close, tabs, switches and sliders are now at least 44x44. The bar went from 40 to 44 px and the frame grew to fit. A new test measures every control in all 17 states and fails on the old 40 px chips (checked). The a11y audit also runs at this size.

The screenshots also showed the credits line overlapping the total bet at this size. It now sits above the card, with a test.

## Screen reader
**No real screen reader was used.** This machine has none (no Orca, eSpeak or speech-dispatcher) and system packages were not to be installed. Automated tests check the ARIA roles and names and the live-region text, but that does not show how a screen reader actually speaks them. A manual pass is still needed, for example NVDA or VoiceOver: place a bet, then hear a win, a no-win, Double Run and a gamble.

## Preview
`npm run preview:rc` writes `running-light-v5-rc.zip`; `node test/ui/verify-preview.js` extracts it and plays a real round by clicks, with no test hooks, from a local server and from `file://`. It opens in Chrome from a double-click because the copy loads its bundle as a plain script; `dist/` is unchanged. Other browsers were not tested.

## Not covered
- Tablet landscape (1024x768) still has controls under 44 px (chips 34, Undo and Clear 32). The rail is too narrow for 44 px chips in its 4-column grid, so it needs a layout decision.
- `chip-768` in `docs/design-v3/tokens.json` and `src/data/design-tokens-v3.json` still says 40. These are v3 values with nothing reading them for layout; `layout.js` is what sets 44.
- Screenshots of the new tablet sizes have no v5 mockup to compare against (dev spec §9 item 1).
