// Canvas renderer: camera, the cached ground, depth-sorted sprites, the
// day/night lighting pass, particles and the on-map labels.
import { ATTRACTIONS, GAME_TITLE, TOWNS, WORLD as W } from './config.js';
import * as A from './art.js';
import * as E from './economy.js';
import { money } from './format.js';
import { isReady, mulberry32 } from './sim.js';

const TAU = Math.PI * 2;
const M = 240; // ground painted this far beyond the world edge
const GROUND_SCALE = 1.25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function townFor(state) {
  return TOWNS[state.tours % TOWNS.length];
}

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
function buildScenery(town, seed) {
  const r = mulberry32(seed);
  const items = [];
  const rows = W.rowY;
  for (let k = 0; k < rows.length; k++) {
    const y = rows[k] - 104;
    for (const s of [-1, 1]) items.push({ kind: 'lamp', x: W.aveX + s * (W.aveHalf + 14), y });
    items.push({ kind: 'bunting', x: W.aveX, y: y + 0.5 });
    if (k % 2 === 0) items.push({ kind: 'bench', x: W.aveX + (k % 4 === 0 ? -1 : 1) * (W.aveHalf + 26), y: rows[k] - 150 });
    for (const s of [-1, 1]) {
      items.push({ kind: 'tree', x: W.aveX + s * (458 - r() * 12), y: rows[k] - 96 - r() * 30, v: Math.floor(r() * 8), s: 0.85 + r() * 0.3 });
      items.push({ kind: 'tree', x: W.aveX + s * (446 + r() * 14), y: rows[k] + 60 + r() * 30, v: Math.floor(r() * 8), s: 0.8 + r() * 0.3 });
    }
  }
  for (const s of [-1, 1]) {
    items.push({ kind: 'lamp', x: W.aveX + s * 150, y: W.gateY - 60 });
    items.push({ kind: 'booth', x: W.aveX + s * 150, y: W.gateY + 2 });
    items.push({ kind: 'tree', x: W.aveX + s * 300, y: 150 + r() * 30, v: 1, s: 1.1 });
    items.push({ kind: 'tree', x: W.aveX + s * 390, y: 120 + r() * 40, v: 3, s: 0.95 });
    items.push({ kind: 'lamp', x: W.aveX + s * 110, y: 196 });
  }
  items.push({ kind: 'gate', x: W.aveX, y: W.gateY });
  items.push({ kind: 'bandstand', x: W.aveX, y: 150 });
  return items;
}

