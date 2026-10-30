// Entry point. Production: crypto RNG, localStorage (memory fallback). Test mode only when the test harness
// defines window.__RL_TEST__ before load (never selectable from the game UI).
import './styles.css';
import tokens from './data/design-tokens-v3.json';
import { assertArrangement } from './engine/config.js';
import { createGame } from './engine/game.js';
import { createCryptoRng, createSeededRng } from './engine/rng.js';
import { detectBackend, memoryBackend, KEYS, validSettings } from './engine/storage.js';
import { startApp } from './ui/app.js';
import { loadingScreen } from './ui/view.js';

// UI feature flag: Start screen after loading (v2 open item 1, default ON). Tests may turn it off via __RL_TEST__.
const START_SCREEN = true;
// Minimum supported viewport; below it (or a phone in landscape under 480 px tall) the "Rotate / enlarge" screen shows.
const MIN_W = 320, MIN_H = 480;

const T = globalThis.__RL_TEST__ || null;
const root = document.getElementById('app');
const loadingEl = document.getElementById('loading');

function checkSize() {
  document.getElementById('rotate').hidden = !(window.innerWidth < MIN_W || window.innerHeight < MIN_H);
}
window.addEventListener('resize', checkSize);
checkSize();

// Loading screen (INIT): the flat v3 mark and a progress bar while fonts load (v3 batch 6: no bulb ring).
const reducedPref = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let progress = 0, step = 0, label = 'Loading…';
const drawLoading = () => {
  loadingEl.innerHTML = loadingScreen(window.innerWidth, window.innerHeight, progress, reducedPref ? -1 : step, label);
  loadingEl.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
};
drawLoading();
const loadTick = setInterval(() => { step++; progress = Math.min(0.9, progress + 0.06); drawLoading(); }, 90);

/**
 * Approved v2 behaviour (spec D3): an unreadable or invalid settings key is reset to the defaults (no ERROR state).
 * Done here in the load layer so the locked engine is untouched. Corrupt balance/round keys still go to ERROR.
 */
function resetCorruptSettings(backend) {
  try {
    const raw = backend.getItem(KEYS.settings);
    if (raw == null) return false;
    let ok = false;
    try { ok = validSettings(JSON.parse(raw)); } catch { ok = false; }
    if (ok) return false;
    backend.removeItem(KEYS.settings);
    console.warn('[running-light] settings were unreadable: reset to the defaults');
    return true;
  } catch {
    return false;
  }
}

async function boot() {
  assertArrangement(tokens['board-arrangement']); // B1 startup assertion (v3 tokens vs config.js)
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]);
    await Promise.all(['600 20px Poppins', '700 20px Poppins', "600 20px 'JetBrains Mono'"].map((f) => document.fonts.load(f)));
  } catch { /* fonts are decorative; fall back silently */ }
  label = 'Loading sounds…';
  // T.noStorage simulates unavailable localStorage the same way detectBackend() falls back.
  const { backend, persistent } = T && T.noStorage ? { backend: memoryBackend(), persistent: false } : detectBackend();
  const settingsReset = resetCorruptSettings(backend);
  const game = createGame({
    rng: T && Number.isInteger(T.seed) ? createSeededRng(T.seed) : createCryptoRng(),
    backend,
    persistent,
    prefersReducedMotion: reducedPref,
    testMode: !!T,
  });
  const startScreen = T && typeof T.startScreen === 'boolean' ? T.startScreen : START_SCREEN;
  const app = startApp({ game, root, testMode: !!T, timeScale: (T && T.timeScale) || 1, startScreen, settingsReset });
  game.init();
  for (const e of game.state.log) console.warn('[running-light]', e.msg);
  clearInterval(loadTick);
  progress = 1;
  drawLoading();
  setTimeout(() => loadingEl.classList.add('done'), T ? 0 : 250);
  if (T) {
    globalThis.__rl = { game, app };
    // TEST MODE ONLY: re-show the loading screen at a given frame (screenshot 01)
    globalThis.__rlShowLoading = (p, st, lab) => {
      progress = p; step = st; label = lab;
      drawLoading();
      loadingEl.classList.remove('done');
    };
  }
}

boot().catch((e) => {
  console.error(`boot failed: ${e && e.stack ? e.stack : e}`);
  clearInterval(loadTick);
  loadingEl.innerHTML = '';
  document.getElementById('fatal').hidden = false;
});
