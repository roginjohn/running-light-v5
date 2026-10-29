#!/usr/bin/env node
// v5 seeded simulation (MATH-SPEC-C). Drives the REAL engine (createGame + dispatch) with a seeded sfc32 RNG.
// Bets 1 credit on each of the 6 tier spots every round and reports the overall and per-tier payback, the exact
// theoretical payback from config.js (enumerated over every 1-light stop and ordered Double Run pair i ≠ j) and the
// Double Run rate. Exit code 1 when the overall payback is outside 95.4% ± 0.3 pp (and, from 10M rounds on, when a
// tier is outside ±0.5 pp, ±1.0 pp for 100x/200x, or the Double Run rate is outside 4% ± 0.05 pp; dev spec §5.3).
// Usage: node scripts/simulate.js [--rounds N] [--seed S] [--strategy A|B|both] [--out dir]
//   A: always Collect (default). B: same bets, always gamble the maximum allowed (pick red), then Collect.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame } from '../src/engine/game.js';
import { createSeededRng } from '../src/engine/rng.js';
import { memoryBackend } from '../src/engine/storage.js';
import { MULT, WEIGHTS, TOTAL_WEIGHT, TIERS, COUNT_BY_TIER, DOUBLE_RUN_ONE_IN, pStopTier, pRoundTier } from '../src/engine/config.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const ROUNDS = Number(args.rounds || 20_000_000);
const SEED = Number(args.seed ?? 20261030);
const STRATEGY = args.strategy || 'A';
const OUT = args.out || new URL('../test-results/sim', import.meta.url).pathname;
const JSON_STORAGE = args['json-storage'] === '1';

const TARGET = 0.954, BAND = 0.003; // 95.4% ± 0.3 pp (sim:quick acceptance, dev spec §5.9)
const TIER_BAND = (t) => (t >= 100 ? 0.01 : 0.005); // dev spec §5.3, checked from 10M rounds
const DR_BAND = 0.0005;
const FULL_CHECKS = ROUNDS >= 10_000_000;

/** Exact return per 1 credit on tier t: every 1-light stop i and every ordered Double Run pair i ≠ j. */
function exactPayback(t) {
  const dr = 1 / DOUBLE_RUN_ONE_IN;
  let e = 0;
  for (let i = 1; i <= 50; i++) {
    const pi = WEIGHTS[i] / TOTAL_WEIGHT;
    const a = MULT[i] === t ? t : 0;
    e += pi * (1 - dr) * a;
    for (let j = 1; j <= 50; j++) {
      if (j !== i) e += pi * dr * (WEIGHTS[j] / (TOTAL_WEIGHT - WEIGHTS[i])) * (a + (MULT[j] === t ? t : 0));
    }
  }
  return e;
}
const EXACT = Object.fromEntries(TIERS.map((t) => [t, exactPayback(t)]));
const EXACT_OVERALL = TIERS.reduce((s, t) => s + EXACT[t], 0) / TIERS.length; // equal stake on every tier

/** Simulation backend: keeps written values by reference (skips JSON serialization; engine logic unchanged). */
function objectBackend() {
  const m = new Map();
  return { getItem: () => null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), setJSON: (k, v) => m.set(k, v) };
}

function makeGame(seed) {
  let id = 0;
  const g = createGame({
    rng: createSeededRng(seed),
    backend: JSON_STORAGE ? memoryBackend() : objectBackend(),
    testMode: true,
    now: () => 0,
    idGen: () => `s${++id}`,
  });
  g.init();
  return g;
}

function must(g, action) {
  const r = g.dispatch(action);
  if (!r.ok) throw new Error(`${action.type} rejected in ${g.state.phase}: ${r.reason}`);
}

