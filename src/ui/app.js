// UI controller (v3): renders DOM regions from engine state, maps input to engine.dispatch, runs outcome-first
// animations. The UI never computes outcomes; it only animates what the engine has already stored.
import * as V from './view.js';
import { computeLayout, layoutVars } from './layout.js';
import { mapKey } from './keys.js';
import { createAudio } from './audio.js';
import { planFirstRunV2, planSecondRunV2, planFade, advance } from './lightplan.js';
import { MULT, TOASTS, REFILL_AMOUNT } from '../engine/config.js';
import { totalOf, countOf, sameBets } from '../engine/bets.js';
import { createCryptoRng } from '../engine/rng.js';
import { halveBets, doubleBets } from './betscale.js';
import { recordTotal, loadTotals, saveTotals } from './bettotals.js';
import { TOP_TIER } from './adapter.js'; // TEMPORARY (Batch 2 adapter, removed in Batch 5)

const REGIONS = ['frame', 'stage', 'track', 'centre', 'top', 'credits', 'bar', 'controls', 'toast', 'tip', 'modal', 'start'];
const GAME_REGIONS = ['credits', 'track', 'centre', 'top', 'bar', 'controls'];
const UI_TOASTS = { [TOASTS.noSave]: "Progress won't be saved on this device" };
const LONG_PRESS_MS = 400;
const GAMBLE_LOSS_MS = 3000;

