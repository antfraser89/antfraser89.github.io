// Canvas renderer for the park: camera, cached ground, depth-sorted sprites,
// water, the evening light, particles and the on-map labels.
import { GAME_TITLE, PLOTS, STAGES, WORLD as W, townInfo } from './config.js';
import * as A from './art.js';
import * as SC from './scenery.js';
import * as E from './economy.js';
import { money } from './format.js';
import { layoutFor } from './layout.js';
import { designAt, isOpen, mulberry32 } from './sim.js';

const TAU = Math.PI * 2;
const M = 240; // ground detail is painted this far beyond the world edge
const GROUND_SCALE = 1.25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const inEllipse = (e, x, y, pad = 0) => ((x - e.x) / (e.rx + pad)) ** 2 + ((y - e.y) / (e.ry + pad)) ** 2 < 1;

// How far the day has gone, 0 (broad day) to 1 (night), from the state clock.
// The long ramp before dusk is the golden hour, when the park looks its best.
export function darkness(clock) {
  if (clock < 0.3) return 0;
  if (clock < 0.54) return ((clock - 0.3) / 0.24) * 0.45;
  if (clock < 0.64) return 0.45 + ((clock - 0.54) / 0.1) * 0.55;
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

// Scenery that has to be depth-sorted against guests and attractions.
function buildScenery(L, theme, seed) {
  const r = mulberry32(seed);
  const items = [];
  const gx = L.gate.x;
  const crowded = (x, y, gap) => items.some((it) => Math.hypot(it.x - x, it.y - y) < gap);
  items.push({ kind: 'gate', x: gx, y: W.gateY });
  for (const s of [-1, 1]) {
    items.push({ kind: 'booth', x: gx + s * 150, y: W.gateY + 2 });
    items.push({ kind: 'lamp', x: gx + s * 78, y: W.gateY - 96 });
  }
  items.push({ kind: 'bunting', x: gx, y: W.gateY - 95.5, half: 78 });
  for (const p of L.props) items.push({ ...p });

  // lamps down the promenades, on alternating sides, with the odd bench
  for (const id of L.lampPaths) {
    const path = L.paths[id];
    const board = path.kind === 'board';
    let side = id % 2 ? 1 : -1;
    let run = 100;
    for (let i = 1; i < path.pts.length; i++) {
      const [ax, ay] = path.pts[i - 1];
      const [bx, by] = path.pts[i];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      run += len;
      if (run < 168) continue;
      const off = board ? path.w / 2 - 8 : path.w / 2 + 13;
      const x = bx - ((by - ay) / len) * off * side;
      const y = by + ((bx - ax) / len) * off * side;
      if (y > W.gateY - 130 || L.onPlot(x, y, 6) || L.wet(x, y) || crowded(x, y, 70)) continue;
      if (!board && L.onPath(x, y, -5)) continue;
      run = 0;
      side = -side;
      items.push({ kind: 'lamp', x, y });
      const bxp = x + ((bx - ax) / len) * 34;
      const byp = y + ((by - ay) / len) * 34;
      if (!board && r() < 0.45 && !L.onPath(bxp, byp, 2) && !L.onPlot(bxp, byp, 6) && !L.wet(bxp, byp)) items.push({ kind: 'bench', x: bxp, y: byp });
    }
  }

  // trees wherever there is open ground for them
  const want = L.paved ? 20 : 44;
  let placed = 0;
  for (let k = 0; k < 700 && placed < want; k++) {
    const x = 44 + r() * (W.w - 88);
    const y = 84 + r() * (W.gateY - 110);
    if (L.noTreesAbove && y < L.noTreesAbove) continue;
    if (L.wet(x, y) || L.wet(x, y - 30) || L.onPath(x, y, 26) || L.onPath(x, y - 42, 12) || L.onPlot(x, y, 18)) continue;
    if (L.garden && inEllipse(L.garden, x, y, 40)) continue;
    if (L.plaza && inEllipse(L.plaza, x, y, 30)) continue;
    if (L.island && inEllipse(L.island, x, y, 30)) continue;
    if (Math.abs(x - gx) < 200 && y > W.gateY - 130) continue;
    if (crowded(x, y, 50)) continue;
    items.push({ kind: 'tree', x, y, v: Math.floor(r() * 8), s: 0.85 + r() * 0.4 });
    placed++;
  }
  return items;
}

// A small repeating tile of grass (or sand, snow, cobbles) that fills the whole view.
function buildTile(theme, seed, paved) {
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
  c.globalAlpha = 0.6;
  for (let k = 0; k < 9; k++) {
    const [x, y, rx, ry, rot] = [r() * size, r() * size, 30 + r() * 70, 14 + r() * 26, r() * 3];
    wrapped((dx, dy) => {
      c.beginPath();
      c.ellipse(x + dx, y + dy, rx, ry, rot, 0, TAU);
      c.fill();
    });
  }
  c.globalAlpha = 1;
  if (paved) {
    // setts laid in rows
    for (let gy = 0; gy < size; gy += 16) {
      for (let gx = (gy / 16) % 2 ? -10 : 0; gx < size; gx += 20) {
        c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(10,15,30,0.06)';
        c.beginPath();
        c.roundRect(gx + 1.5, gy + 1.5, 17, 13, 3);
        c.fill();
      }
    }
    return cv;
  }
  c.strokeStyle = theme.tuft;
  c.lineWidth = 1.5;
  c.lineCap = 'round';
  for (let k = 0; k < 26; k++) {
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
function buildGround(L, theme, seed) {
  const cv = document.createElement('canvas');
  cv.width = Math.round((W.w + 2 * M) * GROUND_SCALE);
  cv.height = Math.round((W.h + 2 * M) * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.scale(GROUND_SCALE, GROUND_SCALE);
  c.translate(M, M);
  const r = mulberry32(seed);
  const gx = L.gate.x;
  const snow = theme.weather === 'snow';
  const stone = L.paved || theme.key === 'sand';

  for (const w of L.water) {
    SC.paintWater(c, w, theme);
    if (w.frozen) SC.paintIce(c, w, r);
  }
  if (L.island) SC.paintIsland(c, L.island, theme);
  for (const d of L.decks) SC.paintDeck(c, d, theme, 0);
  if (L.head) SC.paintPierHead(c, L.head, theme, 0);
  for (const d of L.decks) SC.paintDeck(c, d, theme, 1);
  if (L.head) SC.paintPierHead(c, L.head, theme, 1);

  // open squares: just inside the gate, and wherever the map asks for one
  const square = (e) => {
    c.beginPath();
    c.ellipse(e.x, e.y, e.rx + 5, e.ry + 5, 0, 0, TAU);
    c.fillStyle = stone ? theme.stoneEdge : theme.pathEdge;
    c.fill();
    c.beginPath();
    c.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, TAU);
    c.fillStyle = stone ? theme.stone : theme.path;
    c.fill();
    c.beginPath();
    c.ellipse(e.x, e.y, e.rx * 0.62, e.ry * 0.62, 0, 0, TAU);
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = 3;
    c.stroke();
  };
  if (L.garden) {
    SC.paintGarden(c, L.garden, theme, L.beds, r, snow);
    if (L.feature && L.feature.kind === 'fountain') SC.paintFountainBasin(c, L.feature.x, L.feature.y - 4, theme);
  }
  for (const p of L.plots) {
    const decked = L.decks.some((d) => p.x > d.x && p.x < d.x + d.w && p.y > d.y && p.y < d.y + d.h);
    if (!decked) SC.paintPad(c, p.x, p.y, theme, L.paved ? 'cobble' : 'lawn');
  }
  square({ x: gx, y: W.gateY - 4, rx: 134, ry: 66 });
  if (L.plaza) square(L.plaza);
  const order = (p) => (p.kind === 'spur' ? 0 : p.kind === 'board' ? 2 : 1);
  for (const path of [...L.paths].sort((a, b) => order(a) - order(b))) {
    const decked = path.kind === 'board';
    if (!decked) SC.paintPath(c, path, theme, r);
  }
  for (const b of L.bridges) SC.paintBridge(c, b, theme);

  // flowers round the plots
  if (!snow && !L.paved) {
    for (const p of L.plots) {
      for (let k = 0; k < 18; k++) {
        const fx = p.x + (r() - 0.5) * 262;
        const fy = p.y - 114 + r() * 10 + (k % 2) * 146;
        if (L.onPath(fx, fy, 6) || L.wet(fx, fy)) continue;
        c.beginPath();
        c.arc(fx, fy, 2.4, 0, TAU);
        c.fillStyle = theme.blooms[Math.floor(r() * theme.blooms.length)];
        c.fill();
      }
    }
  }

  // the fence, with a gap at the gate
  for (const run of L.fence) {
    for (let i = 0; i < run.length - 1; i++) {
      const [xa, ya] = run[i];
      const [xb, yb] = run[i + 1];
      c.strokeStyle = theme.fence;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(xa, ya - 12);
      c.lineTo(xb, yb - 12);
      c.moveTo(xa, ya - 6);
      c.lineTo(xb, yb - 6);
      c.stroke();
      const n = Math.max(1, Math.round(Math.hypot(xb - xa, yb - ya) / 30));
      for (let k = 0; k <= n; k++) {
        const x = xa + ((xb - xa) * k) / n;
        const y = ya + ((yb - ya) * k) / n;
        c.fillStyle = 'rgba(15,30,30,0.14)';
        c.fillRect(x - 1, y - 1, 9, 3.5);
        c.fillStyle = theme.fence;
        c.fillRect(x - 2.5, y - 16, 5, 17);
      }
    }
  }

  // trees just beyond the fence
  const outside = [];
  for (let k = 0; k < 150; k++) {
    const x = -M + r() * (W.w + 2 * M);
    const y = -M + r() * (W.h + 2 * M);
    const inside = x > -20 && x < W.w + 20 && y > 30 && y < W.gateY + 58;
    const road = Math.abs(x - gx) < 96 && y > W.gateY;
    if (inTreeBand(x, y) && !inside && !road && !L.wet(x, y) && !L.wet(x, y - 30)) outside.push({ x, y, v: Math.floor(r() * 8), s: 0.9 + r() * 0.5 });
  }
  outside.sort((p, q) => p.y - q.y);
  for (const t of outside) SC.drawTree(c, t.x, t.y, theme, t.v, t.s);
  return cv;
}

// Glints on open water, worked out once per map.
function buildGlints(L, seed) {
  const r = mulberry32(seed);
  const glints = [];
  for (const w of L.water) {
    if (w.frozen || !w.sparkle) continue;
    const [cx, cy, hw, hh] = w.sparkle;
    for (let k = 0; k < 400 && glints.length < 90; k++) {
      const x = cx + (r() - 0.5) * 2 * hw;
      const y = cy + (r() - 0.5) * 2 * hh;
      if (L.wet(x, y) && L.wet(x - 22, y) && L.wet(x + 22, y) && L.wet(x, y + 10)) glints.push({ x, y, l: 4 + r() * 9, ph: r() * TAU });
    }
  }
  return glints;
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
  let L = layoutFor(world.state.town);
  let glints = [];
  let shore = null; // the sea's edge, for the surf
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
  const pops = PLOTS.map(() => 0); // 1 → 0 while a new stage bounces into place

  function setTown() {
    if (world.state.town === town) return;
    town = world.state.town;
    const info = townInfo(town);
    const seed = 1000 + town * 77;
    const rebuild = info.theme !== theme;
    theme = info.theme;
    L = layoutFor(town);
    if (rebuild || !ground) {
      ground = buildGround(L, theme, seed);
      tile = ctx.createPattern(buildTile(theme, seed + 3, L.paved), 'repeat');
      if (tile.setTransform) tile.setTransform(new DOMMatrix().scale(1 / GROUND_SCALE));
      glints = buildGlints(L, seed + 11);
      const sea = L.water.find((w) => w.kind === 'sea');
      shore = sea ? sea.pts.filter((pt) => pt[1] > sea.shoreY - 40) : null;
      for (const w of L.water) {
        let [y0, y1] = [Infinity, -Infinity];
        for (const pt of w.pts) {
          y0 = Math.min(y0, pt[1]);
          y1 = Math.max(y1, pt[1]);
        }
        w.span = [Math.max(y0, -260), y1];
      }
    }
    scenery = buildScenery(L, theme, seed + 5);
    fixed = scenery.map((s) => ({ y: s.y, s }));
    for (const p of L.plots) fixed.push({ y: p.y - 4, k: p.index });
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

  // the opening view: the gate and the first attractions, low in the frame
  function homeY() {
    return W.gateY - 90 - (usableH() / cam.zoom) * 0.2;
  }

  function resetView() {
    resize();
    // fit the park's width on a phone; on a wide screen settle for a good slice of it
    cam.zoom = clamp(Math.max(Math.min(usableW() / 1010, usableH() / 1000), usableW() / 1900), cam.minZoom, 0.85);
    cam.x = W.w / 2;
    cam.y = homeY();
    cam.tx = cam.ty = null;
    introT = -1;
    clampCam();
  }

  // Glide so plot k sits in the clear space above any open sheet.
  function focus(k) {
    if (introT >= 0) { introT = -1; cam.zoom = introTo; }
    const p = L.plots[k];
    const d = designAt(world.state, k);
    const clearBottom = vh - Math.max(insets.bottom, sheetCover);
    const wantY = (insets.top + clearBottom) / 2 + 20;
    const fits = usableW() / 2 / cam.zoom >= Math.abs(p.x - W.w / 2) + d.w / 2 + 16;
    cam.tx = fits ? W.w / 2 : p.x + (W.w / 2 - p.x) * 0.35;
    cam.ty = p.y - d.h * 0.42 - (wantY - centreY()) / cam.zoom;
  }

  // First look at the park: start pulled back and settle in.
  let introT = -1;
  let introFrom = 0;
  let introTo = 0;
  function intro() {
    resetView();
    introTo = cam.zoom;
    introFrom = Math.max(cam.minZoom, cam.zoom * 0.7);
    if (introTo - introFrom < 0.02) return;
    introT = 0;
    cam.zoom = introFrom;
    cam.y = homeY();
    clampCam();
  }

  function updateCamera(dt) {
    if (introT >= 0) {
      introT = Math.min(1, introT + dt / 1.25);
      const u = 1 - Math.pow(1 - introT, 3);
      cam.zoom = lerp(introFrom, introTo, u);
      cam.x = W.w / 2;
      cam.y = homeY();
      clampCam();
      if (introT >= 1) introT = -1;
      return;
    }
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
      introT = -1;
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
    introT = -1;
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
    for (const p of L.plots) {
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
        y: y + (Math.random() - 0.5) * (opts.spreadY ?? opts.spread ?? 10),
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
  // builders' dust rolling out from under a new stage
  const dust = (x, y, w = 120) => burst(x, y, 20, ['#f1e6cc', '#e2d2b0', '#fff8e8'], {
    up: true, speed: 70, life: 1.0, size: 13, shape: 'puff', spread: w * 0.9, spreadY: 14, gravity: -30,
  });
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
    for (let k = 0; k < pops.length; k++) if (pops[k] > 0) pops[k] = Math.max(0, pops[k] - dt * 1.7);
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
      const lit = dark > 0.3;
      switch (s.kind) {
        case 'tree': SC.drawTree(ctx, s.x, s.y, theme, s.v, s.s); break;
        case 'lamp': SC.drawLamp(ctx, s.x, s.y, lit); break;
        case 'bench': A.drawBench(ctx, s.x, s.y); break;
        case 'bunting': A.drawBunting(ctx, s.x - s.half, s.y - 72, s.x + s.half, s.y - 72, 9, time); break;
        case 'gate': A.drawGate(ctx, s.x, s.y, GAME_TITLE, time); break;
        case 'booth': A.drawTicketBooth(ctx, s.x, s.y); break;
        case 'bandstand': A.drawBandstand(ctx, s.x, s.y, time); break;
        case 'pavilion':
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.scale(1.25, 1.25);
          A.drawBandstand(ctx, 0, 0, time);
          ctx.restore();
          break;
        case 'fountain': SC.drawFountain(ctx, s.x, s.y, time); break;
        case 'bonfire': SC.drawBonfire(ctx, s.x, s.y, time); break;
        case 'fir': SC.drawFir(ctx, s.x, s.y, time); break;
        case 'topiary': SC.drawTopiary(ctx, s.x, s.y, theme); break;
        case 'boat': SC.drawBoat(ctx, s.x, s.y, time, s.hue, s.drift); break;
        case 'ducks': SC.drawDucks(ctx, s.x, s.y, time); break;
        case 'skaters': SC.drawSkaters(ctx, s.x, s.y, time); break;
        case 'buoy': SC.drawBuoy(ctx, s.x, s.y, time); break;
        case 'parasol': SC.drawParasol(ctx, s.x, s.y, s.hue); break;
        case 'bales': SC.drawBales(ctx, s.x, s.y); break;
        case 'lanterns': SC.drawLanterns(ctx, s.x, s.y, s.half, time, lit); break;
        case 'barge': {
          // barges work up and down the canal for ever
          const canal = L.water[0];
          const span = W.w + 2 * M;
          const u = (((s.t0 + (time * s.speed) / span) % 1) + 1) % 1;
          const x = -M + u * span;
          SC.drawBarge(ctx, x, canal.mid(x), time, s.hue, Math.sign(s.speed));
          break;
        }
        default: break;
      }
      return;
    }
    const k = item.k;
    const p = L.plots[k];
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
    if (pops[k] > 0) {
      // freshly built: drop in, overshoot and settle
      const u = 1 - pops[k];
      const sx = 1 + Math.sin(u * Math.PI * 3) * (1 - u) * 0.16;
      const grow = Math.min(1, u * 3.2);
      ctx.scale(sx * (0.85 + grow * 0.15), (2 - sx) * (0.55 + grow * 0.45));
    } else if (rt.pulse > 0) {
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

  // A small label on the map: dark glass, hairline edge, one accent colour.
  function pill(x, y, text, tone, size, progress = -1) {
    ctx.font = A.uiFont(size, 700);
    const w = ctx.measureText(text).width + size * 1.5;
    const h = size * 1.9;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fillStyle = tone.bg;
    ctx.fill();
    ctx.strokeStyle = tone.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (progress >= 0) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(224,190,120,0.95)';
      ctx.fillRect(x - w / 2, y + h / 2 - 2.5, w * progress, 2.5);
      ctx.restore();
    }
    ctx.fillStyle = tone.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    return w;
  }
  const TONE = {
    plain: { bg: 'rgba(14,22,34,0.82)', edge: 'rgba(224,190,120,0.45)', fg: '#f0dcae' },
    go: { bg: 'rgba(24,104,78,0.94)', edge: 'rgba(190,240,215,0.6)', fg: '#ffffff' },
    done: { bg: 'rgba(196,158,86,0.96)', edge: 'rgba(255,244,214,0.8)', fg: '#1d1608' },
    alert: { bg: 'rgba(168,44,58,0.95)', edge: 'rgba(255,214,214,0.6)', fg: '#ffffff' },
  };

  function drawOverlays() {
    const s = world.state;
    const z = cam.zoom;
    const size = clamp(8 + z * 7, 10, 13.5);
    const right = usableW();
    for (const p of L.plots) {
      const k = p.index;
      const plot = s.plots[k];
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.y);
      if (sx < -160 || sx > vw + 160 || sy < -80 || sy > vh + 320) continue;
      if (plot.stage === 0) {
        const cost = E.stageCost(s.town, k, 1);
        pill(sx, toScreenY(p.y - 6) + size, money(cost), s.coins >= cost ? TONE.go : TONE.plain, size + 1);
        continue;
      }
      const d = designAt(s, k);
      const rt = world.rt[k];
      const edge = size * 3;
      const px = clamp(toScreenX(p.x + p.side * (d.w / 2 - 44)), Math.min(edge, sx), Math.max(right - edge, sx));
      const py = toScreenY(p.y + 18) + size;
      if (plot.splat) {
        pill(px, py, 'Clean up ' + money(E.repairCost(s.town, k, plot.stage)), TONE.alert, size);
        continue;
      }
      const done = plot.stage >= STAGES;
      const can = !done && s.coins >= E.stageCost(s.town, k, plot.stage + 1);
      pill(px, py, `${can ? '▲ ' : ''}★ ${plot.stage}/${STAGES}`, can ? TONE.go : done ? TONE.done : TONE.plain, size, rt.phase === 'run' ? rt.t / rt.dur : -1);
    }
    if (pointer >= 0) {
      const p = L.plots[pointer];
      const built = s.plots[pointer].stage > 0;
      const d = designAt(s, pointer);
      const top = toScreenY(built ? p.y - d.h - 6 : p.y - 96) - 14;
      const by = top - Math.abs(Math.sin(time * 3.2)) * 10;
      const sx = toScreenX(p.x);
      ctx.beginPath();
      ctx.moveTo(sx - 12, by - 19);
      ctx.lineTo(sx + 12, by - 19);
      ctx.lineTo(sx, by);
      ctx.closePath();
      ctx.fillStyle = '#e0be78';
      ctx.fill();
      ctx.strokeStyle = '#0e1622';
      ctx.lineWidth = 2.5;
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

  // Water beyond the cached layer, so a lake or the sea runs on to the horizon.
  function drawFarWater(view) {
    for (const w of L.water) {
      const [deep, shallow] = theme.water;
      if (w.kind === 'canal') {
        ctx.fillStyle = deep;
        for (const [xa, xb] of [[view.x0, -M + 4], [W.w + M - 4, view.x1]]) {
          if (xb <= xa) continue;
          ctx.beginPath();
          ctx.moveTo(xa, w.mid(xa) - w.half);
          ctx.lineTo(xb, w.mid(xb) - w.half);
          ctx.lineTo(xb, w.mid(xb) + w.half);
          ctx.lineTo(xa, w.mid(xa) + w.half);
          ctx.fill();
        }
        continue;
      }
      const edge = w.kind === 'sea' ? w.shoreY : 250;
      if (view.y0 > edge) continue;
      const grad = ctx.createLinearGradient(0, w.span[0], 0, w.span[1]);
      grad.addColorStop(0, deep);
      grad.addColorStop(w.kind === 'sea' ? 0.72 : 1, shallow);
      if (w.kind === 'sea') grad.addColorStop(1, theme.foam);
      ctx.fillStyle = grad;
      ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, edge - view.y0);
    }
  }

  // Light on the water: glints that come and go, and surf along a beach.
  function drawWaterLife(view, dark) {
    if (glints.length) {
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = dark > 0.6 ? 'rgba(255,226,170,0.9)' : 'rgba(255,255,255,0.9)';
      for (const g of glints) {
        if (g.y < view.y0 || g.y > view.y1) continue;
        const a = 0.5 + 0.5 * Math.sin(time * 1.4 + g.ph);
        if (a < 0.15) continue;
        const x = g.x + Math.sin(time * 0.5 + g.ph) * 8;
        ctx.globalAlpha = a * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - g.l, g.y);
        ctx.lineTo(x + g.l, g.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }
    if (shore) {
      for (let k = 0; k < 2; k++) {
        const wash = Math.sin(time * 0.7 + k * 1.8);
        ctx.beginPath();
        for (let i = 0; i < shore.length; i++) {
          const [x, y] = shore[i];
          const yy = y - 6 - k * 16 + wash * (5 - k * 2) + Math.sin(x * 0.05 + time * 1.1) * 2;
          if (i) ctx.lineTo(x, yy);
          else ctx.moveTo(x, yy);
        }
        ctx.strokeStyle = `rgba(255,255,255,${k ? 0.32 : 0.75})`;
        ctx.lineWidth = k ? 2 : 4;
        ctx.stroke();
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
    const beyond = view.x0 < -M + 50 || view.x1 > W.w + M - 50 || view.y0 < -M + 110;
    if (beyond) {
      drawFarWater(view);
      // distant trees, only where the view reaches past the cached layer
      for (let gy = Math.floor(view.y0 / FAR_CELL); gy * FAR_CELL < view.y1; gy++) {
        for (let gx = Math.floor(view.x0 / FAR_CELL); gx * FAR_CELL < view.x1; gx++) {
          const hsh = cellHash(gx, gy);
          if (hsh > 0.4) continue;
          const x = (gx + ((hsh * 13.7) % 1)) * FAR_CELL;
          const y = (gy + ((hsh * 7.3) % 1)) * FAR_CELL;
          if (inTreeBand(x, y) || L.wet(x, y) || L.wet(x, y - 30)) continue;
          SC.drawTree(ctx, x, y, theme, Math.floor(hsh * 97) % 8, 0.9 + ((hsh * 31) % 1) * 0.5);
        }
      }
    }
    ctx.drawImage(ground, -M, -M, W.w + 2 * M, W.h + 2 * M);
    drawWaterLife(view, dark);

    // long evening shadows, thrown to the right of everything that stands up
    const lowSun = clamp(dark / 0.45, 0, 1);
    const shade = 0.17 * (1 - clamp((dark - 0.5) / 0.4, 0, 1) * 0.7);
    ctx.fillStyle = `rgba(14,26,40,${shade})`;
    for (const p of L.plots) {
      if (s.plots[p.index].stage === 0) continue;
      const d = designAt(s, p.index);
      const reach = d.h * (0.34 + lowSun * 0.4);
      ctx.beginPath();
      ctx.ellipse(p.x + reach * 0.5, p.y + 4 + reach * 0.07, d.w * 0.5 + reach * 0.5, 15 + reach * 0.06, 0.05, 0, TAU);
      ctx.fill();
    }

    if (selected >= 0) {
      const p = L.plots[selected];
      const d = designAt(s, selected);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 4, d.w / 2 + 14, 30, 0, 0, TAU);
      ctx.strokeStyle = `rgba(255,236,190,${0.6 + Math.sin(time * 4) * 0.25})`;
      ctx.lineWidth = 4;
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
      if (p.shape === 'puff') {
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.4), 0, TAU);
        ctx.fill();
      } else if (p.shape === 'coin') {
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
        ctx.globalAlpha = 0.16 * (1 - dark / 0.6);
        ctx.drawImage(cloud, cx - width, cy - width * 0.42, width * 2, width * 0.84);
      }
      ctx.globalAlpha = 1;
    }

    // The light. A warm wash from the sun's side at every hour, deepening to
    // gold and then to blue dusk, with the lamps coming on as it goes.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sun = ctx.createLinearGradient(0, 0, vw, vh);
    sun.addColorStop(0, `rgba(255,232,188,${0.3 + lowSun * 0.2})`);
    sun.addColorStop(0.55, 'rgba(255,240,220,0)');
    sun.addColorStop(1, `rgba(34,52,96,${0.22 + lowSun * 0.14})`);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'source-over';
    if (dark > 0.01) {
      const k = clamp(dark / 0.45, 0, 1);
      const n = clamp((dark - 0.45) / 0.55, 0, 1);
      const cr = Math.round(lerp(lerp(255, 255, k), 98, n));
      const cg = Math.round(lerp(lerp(255, 216, k), 110, n));
      const cb = Math.round(lerp(lerp(255, 182, k), 172, n));
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
        switch (sc.kind) {
          case 'lamp':
            glow(sc.x, sc.y - 56, 66, 0, 0.9 * lit);
            glow(sc.x, sc.y + 2, 120, 0, 0.5 * lit, 0.42);
            break;
          case 'gate': glow(sc.x, sc.y - 124, 160, 0, 0.5 * lit, 0.6); break;
          case 'bandstand': glow(sc.x, sc.y - 50, 130, 0, 0.6 * lit); break;
          case 'pavilion': glow(sc.x, sc.y - 60, 170, 0, 0.6 * lit); break;
          case 'bonfire': {
            const flick = 0.85 + Math.sin(time * 9) * 0.08 + Math.sin(time * 14.3) * 0.06;
            glow(sc.x, sc.y - 26, 190, 0, 0.75 * flick * Math.max(lit, 0.35));
            glow(sc.x, sc.y + 4, 240, 0, 0.3 * flick * Math.max(lit, 0.35), 0.4);
            break;
          }
          case 'fir': glow(sc.x, sc.y - 80, 130, 2, 0.4 * lit); break;
          case 'fountain': glow(sc.x, sc.y - 40, 90, 2, 0.35 * lit); break;
          case 'lanterns': glow(sc.x, sc.y - 10, 86, 0, 0.55 * lit, 0.9); break;
          case 'boat': glow(sc.x + Math.sin(time * 0.13 + sc.hue * 2) * sc.drift, sc.y - 14, 40, 0, 0.4 * lit); break;
          default: break;
        }
      }
      for (const p of L.plots) {
        if (!isOpen(s, p.index)) continue;
        const d = designAt(s, p.index);
        const stage = s.plots[p.index].stage;
        const flick = 0.9 + Math.sin(time * 5 + p.index) * 0.06;
        const strength = (0.5 + 0.06 * stage) * lit * flick;
        for (const [lx, ly, lr, tint] of A.LIGHTS[d.index]) glow(p.x + lx, p.y + ly, lr, tint, strength);
        // a pool of light spilling on to the ground in front
        glow(p.x, p.y - d.h * 0.4, Math.max(d.w, d.h) * 0.75, 0, 0.3 * lit);
        glow(p.x, p.y + 14, d.w * 0.9, 0, 0.34 * lit, 0.3);
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
    const vg = ctx.createRadialGradient(usableW() / 2, vh * 0.46, Math.min(vw, vh) * 0.36, usableW() / 2, vh * 0.46, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(10,18,30,0)');
    vg.addColorStop(1, 'rgba(10,18,30,0.34)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
    drawOverlays();
    for (const p of popups) {
      const u = p.t / 1.3;
      const x = toScreenX(p.x);
      const y = toScreenY(p.y) - u * 46;
      ctx.globalAlpha = clamp((1 - u) * 2.2, 0, 1);
      ctx.font = A.uiFont(Math.round(p.size * clamp(0.6 + cam.zoom * 0.8, 0.75, 1.2) * 1.05), 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,18,30,0.9)';
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
    dust,
    intro,
    pop: (k) => { pops[k] = 1; },
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