function run(strategy, rounds, seed) {
  const g = makeGame(seed);
  const TOP = 1_000_000_000;
  g.test.setBalance(TOP);
  for (const t of TIERS) must(g, { type: 'ADD_BET', tier: t }); // chip 1 on each of the 6 tiers
  let wagered = 0, returned = 0, sumSq = 0, drRounds = 0, sameStops = 0, sameTier = 0, roundsWithWin = 0;
  let flips = 0, flipWins = 0, gambleRounds = 0;
  const tierRet = Object.fromEntries(TIERS.map((t) => [t, 0]));
  const tierSq = Object.fromEntries(TIERS.map((t) => [t, 0]));
  const tierHitRounds = Object.fromEntries(TIERS.map((t) => [t, 0]));
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) {
    if (g.state.phase !== 'BETTING') throw new Error(`unexpected phase ${g.state.phase}`);
    if (!Object.keys(g.state.bets).length) must(g, { type: 'REBET' });
    if (g.state.balance < 1_000_000) g.test.setBalance(TOP); // simulation top-up hook
    const balBefore = g.state.balance;
    must(g, { type: 'START' });
    const r = g.state.round;
    wagered += r.totalBet;
    // per-tier return of the base win (each light pays M on its own tier)
    const m1 = MULT[r.s1], m2 = r.doubleRun ? MULT[r.s2] : 0;
    if (r.doubleRun) {
      drRounds++;
      if (r.s1 === r.s2) sameStops++;
      if (m1 && m1 === m2) sameTier++;
    }
    for (const t of TIERS) {
      const x = (m1 === t ? t : 0) + (m2 === t ? t : 0);
      if (x) { tierRet[t] += x; tierSq[t] += x * x; tierHitRounds[t]++; }
    }
    must(g, { type: 'LIGHT1_DONE' });
    must(g, { type: 'RESOLVE_DONE' });
    if (g.state.phase === 'DOUBLE_RUN') must(g, { type: 'LIGHT2_DONE' });
    if (r.baseWin !== (m1 || 0) + (m2 || 0)) throw new Error('payout mismatch');
    if (g.state.phase === 'GAMBLE_OFFER') {
      roundsWithWin++;
      if (strategy === 'B' && g.gambleBlock() === null) {
        gambleRounds++;
        must(g, { type: 'GAMBLE_OPEN' });
        must(g, { type: 'PICK', colour: 'red' });
        while (g.state.phase === 'GAMBLE' && g.gambleBlock() === null) {
          must(g, { type: 'GAMBLE_FLIP' });
          must(g, { type: 'REVEAL_DONE' });
          flips++;
          const last = r.gambles[r.gambles.length - 1];
          if (last.pick === last.result) flipWins++;
        }
        if (g.state.phase === 'GAMBLE') must(g, { type: 'COLLECT' });
      } else must(g, { type: 'COLLECT' });
      must(g, { type: 'PAYOUT_DONE' });
    }
    if (!r.settled) throw new Error('round not settled');
    const win = r.currentWin;
    if (g.state.balance !== balBefore - r.totalBet + win) throw new Error('balance integrity violated');
    returned += win;
    const x = win / r.totalBet;
    sumSq += x * x;
  }
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  const rtp = returned / wagered;
  const se = Math.sqrt((sumSq / rounds - rtp * rtp) / rounds);
  const tiers = TIERS.map((t) => {
    const p = tierRet[t] / rounds; // 1 credit per round on this tier
    const tse = Math.sqrt((tierSq[t] / rounds - p * p) / rounds);
    return {
      tier: t, squares: COUNT_BY_TIER[t], rtp: p, exactRtp: EXACT[t], se: tse, z: (p - EXACT[t]) / tse,
      roundHitOneIn: rounds / tierHitRounds[t], exactRoundHitOneIn: 1 / pRoundTier(t), lightOneIn: 1 / pStopTier(t),
      bandPass: !FULL_CHECKS || Math.abs(p - TARGET) <= TIER_BAND(t),
    };
  });
  const drRate = drRounds / rounds;
  const res = {
    strategy, seed, rounds, runtimeSeconds: +secs.toFixed(2),
    wagered, returned, rtp, exactRtp: EXACT_OVERALL, rtpStandardError: se, rtpZ: (rtp - EXACT_OVERALL) / se,
    rtpBandPass: Math.abs(rtp - TARGET) <= BAND,
    doubleRun: {
      rounds: drRounds, rate: drRate, expected: 1 / DOUBLE_RUN_ONE_IN,
      z: (drRate - 0.04) / Math.sqrt((0.04 * 0.96) / rounds), bandPass: !FULL_CHECKS || Math.abs(drRate - 0.04) <= DR_BAND,
    },
    s1EqualsS2: sameStops, sameTierDoubleRuns: sameTier, roundsWithWin,
    tiers,
  };
  if (strategy === 'B') {
    const wr = flips ? flipWins / flips : 0;
    res.gamble = { roundsGambled: gambleRounds, flips, wins: flipWins, winRate: wr, z: (wr - 0.5) / Math.sqrt(0.25 / flips), winRatePass: Math.abs(wr - 0.5) <= 0.002 };
  }
  return res;
}

