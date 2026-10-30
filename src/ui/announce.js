// What the polite live region (#live, dev spec §4) says about a result. Pure: every number comes from the stored round.
import { winParts } from '../engine/outcome.js';
import { MULT } from '../engine/config.js';

const fmt = (n) => Number(n).toLocaleString('en-US');
const what = (l) => (l.tier === 'blank' ? 'a blank square' : `${l.tier}x`);

/** "Light stopped on square 8, 200x. Won 5,000. Collect or gamble." One sentence per light in a Double Run, and a
 *  double hit (both lights on one bet tier) is named. canGamble: the engine still offers the gamble on this win. */
export function resultMessage(r, canGamble = true) {
  const { lights, total } = winParts(r.bets, r.s1, r.s2);
  const next = canGamble ? 'Collect or gamble.' : 'Collect your win.';
  if (lights.length === 1) {
    const [l] = lights;
    const stop = `Light stopped on square ${l.square}, ${what(l)}.`;
    if (total) return `${stop} Won ${fmt(total)}. ${next}`;
    return `${stop} ${l.tier === 'blank' ? '' : `No bet on ${l.tier}x. `}No win. Your bets are kept.`;
  }
  const stops = lights.map((l, i) => {
    const pay = l.tier === 'blank' ? '' : l.amount ? `, pays ${fmt(l.amount)}` : ', no bet';
    return `Light ${i + 1} stopped on square ${l.square}, ${what(l)}${pay}.`;
  }).join(' ');
  if (!total) return `Double Run. ${stops} No win. Your bets are kept.`;
  const doubleHit = lights[0].amount && lights[1].amount && MULT[r.s1] === MULT[r.s2];
  return `Double Run. ${doubleHit ? `Double hit on ${MULT[r.s1]}x, both lights pay. ` : ''}${stops} Won ${fmt(total)}. ${next}`;
}

/** First light of a Double Run, with the second still to come. */
export function doubleRunMessage(r) {
  const [l] = winParts(r.bets, r.s1).lights;
  const pay = l.tier === 'blank' ? '' : l.amount ? `, pays ${fmt(l.amount)}` : ', no bet';
  return `Double Run! Light 1 stopped on square ${l.square}, ${what(l)}${pay}. A second light is running.`;
}

export const gambleWonMessage = (colour, win, canGamble) => `Gamble won. Match, ${colour} lit. Your win is now ${fmt(win)}. ${canGamble ? 'Gamble again or collect.' : 'Collect your win.'}`;
export const gambleLostMessage = (colour, pick, win, balance) => `Gamble lost. No match, ${colour} lit and your pick was ${pick}. The ${fmt(win)} win is gone. Your credits stay at ${fmt(balance)}.`;
