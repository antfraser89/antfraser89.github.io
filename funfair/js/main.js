// Boot, the frame loop, saving, and turning simulation events into feedback.
import { createAudio } from './audio.js';
import { ATTRACTIONS, GAME_TITLE, PARK, SAVE_KEY, SHOP, TUNING } from './config.js';
import * as E from './economy.js';
import { fmt, money } from './format.js';
import { createRenderer, townFor } from './render.js';
import * as S from './sim.js';
import { newState, parseSave, serialize } from './state.js';
import { createUI } from './ui.js';

const params = new URLSearchParams(location.search);
const speed = Math.max(0.1, Math.min(60, Number(params.get('speed')) || 1));

function readSave() {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? parseSave(text) : null;
  } catch {
    return null; // private mode or storage disabled: play without saving
  }
}

const loaded = readSave();
const state = loaded || newState();
const world = S.createWorld(state);
let saving = true;

function save() {
  if (!saving) return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(world.state));
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
const renderer = createRenderer(canvas, world, {
  onTap,
  onBang: () => audio.play('bang'),
});
const ui = createUI({
  world,
  renderer,
  audio,
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
  const i = hit.attraction;
  if (S.tapAttraction(world, i)) {
    const d = ATTRACTIONS[i];
    audio.play('go');
    renderer.burst(d.x, d.y - d.h - 30, 8, ['#ffc53d', '#fff6e0'], { speed: 120, life: 0.5, size: 4 });
    return;
  }
  audio.play('click');
  if (ui.sheetKey === 'attraction:' + i) ui.closeSheet();
  else ui.openAttraction(i);
}

const STAR = '<span class="star">★</span>';

function handleEvents() {
  const s = world.state;
  for (const ev of world.events) {
    switch (ev.type) {
      case 'pay': {
        const d = ATTRACTIONS[ev.i];
        const boosted = E.boostMult(s) > 1;
        renderer.popText(d.x, d.y - d.h * 0.62, '+' + money(ev.amount), boosted ? '#ffc53d' : '#fff6e0');
        renderer.coins(d.x, d.y - d.h * 0.5, Math.min(6, 2 + ev.n));
        audio.play('coin');
        break;
      }
      case 'build': {
        const d = ATTRACTIONS[ev.i];
        renderer.confetti(d.x, d.y - d.h * 0.5, 44);
        audio.play('build');
        ui.toast(`<b>${d.name}</b> is open for business!`);
        break;
      }
      case 'upgrade': {
        const d = ATTRACTIONS[ev.i];
        renderer.burst(d.x, d.y - d.h * 0.4, 6, ['#b6f36b', '#fff6e0'], { up: true, speed: 140, life: 0.6, size: 4, spread: d.w * 0.6 });
        audio.play('upgrade');
        break;
      }
      case 'milestone': {
        const d = ATTRACTIONS[ev.i];
        renderer.confetti(d.x, d.y - d.h * 0.5, 60);
        audio.play('milestone');
        ui.toast(`${d.name} hit level ${s.attractions[ev.i].level}: tickets ×2!` + (ev.stars ? ` +${STAR}${ev.stars}` : ''), 'gold');
        break;
      }
      case 'hire': {
        audio.play('hire');
        ui.toast(`An operator now runs the <b>${ATTRACTIONS[ev.i].name}</b>.`);
        break;
      }
      case 'park':
        audio.play('upgrade');
        ui.toast(`${PARK[ev.key].name} improved.`);
        break;
      case 'shop':
        audio.play('milestone');
        ui.toast(ev.key === 'warp' ? `Time warp: +${money(ev.amount)}` : `${SHOP[ev.key].name} upgraded.`, 'gold');
        save();
        break;
      case 'balloon': {
        audio.play('pop');
        renderer.burst(ev.x, ev.y, 16, [ev.color, '#fff6e0'], { speed: 220, life: 0.6, size: 6 });
        const r = ev.reward;
        if (r.kind === 'cash') {
          renderer.popText(ev.x, ev.y, '+' + money(r.amount), '#ffc53d', 18);
          ui.toast(`Prize balloon: +${money(r.amount)}`);
        } else if (r.kind === 'star') {
          renderer.popText(ev.x, ev.y, '+★', '#ffc53d', 20);
          ui.toast(`Prize balloon: +${STAR}1`, 'gold');
        } else {
          ui.toast(`Rush hour! Takings ×${TUNING.rushMult} for ${r.amount}s`, 'gold');
        }
        break;
      }
      case 'fireworks':
        audio.play('whoosh');
        ui.toast(`Fireworks! Takings ×${TUNING.fireworksMult} for ${TUNING.fireworksDuration}s`, 'gold');
        break;
      case 'goal':
        audio.play('claim');
        ui.toast(`Goal complete: +${STAR}${ev.stars}`, 'gold');
        break;
      case 'tour':
        ui.toast(`Welcome to <b>${townFor(s).name}</b>! +${fmt(ev.gain)} fame`, 'gold');
        break;
      default:
        break;
    }
  }
  world.events.length = 0;
}

// Credit time spent with the tab closed or hidden.
function creditAway(seconds, announce) {
  if (!(seconds > 5)) return;
  const res = S.applyOffline(world, seconds);
  if (res.amount <= 0) return;
  if (announce && seconds >= TUNING.offlineMinSeconds) ui.showAway(res, seconds);
  else ui.toast(`While you were away: +${money(res.amount)}`);
}

// ---- loop -----------------------------------------------------------------

let last = performance.now();
let uiClock = 0;
let saveClock = 0;
let hiddenAt = 0;

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 5) {
    creditAway(dt, false); // a long stall (sleep, throttled tab) counts as time away
    dt = 0.05;
  }
  dt = Math.max(0, Math.min(dt, 0.25));

  let simTime = dt * speed;
  const stepSize = speed > 4 ? 0.1 : 0.05;
  while (simTime > 1e-6) {
    const h = Math.min(stepSize, simTime);
    S.step(world, h);
    simTime -= h;
  }
  handleEvents();
  renderer.draw(dt);

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
    creditAway(away, true);
  }
  audio.sync();
});
window.addEventListener('pagehide', save);
window.addEventListener('resize', () => {
  renderer.resize();
  ui.measure();
});
window.addEventListener('pointerdown', () => audio.unlock(), { passive: true });
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.key === 'Escape') ui.closeSheet();
});

document.title = GAME_TITLE;
ui.refresh();
ui.measure();
renderer.resetView();

if (!loaded) {
  ui.showWelcome();
} else if (state.lastSaved > 0) {
  creditAway((Date.now() - state.lastSaved) / 1000, true);
}

requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
});

// Handy for poking at the game from the console and for automated checks.
window.funfair = { world, sim: S, economy: E, renderer, ui, save };