export function startApp({ game, root, testMode = false, timeScale = 1, startScreen = true, settingsReset = false }) {
  const audio = createAudio();
  const cosmetic = createCryptoRng(); // cosmetic randomness only (light-run durations); never outcomes
  const u01 = () => cosmetic.randInt(1_000_000) / 1_000_000;
  const live = root.querySelector('#live');
  const R = {};
  for (const n of REGIONS) R[n] = root.querySelector(`#r-${n}`);
  const cache = {};
  let shownModal = null; // dialog kind on screen (its entrance plays once)
  let L = null;

  const ui = {
    tip: null, sheet: null, light1: null, light2: null,
    displayBalance: null, displayWin: null, delta: null, toast: null, toastSeq: 0, flip: null, matchMsg: null,
    gambleLoss: null, ringOn: false, roving: 1, showLastStop: false, startLocked: false,
    paused: false, lightIndex: 1, start: startScreen, settingsReset, reducedNow: false,
    fairness: false, infoFrom: null, // fairness panel is UI-only (no engine state); infoFrom = icon that opened Info
    betTotals: [], // "Last bets": [{ id: roundId, t: total }], newest first (ui/bettotals.js)
  };
  const backend = game.store && game.store.backend;

  // ------------------------------------------------------------ animation scheduler (rAF; pauses when the tab is hidden)
  const tasks = new Set();
  let rafId = null;
  let inFrame = false, frames = 0;
  const now = () => performance.now();
  function frame() {
    rafId = null;
    if (ui.paused) return;
    const t = now();
    frames += 1;
    inFrame = true;
    try {
      for (const task of [...tasks]) {
        let done = false;
        try {
          done = task(t);
        } catch (e) {
          tasks.clear();
          fail(e);
          return;
        }
        if (done) tasks.delete(task);
      }
    } finally {
      inFrame = false;
    }
    // a task added during this frame has already requested the next one (addTask): never schedule frame() twice
    if (tasks.size && !rafId) rafId = requestAnimationFrame(frame);
  }
  function addTask(fn) {
    tasks.add(fn);
    if (!rafId && !ui.paused) rafId = requestAnimationFrame(frame);
    return fn;
  }
  function wait(ms, cb) {
    const end = now() + ms / timeScale;
    const task = addTask((t) => {
      if (t >= end) {
        cb();
        return true;
      }
      return false;
    });
    task.cancel = () => tasks.delete(task);
    return task;
  }
  function tween(ms, step, done, ease = (x) => 1 - (1 - x) ** 3) {
    const start = now();
    const dur = Math.max(1, ms / timeScale);
    const task = addTask((t) => {
      const x = Math.min(1, (t - start) / dur);
      step(ease(x));
      if (x >= 1) {
        done && done();
        return true;
      }
      return false;
    });
    task.finish = () => {
      if (!tasks.has(task)) return;
      tasks.delete(task);
      step(1);
      done && done();
    };
    return task;
  }
  /** Run cb in the next frame that starts after this one has been laid out and painted (one rAF from inside a
   *  frame, two from an input or timer task, whose own frame has not run yet). */
  function nextFrame(cb) {
    const at = frames + (inFrame ? 1 : 2);
    const task = addTask(() => {
      if (frames < at) return false;
      cb();
      return true;
    });
    task.cancel = () => tasks.delete(task);
    return task;
  }
  const reduced = () => game.state.settings.reducedMotion;

  // ------------------------------------------------------------ derived context
  function ctx() {
    const s = game.state;
    const needsRefill = game.needsRefill();
    const gambleWhy = s.round && !s.round.settled ? game.gambleBlock() : null;
    let modal = null;
    if (s.phase === 'ERROR') modal = 'error';
    else if (s.phase === 'RECOVERY') modal = 'recovery';
    else if (needsRefill) modal = 'refill';
    else if (s.info) modal = 'info';
    else if (ui.fairness) modal = 'fairness';
    const total = totalOf(s.bets);
    const mode = V.modeOf(s, ui);
    return {
      needsRefill, gambleWhy, modal, mode, total, count: countOf(s.bets),
      ghosts: !!(s.ghosts && s.lastBets && total === 0 && s.phase === 'BETTING'),
      canBet: s.phase === 'BETTING' && !needsRefill && !modal && !ui.start,
      canInfo: game.canDispatch({ type: 'OPEN_INFO', tab: 'help' }) && !modal && !ui.start,
      rebetWhy: game.rebetBlock(),
      rebetSame: !!(s.lastBets && sameBets(s.bets, s.lastBets)),
      reduced: reduced(),
    };
  }

  // ------------------------------------------------------------ rendering
  function setRegion(name, html) {
    if (cache[name] === html) return;
    const el = R[name];
    const active = document.activeElement;
    const fid = active && el.contains(active) && active.dataset ? active.dataset.id : null;
    el.innerHTML = html;
    cache[name] = html;
    if (fid) {
      const again = el.querySelector(`[data-id="${fid}"]`);
      if (again) again.focus({ preventScroll: true });
    }
  }

  function relayout() {
    L = computeLayout(window.innerWidth, window.innerHeight);
    for (const [k, v] of Object.entries(layoutVars(L))) root.style.setProperty(k, v);
    root.dataset.bp = L.bp;
    const st = L.stage;
    R.stage.style.cssText = `left:${st.x}px;top:${st.y}px;width:${st.w}px;height:${st.h}px`;
    setRegion('frame', V.pageFrame(L));
    // persistent tile buttons (#1 top-left, clockwise)
    if (!R.track.children.length) {
      let h = '';
      for (let n = 1; n <= 50; n++) h += `<button class="tile hit" data-id="sq-${n}" tabindex="${n === ui.roving ? 0 : -1}">${V.tileStatic(n)}</button>`;
      R.track.innerHTML = h;
      tileCache.length = 0;
    }
    for (let n = 1; n <= 50; n++) {
      const el = R.track.children[n - 1];
      el.style.left = `${L.pos[n].x}px`;
      el.style.top = `${L.pos[n].y}px`;
    }
    for (const k of Object.keys(cache)) delete cache[k];
    render();
  }

  const tileCache = [];
  function renderTiles(c) {
    const s = game.state;
    for (let n = 1; n <= 50; n++) {
      const look = V.tileLook(n, s, ui, c);
      const prev = tileCache[n];
      const el = R.track.children[n - 1];
      if (!prev || prev.cls !== look.cls) el.className = `tile hit${look.cls ? ` ${look.cls}` : ''}`;
      if (!prev || prev.dyn !== look.dyn) el.lastElementChild.innerHTML = look.dyn;
      if (!prev || prev.disabled !== look.disabled) {
        if (look.disabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
      }
      if (!prev || prev.label !== look.label) el.setAttribute('aria-label', look.label);
      const ti = n === ui.roving ? 0 : -1;
      if (el.tabIndex !== ti) el.tabIndex = ti;
      tileCache[n] = look;
    }
  }

  // Big multiplier: written as text on a fixed-size, contained element (no layout reads, at most once per light
  // step); the centre region's markup never carries the value, so a step never rebuilds the centre.
  let bigEl = null, bigShown = null;
  function paintBig() {
    if (!bigEl || !bigEl.isConnected) {
      bigEl = R.centre.querySelector('[data-role="big"]');
      bigShown = null;
    }
    if (!bigEl) return;
    const v = V.bigValue(game.state, ui);
    if (v !== bigShown) {
      bigEl.textContent = v;
      bigShown = v;
    }
  }

  // Rail note count-up (win offer, gamble win): only the number's text changes, so the rail is not rebuilt (and
  // the focused Collect button is not re-focused, which would force a layout) on every frame.
  function paintWin() {
    const el = R.controls.querySelector('[data-role="lastwin"]');
    if (!el) return;
    const lw = V.lastWin(game.state, ui, ctx());
    const v = V.fmt(ui.displayWin == null || !lw ? (lw ? lw.value : 0) : ui.displayWin);
    if (el.textContent !== v) el.textContent = v;
  }

  // Credits count-up (START, payout, refill): only the balance text changes, inside the strictly contained .credits
  // box, so a tween frame never rebuilds the region or lays out the page. The markup carries the settled balance.
  let balEl = null;
  function paintCredits() {
    if (!balEl || !balEl.isConnected) balEl = R.credits.querySelector('[data-role="balance"]');
    if (!balEl) return;
    const v = V.fmt(ui.displayBalance == null ? game.state.balance : ui.displayBalance);
    if (balEl.textContent !== v) balEl.textContent = v;
  }

  // A result (win offer, loss, gamble result, the end of a payout) changes most regions at once. Rendered in one
  // frame and followed by a focus move (which forces a synchronous layout of all the new text), that was one 45–80 ms
  // task at 4× CPU. Staged: the board and the centre in this frame, the rail, top row and bar in the next, and the
  // focus move one frame later, on a clean layout. Each stage renders the state as it is then, so nothing is lost if
  // the player acts in between; a newer staged render replaces the pending stages, and each focus step checks the
  // phase first.
  let staged = null;
  function renderStaged(focus = null) {
    if (staged) staged.cancel();
    render(['track', 'centre']);
    staged = nextFrame(() => {
      render();
      staged = nextFrame(() => {
        staged = null;
        if (focus) focus();
      });
    });
  }

  function render(names = null) {
    if (!L) return;
    const s = game.state;
    if (s.phase === 'INIT') return;
    const c = ctx();
    ui.reducedNow = c.reduced;
    const want = (n) => !names || names.includes(n);
    if (want('credits')) {
      setRegion('credits', V.credits(s, ui, L));
      paintCredits();
    }
    if (want('track')) renderTiles(c);
    if (want('centre')) setRegion('centre', V.centre(s, ui, c, L));
    paintBig();
    if (want('top')) setRegion('top', V.topRow(s, ui, L));
    if (want('bar')) setRegion('bar', V.bottomBar(s, ui, c, L));
    if (want('controls')) {
      setRegion('controls', V.controls(s, ui, c, L));
      if (ui.displayWin != null) paintWin();
    }
    if (want('toast')) setRegion('toast', c.modal ? '' : V.toastHtml(ui.toast, L));
    if (want('tip')) setRegion('tip', tipMarkup(c));
    if (want('modal')) {
      // the 160 ms entrance plays once per dialog: a re-render of the same one (tab, toggle, slider) does not replay it
      const again = !!c.modal && c.modal === shownModal;
      setRegion('modal', modalMarkup(c));
      if (again) R.modal.querySelector('.dlg')?.classList.add('still');
      shownModal = c.modal;
    }
    if (want('start')) setRegion('start', ui.start ? V.startScreen(s, ui, L) : '');
    R.start.hidden = !ui.start;
    for (const n of GAME_REGIONS) R[n].inert = !!c.modal || ui.start;
    R.modal.inert = ui.start;
    root.classList.toggle('reduced', !!s.settings.reducedMotion);
    root.classList.toggle('kbd', ui.ringOn);
  }

  function modalMarkup(c) {
    const s = game.state;
    switch (c.modal) {
      case 'error': return V.errorModal(s, L);
      case 'recovery': return V.recoveryModal(s, L);
      case 'refill': return V.refillModal(s, ui, L);
      case 'info': return V.infoModal(s, ui, L);
      case 'fairness': return V.fairnessModal(L);
      default: return '';
    }
  }

  function tipMarkup(c) {
    const s = game.state;
    if (ui.sheet && c.canBet) return V.tooltip(ui.sheet, s, L, true);
    if (ui.tip && c.canBet) return V.tooltip(ui.tip, s, L, false);
    return '';
  }

  function focusId(id, ring = true) {
    const el = root.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    if (ring) ui.ringOn = true;
    if (id.startsWith('sq-')) {
      ui.roving = Number(id.slice(3));
      el.tabIndex = 0;
    }
    el.focus({ preventScroll: true });
    root.classList.toggle('kbd', ui.ringOn);
  }

  // ------------------------------------------------------------ announcements (aria-live polite)
  let lastAnnounce = '';
  function announce(msg) {
    if (!msg || msg === lastAnnounce) return;
    lastAnnounce = msg;
    live.textContent = msg;
  }

  // ------------------------------------------------------------ toasts (in 160 · hold 2200 · out 240)
  function showToast(text, kind) {
    const seq = ++ui.toastSeq;
    ui.toast = { text: UI_TOASTS[text] || text, kind, seq };
    announce(ui.toast.text);
    render(['toast']);
    wait(160 + 2200, () => {
      if (!ui.toast || ui.toast.seq !== seq) return;
      ui.toast = { ...ui.toast, out: true };
      render(['toast']);
      wait(240, () => {
        if (ui.toast && ui.toast.seq === seq) {
          ui.toast = null;
          render(['toast']);
        }
      });
    });
  }

  // ------------------------------------------------------------ light runs (outcome first)
  function runLight(plan, which, onDone) {
    const start = now();
    let lastIdx = null;
    const decelAt = plan.phases ? plan.phases.accelMs + plan.phases.cruiseMs : Infinity;
    let ducked = false;
    const noTrail = reduced();
    addTask((t) => {
      const el = (t - start) * timeScale;
      if (plan.mode === 'fade') {
        const level = plan.levelAt(el);
        ui[which] = { idx: plan.to, level, trail: null };
        if (lastIdx !== level && level > 0) audio.play(which === 'light2' ? 'sfx_relay_tick_alt' : 'sfx_relay_tick');
        lastIdx = level;
        if (level === 0) ui[which] = null;
      } else {
        const idx = plan.indexAt(el);
        const speed = plan.speedAt(el);
        const moving = el < plan.durationMs;
        const trail = !noTrail && moving && speed > 1 ? [advance(idx, -1), speed > 4 ? advance(idx, -2) : null] : null;
        if (!ducked && el >= decelAt) {
          audio.duck(true);
          ducked = true;
        }
        if (idx !== lastIdx) {
          const pitch = Math.max(-10, 6 * Math.log2(Math.max(speed, 1) / plan.cruise));
          audio.play(which === 'light2' ? 'sfx_relay_tick_alt' : 'sfx_relay_tick', { pitch, gain: moving ? 1 : 1.6 });
          lastIdx = idx;
        }
        ui[which] = { idx, trail, level: null };
      }
      render(['track']);
      if (el >= plan.durationMs) {
        const finalIdx = plan.indexAt(plan.durationMs);
        if (finalIdx !== plan.to) throw new Error(`display mismatch: animated ${finalIdx} != stored ${plan.to}`); // integrity assertion
        ui[which] = { idx: plan.to, trail: null, level: null, done: true };
        ui.lightIndex = plan.to;
        audio.play('sfx_stop_thunk');
        if (ducked) wait(600, () => audio.duck(false));
        render(['track']);
        onDone();
        return true;
      }
      return false;
    });
  }

  function noteBetTotal(r) {
    const next = recordTotal(ui.betTotals, r.roundId, r.totalBet);
    if (next === ui.betTotals) return;
    ui.betTotals = next;
    saveTotals(backend, next);
  }

  function startRound() {
    const r = game.state.round;
    noteBetTotal(r);
    ui.showLastStop = false;
    ui.tip = null;
    ui.sheet = null;
    audio.play('sfx_start');
    const before = r.balanceBefore, after = r.balance;
    ui.displayBalance = before;
    tween(300, (x) => { ui.displayBalance = Math.round(before + (after - before) * x); paintCredits(); }, () => { ui.displayBalance = null; paintCredits(); });
    const plan = reduced() ? planFade(r.s1) : planFirstRunV2(ui.lightIndex, r.s1, u01(), u01());
    announce(`Running. Credits ${V.fmt(before)} minus ${V.fmt(r.totalBet)} bet = ${V.fmt(after)}.`);
    runLight(plan, 'light1', () => game.dispatch({ type: 'LIGHT1_DONE' }));
  }

  function runDoubleRun() {
    const r = game.state.round;
    ui.light1 = null;
    audio.play('sfx_double_run_horn');
    render();
    announce(`Double Run! A second light is running. Square ${r.s1} stays lit.`);
    // banner: in 600 · hold 400 · out 300 (the headline stays as the mid Double Run copy)
    wait(reduced() ? 600 : 1300, () => {
      const plan = reduced() ? planFade(r.s2) : planSecondRunV2(r.s1, r.s2, u01(), u01());
      runLight(plan, 'light2', () => game.dispatch({ type: 'LIGHT2_DONE' }));
    });
  }

  function afterReveal({ recovered = false } = {}) {
    const s = game.state;
    const r = s.round;
    ui.light1 = null;
    ui.light2 = null;
    if (s.phase === 'GAMBLE_OFFER') {
      // v3 batch 5: the win is shown by flat state (green stop, light big number, green pays pill); no pulse, chase,
      // WIN tag or confetti. The rail note counts up (batch 3); sounds as before.
      const { w1, w2 } = V.winners(s, ui);
      const top = Math.max(...[w1, w2].filter(Boolean).map((n) => MULT[n]));
      if (!recovered && !reduced()) {
        ui.displayWin = 0;
        const target = r.currentWin;
        countTween = tween(Math.min(1500, 400 + target / 4), (x) => { ui.displayWin = Math.round(target * x); paintWin(); }, () => { ui.displayWin = null; countTween = null; paintWin(); }, (x) => 1 - (1 - x) ** 4);
      }
      if (top >= 50) { // TEMPORARY (Batch 2 adapter): 50x and up use the big-win sound, the 200x the jackpot one
        audio.play(top >= TOP_TIER ? 'sfx_win_jackpot' : 'sfx_win_big');
        audio.duck(true);
        wait(2500, () => audio.duck(false));
      } else audio.play('sfx_win_small');
      renderStaged(() => { if (game.state.phase === 'GAMBLE_OFFER') focusId('btn-collect', true); });
      announce(`You win ${V.fmt(r.currentWin)}. Collect or gamble.`);
    } else {
      ui.showLastStop = true;
      audio.play('sfx_loss');
      renderStaged(() => {
        const a = document.activeElement;
        if (!a || a === document.body || !root.contains(a) || a.getAttribute('aria-disabled') === 'true') focusId('btn-start', false);
      });
      announce(`No win this time. The light stopped on square ${r.s1}${r.s2 ? ` and ${r.s2}` : ''}. Your bets are still on the board.`);
    }
  }

  // ------------------------------------------------------------ gamble flip (stored result revealed)
  // One disc with two faces turns by CSS (700 ms rotateY, ending on the stored result; a 120 ms crossfade in
  // reduced motion). The centre is rendered once when it starts and once when it ends: no per-frame work.
  const FLIP_MS = 700;
  function runFlip() {
    ui.matchMsg = null;
    audio.play('sfx_drumroll');
    ui.flip = { final: false };
    render(['centre', 'controls']);
    wait(reduced() ? 120 : FLIP_MS, () => {
      ui.flip = { final: true };
      render(['centre']);
      wait(reduced() ? 400 : 300, () => {
        ui.flip = null;
        game.dispatch({ type: 'REVEAL_DONE' });
      });
    });
  }

  function afterRevealDone(prevWin) {
    const s = game.state;
    const r = s.round;
    if (s.phase === 'PAYOUT') {
      // gamble loss: the loss result stays in the centre's gamble panel, then returns to the board (3 s or the button)
      const g = r.gambles[r.gambles.length - 1];
      audio.play('sfx_gamble_lose');
      ui.gambleLoss = { pick: g.pick, result: g.result, win: prevWin, flip: r.gambles.length, left: Math.round(GAMBLE_LOSS_MS / 1000) };
      announce(`No match. ${g.result} lit. Your pick was ${g.pick}, so the ${V.fmt(prevWin)} gamble is lost. Your credits stay at ${V.fmt(s.balance)}.`);
      const t0 = now();
      lossTask = addTask((t) => {
        if (!ui.gambleLoss) return true;
        const left = Math.max(0, Math.ceil((GAMBLE_LOSS_MS - (t - t0) * timeScale) / 1000));
        if (left !== ui.gambleLoss.left) {
          ui.gambleLoss = { ...ui.gambleLoss, left };
          render(['controls']);
        }
        if ((t - t0) * timeScale >= GAMBLE_LOSS_MS) {
          finishGambleLoss();
          return true;
        }
        return false;
      });
      renderStaged(() => { if (ui.gambleLoss) focusId('btn-back', ui.ringOn); });
    } else {
      audio.play('sfx_gamble_win');
      const g = r.gambles[r.gambles.length - 1];
      ui.matchMsg = { colour: g.result };
      const target = r.currentWin;
      if (!reduced()) tween(500, (x) => { ui.displayWin = Math.round(prevWin + (target - prevWin) * x); paintWin(); }, () => { ui.displayWin = null; paintWin(); });
      announce(`Match! ${g.result} lit. Your win is now ${V.fmt(target)}. Gamble again or Collect.`);
      renderStaged(() => {
        const a = document.activeElement;
        if (game.state.phase === 'GAMBLE' && (!a || !root.contains(a) || a === document.body)) focusId('btn-collect', ui.ringOn);
      });
    }
  }
  let lossTask = null;
  function finishGambleLoss() {
    if (!ui.gambleLoss) return;
    ui.gambleLoss = null;
    if (lossTask) tasks.delete(lossTask);
    game.dispatch({ type: 'PAYOUT_DONE' });
  }

  // ------------------------------------------------------------ payout count-up (<= 1.5 s, click to fast-forward)
  let payoutTween = null;
  let countTween = null;
  function startPayout() {
    const s = game.state;
    const r = s.round;
    ui.flip = null;
    ui.matchMsg = null;
    if (countTween) countTween.finish();
    if (r.currentWin > 0) {
      audio.play('sfx_collect');
      const after = s.balance, before = after - r.currentWin;
      showToast(`+${V.fmt(r.currentWin)} added to your credits`, 'ok');
      const done = () => {
        payoutTween = null;
        ui.displayBalance = null;
        ui.delta = null;
        game.dispatch({ type: 'PAYOUT_DONE' });
      };
      ui.delta = r.currentWin;
      if (reduced()) {
        render();
        payoutTween = tween(300, () => {}, done);
      } else {
        ui.displayBalance = before;
        payoutTween = tween(Math.min(1500, 500 + r.currentWin / 3), (x) => { ui.displayBalance = Math.round(before + (after - before) * x); paintCredits(); }, done, (x) => 1 - (1 - x) ** 4);
        render();
      }
      announce(`${V.fmt(r.currentWin)} collected. Added to your credits: ${V.fmt(before)} to ${V.fmt(after)}.`);
    } else {
      render();
      wait(300, () => game.dispatch({ type: 'PAYOUT_DONE' }));
    }
  }

  function refillAnim() {
    audio.play('sfx_refill');
    ui.displayBalance = 0;
    tween(reduced() ? 1 : 1000, (x) => { ui.displayBalance = Math.round(REFILL_AMOUNT * x); paintCredits(); }, () => {
      ui.displayBalance = null;
      render();
    }, (x) => x);
    announce(`Refilled: ${V.fmt(REFILL_AMOUNT)} play credits.`);
  }

  // ------------------------------------------------------------ engine events
  let prevWin = 0;
  function onEngine(s, evt) {
    if (s.toast && s.toast.seq !== engineToastSeq) {
      engineToastSeq = s.toast.seq;
      if (s.toast.kind !== 'info') audio.play('sfx_deny');
      showToast(s.toast.text, s.toast.kind);
    }
    switch (evt.type) {
      case 'INIT':
        audio.setSettings(s.settings);
        onInit();
        return;
      case 'ADD_BET': audio.play('sfx_chip_place', { step: Math.min(9, Math.ceil((s.bets[evt.action.tier] || 1) / s.chip) - 1) }); break;
      case 'REMOVE_BET': case 'UNDO': case 'CLEAR': audio.play('sfx_chip_remove'); break;
      case 'REBET': audio.play('sfx_chip_place'); break;
      case 'SELECT_CHIP': audio.play('sfx_chip_select'); break;
      case 'START': startRound(); break;
      case 'LIGHT1_DONE': wait(300, () => game.dispatch({ type: 'RESOLVE_DONE' })); break;
      case 'RESOLVE_DONE':
        if (s.phase === 'DOUBLE_RUN') runDoubleRun();
        else afterReveal();
        return;
      case 'LIGHT2_DONE': afterReveal(); return;
      case 'GAMBLE_OPEN':
        audio.play('sfx_modal');
        ui.matchMsg = null;
        // the offer's Collect keeps focus until the gamble rail (same button) replaces it two frames later
        renderStaged(() => { if (game.state.phase === 'GAMBLE') focusId('btn-collect', ui.ringOn); });
        return;
      case 'PICK':
        audio.play('sfx_gamble_pick');
        ui.matchMsg = null;
        break;
      case 'GAMBLE_FLIP':
        prevWin = s.round.currentWin;
        runFlip();
        break;
      case 'REVEAL_DONE': afterRevealDone(prevWin); return;
      case 'COLLECT': startPayout(); return;
      case 'PAYOUT_DONE':
        ui.showLastStop = false;
        renderStaged(() => {
          const a = document.activeElement;
          if (game.state.phase === 'BETTING' && (!root.contains(a) || a === document.body || a.getAttribute('aria-disabled') === 'true')) focusId(game.rebetBlock() ? `sq-${ui.roving}` : 'btn-rebet', false);
        });
        return;
      case 'REFILL': refillAnim(); break;
      case 'TOGGLE_MUTE': case 'SET_SETTING': audio.setSettings(s.settings); break;
      case 'OPEN_INFO':
        audio.play('sfx_modal');
        ui.tip = null;
        render();
        focusId(`tab-${s.info}`, ui.ringOn);
        return;
      case 'CLOSE_INFO':
        render();
        focusId(ui.infoFrom || 'icon-stats', false);
        ui.infoFrom = null;
        return;
      case 'CONTINUE': onContinue(); return;
      case 'ERROR': case 'FAIL':
        tasks.clear();
        ui.light1 = null;
        ui.light2 = null;
        ui.gambleLoss = null;
        render();
        focusId('m-reload', ui.ringOn);
        return;
      default: break;
    }
    render();
    if (game.needsRefill() && !R.modal.contains(document.activeElement)) focusId('m-refill', ui.ringOn);
  }
  let engineToastSeq = 0;

  // ------------------------------------------------------------ type warm-up (v3 batch 7)
  // The first time a result state appears, Blink shapes its text from a cold cache (fonts at new sizes, new words):
  // at 4× CPU that alone was 15–30 ms of the win-reveal frame. Once after boot, in idle time, each result template
  // (V.warmSamples, a sample round) is laid out in a hidden, contained, inert box, one per idle callback, and the box
  // is removed. Outside the animation tasks, so pendingTasks() and the regions are not touched.
  function warmType() {
    const idle = globalThis.requestIdleCallback ? (cb) => requestIdleCallback(cb, { timeout: 500 }) : (cb) => setTimeout(cb, 50);
    let samples;
    try { samples = V.warmSamples(game.state, L); } catch { return; }
    const box = document.createElement('div');
    box.className = 'warm';
    box.setAttribute('aria-hidden', 'true');
    box.inert = true;
    root.appendChild(box);
    let i = 0;
    const step = () => {
      if (i < samples.length) {
        box.innerHTML = samples[i++];
        idle(step);
      } else box.remove();
    };
    idle(step);
  }

  function onInit() {
    const s = game.state;
    ui.betTotals = loadTotals(backend);
    if (s.round) noteBetTotal(s.round); // a round restored after a reload (no-op if it was already recorded)
    else if (!ui.betTotals.length && s.lastBets) noteBetTotal({ roundId: null, totalBet: totalOf(s.lastBets) });
    ui.lightIndex = s.history.length ? s.history[s.history.length - 1].s1 : 1;
    relayout();
    warmType();
    if (ui.settingsReset) showToast('Settings were reset to the defaults', 'info');
    showMigrationNotice();
    if (ui.start) focusId('start-play', false);
    else afterStartFocus();
  }
  // v5 §2.5: one-time "Game updated" toast after the v1 -> v5 reset (the engine's storage sets the flag once per device)
  let migrationNotice = !!(game.store && game.store.migration && game.store.migration.notice);
  function showMigrationNotice() {
    if (!migrationNotice || ui.start) return; // behind the Start screen it waits for leaveStart
    migrationNotice = false;
    showToast(TOASTS.migrated, 'info');
  }
  function afterStartFocus() {
    const s = game.state;
    if (s.phase === 'RECOVERY') focusId('m-continue', ui.ringOn);
    else if (s.phase === 'ERROR') focusId('m-reload', ui.ringOn);
    else if (game.needsRefill()) focusId('m-refill', ui.ringOn);
  }
  function leaveStart(then) {
    firstInteraction();
    ui.start = false;
    render();
    afterStartFocus();
    showMigrationNotice();
    if (then) then();
  }

  function onContinue() {
    const s = game.state;
    const r = s.round;
    ui.lightIndex = r.s2 || r.s1;
    if (s.phase === 'GAMBLE_OFFER') afterReveal({ recovered: true });
    else if (s.phase === 'BETTING') afterReveal({ recovered: true });
    else if (s.phase === 'GAMBLE') {
      render();
      if (s.gamble.revealing) {
        prevWin = r.currentWin;
        runFlip();
      } else focusId('btn-collect', ui.ringOn);
    } else if (s.phase === 'PAYOUT') startPayout();
    else render();
  }

  function fail(e) {
    console.error(e);
    if (game.state.phase !== 'ERROR') game.dispatch({ type: 'FAIL', message: e && e.message ? e.message : String(e) });
  }

  function reload() {
    game.dispatch({ type: 'RELOAD' }); // resets only a corrupt key, if one was detected
    if (!testMode || !globalThis.__RL_TEST__?.noReload) globalThis.location.reload();
  }

  // ------------------------------------------------------------ fairness panel (UI only; same lock as Info/Settings)
  function openFairness() {
    if (!ctx().canInfo) return null;
    ui.fairness = true;
    ui.tip = null;
    audio.play('sfx_modal');
    render();
    focusId('f-close', ui.ringOn);
    return { ok: true };
  }
  function closeFairness() {
    if (!ui.fairness) return null;
    ui.fairness = false;
    render();
    focusId('icon-fair', false);
    return { ok: true };
  }

  // ------------------------------------------------------------ 1/2 and x2 (scale every square's bet)
  // The locked engine has no scale action, so the UI computes the clamped map (ui/betscale.js, engine limits) and
  // applies it the way the engine's own bet handlers do: one undo step, ghosts cleared. Only while betting is open;
  // START re-checks every limit in the engine.
  function scaleBets(kind) {
    const c = ctx();
    const s = game.state;
    if (c.mode !== 'bet' || !c.canBet || !c.total || !game.canDispatch({ type: 'ADD_BET', tier: 5 })) return null;
    const r = kind === 'half' ? halveBets(s.bets) : doubleBets(s.bets, s.balance);
    if (r.limit) {
      audio.play('sfx_deny');
      showToast(TOASTS[r.limit], r.limit === 'credits' ? 'error' : 'warn');
    }
    if (!r.changed) return { ok: false, reason: 'no change' };
    s.undo.push(s.bets);
    s.bets = r.bets;
    s.ghosts = false;
    audio.play(kind === 'half' ? 'sfx_chip_remove' : 'sfx_chip_place');
    render();
    const n = countOf(r.bets);
    if (!r.limit) announce(`Total bet ${V.fmt(totalOf(r.bets))} on ${n} tier${n === 1 ? '' : 's'}.`);
    return { ok: true };
  }

  // ------------------------------------------------------------ input
  function activate(id, { shift = false } = {}) {
    const d = (a) => game.dispatch(a);
    if (id.startsWith('sq-')) {
      const n = Number(id.slice(3));
      ui.roving = n;
      return d({ type: shift ? 'REMOVE_BET' : 'ADD_BET', square: n });
    }
    if (id.startsWith('chip-')) return d({ type: 'SELECT_CHIP', value: Number(id.slice(5)) });
    if (id.startsWith('tab-')) return d({ type: 'SET_TAB', tab: id.slice(4) });
    if (id.startsWith('pick-')) return d({ type: 'PICK', colour: id.slice(5) });
    switch (id) {
      case 'btn-undo': return d({ type: 'UNDO' });
      case 'btn-clear': return d({ type: 'CLEAR' });
      case 'btn-rebet': return d({ type: 'REBET' });
      case 'btn-half': return scaleBets('half');
      case 'btn-double': return scaleBets('double');
      case 'btn-start': {
        if (ui.startLocked) return null;
        ui.startLocked = true; // disables synchronously on first activation
        const res = d({ type: 'START' });
        ui.startLocked = false;
        if (!res.ok) render(['controls']);
        return res;
      }
      case 'btn-collect': return d({ type: 'COLLECT' });
      case 'btn-gamble': return d({ type: 'GAMBLE_OPEN' });
      case 'btn-flip': return d({ type: 'GAMBLE_FLIP' });
      case 'btn-back': return finishGambleLoss();
      case 'm-refill': return d({ type: 'REFILL' });
      case 'm-continue': return d({ type: 'CONTINUE' });
      case 'm-reload': return reload();
      case 'icon-stats': ui.infoFrom = id; return d({ type: 'OPEN_INFO', tab: 'paytable' }); // Paytable + Help tabs
      case 'icon-settings': ui.infoFrom = id; return d({ type: 'OPEN_INFO', tab: 'settings' });
      case 'icon-fair': return openFairness();
      case 'f-close': return closeFairness();
      case 'icon-sound': case 'tg-mute': case 'start-sound': return d({ type: 'TOGGLE_MUTE' });
      case 'tg-rm': return d({ type: 'SET_SETTING', key: 'reducedMotion', value: !game.state.settings.reducedMotion });
      case 'close': return d({ type: 'CLOSE_INFO' });
      case 'start-play': return leaveStart();
      case 'start-help': return leaveStart(() => { if (game.canDispatch({ type: 'OPEN_INFO', tab: 'help' })) d({ type: 'OPEN_INFO', tab: 'help' }); });
      case 'tip-add': case 'tip-remove': {
        const n = ui.sheet;
        const r = d({ type: id === 'tip-add' ? 'ADD_BET' : 'REMOVE_BET', square: n });
        render(['tip']);
        return r;
      }
      default: return null;
    }
  }

  const hitOf = (target) => (target && target.closest ? target.closest('.hit') : null);

  function firstInteraction() {
    if (!audio.unlocked) {
      audio.unlock();
      audio.setSettings(game.state.settings);
    }
  }

  let pressTimer = null;
  let suppressClick = false;
  root.addEventListener('pointerdown', (e) => {
    if (!ui.start) firstInteraction();
    ui.ringOn = false;
    root.classList.remove('kbd');
    if (payoutTween) {
      payoutTween.finish();
      return;
    }
    const h = hitOf(e.target);
    if (ui.sheet && !(h && h.closest('.tip'))) {
      ui.sheet = null;
      render(['tip']);
    }
    if (h && h.getAttribute('role') === 'slider') {
      dragSlider(h, e);
      e.preventDefault();
    }
    clearTimeout(pressTimer);
    if (e.pointerType === 'touch' && h && h.dataset.id.startsWith('sq-') && h.getAttribute('aria-disabled') !== 'true') {
      const n = Number(h.dataset.id.slice(3));
      pressTimer = setTimeout(() => {
        ui.sheet = n;
        suppressClick = true;
        render(['tip']);
      }, LONG_PRESS_MS);
    }
  });
  root.addEventListener('pointerup', () => clearTimeout(pressTimer));
  root.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  root.addEventListener('click', (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const h = hitOf(e.target);
    if (!h || h.getAttribute('aria-disabled') === 'true' || h.getAttribute('role') === 'slider') return;
    audio.play('sfx_click');
    activate(h.dataset.id, { shift: e.shiftKey });
  });
  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const h = hitOf(e.target);
    if (h && h.dataset.id.startsWith('sq-') && h.getAttribute('aria-disabled') !== 'true' && !suppressClick) activate(h.dataset.id, { shift: true });
  });
  let tipTimer = null;
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const h = hitOf(e.target);
    const id = h && h.dataset.id.startsWith('sq-') ? h.dataset.id : null;
    const n = id ? Number(id.slice(3)) : null;
    if (n === ui.hoverSq) return;
    ui.hoverSq = n;
    clearTimeout(tipTimer);
    if (ui.tip && ui.tip !== n) {
      ui.tip = null;
      render(['tip']);
    }
    if (n) tipTimer = setTimeout(() => { if (ui.hoverSq === n) { ui.tip = n; render(['tip']); } }, 300);
  });
  root.addEventListener('pointerleave', () => {
    ui.hoverSq = null;
    ui.tip = null;
    render(['tip']);
  });
  root.addEventListener('focusin', (e) => {
    const h = hitOf(e.target);
    if (h && h.dataset.id.startsWith('sq-')) {
      ui.roving = Number(h.dataset.id.slice(3));
      if (ui.ringOn) {
        ui.tip = ui.roving;
        render(['tip']);
      }
    } else if (ui.tip && ui.ringOn) {
      ui.tip = null;
      render(['tip']);
    }
  });

  function dragSlider(h, e0) {
    const key = h.dataset.id === 'sl-music' ? 'music' : 'sfx';
    const setFrom = (ev) => {
      const rect = h.getBoundingClientRect();
      const v = Math.max(0, Math.min(100, Math.round(((ev.clientX - rect.left) / rect.width) * 100)));
      if (v !== game.state.settings[key]) game.dispatch({ type: 'SET_SETTING', key, value: v });
    };
    setFrom(e0);
    const id = h.dataset.id;
    focusId(id, false);
    const move = (ev) => setFrom(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      ui.ringOn = true;
      root.classList.add('kbd');
      return; // native focus order (modals trap focus via inert)
    }
    const a = document.activeElement;
    const h = a && root.contains(a) ? hitOf(a) : null;
    const id = h ? h.dataset.id : null;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Start screen: Enter/Space = PLAY (the first gesture unlocks audio), M = sound
    if (ui.start) {
      if (e.repeat) return;
      if (k === 'm') { game.dispatch({ type: 'TOGGLE_MUTE' }); e.preventDefault(); return; }
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        ui.ringOn = true;
        if (id && id !== 'start-play') activate(id);
        else leaveStart();
      }
      return;
    }
    firstInteraction();
    // Gamble loss result view: Enter/Space = back to the board
    if (ui.gambleLoss && (k === 'Enter' || k === ' ') && !e.repeat) {
      e.preventDefault();
      finishGambleLoss();
      return;
    }
    // Fairness panel: Esc closes it; Enter/Space press the focused button; M still mutes; game keys are ignored
    if (ui.fairness) {
      if (e.repeat) return;
      if (k === 'Escape') closeFairness();
      else if (k === 'm' && !e.ctrlKey) game.dispatch({ type: 'TOGGLE_MUTE' });
      else if ((k === 'Enter' || k === ' ') && h && R.modal.contains(h)) activate(id);
      else return;
      e.preventDefault();
      return;
    }
    // Long-press sheet: Esc closes it
    if (ui.sheet && k === 'Escape') {
      ui.sheet = null;
      render(['tip']);
      return;
    }
    let kind = null;
    if (id) kind = id.startsWith('sq-') ? 'square' : id.startsWith('chip-') ? 'chip' : id.startsWith('pick-') ? 'pick' : id.startsWith('sl-') ? 'slider' : id.startsWith('tg-') ? 'toggle' : id.startsWith('tab-') ? 'tab' : id.startsWith('icon-') ? 'icon' : 'button';
    const s = game.state;
    const intent = mapKey(e, {
      phase: s.phase, info: s.info, refill: game.needsRefill(),
      focus: { kind, square: kind === 'square' ? Number(id.slice(3)) : null },
    });
    if (e.key === ' ' || e.key === 'Backspace' || e.key.startsWith('Arrow')) e.preventDefault();
    if (!intent) return;
    e.preventDefault();
    ui.ringOn = true;
    root.classList.add('kbd');
    if (payoutTween && (e.key === ' ' || e.key === 'Enter')) {
      payoutTween.finish();
      return;
    }
    switch (intent.kind) {
      case 'activate':
        if (h && h.getAttribute('aria-disabled') !== 'true') {
          audio.play('sfx_click');
          if (kind === 'slider') break;
          activate(id);
        }
        break;
      case 'dispatch': {
        if (intent.action.type === 'RELOAD') {
          reload();
          break;
        }
        if (intent.action.type === 'START') {
          activate('btn-start');
          break;
        }
        game.dispatch(intent.action);
        if (intent.focusPick && game.state.phase === 'GAMBLE' && !game.state.gamble.revealing) focusId(`pick-${intent.focusPick}`);
        break;
      }
      case 'focusSquare': {
        const n = advance(ui.roving, intent.delta);
        render(['track']);
        focusId(`sq-${n}`);
        break;
      }
      case 'tab': {
        const tabs = ['settings', 'paytable', 'help'];
        const i = (tabs.indexOf(s.info) + intent.delta + 3) % 3;
        game.dispatch({ type: 'SET_TAB', tab: tabs[i] });
        focusId(`tab-${tabs[i]}`);
        break;
      }
      case 'slider': {
        const key = id === 'sl-music' ? 'music' : 'sfx';
        game.dispatch({ type: 'SET_SETTING', key, value: Math.max(0, Math.min(100, s.settings[key] + intent.delta)) });
        break;
      }
      default: break;
    }
    root.classList.toggle('kbd', ui.ringOn);
  });

  window.addEventListener('error', (e) => fail(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fail(e.reason));
  window.addEventListener('resize', () => { if (game.state.phase !== 'INIT') relayout(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && tasks.size && !rafId && !ui.paused) rafId = requestAnimationFrame(frame);
  });

  game.subscribe(onEngine);

  return {
    ui, render, audio, focusId, relayout,
    get layout() { return L; },
    setPaused(p) {
      ui.paused = p;
      if (!p && tasks.size && !rafId) rafId = requestAnimationFrame(frame);
    },
    pendingTasks: () => tasks.size,
    leaveStart: () => leaveStart(),
    scaleBets,
  };
}
