// Canvas renderer for the park: camera, cached ground, depth-sorted sprites,
// the day/night lighting pass, particles and the on-map labels.
import { GAME_TITLE, PLOTS, STAGES, WORLD as W, townInfo } from './config.js';
import * as A from './art.js';
import * as E from './economy.js';
import { money } from './format.js';
import { designAt, isOpen, mulberry32 } from './sim.js';

const TAU = Math.PI * 2;
const M = 240; // ground detail is painted this far beyond the world edge
const GROUND_SCALE = 1.25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;



// How dark it is, 0 (day) to 1 (night), from the state clock.
export function darkness(clock) {
  if (clock < 0.5) return 0;
  if (clock < 0.6) return (clock - 0.5) / 0.1;
  if (clock < 0.9) return 1;
  return 1 - (clock - 0.9) / 0.1;
}

function makeGlow(r, g, b) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.38)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 128, 128);
  return cv;
}

// Static scenery that has to be depth-sorted against guests and attractions.
function buildScenery(seed) {
  const r = mulberry32(seed);
  const items = [];
  W.rowY.forEach((rowY, k) => {
    const y = rowY - 104;
    for (const s of [-1, 1]) items.push({ kind: 'lamp', x: W.aveX + s * (W.aveHalf + 14), y });
    items.push({ kind: 'bunting', x: W.aveX, y: y + 0.5 });
    if (k !== 1) items.push({ kind: 'bench', x: W.aveX + (k ? 1 : -1) * (W.aveHalf + 26), y: rowY - 150 });
    for (const s of [-1, 1]) {
      items.push({ kind: 'tree', x: W.aveX + s * (458 - r() * 12), y: rowY - 96 - r() * 30, v: Math.floor(r() * 8), s: 0.85 + r() * 0.3 });
      items.push({ kind: 'tree', x: W.aveX + s * (446 + r() * 14), y: rowY + 60 + r() * 30, v: Math.floor(r() * 8), s: 0.8 + r() * 0.3 });
    }
  });
  for (const s of [-1, 1]) {
    items.push({ kind: 'lamp', x: W.aveX + s * 150, y: W.gateY - 60 });
    items.push({ kind: 'booth', x: W.aveX + s * 150, y: W.gateY + 2 });
    items.push({ kind: 'tree', x: W.aveX + s * 440, y: 96 + r() * 30, v: 3, s: 0.95 });
    items.push({ kind: 'lamp', x: W.aveX + s * 110, y: 196 });
  }
  items.push({ kind: 'gate', x: W.aveX, y: W.gateY });
  items.push({ kind: 'bandstand', x: W.aveX, y: 150 });
  return items;
}

// A small repeating tile of grass (or sand, or snow) that fills the whole view.
function buildTile(theme, seed) {
  const size = 320;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.scale(GROUND_SCALE, GROUND_SCALE);
  const r = mulberry32(seed);
  c.fillStyle = theme.ground;
  c.fillRect(0, 0, size, size);
  // draw each mark nine times, offset by the tile size, so the edges wrap
  const wrapped = (fn) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  c.fillStyle = theme.ground2;
  c.globalAlpha = 0.55;
  for (let k = 0; k < 7; k++) {
    const [x, y, rx, ry, rot] = [r() * size, r() * size, 30 + r() * 60, 14 + r() * 24, r() * 3];
    wrapped((dx, dy) => {
      c.beginPath();
      c.ellipse(x + dx, y + dy, rx, ry, rot, 0, TAU);
      c.fill();
    });
  }
  c.globalAlpha = 1;
  c.strokeStyle = theme.tuft;
  c.lineWidth = 1.6;
  c.lineCap = 'round';
  for (let k = 0; k < 22; k++) {
    const x = 8 + r() * (size - 16);
    const y = 8 + r() * (size - 16);
    c.beginPath();
    c.moveTo(x - 3, y);
    c.lineTo(x - 1, y - 5);
    c.moveTo(x + 1, y);
    c.lineTo(x + 2, y - 6);
    c.moveTo(x + 4, y);
    c.lineTo(x + 6, y - 4);
    c.stroke();
  }
  return cv;
}