// A small repeating tile of grass (or sand, or snow) that fills the whole view.
function buildTile(town, seed) {
  const size = 320;
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.scale(GROUND_SCALE, GROUND_SCALE);
  const r = mulberry32(seed);
  c.fillStyle = town.ground;
  c.fillRect(0, 0, size, size);
  // draw each mark nine times, offset by the tile size, so the edges wrap
  const wrapped = (fn) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  c.fillStyle = town.ground2;
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
  c.strokeStyle = town.tuft;
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
function buildGround(town, seed) {
  const cv = document.createElement('canvas');
  cv.width = Math.round((W.w + 2 * M) * GROUND_SCALE);
  cv.height = Math.round((W.h + 2 * M) * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.scale(GROUND_SCALE, GROUND_SCALE);
  c.translate(M, M);
  const r = mulberry32(seed);

  // plot pads
  for (const d of ATTRACTIONS) {
    c.beginPath();
    c.roundRect(d.x - 138, d.y - 104, 276, 128, 26);
    c.fillStyle = town.plot;
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
  paths(5, town.pathEdge);
  paths(0, town.path);
  c.fillStyle = 'rgba(0,0,0,0.06)';
  for (let k = 0; k < 260; k++) {
    const y = 160 + r() * (W.h + M - 170);
    c.fillRect(W.aveX - W.aveHalf + 6 + r() * (W.aveHalf * 2 - 22), y, 6 + r() * 8, 2.5);
  }
  for (const yRow of W.rowY) {
    for (let k = 0; k < 26; k++) {
      c.fillRect(W.aveX - reach + 8 + r() * (reach * 2 - 26), yRow + r() * 44, 6 + r() * 8, 2.5);
    }
  }

  // flowers round the plots
  const blooms = ['#ff6b8b', '#ffd75e', '#ffffff', '#c98cff', '#ff9a4d'];
  if (town.weather !== 'snow') {
    for (const d of ATTRACTIONS) {
      for (let k = 0; k < 16; k++) {
        const fx = d.x + (r() - 0.5) * 250 + (r() < 0.5 ? -8 : 8);
        const fy = d.y - 112 + r() * 12 + (k % 2) * 142;
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
    c.fillStyle = town.fence;
    c.fillRect(x - 2.5, y - 16, 5, 17);
  };
  const rail = (xa, ya, xb, yb) => {
    c.strokeStyle = town.fence;
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
  for (let k = 0; k < 150; k++) {
    const x = -M + r() * (W.w + 2 * M);
    const y = -M + r() * (W.h + 2 * M);
    const inside = x > fx0 - 34 && x < fx1 + 34 && y > fy0 - 10 && y < fy1 + 50;
    const road = Math.abs(x - W.aveX) < W.aveHalf + 50 && y > fy1;
    const water = town.sea && y < 80;
    if (inTreeBand(x, y) && !inside && !road && !water) outside.push({ x, y, v: Math.floor(r() * 8), s: 0.9 + r() * 0.5 });
  }
  outside.sort((p, q) => p.y - q.y);
  for (const t of outside) A.drawTree(c, t.x, t.y, town, t.v, t.s);
  return cv;
}

export function createRenderer(canvas, world, hooks = {}) {
  const ctx = canvas.getContext('2d');
  const cam = { x: W.w / 2, y: W.h, zoom: 0.5, tx: null, ty: null, minZoom: 0.3, maxZoom: 2.2 };
  const insets = { top: 104, bottom: 84 };
  let vw = 300;
  let vh = 300;
  let dpr = 1;
  let time = 0;
  let town = null;
  let ground = null;
  let tile = null;
  let scenery = [];
  let fixed = [];
  let selected = -1;
  let pointer = -1;
  let sheetCover = 0;
  let cover = 0; // sheetCover, eased, so the view glides when a sheet opens or closes
  const glows = [makeGlow(255, 214, 130), makeGlow(255, 150, 205), makeGlow(140, 220, 255)];
  const particles = [];
  const popups = [];
  const rockets = [];
  const sparks = [];
  const weather = [];
  let rocketIn = 0;
  const animT = ATTRACTIONS.map(() => 0);

  function setTown() {
    const next = townFor(world.state);
    if (next === town) return;
    town = next;
    const seed = 1000 + (world.state.tours % TOWNS.length) * 77;
    ground = buildGround(town, seed);
    tile = ctx.createPattern(buildTile(town, seed + 3), 'repeat');
    if (tile.setTransform) tile.setTransform(new DOMMatrix().scale(1 / GROUND_SCALE));
    scenery = buildScenery(town, seed + 5);
    fixed = scenery.map((s) => ({ y: s.y, s }));
    for (const d of ATTRACTIONS) fixed.push({ y: d.y - 4, a: d.index });
    fixed.sort((p, q) => p.y - q.y);
    weather.length = 0;
    if (town.weather) {
      const r = mulberry32(seed + 9);
      for (let k = 0; k < 46; k++) weather.push({ x: r(), y: r(), z: 0.5 + r() * 0.8, ph: r() * TAU, k });
    }
  }

  // ---- camera ------------------------------------------------------------

  const usable = () => vh - insets.top - insets.bottom;
  const centreY = () => insets.top + usable() / 2;
  const toScreenX = (x) => vw / 2 + (x - cam.x) * cam.zoom;
  const toScreenY = (y) => centreY() + (y - cam.y) * cam.zoom;
  const toWorld = (sx, sy) => ({ x: cam.x + (sx - vw / 2) / cam.zoom, y: cam.y + (sy - centreY()) / cam.zoom });

  function clampCam() {
    cam.zoom = clamp(cam.zoom, cam.minZoom, cam.maxZoom);
    const hw = vw / 2 / cam.zoom;
    const hh = usable() / 2 / cam.zoom;
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
    cam.minZoom = Math.min(vw / (W.w + 100), usable() / (W.h + 76));
    clampCam();
  }

  function resetView() {
    resize();
    cam.zoom = clamp(vw / 880, cam.minZoom, 0.8);
    cam.x = W.w / 2;
    // start on the first row of plots, as low as the view allows
    cam.y = W.rowY[0] + 40 - (usable() / cam.zoom) * 0.25;
    cam.tx = cam.ty = null;
    clampCam();
  }

  // Glide so attraction i sits in the clear space above any open sheet.
  function focus(i) {
    const d = ATTRACTIONS[i];
    const clearTop = insets.top;
    const clearBottom = vh - Math.max(insets.bottom, sheetCover);
    const wantY = (clearTop + clearBottom) / 2 + 20;
    // only pan sideways when the attraction would not otherwise fit in view
    const fits = vw / 2 / cam.zoom >= Math.abs(d.x - W.aveX) + d.w / 2 + 16;
    cam.tx = fits ? W.w / 2 : d.x + (W.aveX - d.x) * 0.35;
    cam.ty = d.y - d.h * 0.42 - (wantY - centreY()) / cam.zoom;
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
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(mid.x, mid.y, (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.d));
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
      const bx = toScreenX(b.x);
      const by = toScreenY(b.y);
      const reach = Math.max(34, 36 * cam.zoom);
      if (Math.hypot(sx - bx, sy - (by + 12 * cam.zoom)) < reach + 10) return { balloon: b };
    }
    const p = toWorld(sx, sy);
    let best = -1;
    let bestD = Infinity;
    for (const d of ATTRACTIONS) {
      const built = world.state.attractions[d.index].built;
      const top = built ? d.y - d.h - 46 : d.y - 96;
      const half = built ? d.w / 2 + 12 : 82;
      if (Math.abs(p.x - d.x) > half || p.y < top || p.y > d.y + 30) continue;
      const dist = Math.abs(p.y - (d.y - 50)) + Math.abs(p.x - d.x) * 0.5;
      if (dist < bestD) {
        bestD = dist;
        best = d.index;
      }
    }
    return best >= 0 ? { attraction: best } : null;
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

  function launchRocket() {
    if (rockets.length > 6) return;
    rockets.push({
      x: vw * (0.12 + Math.random() * 0.76),
      y: vh + 10,
      ty: vh * (0.14 + Math.random() * 0.3),
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

    if (world.state.boosts.fireworks > 0) {
      rocketIn -= dt;
      if (rocketIn <= 0) {
        rocketIn = 0.32 + Math.random() * 0.4;
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
        case 'tree': A.drawTree(ctx, s.x, s.y, town, s.v, s.s); break;
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
    const i = item.a;
    const d = ATTRACTIONS[i];
    const st = world.state.attractions[i];
    if (!st.built) {
      const next = world.state.attractions.findIndex((a) => !a.built);
      const mode = i !== next ? 'locked' : world.state.cash >= d.cost ? 'afford' : 'open';
      A.drawForSale(ctx, d.x, d.y - 28, mode);
      return;
    }
    const rt = world.rt[i];
    ctx.save();
    ctx.translate(d.x, d.y - 4);
    if (rt.pulse > 0) {
      const k = 1 + Math.sin(rt.pulse * Math.PI) * 0.025;
      ctx.scale(k, 2 - k);
    }
    A.drawAttraction(ctx, i, {
      t: time + i * 1.7,
      anim: animT[i],
      run: rt.phase === 'run',
      p: rt.phase === 'run' ? clamp(rt.t / rt.dur, 0, 1) : 0,
      riders: rt.riders.length,
    });
    ctx.restore();
  }

  function pill(x, y, text, bg, fg, size, progress = -1) {
    ctx.font = `800 ${size}px ${FONT}`;
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
    const next = s.attractions.findIndex((a) => !a.built);
    for (const d of ATTRACTIONS) {
      const i = d.index;
      const a = s.attractions[i];
      const sx = toScreenX(d.x);
      const sy = toScreenY(d.y);
      if (sx < -160 || sx > vw + 160 || sy < -80 || sy > vh + 320) continue;
      if (!a.built) {
        if (i === next) {
          const can = s.cash >= d.cost;
          pill(sx, toScreenY(d.y - 6) + size, money(d.cost), can ? '#2f9e44' : 'rgba(27,31,74,0.85)', '#fff', size + 1);
        }
        continue;
      }
      const rt = world.rt[i];
      const can = s.cash >= E.levelCost(d, a.level);
      // nameplate at the outer front corner, clear of the queue and of the row below
      const edge = size * 2.6;
      const px = clamp(toScreenX(d.x + d.side * (d.w / 2 - 34)), Math.min(edge, sx), Math.max(vw - edge, sx));
      const py = toScreenY(d.y + 14) + size;
      const prog = rt.phase === 'run' ? rt.t / rt.dur : -1;
      pill(px, py, (can ? '▲ ' : '') + 'Lv ' + a.level, can ? '#2f9e44' : 'rgba(27,31,74,0.82)', '#fff', size, prog);
      if (isReady(world, i)) {
        const full = rt.riders.length >= E.capacity(d, a.level);
        const bounce = Math.abs(Math.sin(time * (full ? 6 : 4))) * 7;
        const by = toScreenY(d.y - d.h - 6) - 20 - bounce;
        const r = clamp(15 + z * 8, 17, 24);
        ctx.beginPath();
        ctx.arc(sx, by, r + 3, 0, TAU);
        ctx.fillStyle = 'rgba(27,31,74,0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, by, r, 0, TAU);
        ctx.fillStyle = '#ffc53d';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx - 6, by + r + 1);
        ctx.lineTo(sx + 6, by + r + 1);
        ctx.lineTo(sx, by + r + 9);
        ctx.closePath();
        ctx.fillStyle = 'rgba(27,31,74,0.9)';
        ctx.fill();
        ctx.font = `900 ${Math.round(r * 0.72)}px ${FONT}`;
        ctx.fillStyle = '#1b1f4a';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GO!', sx, by + 1);
      } else if (!a.operator && rt.phase === 'idle') {
        ctx.globalAlpha = 0.85;
        pill(sx, toScreenY(d.y - d.h - 6) - 12, 'waiting for guests', 'rgba(27,31,74,0.7)', '#fff6e0', Math.max(9, size - 2));
        ctx.globalAlpha = 1;
      }
    }
    if (pointer >= 0) {
      const d = ATTRACTIONS[pointer];
      const built = s.attractions[pointer].built;
      const sx = toScreenX(d.x);
      const top = toScreenY(built ? d.y - d.h - 6 : d.y - 96) - (built && isReady(world, pointer) ? 62 : 14);
      const by = top - Math.abs(Math.sin(time * 3.2)) * 10;
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
    const kind = town.weather;
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
    for (let i = 0; i < ATTRACTIONS.length; i++) if (world.rt[i].phase === 'run') animT[i] += dt;

    const s = world.state;
    const dark = darkness(s.clock);
    const z = cam.zoom;
    const ox = vw / 2 - cam.x * z;
    const oy = centreY() - cam.y * z;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = town.ground;
    ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * ox, dpr * oy);
    const view = { x0: -ox / z - 180, x1: (vw - ox) / z + 180, y0: -oy / z - 40, y1: (vh - oy) / z + 300 };
    ctx.fillStyle = tile;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    if (town.sea && view.y0 < 30) {
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
          if (inTreeBand(x, y) || (town.sea && y < 80)) continue;
          A.drawTree(ctx, x, y, town, Math.floor(hsh * 97) % 8, 0.9 + ((hsh * 31) % 1) * 0.5);
        }
      }
    }
    ctx.drawImage(ground, -M, -M, W.w + 2 * M, W.h + 2 * M);

    if (selected >= 0) {
      const d = ATTRACTIONS[selected];
      ctx.beginPath();
      ctx.ellipse(d.x, d.y - 4, d.w / 2 + 14, 30, 0, 0, TAU);
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
      for (const d of ATTRACTIONS) {
        if (!s.attractions[d.index].built) continue;
        const flick = 0.9 + Math.sin(time * 5 + d.index) * 0.06;
        for (const [lx, ly, lr, tint] of A.LIGHTS[d.index]) glow(d.x + lx, d.y + ly, lr, tint, 0.5 * lit * flick);
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
    drawOverlays();
    for (const p of popups) {
      const u = p.t / 1.3;
      const x = toScreenX(p.x);
      const y = toScreenY(p.y) - u * 46;
      ctx.globalAlpha = clamp((1 - u) * 2.2, 0, 1);
      ctx.font = `900 ${Math.round(p.size * clamp(0.6 + cam.zoom * 0.8, 0.75, 1.2))}px ${FONT}`;
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
    burst,
    cam,
    toScreenX,
    toScreenY,
    setSelected: (i) => { selected = i; },
    setPointer: (i) => { pointer = i; },
    setSheetCover: (px) => { sheetCover = px; },
    setInsets: (top, bottom) => {
      insets.top = top;
      insets.bottom = bottom;
      resize();
    },
    get time() { return time; },
  };
}

// A still picture of an attraction for menus.
export function thumbnail(i, w = 88, h = 72, scale = 2) {
  const d = ATTRACTIONS[i];
  const cv = document.createElement('canvas');
  cv.width = w * scale;
  cv.height = h * scale;
  const c = cv.getContext('2d');
  const k = Math.min(w / (d.w + 16), h / (d.h + 24)) * scale;
  c.translate((w * scale) / 2, h * scale - 7 * scale);
  c.scale(k, k);
  A.drawAttraction(c, i, { t: 0.4, anim: 0.6, run: false, p: 0, riders: 0 });
  return cv;
}

