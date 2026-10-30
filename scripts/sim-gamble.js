#!/usr/bin/env node
// v5 gamble-path simulation (MATH-SPEC-C, dev spec §2.4). Drives the REAL engine (createGame + dispatch) with a seeded
// sfc32 RNG through every gamble path: Collect at once, then gamble up to 1, 2 or 3 times per win, on a small bet map and
// on the large 200x bets around the 150,000 limit. Simulated play credits only.
// Reports payback and spread per policy, flips per depth, the flip win rate and the wins the limit blocked. Exit code 1
// when a gamble breaks a rule: more than 3 flips on a win, a win above 300,000, a flip on a win above 150,000, a win of
// 150,000 or less that the engine refuses, a balance mismatch, or a flip win rate outside 50% ± 0.2 pp, or when a policy's
// payback is more than 4 standard errors from the exact no-gamble payback (a flip keeps the mean).
// Usage: node scripts/sim-gamble.js [--rounds N] [--seed S] [--out dir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame } from '../src/engine/game.js';
import { createSeededRng } from '../src/engine/rng.js';
import { WEIGHTS, TOTAL_WEIGHT, MULT, DOUBLE_RUN_ONE_IN, MAX_GAMBLES, GAMBLE_CAP } from '../src/engine/config.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const ROUNDS = Number(args.rounds || 2_000_000);
const SEED = Number(args.seed ?? 20261031);
const OUT = args.out || new URL('../test-results/sim-gamble', import.meta.url).pathname;
const GAMBLE_LIMIT = GAMBLE_CAP / 2; // the largest win the engine offers: doubling it reaches the cap exactly
const RATE_BAND = 0.002;
const Z_MAX = 4;

// [name, bets]: the 200x bets exist to reach the 150,000 limit and the 300,000 cap
const BET_MAPS = [
  ['1 on each tier', { 5: 1, 10: 1, 20: 1, 50: 1, 100: 1, 200: 1 }],
  ['mock bets (190)', { 5: 100, 10: 50, 20: 25, 50: 10, 100: 5 }],
  ['500 on 200x', { 200: 500 }],
  ['750 on 200x (150,000)', { 200: 750 }],
  ['751 on 200x (150,200)', { 200: 751 }],
  ['1,000 on 200x', { 200: 1000 }],
];
const POLICIES = [0, 1, 2, 3]; // the most flips the player takes on a win

/** Exact return of a bet map per round without gambling: every 1-light stop and ordered Double Run pair i ≠ j. */
function exactReturn(bets) {
  const pay = (s) => (MULT[s] ? MULT[s] * (bets[MULT[s]] || 0) : 0);
  const dr = 1 / DOUBLE_RUN_ONE_IN;
  let e = 0;
  for (let i = 1; i <= 50; i++) {
    const pi = WEIGHTS[i] / TOTAL_WEIGHT;
    e += pi * (1 - dr) * pay(i);
    for (let j = 1; j <= 50; j++) {
      if (j !== i) e += pi * dr * (WEIGHTS[j] / (TOTAL_WEIGHT - WEIGHTS[i])) * (pay(i) + pay(j));
    }
  }
  return e;
}

/** Simulation backend: keeps written values by reference (same as simulate.js; engine logic unchanged). */
function objectBackend() {
  const m = new Map();
  return { getItem: () => null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), setJSON: (k, v) => m.set(k, v) };
}

function must(g, action) {
  const r = g.dispatch(action);
  if (!r.ok) throw new Error(`${action.type} rejected in ${g.state.phase}: ${r.reason}`);
}