const pct = (x, d = 3) => `${(x * 100).toFixed(d)}%`;
const n = (x) => x.toLocaleString('en-US');

function report(res) {
  const L = [];
  L.push(`### Strategy ${res.strategy} — seed ${res.seed}, ${n(res.rounds)} rounds, ${res.runtimeSeconds}s`);
  L.push('');
  // strategy A is the payback check; B gambles every win, which keeps the mean but widens the spread a lot
  const band = res.strategy === 'A' ? ` — band 95.4% ± 0.3 pp: **${res.rtpBandPass ? 'PASS' : 'FAIL'}**` : ' (informational)';
  L.push(`- Overall payback: **${pct(res.rtp)}** (exact ${pct(res.exactRtp)}; SE ${(res.rtpStandardError * 100).toFixed(3)} pp; z = ${res.rtpZ.toFixed(2)})${band}`);
  L.push(`- Wagered ${n(res.wagered)}, returned ${n(res.returned)}; rounds with a win ${pct(res.roundsWithWin / res.rounds, 2)}`);
  L.push(`- Double Run rate: ${pct(res.doubleRun.rate)} vs 4.000% (z = ${res.doubleRun.z.toFixed(2)}), ${n(res.doubleRun.rounds)} rounds; both lights on one tier: ${n(res.sameTierDoubleRuns)}`);
  L.push(`- s1 == s2 occurrences: **${res.s1EqualsS2}** (must be 0)`);
  if (res.gamble) L.push(`- Gamble: ${n(res.gamble.flips)} flips, win rate **${pct(res.gamble.winRate)}** (z = ${res.gamble.z.toFixed(2)}) — 50% ± 0.2 pp: **${res.gamble.winRatePass ? 'PASS' : 'FAIL'}**`);
  L.push('');
  L.push('| Tier | Squares | Sim payback | Exact payback | SE (pp) | z | Round hit 1 in N | Exact 1 in N | Per light 1 in |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const t of res.tiers) {
    L.push(`| ${t.tier}x | ${t.squares} | ${pct(t.rtp)} | ${pct(t.exactRtp)} | ${(t.se * 100).toFixed(3)} | ${t.z.toFixed(2)} | ${t.roundHitOneIn.toFixed(2)} | ${t.exactRoundHitOneIn.toFixed(2)} | ${t.lightOneIn.toFixed(2)} |`);
  }
  L.push('');
  return L.join('\n');
}

mkdirSync(OUT, { recursive: true });
const results = [];
if (STRATEGY === 'A' || STRATEGY === 'both') results.push(run('A', ROUNDS, SEED));
if (STRATEGY === 'B' || STRATEGY === 'both') results.push(run('B', ROUNDS, SEED + 1));
const md = [
  '# v5 seeded simulation (real engine, MATH-SPEC-C) — simulated play credits only',
  '',
  `Command: \`node scripts/simulate.js ${process.argv.slice(2).join(' ')}\` · Node ${process.version}`,
  `Storage backend: ${JSON_STORAGE ? 'in-memory JSON strings (same as browser)' : 'in-memory object references (JSON serialization skipped for speed; same engine code path)'}.`,
  'PRNG: sfc32 seeded via splitmix32 (test and simulation only). Bets: 1 credit on each of the 6 tiers every round; the balance is topped up by the simulation hook.',
  `Exact payback per tier (enumerated from config.js): ${TIERS.map((t) => `${t}x ${pct(EXACT[t], 4)}`).join(' · ')}.`,
  FULL_CHECKS ? 'Per-tier (±0.5 pp, ±1.0 pp for 100x/200x) and Double Run (4% ± 0.05 pp) bands are checked.' : 'Per-tier and Double Run bands are checked from 10M rounds; this run checks the overall band only.',
  '',
  ...results.map(report),
].join('\n');
writeFileSync(`${OUT}/simulation.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/simulation.md`, `${md}\n`);
console.log(md);
const pass = results.every((r) => (r.strategy !== 'A' || r.rtpBandPass) && r.s1EqualsS2 === 0 && r.doubleRun.bandPass
  && r.tiers.every((t) => r.strategy !== 'A' || t.bandPass) && (!r.gamble || r.gamble.winRatePass));
console.log(pass ? '\nSIM RESULT: PASS' : '\nSIM RESULT: FAIL');
process.exitCode = pass ? 0 : 1;
