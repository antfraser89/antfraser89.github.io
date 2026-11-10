// Boot, the frame loop, saving, and turning what happens into feedback.
import { setDisplayFont } from './art.js';
import { createAudio } from './audio.js';
import { GAME_TITLE, LEGACY_SAVE_KEYS, OPENING_SPINS, PLOTS, SAVE_KEY, TUNING } from './config.js';
import { plotAt } from './layout.js';
import * as E from './economy.js';
import { money } from './format.js';
import { createRenderer } from './render.js';
import { createRenderer3D } from './world3d.js';
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
if (fontReady) {
  document.documentElement.classList.add('fonts-ready');
  setDisplayFont(true);
}

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
const canvas = document.getElementById('game');
// The park is drawn in 3D where the device can manage it, and flat where it cannot.
const hooks = { onTap, onBang: () => audio.play('bang') };
let renderer;
try {
  if (new URLSearchParams(location.search).has('flat')) throw new Error('flat renderer asked for');
  renderer = createRenderer3D(canvas, world, hooks);
} catch (err) {
  console.info('Park!: using the flat renderer.', err && err.message);
  renderer = createRenderer(canvas, world, hooks);
}
const ui = createUI({
  world,
  renderer,
  audio,
  clock,
  onSave: save,
  onReplaceSave: (next) => replaceSave(next),
  onReset: () => replaceSave(null),
});

function onTap(sx, sy) {
  audio.unlock();
  const hit = renderer.pick(sx, sy);
  if (!hit) {
    ui.closeSheet();
    return;
  }
  if (hit.balloon) {
    S.popBalloon(world, hit.balloon);
    return;
  }
  audio.play('click');
  ui.openBuild(hit.plot);
}

function handleEvents() {
  for (const ev of world.events) {
    if (ev.type === 'pay') {
      if (!ui.parkVisible) continue; // nobody is looking at the park
      const p = plotAt(world.state.town, ev.k);
      const d = S.designAt(world.state, ev.k);
      renderer.popText(p.x, p.y - d.h * 0.62, '+' + money(ev.amount));
      renderer.coins(p.x, p.y - d.h * 0.5, Math.min(5, 1 + ev.n));
    } else if (ev.type === 'balloon') {
      audio.play('pop');
      renderer.burst(ev.x, ev.y, 16, [ev.color, '#fff6e0'], { speed: 220, life: 0.6, size: 6 });
      ui.toast(`Prize balloon: ${ui.describe(ev.reward)}`, 'gold');
    } else if (ev.type === 'mission') {
      audio.play('claim');
      ui.toast(`Mission complete: ${ui.describe(ev.reward)}`, 'gold');
      save();
    }
  }
  world.events.length = 0;
}

// A rival's pie arriving while you are playing.
function announce(item) {
  const who = R.rivalName(item.rival);
  if (item.blocked) {
    audio.play('lock');
    ui.toast(`${who} threw a pie. Your padlock stopped it!`);
    return;
  }
  const p = plotAt(world.state.town, item.plot);
  const d = S.designAt(world.state, item.plot);
  audio.play('splat');
  if (ui.parkVisible) renderer.custard(p.x, p.y - d.h * 0.5);
  ui.toast(`<b>${who} pied your ${d.name}!</b> Clean it up to reopen.`);
}

// Catch up after time away: the gate's takings, the token meter, the rivals.
function comeBack(seconds, announceIt) {
  if (!(seconds > 5)) return;
  const till = S.applyOffline(world, seconds);
  const res = R.tick(world.state, clock(), Math.random, TUNING.incomingMaxAway);
  if (announceIt && seconds >= TUNING.offlineMinSeconds) ui.showAway(seconds, till, res.tokens, res.incidents);
  else res.incidents.forEach(announce);
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
    const res = R.tick(world.state, clock(), Math.random, 1);
    res.incidents.forEach(announce);
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
window.addEventListener('resize', () => {
  ui.measure();
  renderer.resize();
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
renderer.resetView();

// The splash doubles as the first tap, which browsers need before sound can play.
ui.showSplash(() => {
  if (!loaded) {
    ui.showWelcome();
  } else if (state.lastSaved > 0) {
    comeBack((clock() - state.lastSaved) / 1000, true);
    ui.showDaily();
  }
});

requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});

// Handy for poking at the game from the console and for automated checks.
window.park = { world, state, rules: R, sim: S, economy: E, renderer, ui, save, clock };
