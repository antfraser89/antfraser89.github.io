// Boot, the frame loop, saving, and turning what happens into feedback.
import { createAudio } from './audio.js';
import { GAME_TITLE, LEGACY_SAVE_KEYS, OPENING_SPINS, PLOTS, SAVE_KEY, TUNING } from './config.js';
import * as E from './economy.js';
import * as G from './game.js';
import { money } from './format.js';
import { createParkView } from './parkview.js';
import { preload, preloadRest } from './preload.js';
import * as R from './rules.js';
import * as S from './sim.js';
import { newState, parseSave, serialize } from './state.js';
import { createUI } from './ui.js';

const params = new URLSearchParams(location.search);
const speed = Math.max(0.1, Math.min(600, Number(params.get('speed')) || 1));

// The game clock is the wall clock, except when fast-forwarding for testing.
let skew = 0;
const clock = () => Date.now() + skew;

function readSave() {
  try {
    for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
      const text = localStorage.getItem(key);
      const save = text ? parseSave(text) : null;
      if (save) return save;
    }
    return null;
  } catch {
    return null; // private mode or storage disabled: play without saving
  }
}

// Give the display typeface a moment to arrive so signs and cards are drawn
// with it; if it does not come, carry on with the system font.
const fontReady = await Promise.race([
  document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('400 20px "Lilita One"'), document.fonts.load('700 14px "Baloo 2"'), document.fonts.load('800 14px "Baloo 2"')])
      .then((sets) => sets[0].length > 0, () => false)
    : false,
  new Promise((resolve) => setTimeout(() => resolve(false), 1800)),
]);
if (fontReady) document.documentElement.classList.add('fonts-ready');

const loaded = readSave();
const state = loaded || newState(clock());
const world = S.createWorld(state);
let saving = true;

function save() {
  if (!saving) return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(world.state, clock()));
  } catch {
    /* storage full or unavailable */
  }
}

function replaceSave(next) {
  saving = false;
  try {
    if (next) localStorage.setItem(SAVE_KEY, serialize(next));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
  location.reload();
}

const audio = createAudio(() => world.state.settings);
// The park page: the painted park, with a tap area on each of its eight sites.
const renderer = createParkView(world, {
  onSite: (k) => {
    audio.unlock();
    audio.play('click');
    ui.openBuild(k);
  },
  onBang: () => audio.play('bang'),
});
const ui = createUI({
  world,
  renderer,
  audio,
  clock,
  onSave: save,
  onReplaceSave: (next) => replaceSave(next),
  onReset: () => replaceSave(null),
});

function handleEvents() {
  for (const ev of world.events) {
    if (ev.type === 'pay') {
      if (ui.parkVisible) renderer.pay(ev.k, '+' + money(ev.amount));
    } else if (ev.type === 'mission') {
      audio.play('claim');
      ui.toast(`Mission complete: ${ui.describe(ev.reward)}`, 'gold');
      save();
    }
  }
  world.events.length = 0;
}

// Catch up after time away: the gate's takings, the spin meter, and
// everything in the side games that runs on the clock.
function comeBack(seconds, announceIt) {
  if (!(seconds > 5)) return;
  const till = S.applyOffline(world, seconds);
  const res = G.tick(world.state, clock());
  if (announceIt && seconds >= TUNING.offlineMinSeconds) ui.showAway(seconds, till, res.tokens);
  ui.showLeague(res.league);
}

// ---- loop -----------------------------------------------------------------

let last = performance.now();
let uiClock = 0;
let saveClock = 0;
let tickClock = 0;
let hiddenAt = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 5) {
    comeBack(dt, false); // a long stall (sleep, throttled tab) counts as time away
    dt = 0.05;
  }
  dt = Math.max(0, Math.min(dt, 0.25));
  skew += dt * 1000 * (speed - 1);

  let simTime = dt * Math.min(speed, 12);
  while (simTime > 1e-6) {
    const step = Math.min(0.05, simTime);
    S.step(world, step);
    simTime -= step;
  }
  handleEvents();
  // the park keeps running behind the machine, but is only painted when on show
  if (ui.parkVisible) renderer.draw(dt);
  ui.frame(dt);

  tickClock += dt;
  if (tickClock >= 1) {
    tickClock = 0;
    const res = G.tick(world.state, clock());
    ui.showLeague(res.league);
    if (!ui.busy && world.state.stats.spins >= OPENING_SPINS.length) ui.showDaily();
  }
  uiClock += dt;
  if (uiClock >= 0.1) {
    uiClock = 0;
    ui.refresh();
  }
  saveClock += dt;
  if (saveClock >= 10) {
    saveClock = 0;
    save();
  }
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    const away = (Date.now() - hiddenAt) / 1000;
    hiddenAt = 0;
    last = performance.now();
    comeBack(away, true);
  }
  audio.sync();
});
window.addEventListener('pagehide', save);

// The phone's back button (or the browser's) closes whatever is open rather
// than leaving the game. One spare history entry is kept while anything is open.
let spare = false;
window.addEventListener('popstate', () => {
  spare = false;
  ui.back();
});
setInterval(() => {
  if (ui.layers > 0 && !spare) {
    try {
      history.pushState({ park: 1 }, '');
      spare = true;
    } catch {
      /* not allowed here: the back button just behaves as usual */
    }
  }
}, 400);
window.addEventListener('resize', () => {
  ui.measure();
});
window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'Escape') ui.closeSheet();
  // space bar spins, unless a button or text box has the focus
  if (e.key === ' ' && !e.repeat && !/^(BUTTON|TEXTAREA|INPUT)$/.test(e.target.tagName)) {
    e.preventDefault();
    ui.spin();
  }
});

document.title = GAME_TITLE;
ui.refresh();
ui.measure();

// The splash doubles as the first tap, which browsers need before sound can
// play. Its bar follows the pictures as they arrive.
ui.showSplash(() => {
  preloadRest();
  if (!loaded) {
    ui.showWelcome();
  } else if (state.lastSaved > 0) {
    comeBack((clock() - state.lastSaved) / 1000, true);
    ui.showDaily();
  }
}, preload);

// Offline play, where the browser allows it. A single-file build has no
// separate worker file, so this quietly does nothing there.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.PARK_ART) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

// If something throws, say so once and offer a reload; the save is untouched.
let complained = false;
function complain() {
  if (complained) return;
  complained = true;
  save();
  ui.toast('Something went wrong. <button class="btn small" onclick="location.reload()">Reload</button>', 'oops');
}
window.addEventListener('error', (e) => { if (e.error) complain(); });
window.addEventListener('unhandledrejection', complain);

requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});

// Handy for poking at the game from the console and for automated checks.
window.park = { world, state, rules: R, sim: S, economy: E, renderer, ui, save, clock };