// Trees beyond the cached area are placed by a hash of their grid cell, so
// the countryside goes on for ever without storing anything.
const FAR_CELL = 124;
const cellHash = (gx, gy) => {
  const v = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const inTreeBand = (x, y) => x > -M + 50 && x < W.w + M - 50 && y > -M + 110 && y < W.h + M - 30;

// Everything static inside and just around the fence, on a transparent layer.
function buildGround(theme, seed) {
  const cv = document.createElement('canvas');
  cv.width = Math.round((W.w + 2 * M) * GROUND_SCALE);
  cv.height = Math.round((W.h + 2 * M) * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.scale(GROUND_SCALE, GROUND_SCALE);
  c.translate(M, M);
  const r = mulberry32(seed);

  for (const p of PLOTS) {
    c.beginPath();
    c.roundRect(p.x - 138, p.y - 104, 276, 128, 26);
    c.fillStyle = theme.plot;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.06)';
    c.lineWidth = 3;
    c.stroke();
  }

  // paths: avenue, spurs to each plot, and a plaza at each end
  const reach = W.entranceOffset + 22;
  const paths = (grow, col) => {
    c.fillStyle = col;
    c.beginPath();
    c.roundRect(W.aveX - W.aveHalf - grow, 150, (W.aveHalf + grow) * 2, W.h + M, 20);
    c.fill();
    for (const y of W.rowY) {
      c.beginPath();
      c.roundRect(W.aveX - reach - grow, y - 8 - grow, (reach + grow) * 2, 58 + grow * 2, 18);
      c.fill();
    }
    c.beginPath();
    c.ellipse(W.aveX, 168, 150 + grow, 74 + grow, 0, 0, TAU);
    c.fill();
    c.beginPath();
    c.ellipse(W.aveX, W.gateY - 4, 132 + grow, 66 + grow, 0, 0, TAU);
    c.fill();
  };
  paths(5, theme.pathEdge);
  paths(0, theme.path);
  c.fillStyle = 'rgba(0,0,0,0.06)';
  for (let k = 0; k < 180; k++) {
    const y = 160 + r() * (W.h + M - 170);
    c.fillRect(W.aveX - W.aveHalf + 6 + r() * (W.aveHalf * 2 - 22), y, 6 + r() * 8, 2.5);
  }
  for (const yRow of W.rowY) {
    for (let k = 0; k < 26; k++) c.fillRect(W.aveX - reach + 8 + r() * (reach * 2 - 26), yRow + r() * 44, 6 + r() * 8, 2.5);
  }

  // flowers round the plots
  const blooms = ['#ff6b8b', '#ffd75e', '#ffffff', '#c98cff', '#ff9a4d'];
  if (theme.weather !== 'snow') {
    for (const p of PLOTS) {
      for (let k = 0; k < 16; k++) {
        const fx = p.x + (r() - 0.5) * 250 + (r() < 0.5 ? -8 : 8);
        const fy = p.y - 112 + r() * 12 + (k % 2) * 142;
        if (Math.abs(fx - W.aveX) < reach + 14 && k % 2) continue;
        c.beginPath();
        c.arc(fx, fy, 2.6, 0, TAU);
        c.fillStyle = blooms[Math.floor(r() * blooms.length)];
        c.fill();
      }
    }
  }

  // perimeter fence with a gap at the gate
  const fx0 = 18;
  const fx1 = W.w - 18;
  const fy0 = 36;
  const fy1 = W.gateY + 8;
  const post = (x, y) => {
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(x - 2, y - 1, 7, 4);
    c.fillStyle = theme.fence;
    c.fillRect(x - 2.5, y - 16, 5, 17);
  };
  const rail = (xa, ya, xb, yb) => {
    c.strokeStyle = theme.fence;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(xa, ya - 12);
    c.lineTo(xb, yb - 12);
    c.moveTo(xa, ya - 6);
    c.lineTo(xb, yb - 6);
    c.stroke();
  };
  rail(fx0, fy0, fx1, fy0);
  rail(fx0, fy0, fx0, fy1);
  rail(fx1, fy0, fx1, fy1);
  rail(fx0, fy1, W.aveX - 104, fy1);
  rail(W.aveX + 104, fy1, fx1, fy1);
  for (let x = fx0; x <= fx1; x += 30.1) {
    post(x, fy0);
    if (Math.abs(x - W.aveX) > 104) post(x, fy1);
  }
  for (let y = fy0; y <= fy1; y += 30.2) {
    post(fx0, y);
    post(fx1, y);
  }

  // trees just beyond the fence
  const outside = [];
  for (let k = 0; k < 120; k++) {
    const x = -M + r() * (W.w + 2 * M);
    const y = -M + r() * (W.h + 2 * M);
    const inside = x > fx0 - 34 && x < fx1 + 34 && y > fy0 - 10 && y < fy1 + 50;
    const road = Math.abs(x - W.aveX) < W.aveHalf + 50 && y > fy1;
    const water = theme.sea && y < 80;
    if (inTreeBand(x, y) && !inside && !road && !water) outside.push({ x, y, v: Math.floor(r() * 8), s: 0.9 + r() * 0.5 });
  }
  outside.sort((p, q) => p.y - q.y);
  for (const t of outside) A.drawTree(c, t.x, t.y, theme, t.v, t.s);
  return cv;
}

export function createRenderer(canvas, world, hooks = {}) {
  const ctx = canvas.getContext('2d');
  const cam = { x: W.w / 2, y: W.h, zoom: 0.5, tx: null, ty: null, minZoom: 0.3, maxZoom: 2.2 };
  const insets = { top: 104, bottom: 84, right: 0 };
  let vw = 300;
  let vh = 300;
  let dpr = 1;
  let time = 0;
  let town = -1;
  let theme = null;
  let ground = null;
  let tile = null;
  let scenery = [];
  let fixed = [];
  let selected = -1;
  let pointer = -1;
  let sheetCover = 0;
  let cover = 0; // sheetCover, eased, so the view glides when a sheet opens or closes
  const glows = [makeGlow(255, 214, 130), makeGlow(255, 150, 205), makeGlow(140, 220, 255)];
  const cloud = makeGlow(20, 24, 60);
  // slow cloud shadows crossing the ground: [phase, row, width, speed]
  const clouds = [[0.05, 0.12, 520, 9], [0.4, 0.55, 680, 7], [0.72, 0.3, 440, 11], [0.9, 0.85, 600, 8]];
  const particles = [];
  const popups = [];
  const rockets = [];
  const sparks = [];
  const weather = [];
  let rocketIn = 0;
  let showUntil = 0; // fireworks keep going until this time
  const animT = PLOTS.map(() => 0);

  function setTown() {
    if (world.state.town === town) return;
    town = world.state.town;
    const info = townInfo(town);
    const seed = 1000 + town * 77;
    const rebuild = info.theme !== theme;
    theme = info.theme;
    if (rebuild || !ground) {
      ground = buildGround(theme, seed);
      tile = ctx.createPattern(buildTile(theme, seed + 3), 'repeat');
      if (tile.setTransform) tile.setTransform(new DOMMatrix().scale(1 / GROUND_SCALE));
    }
    scenery = buildScenery(seed + 5);
    fixed = scenery.map((s) => ({ y: s.y, s }));
    for (const p of PLOTS) fixed.push({ y: p.y - 4, k: p.index });
    fixed.sort((p, q) => p.y - q.y);
    weather.length = 0;
    if (theme.weather) {
      const r = mulberry32(seed + 9);
      for (let k = 0; k < 46; k++) weather.push({ x: r(), y: r(), z: 0.5 + r() * 0.8, ph: r() * TAU, k });
    }
    animT.fill(0);
  }

  // ---- camera ------------------------------------------------------------

  const usableH = () => vh - insets.top - insets.bottom;
  const usableW = () => vw - insets.right;
  const centreX = () => usableW() / 2;
  const centreY = () => insets.top + usableH() / 2;
  const toScreenX = (x) => centreX() + (x - cam.x) * cam.zoom;
  const toScreenY = (y) => centreY() + (y - cam.y) * cam.zoom;
  const toWorld = (sx, sy) => ({ x: cam.x + (sx - centreX()) / cam.zoom, y: cam.y + (sy - centreY()) / cam.zoom });

  function clampCam() {
    cam.zoom = clamp(cam.zoom, cam.minZoom, cam.maxZoom);
    const hw = usableW() / 2 / cam.zoom;
    const hh = usableH() / 2 / cam.zoom;
    const loX = -50 + hw;
    const hiX = W.w + 50 - hw;
    cam.x = loX > hiX ? W.w / 2 : clamp(cam.x, loX, hiX);
    const loY = -30 + hh;
    // an open sheet hides the bottom of the map, so allow scrolling further down
    const hidden = Math.max(cam.tx === null ? cover : sheetCover, insets.bottom) - insets.bottom;
    const hiY = W.h + 46 - hh + hidden / cam.zoom;
    cam.y = loY > hiY ? (W.h + 16) / 2 : clamp(cam.y, loY, hiY);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    cam.minZoom = Math.min(usableW() / (W.w + 100), usableH() / (W.h + 76));
    clampCam();
  }

  function resetView() {
    resize();
    cam.zoom = clamp(Math.min(usableW() / 880, usableH() / 900), cam.minZoom, 0.85);
    cam.x = W.w / 2;
    cam.y = W.rowY[0] + 60 - (usableH() / cam.zoom) * 0.2;
    cam.tx = cam.ty = null;
    clampCam();
  }

  // Glide so plot k sits in the clear space above any open sheet.
  function focus(k) {
    const p = PLOTS[k];
    const d = designAt(world.state, k);
    const clearBottom = vh - Math.max(insets.bottom, sheetCover);
    const wantY = (insets.top + clearBottom) / 2 + 20;
    const fits = usableW() / 2 / cam.zoom >= Math.abs(p.x - W.aveX) + d.w / 2 + 16;
    cam.tx = fits ? W.w / 2 : p.x + (W.aveX - p.x) * 0.35;
    cam.ty = p.y - d.h * 0.42 - (wantY - centreY()) / cam.zoom;
  }

  function updateCamera(dt) {
    if (cam.tx === null) return;
    const k = 1 - Math.exp(-dt * 7);
    const bx = cam.x;
    const by = cam.y;
    cam.x = lerp(cam.x, cam.tx, k);
    cam.y = lerp(cam.y, cam.ty, k);
    clampCam();
    if (Math.abs(cam.x - bx) + Math.abs(cam.y - by) < 0.05) cam.tx = cam.ty = null;
  }

  // ---- input -------------------------------------------------------------

  const pointers = new Map();
  let drag = null;
  let pinch = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
      if (drag) drag.moved = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.d));
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    if (drag.moved) {
      cam.x -= (e.clientX - drag.x) / cam.zoom;
      cam.y -= (e.clientY - drag.y) / cam.zoom;
      cam.tx = cam.ty = null;
      clampCam();
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0 && drag) {
      const tap = !drag.moved && e.type === 'pointerup' && performance.now() - drag.t < 700;
      drag = null;
      if (tap && hooks.onTap) {
        const rect = canvas.getBoundingClientRect();
        hooks.onTap(e.clientX - rect.left, e.clientY - rect.top);
      }
    } else if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: true, t: 0 };
    }
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, cam.zoom * Math.exp(-e.deltaY * 0.0014));
  }, { passive: false });

  function zoomAt(sx, sy, zoom) {
    const before = toWorld(sx, sy);
    cam.zoom = clamp(zoom, cam.minZoom, cam.maxZoom);
    const after = toWorld(sx, sy);
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    cam.tx = cam.ty = null;
    clampCam();
  }

  // What is under a tap? Balloons first, then the nearest plot.
  function pick(sx, sy) {
    for (const b of world.balloons) {
      const reach = Math.max(34, 36 * cam.zoom);
      if (Math.hypot(sx - toScreenX(b.x), sy - (toScreenY(b.y) + 12 * cam.zoom)) < reach + 10) return { balloon: b };
    }
    const w = toWorld(sx, sy);
    let best = -1;
    let bestD = Infinity;
    for (const p of PLOTS) {
      const built = world.state.plots[p.index].stage > 0;
      const d = designAt(world.state, p.index);
      const top = built ? p.y - d.h - 30 : p.y - 110;
      const half = built ? d.w / 2 + 16 : 110;
      if (Math.abs(w.x - p.x) > half || w.y < top || w.y > p.y + 34) continue;
      const dist = Math.abs(w.y - (p.y - 50)) + Math.abs(w.x - p.x) * 0.5;
      if (dist < bestD) {
        bestD = dist;
        best = p.index;
      }
    }
    return best >= 0 ? { plot: best } : null;
  }

  // ---- effects -----------------------------------------------------------

  function popText(x, y, text, color = '#fff6e0', size = 14) {
    // a fresh popup in the same spot replaces the old one instead of stacking
    for (const p of popups) {
      if (p.x === x && p.y === y && p.t < 0.45) {
        p.text = text;
        p.color = color;
        return;
      }
    }
    if (popups.length > 40) popups.shift();
    popups.push({ x, y, text, color, size, t: 0 });
  }

  function burst(x, y, n, palette, opts = {}) {
    for (let k = 0; k < n; k++) {
      if (particles.length > 500) particles.shift();
      const a = opts.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * TAU;
      const sp = (opts.speed || 150) * (0.4 + Math.random() * 0.8);
      particles.push({
        x: x + (Math.random() - 0.5) * (opts.spread || 10),
        y: y + (Math.random() - 0.5) * (opts.spread || 10),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: opts.gravity ?? 420,
        t: 0,
        life: (opts.life || 0.9) * (0.7 + Math.random() * 0.6),
        size: (opts.size || 5) * (0.7 + Math.random() * 0.6),
        color: palette[Math.floor(Math.random() * palette.length)],
        shape: opts.shape || 'rect',
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }

  const CONFETTI = ['#e5484d', '#ffc53d', '#3e63dd', '#46a758', '#e93d82', '#fff6e0'];
  const confetti = (x, y, n = 36) => burst(x, y, n, CONFETTI, { up: true, speed: 260, life: 1.3, spread: 60 });
  const coins = (x, y, n = 4) => burst(x, y, n, ['#ffc53d', '#ffd75e'], { up: true, speed: 150, life: 0.75, shape: 'coin', size: 5 });
  const custard = (x, y) => burst(x, y, 34, ['#fff3c4', '#ffe9a6', '#ffffff'], { speed: 260, life: 0.9, size: 9, shape: 'coin' });

  function launchRocket() {
    if (rockets.length > 6) return;
    const w = usableW();
    rockets.push({
      x: w * (0.12 + Math.random() * 0.76),
      y: vh - insets.bottom + 10,
      ty: insets.top + (vh - insets.top - insets.bottom) * (0.08 + Math.random() * 0.4),
      vy: -(vh * 0.9 + Math.random() * vh * 0.3),
      color: ['#ffd75e', '#ff7a9a', '#8fd3ff', '#b6f36b', '#ffb36b', '#d0a2ff'][Math.floor(Math.random() * 6)],
    });
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.t += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let k = particles.length - 1; k >= 0; k--) if (particles[k].t >= particles[k].life) particles.splice(k, 1);
    for (const p of popups) p.t += dt;
    while (popups.length && popups[0].t > 1.3) popups.shift();

    if (time < showUntil) {
      rocketIn -= dt;
      if (rocketIn <= 0) {
        rocketIn = 0.28 + Math.random() * 0.4;
        launchRocket();
      }
    }
    for (let k = rockets.length - 1; k >= 0; k--) {
      const rk = rockets[k];
      rk.y += rk.vy * dt;
      if (rk.y <= rk.ty) {
        rockets.splice(k, 1);
        const n = 38;
        const big = 90 + Math.random() * 110;
        for (let j = 0; j < n; j++) {
          const a = (j / n) * TAU + Math.random() * 0.2;
          const sp = big * (0.75 + Math.random() * 0.35);
          sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.9 + Math.random() * 0.5, color: rk.color });
        }
        if (hooks.onBang) hooks.onBang();
      }
    }
    for (const s of sparks) {
      s.t += dt;
      s.vx *= 1 - dt * 1.6;
      s.vy = s.vy * (1 - dt * 1.6) + 70 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (let k = sparks.length - 1; k >= 0; k--) if (sparks[k].t >= sparks[k].life) sparks.splice(k, 1);
  }

  // ---- drawing -----------------------------------------------------------

  function drawFixed(item, dark) {
    const s = item.s;
    if (s) {
      switch (s.kind) {
        case 'tree': A.drawTree(ctx, s.x, s.y, theme, s.v, s.s); break;
        case 'lamp': A.drawLamp(ctx, s.x, s.y, dark > 0.3); break;
        case 'bench': A.drawBench(ctx, s.x, s.y); break;
        case 'bunting': A.drawBunting(ctx, s.x - W.aveHalf - 14, s.y - 72, s.x + W.aveHalf + 14, s.y - 72, 7, time); break;
        case 'gate': A.drawGate(ctx, s.x, s.y, GAME_TITLE, time); break;
        case 'booth': A.drawTicketBooth(ctx, s.x, s.y); break;
        case 'bandstand': A.drawBandstand(ctx, s.x, s.y, time); break;
        default: break;
      }
      return;
    }
    const k = item.k;
    const p = PLOTS[k];
    const plot = world.state.plots[k];
    if (plot.stage === 0) {
      A.drawForSale(ctx, p.x, p.y - 28, world.state.coins >= E.stageCost(world.state.town, k, 1) ? 'afford' : 'open');
      return;
    }
    const d = designAt(world.state, k);
    const rt = world.rt[k];
    ctx.save();
    ctx.translate(p.x, p.y - 4);
    A.drawPlotBack(ctx, d.w, plot.stage, time + k);
    ctx.save();
    if (rt.pulse > 0) {
      const squash = 1 + Math.sin(rt.pulse * Math.PI) * 0.025;
      ctx.scale(squash, 2 - squash);
    }
    A.drawAttraction(ctx, d.index, {
      t: time + k * 1.7,
      anim: animT[k],
      run: rt.phase === 'run',
      p: rt.phase === 'run' ? clamp(rt.t / rt.dur, 0, 1) : 0,
      riders: rt.riders.length,
    });
    ctx.restore();
    if (plot.splat) A.drawSplat(ctx, d.w, d.h, time);
    A.drawPlotFront(ctx, d.w, p.side, plot.stage, time + k);
    ctx.restore();
  }

  function pill(x, y, text, bg, fg, size, progress = -1) {
    ctx.font = A.displayFont(size);
    const w = ctx.measureText(text).width + size * 1.3;
    const h = size * 1.75;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    if (progress >= 0) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(255,197,61,0.9)';
      ctx.fillRect(x - w / 2, y + h / 2 - 3, w * progress, 3);
      ctx.restore();
    }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    return w;
  }

  function drawOverlays() {
    const s = world.state;
    const z = cam.zoom;
    const size = clamp(8 + z * 7, 10, 14);
    const right = usableW();
    for (const p of PLOTS) {
      const k = p.index;
      const plot = s.plots[k];
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.y);
      if (sx < -160 || sx > vw + 160 || sy < -80 || sy > vh + 320) continue;
      if (plot.stage === 0) {
        const cost = E.stageCost(s.town, k, 1);
        pill(sx, toScreenY(p.y - 6) + size, money(cost), s.coins >= cost ? '#2f9e44' : 'rgba(27,31,74,0.85)', '#fff', size + 1);
        continue;
      }
      const d = designAt(s, k);
      const rt = world.rt[k];
      const edge = size * 3;
      const px = clamp(toScreenX(p.x + p.side * (d.w / 2 - 44)), Math.min(edge, sx), Math.max(right - edge, sx));
      const py = toScreenY(p.y + 18) + size;
      if (plot.splat) {
        pill(px, py, 'Clean up ' + money(E.repairCost(s.town, k, plot.stage)), '#e5484d', '#fff', size);
        continue;
      }
      const done = plot.stage >= STAGES;
      const can = !done && s.coins >= E.stageCost(s.town, k, plot.stage + 1);
      pill(px, py, `${can ? '▲ ' : ''}★ ${plot.stage}/${STAGES}`, can ? '#2f9e44' : done ? '#b8860b' : 'rgba(27,31,74,0.82)', can || done ? '#fff' : '#ffd75e', size,
        rt.phase === 'run' ? rt.t / rt.dur : -1);
    }
    if (pointer >= 0) {
      const p = PLOTS[pointer];
      const built = s.plots[pointer].stage > 0;
      const d = designAt(s, pointer);
      const top = toScreenY(built ? p.y - d.h - 6 : p.y - 96) - 14;
      const by = top - Math.abs(Math.sin(time * 3.2)) * 10;
      const sx = toScreenX(p.x);
      ctx.beginPath();
      ctx.moveTo(sx - 13, by - 20);
      ctx.lineTo(sx + 13, by - 20);
      ctx.lineTo(sx, by);
      ctx.closePath();
      ctx.fillStyle = '#ffc53d';
      ctx.fill();
      ctx.strokeStyle = '#1b1f4a';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  function drawWeather() {
    if (!weather.length) return;
    const kind = theme.weather;
    for (const p of weather) {
      const fall = kind === 'snow' ? 34 : 46;
      const y = ((p.y * vh + time * fall * p.z) % (vh + 20)) - 10;
      const x = ((p.x * vw + Math.sin(time * 0.9 + p.ph) * 26 + time * (kind === 'snow' ? 6 : 16) * p.z) % (vw + 20)) - 10;
      if (kind === 'snow') {
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + p.z * 1.6, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 1.6 * p.z + p.ph);
        ctx.fillStyle = kind === 'leaves' ? ['#e0832b', '#c7521f', '#f0a53a'][p.k % 3] : ['#ffc2dc', '#ff9cc4', '#ffe1ee'][p.k % 3];
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.5 * p.z, 2.4 * p.z, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  const sorted = [];

  function draw(dt) {
    time += dt;
    setTown();
    if (Math.abs(cover - sheetCover) > 0.5) {
      cover = lerp(cover, sheetCover, 1 - Math.exp(-dt * 12));
      clampCam();
    }
    updateCamera(dt);
    updateEffects(dt);
    for (const p of PLOTS) if (world.rt[p.index].phase === 'run') animT[p.index] += dt;

    const s = world.state;
    const dark = darkness(s.clock);
    const z = cam.zoom;
    const ox = centreX() - cam.x * z;
    const oy = centreY() - cam.y * z;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    const view = { x0: -ox / z - 180, x1: (vw - ox) / z + 180, y0: -oy / z - 40, y1: (vh - oy) / z + 300 };
    ctx.fillStyle = tile;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    if (theme.sea && view.y0 < 30) {
      const grad = ctx.createLinearGradient(0, -400, 0, 20);
      grad.addColorStop(0, '#2f8fd0');
      grad.addColorStop(1, '#6fd0e8');
      ctx.fillStyle = grad;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, 12 - view.y0);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = Math.floor(view.x0 / 44) * 44; x < view.x1; x += 44) {
        ctx.beginPath();
        ctx.ellipse(x + 22 + Math.sin(time * 0.8 + x) * 5, 12, 26, 7, 0, 0, TAU);
        ctx.fill();
      }
    }
    // distant trees, only where the view reaches past the cached layer
    if (view.x0 < -M + 50 || view.x1 > W.w + M - 50 || view.y0 < -M + 110) {
      for (let gy = Math.floor(view.y0 / FAR_CELL); gy * FAR_CELL < view.y1; gy++) {
        for (let gx = Math.floor(view.x0 / FAR_CELL); gx * FAR_CELL < view.x1; gx++) {
          const hsh = cellHash(gx, gy);
          if (hsh > 0.4) continue;
          const x = (gx + ((hsh * 13.7) % 1)) * FAR_CELL;
          const y = (gy + ((hsh * 7.3) % 1)) * FAR_CELL;
          if (inTreeBand(x, y) || (theme.sea && y < 80)) continue;
          A.drawTree(ctx, x, y, theme, Math.floor(hsh * 97) % 8, 0.9 + ((hsh * 31) % 1) * 0.5);
        }
      }
    }
    ctx.drawImage(ground, -M, -M, W.w + 2 * M, W.h + 2 * M);

    if (selected >= 0) {
      const p = PLOTS[selected];
      const d = designAt(s, selected);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, d.w / 2 + 14, 30, 0, 0, TAU);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + Math.sin(time * 4) * 0.25})`;
      ctx.lineWidth = 5;
      ctx.setLineDash([14, 10]);
      ctx.lineDashOffset = -time * 30;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // depth-sorted sprites: merge the fixed list with this frame's guests
    sorted.length = 0;
    for (const g of world.guests) {
      if (g.alpha > 0.02 && g.y > view.y0 && g.y < view.y1 && g.x > view.x0 && g.x < view.x1) sorted.push(g);
    }
    sorted.sort((p, q) => p.y - q.y);
    let gi = 0;
    const drawGuestAt = (g) => {
      const fade = g.mode === 'leave' ? clamp((W.spawnY + 40 - g.y) / 34, 0, 1) : 1;
      const al = g.alpha * fade;
      if (al < 1) ctx.globalAlpha = al;
      A.drawGuest(ctx, g, time);
      if (al < 1) ctx.globalAlpha = 1;
    };
    for (const item of fixed) {
      while (gi < sorted.length && sorted[gi].y <= item.y) drawGuestAt(sorted[gi++]);
      if (item.y > view.y0 - 60 && item.y < view.y1 + 40) drawFixed(item, dark);
    }
    while (gi < sorted.length) drawGuestAt(sorted[gi++]);

    for (const g of sorted) {
      if (g.emoteT > 0 && g.emote) {
        const u = 1 - g.emoteT / 1.5;
        A.drawEmote(ctx, g.emote, g.x, g.y - 44 - u * 12, clamp(g.emoteT * 3, 0, 1) * g.alpha);
      }
    }

    for (const p of particles) {
      const a = clamp(1 - p.t / p.life, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      if (p.shape === 'coin') {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * Math.abs(Math.cos(p.rot)) + 1, p.size, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // cloud shadows drift over the park by day
    if (dark < 0.6) {
      const span = W.w + 2 * M + 800;
      for (const [phase, row, width, pace] of clouds) {
        const cx = ((phase * span + time * pace) % span) - M - 400;
        const cy = -80 + row * (W.h + 160) + Math.sin(time * 0.05 + phase * 9) * 40;
        if (cx + width < view.x0 || cx - width > view.x1) continue;
        ctx.globalAlpha = 0.2 * (1 - dark / 0.6);
        ctx.drawImage(cloud, cx - width, cy - width * 0.42, width * 2, width * 0.84);
      }
      ctx.globalAlpha = 1;
    }

    // night: darken everything, then add the lights back
    if (dark > 0.01) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = clamp(dark / 0.45, 0, 1);
      const n = clamp((dark - 0.45) / 0.55, 0, 1);
      const cr = Math.round(lerp(lerp(255, 255, k), 84, n));
      const cg = Math.round(lerp(lerp(255, 196, k), 92, n));
      const cb = Math.round(lerp(lerp(255, 160, k), 162, n));
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = 'lighter';
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
      const glow = (x, y, r, tint, a, squash = 1) => {
        if (x < view.x0 - r || x > view.x1 + r || y < view.y0 - r || y > view.y1 + r) return;
        ctx.globalAlpha = a;
        ctx.drawImage(glows[tint], x - r, y - r * squash, r * 2, r * 2 * squash);
      };
      const lit = clamp((dark - 0.25) / 0.5, 0, 1);
      for (const sc of scenery) {
        if (sc.kind === 'lamp') {
          glow(sc.x, sc.y - 66, 70, 0, 0.75 * lit);
          glow(sc.x, sc.y, 96, 0, 0.38 * lit, 0.42);
        } else if (sc.kind === 'gate') {
          glow(sc.x, sc.y - 124, 150, 0, 0.5 * lit, 0.6);
        } else if (sc.kind === 'bandstand') {
          glow(sc.x, sc.y - 50, 120, 0, 0.55 * lit);
        }
      }
      for (const p of PLOTS) {
        if (!isOpen(s, p.index)) continue;
        const d = designAt(s, p.index);
        const stage = s.plots[p.index].stage;
        const flick = 0.9 + Math.sin(time * 5 + p.index) * 0.06;
        const strength = (0.36 + 0.05 * stage) * lit * flick;
        for (const [lx, ly, lr, tint] of A.LIGHTS[d.index]) glow(p.x + lx, p.y + ly, lr, tint, strength);
        if (stage >= 3) glow(p.x, p.y - 140, d.w * 0.7, 1, 0.3 * lit, 0.35);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // balloons float above the lighting so they are always easy to spot
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    for (const b of world.balloons) {
      const k = Math.max(1, 0.62 / z);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(k, k);
      A.drawBalloon(ctx, 0, 0, b.color, b.t);
      ctx.restore();
    }

    // screen space from here on
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // a soft vignette pulls the eye to the middle of the park
    const vg = ctx.createRadialGradient(usableW() / 2, vh * 0.46, Math.min(vw, vh) * 0.38, usableW() / 2, vh * 0.46, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(20,22,60,0)');
    vg.addColorStop(1, 'rgba(20,22,60,0.26)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
    drawOverlays();
    for (const p of popups) {
      const u = p.t / 1.3;
      const x = toScreenX(p.x);
      const y = toScreenY(p.y) - u * 46;
      ctx.globalAlpha = clamp((1 - u) * 2.2, 0, 1);
      ctx.font = A.displayFont(Math.round(p.size * clamp(0.6 + cam.zoom * 0.8, 0.75, 1.2) * 1.1));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(27,31,74,0.9)';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;

    drawWeather();

    if (rockets.length || sparks.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const rk of rockets) {
        ctx.fillStyle = rk.color;
        ctx.fillRect(rk.x - 1.5, rk.y, 3, 16);
      }
      for (const sp of sparks) {
        const a = clamp(1 - sp.t / sp.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 1.4 + a * 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  setTown();
  resetView();

  return {
    draw,
    resize,
    resetView,
    focus,
    pick,
    popText,
    confetti,
    coins,
    custard,
    burst,
    cam,
    toScreenX,
    toScreenY,
    fireworks: (seconds = 5) => { showUntil = time + seconds; },
    setSelected: (k) => { selected = k; },
    setPointer: (k) => { pointer = k; },
    setSheetCover: (px) => { sheetCover = px; },
    setInsets: (top, bottom, right = 0) => {
      if (insets.top === top && insets.bottom === bottom && insets.right === right) return;
      insets.top = top;
      insets.bottom = bottom;
      insets.right = right;
      resize();
    },
    get time() { return time; },
  };
}

// A still picture of an attraction design for menus.
export function thumbnail(design, w = 88, h = 72, scale = 2) {
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const c = cv.getContext('2d');
  const k = Math.min(w / (design.w + 16), h / (design.h + 24)) * scale;
  c.translate((w * scale) / 2, h * scale - 7 * scale);
  c.scale(k, k);
  A.drawAttraction(c, design.index, { t: 0.4, anim: 0.6, run: false, p: 0, riders: 0 });
  return cv;
}