function run(name, bets, policy, rounds, seed) {
  let id = 0;
  const g = createGame({ rng: createSeededRng(seed), backend: objectBackend(), testMode: true, now: () => 0, idGen: () => `g${++id}` });
  g.init();
  const TOP = 1_000_000_000;
  g.test.setBalance(TOP);
  const total = Object.values(bets).reduce((a, b) => a + b, 0);
  let returned = 0, sumSq = 0, wins = 0, flips = 0, flipWins = 0, gambleLost = 0, blockedCap = 0, maxWin = 0;
  const violations = [];
  const depth = [0, 0, 0, 0]; // wins by the number of flips taken
  for (let i = 0; i < rounds; i++) {
    g.test.setBets(bets);
    if (g.state.balance < 1_000_000) g.test.setBalance(TOP);
    const before = g.state.balance;
    must(g, { type: 'START' });
    const r = g.state.round;
    must(g, { type: 'LIGHT1_DONE' });
    must(g, { type: 'RESOLVE_DONE' });
    if (g.state.phase === 'DOUBLE_RUN') must(g, { type: 'LIGHT2_DONE' });
    if (g.state.phase === 'GAMBLE_OFFER') {
      wins++;
      if (policy > 0) {
        const offered = g.gambleBlock() === null;
        if (offered !== (r.currentWin <= GAMBLE_LIMIT)) violations.push(`win ${r.currentWin}: offered ${offered}`);
        if (offered) {
          must(g, { type: 'GAMBLE_OPEN' });
          while (g.state.phase === 'GAMBLE' && r.gambles.length < policy && g.gambleBlock() === null) {
            must(g, { type: 'PICK', colour: 'red' });
            must(g, { type: 'GAMBLE_FLIP' });
            must(g, { type: 'REVEAL_DONE' });
            flips++;
            const last = r.gambles[r.gambles.length - 1];
            if (last.pick === last.result) flipWins++;
            else gambleLost++;
          }
          if (g.state.phase === 'GAMBLE') {
            if (g.gambleBlock() === 'cap' && r.gambles.length < policy) blockedCap++;
            must(g, { type: 'COLLECT' });
          }
        } else {
          blockedCap++;
          must(g, { type: 'COLLECT' });
        }
      } else must(g, { type: 'COLLECT' });
      must(g, { type: 'PAYOUT_DONE' });
      depth[r.gambles.length]++;
    }
    if (!r.settled) throw new Error('round not settled');
    if (r.gambles.length > MAX_GAMBLES) violations.push(`${r.gambles.length} flips`);
    if (r.currentWin > GAMBLE_CAP) violations.push(`win ${r.currentWin} above the cap`);
    if (g.state.balance !== before - total + r.currentWin) throw new Error('balance integrity violated');
    if (r.currentWin > maxWin) maxWin = r.currentWin;
    returned += r.currentWin;
    sumSq += r.currentWin * r.currentWin;
  }
  const mean = returned / rounds;
  const exact = exactReturn(bets);
  const se = Math.sqrt(Math.max(0, sumSq / rounds - mean * mean) / rounds);
  const flipRate = flips ? flipWins / flips : null;
  return {
    bets: name, policy, rounds, seed, total, payback: mean / total, exactPayback: exact / total, se: se / total, z: se ? (mean - exact) / se : 0,
    sdPerCredit: Math.sqrt(Math.max(0, sumSq / rounds - mean * mean)) / total,
    wins, flips, flipWins, flipRate, gambleLost, blockedCap, depth, maxWin, violations: violations.slice(0, 5), violationCount: violations.length,
  };
}

const pct = (x, d = 3) => `${(x * 100).toFixed(d)}%`;
const n = (x) => x.toLocaleString('en-US');

const t0 = Date.now();
const results = [];
let seed = SEED;
for (const [name, bets] of BET_MAPS) for (const p of POLICIES) results.push(run(name, bets, p, ROUNDS, seed++));
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const allFlips = results.reduce((a, r) => a + r.flips, 0), allFlipWins = results.reduce((a, r) => a + r.flipWins, 0);
const rate = allFlipWins / allFlips;
const ratePass = Math.abs(rate - 0.5) <= RATE_BAND;
const violationCount = results.reduce((a, r) => a + r.violationCount, 0);
const zPass = results.every((r) => Math.abs(r.z) <= Z_MAX);
const maxWin = Math.max(...results.map((r) => r.maxWin));
const pass = ratePass && violationCount === 0 && zPass && maxWin <= GAMBLE_CAP;

const L = [
  '# v5 gamble-path simulation (real engine, MATH-SPEC-C) — simulated play credits only',
  '',
  `Command: \`node scripts/sim-gamble.js ${process.argv.slice(2).join(' ')}\` · Node ${process.version} · ${secs}s · first seed ${SEED}`,
  `${n(ROUNDS)} rounds per row. Policy N = take up to N flips on each win, always picking red, then Collect.`,
  `Rules checked: at most ${MAX_GAMBLES} flips, offered exactly on wins of ${n(GAMBLE_LIMIT)} or less, no win above ${n(GAMBLE_CAP)}, balance integrity every round.`,
  '',
  `- Flips: ${n(allFlips)}, won ${n(allFlipWins)}: **${pct(rate)}** — 50% ± 0.2 pp: **${ratePass ? 'PASS' : 'FAIL'}**`,
  `- Largest win seen: **${n(maxWin)}** (cap ${n(GAMBLE_CAP)})`,
  `- Rule violations: **${violationCount}**`,
  `- Payback within ${Z_MAX} SE of the exact no-gamble payback in every row: **${zPass ? 'PASS' : 'FAIL'}**`,
  '',
  '| Bets | Policy | Payback | Exact (no gamble) | SE (pp) | z | SD per credit | Wins | Wins by flips taken (0/1/2/3) | Flips | Flip win rate | Lost in gamble | Blocked by limit | Max win |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.bets} | ${r.policy} | ${pct(r.payback)} | ${pct(r.exactPayback)} | ${(r.se * 100).toFixed(3)} | ${r.z.toFixed(2)} | ${r.sdPerCredit.toFixed(2)} | ${n(r.wins)} | ${r.depth.map(n).join(' / ')} | ${n(r.flips)} | ${r.flipRate == null ? '—' : pct(r.flipRate, 2)} | ${n(r.gambleLost)} | ${n(r.blockedCap)} | ${n(r.maxWin)} |`),
  '',
];
const md = L.join('\n');
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/gamble.json`, JSON.stringify({ rate, ratePass, maxWin, violationCount, zPass, results }, null, 2));
writeFileSync(`${OUT}/gamble.md`, `${md}\n`);
console.log(md);
console.log(pass ? '\nGAMBLE SIM RESULT: PASS' : '\nGAMBLE SIM RESULT: FAIL');
process.exitCode = pass ? 0 : 1;
