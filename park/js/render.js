// Canvas renderer for the park. The ground is painted once, flat, and drawn
// receding in perspective; everything that stands up (attractions, trees,
// lamps, guests) is planted on it and scaled by its distance from the camera.
import { GAME_TITLE, PLOTS, STAGES, WORLD as W, townInfo } from './config.js';
import * as A from './art.js';
import * as SC from './scenery.js';
import * as E from './economy.js';
import { money } from './format.js';
import { layoutFor } from './layout.js';
import { designAt, isOpen, mulberry32 } from './sim.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const M = 240; // ground detail is painted this far beyond the world edge
const GROUND_SCALE = 1.25;
const FOCAL = 760; // the lens: a smaller number is a wider angle and a steeper perspective
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (u) => {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
};
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

// Trees beyond the fence are placed by a hash of their grid cell.
const FAR_CELL = 124;
const cellHash = (gx, gy) => {
  const v = Math.sin(gx * 127.1 + gy * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Everything that stands up and never moves, to be depth-sorted with the guests.
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

  // the fence, in short lengths so that each sorts properly against its neighbours
  for (const run of L.fence) {
    for (let i = 0; i < run.length - 1; i++) {
      const [xa, ya] = run[i];
      const [xb, yb] = run[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / 150));
      for (let k = 0; k < n; k++) {
        const [x1, y1] = [xa + ((xb - xa) * k) / n, ya + ((yb - ya) * k) / n];
        const [x2, y2] = [xa + ((xb - xa) * (k + 1)) / n, ya + ((yb - ya) * (k + 1)) / n];
        items.push({ kind: 'fence', x1, y1, x2, y2, x: (x1 + x2) / 2, y: Math.max(y1, y2) });
      }
    }
  }

  // woodland beyond the fence, running off into the distance
  for (let cy = Math.floor(-1000 / FAR_CELL); cy * FAR_CELL < W.h + 520; cy++) {
    for (let cx = Math.floor(-1200 / FAR_CELL); cx * FAR_CELL < W.w + 1200; cx++) {
      const hsh = cellHash(cx, cy);
      if (hsh > 0.42) continue;
      const x = (cx + ((hsh * 13.7) % 1)) * FAR_CELL;
      const y = (cy + ((hsh * 7.3) % 1)) * FAR_CELL;
      const inside = x > -24 && x < W.w + 24 && y > 30 && y < W.gateY + 58;
      const road = Math.abs(x - gx) < 96 && y > W.gateY;
      if (inside || road || L.wet(x, y) || L.wet(x, y - 30)) continue;
      items.push({ kind: 'tree', x, y, v: Math.floor(hsh * 97) % 8, s: 0.95 + ((hsh * 31) % 1) * 0.5 });
    }
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

// Everything flat: grass, water, paths, boards, gardens. Painted once per town.
function buildGround(L, theme, seed, tileCv) {
  const cv = document.createElement('canvas');
  cv.width = Math.round((W.w + 2 * M) * GROUND_SCALE);
  cv.height = Math.round((W.h + 2 * M) * GROUND_SCALE);
  const c = cv.getContext('2d');
  c.fillStyle = c.createPattern(tileCv, 'repeat');
  c.fillRect(0, 0, cv.width, cv.height);
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

  // fade the edges of the painted ground into the plain colour beyond it
  const clear = `rgba(${parseInt(theme.ground.slice(1, 3), 16)},${parseInt(theme.ground.slice(3, 5), 16)},${parseInt(theme.ground.slice(5, 7), 16)},0)`;
  c.save();
  for (let y = -M; y < W.h + M; y += 24) {
    if (L.wet(-M + 6, y + 12)) continue;
    const g = c.createLinearGradient(-M, 0, -M + 80, 0);
    g.addColorStop(0, theme.ground);
    g.addColorStop(1, clear);
    c.fillStyle = g;
    c.fillRect(-M, y, 80, 24);
  }
  for (let y = -M; y < W.h + M; y += 24) {
    if (L.wet(W.w + M - 6, y + 12)) continue;
    const g = c.createLinearGradient(W.w + M, 0, W.w + M - 80, 0);
    g.addColorStop(0, theme.ground);
    g.addColorStop(1, clear);
    c.fillStyle = g;
    c.fillRect(W.w + M - 80, y, 80, 24);
  }
  for (const [edge, dir] of [[-M, 1], [W.h + M, -1]]) {
    for (let x = -M; x < W.w + M; x += 24) {
      if (L.wet(x + 12, edge + dir * 6)) continue;
      const g = c.createLinearGradient(0, edge, 0, edge + dir * 80);
      g.addColorStop(0, theme.ground);
      g.addColorStop(1, clear);
      c.fillStyle = g;
      c.fillRect(x, Math.min(edge, edge + dir * 80), 24, 80);
    }
  }
  c.restore();
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
  // The camera looks north along the park. (x, y) is the spot on the ground at
  // the middle of the view and zoom is the scale there; pitch follows zoom.
  const cam = { x: W.w / 2, y: W.h * 0.6, zoom: 0.4, base: 0.4, tx: null, ty: null, minZoom: 0.2, maxZoom: 1.6 };
  const insets = { top: 104, bottom: 84, right: 0 };
  let vw = 300;
  let vh = 300;
  let dpr = 1;
  let time = 0;
  let town = -1;
  let theme = null;
  let ground = null;
  let groundLo = null;
  let scenery = [];
  let fixed = [];
  let L = layoutFor(world.state.town);
  let glints = [];
  let shore = null; // the sea's edge, for the surf
  let trees = []; // one painted sprite per kind of tree
  const shadows = new Map(); // attraction silhouettes, for casting shadows
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
      ground = buildGround(L, theme, seed, buildTile(theme, seed + 3, L.paved));
      // a half-size copy for the far distance, where the full one would shimmer
      groundLo = document.createElement('canvas');
      groundLo.width = Math.ceil(ground.width / 2);
      groundLo.height = Math.ceil(ground.height / 2);
      groundLo.getContext('2d').drawImage(ground, 0, 0, groundLo.width, groundLo.height);
      glints = buildGlints(L, seed + 11);
      const sea = L.water.find((w) => w.kind === 'sea');
      shore = sea ? sea.pts.filter((pt) => pt[1] > sea.shoreY - 40 && pt[0] > -700 && pt[0] < W.w + 700) : null;
      trees = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => {
        const cv = document.createElement('canvas');
        cv.width = 240;
        cv.height = 300;
        const c = cv.getContext('2d');
        c.scale(2, 2);
        SC.drawTree(c, 60, 140, theme, v, 1);
        return cv;
      });
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

  // Pulled right back, the camera looks almost straight down; at the usual
  // distance it tilts to show the park in depth; close in, it swoops low
  // enough to bring the horizon into view.
  function pitchFor(zoom) {
    const r = zoom / cam.base;
    if (r < 1) return lerp(58, 76, clamp((1 - r) / 0.3, 0, 1)) * RAD;
    return lerp(58, 28, ease((r - 1) / 2.2)) * RAD;
  }
  const view = { x: 0, cos: 0.6, sin: 0.8, Cy: 0, h: 1000, cX: 0, cY: 0, horizon: -1e6 };
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function aim() {
    const phi = pitchFor(cam.zoom);
    const d = FOCAL / cam.zoom;
    // the camera is never quite still: a slow drift from side to side lets near
    // things slide across far ones, which is most of what makes depth read
    view.x = cam.x + (calm ? 0 : Math.sin(time * 0.22) * 10);
    view.cos = Math.cos(phi);
    view.sin = Math.sin(phi);
    view.Cy = cam.y + d * view.cos;
    view.h = d * view.sin;
    view.cX = centreX();
    view.cY = centreY();
    view.horizon = view.cY - FOCAL * Math.tan(phi);
  }
  // Where a point on the ground lands on screen. The answer is left in `pt`;
  // the return value is the scale there (0 if it is behind the camera).
  const pt = { x: 0, y: 0, s: 0 };
  function proj(x, y) {
    const dy = view.Cy - y;
    const Z = dy * view.cos + view.h * view.sin;
    if (Z < 70) {
      pt.s = 0;
      return 0;
    }
    const s = FOCAL / Z;
    pt.x = view.cX + (x - view.x) * s;
    pt.y = view.cY - (dy * view.sin - view.h * view.cos) * s;
    pt.s = s;
    return s;
  }
  // The other way: the spot on the ground under a point on the screen.
  function unproj(sx, sy) {
    const t = (view.cY - sy) / FOCAL;
    const den = Math.max(0.03, view.sin - t * view.cos); // at the horizon and above: a long way off
    const dy = (view.h * (view.cos + t * view.sin)) / den;
    const Z = dy * view.cos + view.h * view.sin;
    return { x: view.x + ((sx - view.cX) * Z) / FOCAL, y: view.Cy - dy };
  }
  const toScreen = (x, y) => {
    aim();
    proj(x, y);
    return { x: pt.x, y: pt.y, s: pt.s };
  };

  function clampCam() {
    cam.zoom = clamp(cam.zoom, cam.minZoom, cam.maxZoom);
    cam.x = clamp(cam.x, 100, W.w - 100);
    // an open sheet hides the bottom of the map, so allow scrolling further down
    const hidden = Math.max(cam.tx === null ? cover : sheetCover, insets.bottom) - insets.bottom;
    cam.y = clamp(cam.y, 240, W.h - 180 + hidden / cam.zoom);
    aim();
  }

  // The camera's y that puts the road outside the gate at the foot of the view.
  function homeY() {
    const want = vh - insets.bottom - 4;
    let lo = 0;
    let hi = W.h + 900;
    for (let i = 0; i < 24; i++) {
      cam.y = (lo + hi) / 2;
      aim();
      proj(W.w / 2, W.gateY + 84);
      if (!pt.s || pt.y > want) lo = cam.y;
      else hi = cam.y;
    }
    return (lo + hi) / 2;
  }

  // The zoom at which the park sits nicely in this window.
  function fitZoom() {
    const search = (ok) => {
      let lo = 0.1;
      let hi = 1.4;
      for (let i = 0; i < 18; i++) {
        const z = (lo + hi) / 2;
        cam.zoom = z;
        cam.base = z;
        cam.x = W.w / 2;
        cam.y = homeY();
        aim();
        if (ok()) lo = z;
        else hi = z;
      }
      return lo;
    };
    // as wide as the gate row allows...
    const wide = search(() => proj(70, W.gateY - 140) && pt.x >= 0);
    // ...and no taller than the space under the counters
    const tall = search(() => proj(W.w / 2, 150) && pt.y >= insets.top + 60);
    return clamp(Math.max(Math.min(wide, tall), wide * 0.5), 0.12, 0.95);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const keep = { x: cam.x, y: cam.y, rel: cam.zoom / cam.base };
    const base = fitZoom();
    cam.base = base;
    cam.minZoom = base * 0.78;
    cam.maxZoom = Math.max(1.3, base * 3.3);
    cam.zoom = base * keep.rel;
    cam.x = keep.x;
    cam.y = keep.y;
    clampCam();
  }

  function resetView() {
    resize();
    cam.zoom = cam.base;
    cam.x = W.w / 2;
    cam.y = homeY();
    cam.tx = cam.ty = null;
    introT = -1;
    clampCam();
  }

  // Glide so plot k sits in the clear space above any open sheet.
  function focus(k) {
    if (introT >= 0) {
      introT = -1;
      cam.zoom = introTo;
    }
    const p = L.plots[k];
    const d = designAt(world.state, k);
    const clearBottom = vh - Math.max(insets.bottom, sheetCover);
    const wantY = (insets.top + clearBottom) / 2 + 26;
    const keep = { x: cam.x, y: cam.y };
    cam.x = W.w / 2;
    let lo = 0;
    let hi = W.h + 1400;
    for (let i = 0; i < 24; i++) {
      cam.y = (lo + hi) / 2;
      aim();
      proj(p.x, p.y);
      if (!pt.s || pt.y - d.h * 0.42 * pt.s > wantY) lo = cam.y;
      else hi = cam.y;
    }
    cam.ty = (lo + hi) / 2;
    cam.y = cam.ty;
    aim();
    proj(p.x, p.y);
    const fits = pt.x - (d.w / 2) * pt.s > 8 && pt.x + (d.w / 2) * pt.s < usableW() - 8;
    cam.tx = fits ? W.w / 2 : p.x + (W.w / 2 - p.x) * 0.35;
    cam.x = keep.x;
    cam.y = keep.y;
    aim();
  }

  // First look at the park: start high above it and swoop down.
  let introT = -1;
  let introFrom = 0;
  let introTo = 0;
  function intro() {
    resetView();
    introTo = cam.zoom;
    introFrom = cam.zoom * 0.72;
    cam.minZoom = Math.min(cam.minZoom, introFrom);
    introT = 0;
    cam.zoom = introFrom;
    cam.y = homeY();
    clampCam();
  }

  function updateCamera(dt) {
    if (introT >= 0) {
      introT = Math.min(1, introT + dt / 1.5);
      const u = 1 - Math.pow(1 - introT, 3);
      cam.zoom = lerp(introFrom, introTo, u);
      cam.x = W.w / 2;
      cam.y = homeY();
      clampCam();
      if (introT >= 1) {
        introT = -1;
        cam.minZoom = cam.base * 0.78;
      }
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
      // keep the ground under the finger
      aim();
      const from = unproj(drag.x, Math.max(drag.y, view.horizon + 24));
      const to = unproj(e.clientX, Math.max(e.clientY, view.horizon + 24));
      cam.x += from.x - to.x;
      cam.y += from.y - to.y;
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
    aim();
    const anchorY = Math.max(sy, view.horizon + 40);
    const before = unproj(sx, anchorY);
    cam.zoom = clamp(zoom, cam.minZoom, cam.maxZoom);
    aim();
    const after = unproj(sx, Math.max(anchorY, view.horizon + 40));
    cam.x += before.x - after.x;
    cam.y += before.y - after.y;
    cam.tx = cam.ty = null;
    clampCam();
  }

  // What is under a tap? Balloons first, then the nearest plot.
  function pick(sx, sy) {
    aim();
    for (const b of world.balloons) {
      if (!proj(b.x, b.y)) continue;
      const k = Math.max(pt.s, 0.62);
      if (Math.hypot(sx - pt.x, sy - (pt.y + 12 * k)) < Math.max(34, 36 * k) + 10) return { balloon: b };
    }
    let best = -1;
    let bestD = Infinity;
    for (const p of L.plots) {
      if (!proj(p.x, p.y)) continue;
      const built = world.state.plots[p.index].stage > 0;
      const d = designAt(world.state, p.index);
      const top = pt.y - (built ? d.h + 30 : 110) * pt.s;
      const half = (built ? d.w / 2 + 16 : 110) * pt.s;
      if (Math.abs(sx - pt.x) > half || sy < top || sy > pt.y + 34 * pt.s) continue;
      const dist = Math.abs(sy - (pt.y - 50 * pt.s)) + Math.abs(sx - pt.x) * 0.5;
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
        gy: opts.gy ?? y, // the ground row whose upright plane it flies in
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

  // Point the canvas at a spot on the ground so that whatever is drawn there,
  // in world coordinates, stands up at the right place and size.
  function plant(x, y, reach = 200, tall = 320) {
    const s = proj(x, y);
    if (!s || s < 0.04) return false;
    if (pt.y < -12 || pt.y - tall * s > vh || pt.x + reach * s < 0 || pt.x - reach * s > vw) return false;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (pt.x - x * s), dpr * (pt.y - y * s));
    return true;
  }
  const flat = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // The dark outline of an attraction, kept for throwing its shadow.
  function silhouette(d) {
    let sil = shadows.get(d.index);
    if (!sil) {
      const cv = document.createElement('canvas');
      cv.width = d.w + 80;
      cv.height = d.h + 70;
      const c = cv.getContext('2d');
      c.translate(d.w / 2 + 40, d.h + 50);
      A.drawAttraction(c, d.index, { t: 0.4, anim: 0.6, run: false, p: 0, riders: 0 });
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#0c1826';
      c.fillRect(0, 0, cv.width, cv.height);
      sil = { cv, ox: d.w / 2 + 40, oy: d.h + 50 };
      shadows.set(d.index, sil);
    }
    return sil;
  }

  function drawFence(f) {
    flat();
    const n = Math.max(1, Math.round(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 30));
    let [px, py, ps] = [0, 0, 0];
    ctx.fillStyle = theme.fence;
    ctx.strokeStyle = theme.fence;
    for (let k = 0; k <= n; k++) {
      const s = proj(f.x1 + ((f.x2 - f.x1) * k) / n, f.y1 + ((f.y2 - f.y1) * k) / n);
      if (!s || pt.y < -20 || pt.y > vh + 40) {
        ps = 0;
        continue;
      }
      if (ps) {
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        ctx.moveTo(px, py - 12 * ps);
        ctx.lineTo(pt.x, pt.y - 12 * s);
        ctx.moveTo(px, py - 6 * ps);
        ctx.lineTo(pt.x, pt.y - 6 * s);
        ctx.stroke();
      }
      ctx.fillRect(pt.x - 2.5 * s, pt.y - 16 * s, 5 * s, 17 * s);
      [px, py, ps] = [pt.x, pt.y, s];
    }
  }

  // Paper lanterns strung from one bank of the canal to the other.
  function drawLanterns(it, lit) {
    if (!proj(it.x - 14, it.y - it.half - 12)) return;
    const a = { x: pt.x, y: pt.y, s: pt.s };
    if (!proj(it.x + 14, it.y + it.half + 12)) return;
    const b = { x: pt.x, y: pt.y, s: pt.s };
    if (b.y < -40 || a.y > vh + 80) return;
    flat();
    ctx.strokeStyle = '#27343f';
    for (const q of [a, b]) {
      ctx.lineWidth = 2.6 * q.s;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x, q.y - 36 * q.s);
      ctx.stroke();
    }
    const [ay, by] = [a.y - 36 * a.s, b.y - 36 * b.s];
    const mx = (a.x + b.x) / 2;
    const my = (ay + by) / 2 + 16 * b.s;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(30,40,50,0.7)';
    ctx.beginPath();
    ctx.moveTo(a.x, ay);
    ctx.quadraticCurveTo(mx, my, b.x, by);
    ctx.stroke();
    const cols = ['#e2572b', '#f7b733', '#e06a8a', '#f08a2c'];
    for (let k = 1; k <= 4; k++) {
      const u = k / 5;
      const s = lerp(a.s, b.s, u);
      const lx = (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x + Math.sin(time * 1.2 + k) * 1.2 * s;
      const ly = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by + 5 * s;
      if (lit) {
        ctx.fillStyle = 'rgba(255,190,110,0.28)';
        ctx.beginPath();
        ctx.arc(lx, ly, 9 * s, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = cols[k % 4];
      ctx.beginPath();
      ctx.ellipse(lx, ly, 4.6 * s, 6 * s, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#27343f';
      ctx.fillRect(lx - 2.4 * s, ly - 7 * s, 4.8 * s, 2 * s);
    }
  }

  function drawFixed(item, dark) {
    const s = item.s;
    if (s) {
      const lit = dark > 0.3;
      if (s.kind === 'tree') {
        // trees are stamped from a painted sprite: there are a lot of them
        if (!plant(s.x, s.y, 60, 150)) return;
        ctx.drawImage(trees[s.v], s.x - 60 * s.s, s.y - 140 * s.s, 120 * s.s, 150 * s.s);
        return;
      }
      if (s.kind === 'fence') return drawFence(s);
      if (s.kind === 'lanterns') return drawLanterns(s, lit);
      if (s.kind === 'barge') {
        // barges work up and down the canal for ever
        const canal = L.water[0];
        const span = W.w + 2 * M;
        const u = (((s.t0 + (time * s.speed) / span) % 1) + 1) % 1;
        const x = -M + u * span;
        if (plant(x, canal.mid(x), 80, 60)) SC.drawBarge(ctx, x, canal.mid(x), time, s.hue, Math.sign(s.speed));
        return;
      }
      if (!plant(s.x, s.y, 180, 260)) return;
      switch (s.kind) {
        case 'lamp': SC.drawLamp(ctx, s.x, s.y, lit); break;
        case 'bench': A.drawBench(ctx, s.x, s.y); break;
        case 'bunting': A.drawBunting(ctx, s.x - s.half, s.y - 72, s.x + s.half, s.y - 72, 9, time); break;
        case 'gate': A.drawGate(ctx, s.x, s.y, GAME_TITLE, time); break;
        case 'booth': A.drawTicketBooth(ctx, s.x, s.y); break;
        case 'bandstand': A.drawBandstand(ctx, s.x, s.y, time); break;
        case 'pavilion':
          ctx.translate(s.x, s.y);
          ctx.scale(1.25, 1.25);
          A.drawBandstand(ctx, 0, 0, time);
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
        default: break;
      }
      return;
    }
    const k = item.k;
    const p = L.plots[k];
    if (!plant(p.x, p.y, 240, 340)) return;
    const plot = world.state.plots[k];
    if (plot.stage === 0) {
      A.drawForSale(ctx, p.x, p.y - 28, world.state.coins >= E.stageCost(world.state.town, k, 1) ? 'afford' : 'open');
      return;
    }
    const d = designAt(world.state, k);
    const rt = world.rt[k];
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
    const right = usableW();
    for (const p of L.plots) {
      const k = p.index;
      const plot = s.plots[k];
      const d = designAt(s, k);
      if (!proj(plot.stage === 0 ? p.x : p.x + p.side * (d.w / 2 - 44), p.y)) continue;
      const size = clamp(7 + pt.s * 10, 9.5, 14);
      const sx = pt.x;
      if (sx < -160 || sx > vw + 160 || pt.y < -80 || pt.y > vh + 320) continue;
      if (plot.stage === 0) {
        const cost = E.stageCost(s.town, k, 1);
        pill(sx, pt.y - 6 * pt.s + size, money(cost), s.coins >= cost ? TONE.go : TONE.plain, size + 1);
        continue;
      }
      const rt = world.rt[k];
      const edge = size * 3;
      const px = clamp(sx, edge, Math.max(right - edge, edge));
      const py = pt.y + 18 * pt.s + size;
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
      if (proj(p.x, p.y)) {
        const built = s.plots[pointer].stage > 0;
        const d = designAt(s, pointer);
        const top = pt.y - (built ? d.h + 6 : 96) * pt.s - 14;
        const by = top - Math.abs(Math.sin(time * 3.2)) * 10;
        const sx = pt.x;
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

  // The sky, when the camera is low enough to see it, and the plain colour of
  // the land (or water) that runs off to the horizon.
  function drawBackdrop(dark) {
    flat();
    const hz = clamp(view.horizon, -1, vh);
    const gold = clamp(dark / 0.45, 0, 1);
    const mix = (a, b) => Math.round(lerp(a, b, gold));
    const low = `rgb(${mix(214, 255)},${mix(232, 214)},${mix(238, 176)})`;
    if (hz > 0) {
      const sky = ctx.createLinearGradient(0, hz - Math.max(240, hz), 0, hz);
      sky.addColorStop(0, `rgb(${mix(84, 70)},${mix(150, 104)},${mix(204, 168)})`);
      sky.addColorStop(1, low);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, vw, hz + 1);
      // the sun, low to the left
      const sunX = vw * 0.22 - cam.x * 0.02;
      const sunY = hz - 26 - (1 - gold) * 60;
      const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 150);
      halo.addColorStop(0, 'rgba(255,244,210,0.95)');
      halo.addColorStop(0.12, 'rgba(255,236,190,0.7)');
      halo.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
      // far hills, sliding a little as the camera moves
      for (const [lift, amp, alpha, drift] of [[26, 16, 0.45, 0.05], [12, 10, 0.75, 0.09]]) {
        ctx.beginPath();
        ctx.moveTo(0, hz + 1);
        for (let x = 0; x <= vw + 24; x += 24) {
          const u = (x + cam.x * drift) * 0.006;
          ctx.lineTo(x, hz - lift - Math.sin(u) * amp - Math.sin(u * 2.7 + 1) * amp * 0.5);
        }
        ctx.lineTo(vw, hz + 1);
        ctx.closePath();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.weather === 'snow' ? '#c9d6e4' : '#6f8f8a';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, Math.max(0, hz), vw, vh - Math.max(0, hz));
    // open water carries on to the horizon
    for (const w of L.water) {
      const [deep] = theme.water;
      ctx.fillStyle = deep;
      if (w.kind === 'canal') {
        for (const [xa, xb] of [[-1500, -M + 6], [W.w + M - 6, W.w + 1500]]) {
          const corners = [[xa, w.mid(xa) - w.half], [xb, w.mid(xb) - w.half], [xb, w.mid(xb) + w.half], [xa, w.mid(xa) + w.half]];
          ctx.beginPath();
          let ok = true;
          for (const [x, y] of corners) {
            if (!proj(x, y)) ok = false;
            ctx.lineTo(pt.x, pt.y);
          }
          if (ok) ctx.fill();
        }
        continue;
      }
      if (proj(view.x, w.kind === 'sea' ? w.shoreY - 14 : 250) && pt.y > hz) ctx.fillRect(0, Math.max(0, hz), vw, pt.y - Math.max(0, hz));
    }
    return low;
  }

  // The painted ground, laid down in thin strips: each a little wider than the
  // one behind it, which is all perspective is.
  function drawGround() {
    flat();
    let r = Math.max(0, Math.ceil(view.horizon) + 1);
    const rowAt = (sy) => {
      const t = (view.cY - sy) / FOCAL;
      const den = view.sin - t * view.cos;
      return den > 0.004 ? (view.h * (view.cos + t * view.sin)) / den : Infinity;
    };
    while (r < vh) {
      const dy0 = rowAt(r);
      let step = 2;
      let dy1 = rowAt(r + step);
      if (dy0 - dy1 > 9) {
        step = 1;
        dy1 = rowAt(r + 1);
      }
      const ya = view.Cy - dy0; // the far edge of this strip, in the world
      const yb = view.Cy - dy1;
      if (!(yb > -M)) {
        r += step;
        continue;
      }
      if (ya >= W.h + M) break;
      const s = FOCAL / (((dy0 + dy1) / 2) * view.cos + view.h * view.sin);
      const xl = Math.max(view.x - view.cX / s, -M);
      const xr = Math.min(view.x + (vw - view.cX) / s, W.w + M);
      if (xr > xl) {
        const y0 = Math.max(ya, -M);
        const y1 = Math.min(yb, W.h + M);
        const far = (yb - ya) * GROUND_SCALE > step * dpr * 1.7;
        const k = far ? GROUND_SCALE / 2 : GROUND_SCALE;
        const top = r + ((y0 - ya) / (yb - ya)) * step;
        const bot = r + ((y1 - ya) / (yb - ya)) * step;
        ctx.drawImage(far ? groundLo : ground, (xl + M) * k, (y0 + M) * k, (xr - xl) * k, Math.max(0.5, y1 - y0) * k, view.cX + (xl - view.x) * s, top, (xr - xl) * s, bot - top + 0.7);
      }
      r += step;
    }
  }

  // Light on the water: glints that come and go, and surf along a beach.
  function drawWaterLife(dark) {
    flat();
    if (glints.length) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = dark > 0.6 ? 'rgba(255,226,170,0.9)' : 'rgba(255,255,255,0.9)';
      for (const g of glints) {
        const a = 0.5 + 0.5 * Math.sin(time * 1.4 + g.ph);
        if (a < 0.15 || !proj(g.x + Math.sin(time * 0.5 + g.ph) * 8, g.y) || pt.y < 0 || pt.y > vh) continue;
        ctx.globalAlpha = a * 0.5;
        ctx.lineWidth = Math.max(1, 1.8 * pt.s);
        ctx.beginPath();
        ctx.moveTo(pt.x - g.l * pt.s, pt.y);
        ctx.lineTo(pt.x + g.l * pt.s, pt.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }
    if (shore) {
      for (let k = 0; k < 2; k++) {
        const wash = Math.sin(time * 0.7 + k * 1.8);
        ctx.beginPath();
        let started = false;
        let s = 0.4;
        for (const [x, y] of shore) {
          if (!proj(x, y - 6 - k * 16 + wash * (5 - k * 2) + Math.sin(x * 0.05 + time * 1.1) * 2)) continue;
          if (started) ctx.lineTo(pt.x, pt.y);
          else ctx.moveTo(pt.x, pt.y);
          started = true;
          s = pt.s;
        }
        ctx.strokeStyle = `rgba(255,255,255,${k ? 0.32 : 0.75})`;
        ctx.lineWidth = (k ? 2 : 4) * Math.max(0.5, s * 1.6);
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
    aim();

    const s = world.state;
    const dark = darkness(s.clock);
    const lowSun = clamp(dark / 0.45, 0, 1);

    const haze = drawBackdrop(dark);
    drawGround();
    // distance softens everything towards the horizon
    if (view.horizon > -200) {
      const hz = Math.max(0, view.horizon);
      const fog = ctx.createLinearGradient(0, hz, 0, hz + 130);
      fog.addColorStop(0, haze);
      fog.addColorStop(1, haze.replace('rgb(', 'rgba(').replace(')', ',0)'));
      ctx.fillStyle = fog;
      ctx.globalAlpha = 0.8;
      ctx.fillRect(0, hz, vw, 130);
      ctx.globalAlpha = 1;
    }
    drawWaterLife(dark);

    // every attraction throws a shadow of its own shape, longer as the sun drops
    const shade = 0.26 * (1 - clamp((dark - 0.5) / 0.4, 0, 1) * 0.75);
    for (const p of L.plots) {
      if (s.plots[p.index].stage === 0 || !plant(p.x, p.y, 420, 120)) continue;
      const d = designAt(s, p.index);
      const sil = silhouette(d);
      ctx.translate(p.x, p.y + 2);
      ctx.transform(1, 0, -(0.55 + lowSun * 0.6), 0.24 * view.sin, 0, 0);
      ctx.globalAlpha = shade;
      ctx.drawImage(sil.cv, -sil.ox, -sil.oy);
    }
    ctx.globalAlpha = 1;

    if (selected >= 0) {
      const p = L.plots[selected];
      const d = designAt(s, selected);
      if (proj(p.x, p.y - 4)) {
        flat();
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, (d.w / 2 + 14) * pt.s, 34 * pt.s * view.sin, 0, 0, TAU);
        ctx.strokeStyle = `rgba(255,236,190,${0.6 + Math.sin(time * 4) * 0.25})`;
        ctx.lineWidth = 3.5;
        ctx.setLineDash([12, 9]);
        ctx.lineDashOffset = -time * 30;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // everything that stands up, from the back of the park to the front
    sorted.length = 0;
    for (const g of world.guests) if (g.alpha > 0.02) sorted.push(g);
    sorted.sort((p, q) => p.y - q.y);
    let gi = 0;
    const drawGuestAt = (g) => {
      if (!plant(g.x, g.y, 30, 60)) return;
      const fade = g.mode === 'leave' ? clamp((W.spawnY + 40 - g.y) / 34, 0, 1) : 1;
      const al = g.alpha * fade;
      if (al < 1) ctx.globalAlpha = al;
      A.drawGuest(ctx, g, time);
      if (al < 1) ctx.globalAlpha = 1;
    };
    for (const item of fixed) {
      while (gi < sorted.length && sorted[gi].y <= item.y) drawGuestAt(sorted[gi++]);
      drawFixed(item, dark);
    }
    while (gi < sorted.length) drawGuestAt(sorted[gi++]);

    for (const g of sorted) {
      if (g.emoteT > 0 && g.emote && plant(g.x, g.y, 30, 90)) {
        const u = 1 - g.emoteT / 1.5;
        A.drawEmote(ctx, g.emote, g.x, g.y - 44 - u * 12, clamp(g.emoteT * 3, 0, 1) * g.alpha);
      }
    }

    // particles fly in the upright plane they were thrown from
    flat();
    for (const p of particles) {
      const sc = proj(p.x, p.gy);
      if (!sc) continue;
      const [x, y, size] = [pt.x, pt.y + (p.y - p.gy) * sc, p.size * sc * 1.25];
      const a = clamp(1 - p.t / p.life, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      if (p.shape === 'puff') {
        ctx.globalAlpha = a * 0.55;
        ctx.beginPath();
        ctx.arc(x, y, size * (1 + (1 - a) * 1.4), 0, TAU);
        ctx.fill();
      } else if (p.shape === 'coin') {
        ctx.beginPath();
        ctx.ellipse(x, y, size * Math.abs(Math.cos(p.rot)) + 1, size, 0, 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillRect(-size / 2, -size / 3, size, size * 0.66);
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
        if (!proj(cx, cy)) continue;
        const [rw, rh] = [width * pt.s, width * 0.42 * pt.s * view.sin];
        if (pt.x + rw < 0 || pt.x - rw > vw || pt.y + rh < 0 || pt.y - rh > vh) continue;
        ctx.globalAlpha = 0.16 * (1 - dark / 0.6);
        ctx.drawImage(cloud, pt.x - rw, pt.y - rh, rw * 2, rh * 2);
      }
      ctx.globalAlpha = 1;
    }

    // The light. A warm wash from the sun's side at every hour, deepening to
    // gold and then to blue dusk, with the lamps coming on as it goes.
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
      // a light `up` above the ground at (x, y)
      const glow = (x, y, up, r, tint, a, squash = 1) => {
        const sc = proj(x, y);
        if (!sc) return;
        const [gx, gy, gr] = [pt.x, pt.y - up * sc, r * sc];
        if (gx < -gr || gx > vw + gr || gy < -gr || gy > vh + gr) return;
        ctx.globalAlpha = a * clamp(0.62 / sc, 0.4, 1);
        ctx.drawImage(glows[tint], gx - gr, gy - gr * squash, gr * 2, gr * 2 * squash);
      };
      const lit = clamp((dark - 0.25) / 0.5, 0, 1);
      const lie = 0.5 * view.sin; // how flat a pool of light on the ground looks from here
      for (const sc of scenery) {
        switch (sc.kind) {
          case 'lamp':
            glow(sc.x, sc.y, 56, 66, 0, 0.9 * lit);
            glow(sc.x, sc.y, -2, 120, 0, 0.5 * lit, lie);
            break;
          case 'gate': glow(sc.x, sc.y, 124, 160, 0, 0.5 * lit, 0.6); break;
          case 'bandstand': glow(sc.x, sc.y, 50, 130, 0, 0.6 * lit); break;
          case 'pavilion': glow(sc.x, sc.y, 60, 170, 0, 0.6 * lit); break;
          case 'bonfire': {
            const flick = 0.85 + Math.sin(time * 9) * 0.08 + Math.sin(time * 14.3) * 0.06;
            glow(sc.x, sc.y, 26, 190, 0, 0.75 * flick * Math.max(lit, 0.35));
            glow(sc.x, sc.y, -4, 240, 0, 0.3 * flick * Math.max(lit, 0.35), lie);
            break;
          }
          case 'fir': glow(sc.x, sc.y, 80, 130, 2, 0.4 * lit); break;
          case 'fountain': glow(sc.x, sc.y, 40, 90, 2, 0.35 * lit); break;
          case 'lanterns': glow(sc.x, sc.y, 22, 86, 0, 0.55 * lit, 0.9); break;
          case 'boat': glow(sc.x + Math.sin(time * 0.13 + sc.hue * 2) * sc.drift, sc.y, 14, 40, 0, 0.4 * lit); break;
          default: break;
        }
      }
      for (const p of L.plots) {
        if (!isOpen(s, p.index)) continue;
        const d = designAt(s, p.index);
        const stage = s.plots[p.index].stage;
        const flick = 0.9 + Math.sin(time * 5 + p.index) * 0.06;
        const strength = (0.5 + 0.06 * stage) * lit * flick;
        for (const [lx, ly, lr, tint] of A.LIGHTS[d.index]) glow(p.x + lx, p.y, -ly, lr, tint, strength);
        // a pool of light spilling on to the ground in front
        glow(p.x, p.y, d.h * 0.4, Math.max(d.w, d.h) * 0.75, 0, 0.3 * lit);
        glow(p.x, p.y, -14, d.w * 0.9, 0, 0.34 * lit, lie);
        if (stage >= 3) glow(p.x, p.y, 140, d.w * 0.7, 1, 0.3 * lit, 0.35);
      }
      ctx.globalAlpha = 1;
      // stars come out over the hills
      if (view.horizon > 8 && dark > 0.6) {
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 46; k++) {
          const sx = (cellHash(k, 3) * 1.3 * vw - cam.x * 0.01 + vw) % vw;
          const sy = cellHash(k, 9) * (view.horizon - 30);
          ctx.globalAlpha = (0.35 + 0.5 * cellHash(k, 5)) * (0.7 + 0.3 * Math.sin(time * 2 + k)) * clamp((dark - 0.6) / 0.3, 0, 1);
          ctx.fillRect(sx, sy, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // balloons float above the lighting so they are always easy to spot
    for (const b of world.balloons) {
      if (!plant(b.x, b.y, 80, 120)) continue;
      const k = Math.max(1, 0.62 / pt.s);
      ctx.translate(b.x, b.y);
      ctx.scale(k, k);
      A.drawBalloon(ctx, 0, 0, b.color, b.t);
    }

    // screen space from here on
    flat();
    // a soft vignette pulls the eye to the middle of the park
    const vg = ctx.createRadialGradient(usableW() / 2, vh * 0.46, Math.min(vw, vh) * 0.36, usableW() / 2, vh * 0.46, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(10,18,30,0)');
    vg.addColorStop(1, 'rgba(10,18,30,0.34)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
    drawOverlays();
    for (const p of popups) {
      if (!proj(p.x, p.y)) continue;
      const u = p.t / 1.3;
      const [x, y] = [pt.x, pt.y - u * 46];
      ctx.globalAlpha = clamp((1 - u) * 2.2, 0, 1);
      ctx.font = A.uiFont(Math.round(p.size * clamp(0.5 + pt.s * 1.1, 0.75, 1.25) * 1.05), 800);
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
    toScreen,
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
