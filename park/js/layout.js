// Park layouts. Each kind of town has its own map: where the promenades run,
// where the six plots sit, where the water is. Everything else (the ground
// painter, the guests' routes, the lamps) is worked out from this description.
// No DOM in here, so the simulation and the tests can use it headless.
import { WORLD as W, townInfo } from './config.js';

const CX = W.w / 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// A smooth curve through the given points (Catmull-Rom), as a dense polyline.
export function smooth(points, closed = false, step = 12) {
  const n = points.length;
  if (n < 3 && !closed) {
    const [a, b] = points;
    const len = dist(a[0], a[1], b[0], b[1]);
    const k = Math.max(1, Math.round(len / step));
    return Array.from({ length: k + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / k, a[1] + ((b[1] - a[1]) * i) / k]);
  }
  const at = (i) => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const k = Math.max(1, Math.round(dist(p1[0], p1[1], p2[0], p2[1]) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}

// The same polyline with points every `step` along it, corners kept sharp.
function dense(points, step = 12) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const k = Math.max(1, Math.round(dist(a[0], a[1], b[0], b[1]) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  out.push(points[points.length - 1].slice());
  return out;
}

const ellipse = (cx, cy, rx, ry, n = 28) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + Math.PI / 2; // start at the bottom
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
});

export function inPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The point a given distance along a polyline (running on past the end).
export function along(pts, d) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = dist(ax, ay, bx, by);
    if (d <= len || i === pts.length - 2) {
      const t = len ? d / len : 0;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    d -= len;
  }
  return { x: pts[0][0], y: pts[0][1] };
}

// ---- building a layout --------------------------------------------------------

function builder(key) {
  const L = {
    key,
    gate: { x: CX, y: W.gateY },
    plots: [],
    paths: [], // { pts, w, kind } for the ground painter
    water: [], // { pts, kind, ... }
    decks: [], // { x, y, w, h, r } raised boards over water
    bridges: [], // { x, y, w, len, angle }
    props: [], // fixed scenery: { kind, x, y, ... }
    beds: [], // flower beds: { x, y, rx, ry }
    fence: [], // polylines
    nodes: [],
    links: [],
    feature: null,
  };
  const ends = [];

  // A walkway. Guests can use it and the ground painter paves it.
  L.path = (points, opts = {}) => {
    const pts = opts.straight ? dense(points) : smooth(points, !!opts.closed);
    const path = { pts, w: opts.w || 58, kind: opts.kind || 'main', closed: !!opts.closed };
    L.paths.push(path);
    if (opts.walk === false) return path;
    const id = L.paths.length - 1;
    let prev = -1;
    let first = -1;
    const stride = 4;
    for (let i = 0; i < pts.length; i += stride) {
      const j = !opts.closed && i + stride >= pts.length ? pts.length - 1 : i;
      const node = { x: pts[j][0], y: pts[j][1], path: id };
      L.nodes.push(node);
      L.links.push([]);
      const k = L.nodes.length - 1;
      if (prev >= 0) link(prev, k);
      else first = k;
      prev = k;
      if (j !== i) break;
    }
    if (opts.closed) link(prev, first);
    else ends.push(first, prev);
    return path;
  };
  const link = (a, b) => {
    if (a === b || L.links[a].includes(b)) return;
    L.links[a].push(b);
    L.links[b].push(a);
  };

  // A plot, with the line its queue stands along (front of the queue first).
  L.plot = (x, y, side, queue, opts = {}) => {
    const q = queue || [[x - side * 128, y + 10], [x - side * 286, y + 10]];
    L.plots.push({ index: L.plots.length, x, y, side, q });
    // the paved run from the plot out to the promenade
    if (opts.spur !== false) {
      const sx = x - side * 96;
      const ex = opts.spurTo ?? q[q.length > 2 ? 1 : q.length - 1][0] - side * 22;
      L.path([[sx, y + 21], [ex, y + 21]], { w: 58, kind: opts.kind || 'spur', straight: true });
    }
  };

  L.finish = () => {
    const N = L.nodes;
    // join each path's ends to whatever walkway it meets, and paths that cross
    const near = (k, reach) => {
      let best = -1;
      let bd = reach;
      for (let j = 0; j < N.length; j++) {
        if (N[j].path === N[k].path) continue;
        const d = dist(N[k].x, N[k].y, N[j].x, N[j].y);
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      if (best >= 0) link(k, best);
    };
    for (const k of ends) near(k, 46);
    for (let k = 0; k < N.length; k++) near(k, 30);
    // shortest routes between every pair of nodes (the graph is tiny)
    const n = N.length;
    const D = Array.from({ length: n }, () => new Float32Array(n).fill(1e9));
    const next = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
    for (let a = 0; a < n; a++) {
      D[a][a] = 0;
      next[a][a] = a;
      for (const b of L.links[a]) {
        D[a][b] = dist(N[a].x, N[a].y, N[b].x, N[b].y);
        next[a][b] = b;
      }
    }
    for (let k = 0; k < n; k++) {
      const Dk = D[k];
      for (let a = 0; a < n; a++) {
        const Da = D[a];
        const dak = Da[k];
        if (dak >= 1e9) continue;
        for (let b = 0; b < n; b++) {
          const v = dak + Dk[b];
          if (v < Da[b]) {
            Da[b] = v;
            next[a][b] = next[a][k];
          }
        }
      }
    }
    L.next = next;
    L.gateNode = nearestNode(L, L.gate.x, L.gate.y);
    // open water or ice, not counting the boards and islands that stand in it
    L.wet = (x, y) => L.water.some((w) => inPolygon(w.pts, x, y))
      && !L.decks.some((d) => x > d.x - 8 && x < d.x + d.w + 8 && y > d.y - 8 && y < d.y + d.h + 8)
      && !(L.island && ((x - L.island.x) / (L.island.rx + 6)) ** 2 + ((y - L.island.y) / (L.island.ry + 6)) ** 2 < 1)
      && !(L.head && dist(x, y, L.head.x, L.head.y) < L.head.r + 6);
    L.onPath = (x, y, pad = 0) => {
      for (const p of L.paths) {
        const reach = p.w / 2 + pad;
        for (let i = 0; i < p.pts.length; i += 2) if (dist(x, y, p.pts[i][0], p.pts[i][1]) < reach + 8) return true;
      }
      return false;
    };
    L.onPlot = (x, y, pad = 0) => L.plots.some((p) => x > p.x - 150 - pad && x < p.x + 150 + pad && y > p.y - 124 - pad && y < p.y + 40 + pad);
    delete L.path;
    delete L.plot;
    delete L.finish;
    return L;
  };
  return L;
}

export function nearestNode(L, x, y) {
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < L.nodes.length; k++) {
    const d = (L.nodes[k].x - x) ** 2 + (L.nodes[k].y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

// Node indices from a to b along the walkways.
export function nodeRoute(L, a, b) {
  const out = [a];
  let guard = 0;
  while (a !== b && guard++ < 400) {
    a = L.next[a][b];
    if (a < 0) break;
    out.push(a);
  }
  return out;
}

// ---- the maps -------------------------------------------------------------------

const AVE = 30; // half the avenue's width

// The two plots that flank the avenue just inside the gate, in every town.
function gateRow(L, y = 1240, kind) {
  L.plot(CX - 316, y, -1, [[CX - 188, y + 10], [CX - AVE, y + 10]], { kind });
  L.plot(CX + 316, y, 1, [[CX + 188, y + 10], [CX + AVE, y + 10]], { kind });
}

// A promenade looping round a formal garden, with a lake (or an orchard)
// across the top of the park.
function ring(key, opts) {
  const L = builder(key);
  const cy = 830;
  const rx = 196;
  const ry = 300;
  L.path([[CX, W.gateY + 70], [CX, W.gateY], [CX, 1250], [CX, cy + ry]], { w: 64, straight: true });
  L.path(ellipse(CX, cy, rx, ry), { closed: true, w: 60 });
  // along the shore, tangent to the top of the loop
  L.path([[330, 492], [430, 520], [CX, cy - ry], [650, 520], [750, 492]], { w: 56 });
  gateRow(L);
  // the middle pair stand outside the loop; their queues trail down its outer edge
  for (const s of [-1, 1]) {
    const px = CX + s * 352;
    L.plot(px, 850, s, [[px - s * 128, 860], [CX + s * (rx + 18), 862], [CX + s * (rx + 2), 926], [CX + s * (rx - 26), 1004]], { spurTo: CX + s * (rx - 4) });
  }
  // the top pair face the water
  for (const s of [-1, 1]) {
    const px = CX + s * 316;
    L.plot(px, 470, s, [[px - s * 128, 480], [CX + s * 110, 500], [CX + s * 40, 514]], { spurTo: CX + s * 150 });
  }

  L.garden = { x: CX, y: cy, rx: rx - 46, ry: ry - 46 };
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.beds.push({ x: CX + dx * 62, y: cy + dy * 118, rx: 40, ry: 66 });
  L.feature = { kind: opts.centre, x: CX, y: cy + 14 };
  L.props.push({ kind: opts.centre, x: CX, y: cy + 14 });
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.props.push({ kind: 'topiary', x: CX + dx * 112, y: cy + dy * 198 });

  if (opts.lake) {
    const shore = [[-1600, -1400], [W.w + 1600, -1400], [W.w + 1600, 214], [W.w + 320, 214], [W.w - 40, 262], [930, 250], [770, 284], [700, 392], [640, 452], [CX, 470], [440, 452], [380, 392], [310, 284], [150, 250], [40, 262], [-320, 214], [-1600, 214]];
    L.water.push({ kind: opts.frozen ? 'ice' : 'lake', pts: smooth(shore, true, 18), frozen: !!opts.frozen, sparkle: [CX, 230, 520, 200] });
    L.island = { x: CX, y: 236, rx: 104, ry: 62 };
    L.bridges.push({ x: CX, y: 402, w: 34, len: 150, angle: Math.PI / 2 });
    L.props.push({ kind: 'bandstand', x: CX, y: 262 });
    if (!opts.frozen) {
      L.props.push({ kind: 'boat', x: 250, y: 190, drift: 26, hue: 0 }, { kind: 'boat', x: 850, y: 150, drift: 34, hue: 1 }, { kind: 'ducks', x: 690, y: 330 });
    } else {
      L.props.push({ kind: 'skaters', x: 250, y: 190 }, { kind: 'skaters', x: 840, y: 170 });
    }
    L.fence.push([[18, 280], [18, W.gateY + 8], [CX - 104, W.gateY + 8]], [[CX + 104, W.gateY + 8], [W.w - 18, W.gateY + 8], [W.w - 18, 280]]);
  } else {
    // no water here: a bandstand on its own lawn, ringed by an orchard
    L.path([[CX, cy - ry], [CX, 300]], { w: 52, straight: true });
    L.plaza = { x: CX, y: 262, rx: 150, ry: 78 };
    L.props.push({ kind: 'bandstand', x: CX, y: 250 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const x = 90 + col * 180 + (row ? 90 : 0);
        if (Math.abs(x - CX) < 190) continue;
        L.props.push({ kind: 'tree', x, y: 150 + row * 92, v: (col + row) % 8, s: 1 });
      }
    }
    for (const s of [-1, 1]) L.props.push({ kind: 'bales', x: CX + s * 250, y: 300 });
    L.fence.push([[CX - 104, W.gateY + 8], [18, W.gateY + 8], [18, 60], [W.w - 18, 60], [W.w - 18, W.gateY + 8], [CX + 104, W.gateY + 8]]);
  }
  L.lampPaths = [0, 1, 2];
  return L.finish();
}

// A seafront: two plots on the sand, four out on the arms of a pier.
function pier(key) {
  const L = builder(key);
  const shoreY = 1030;
  L.path([[CX, W.gateY + 70], [CX, W.gateY], [CX, 1250], [CX, 1092]], { w: 64, straight: true });
  L.path([[96, 1092], [W.w - 96, 1092]], { w: 62, kind: 'esplanade', straight: true });
  L.path([[CX, 1092], [CX, 250]], { w: 92, kind: 'board', straight: true });
  gateRow(L);
  const arms = [[-1, 890], [1, 770], [-1, 560], [1, 440]];
  for (const [s, y] of arms) {
    const px = CX + s * 316;
    L.plot(px, y, s, [[px - s * 128, y + 10], [CX + s * 46, y + 10]], { kind: 'board', spurTo: CX + s * 40 });
    L.decks.push({ x: px - 150, y: y - 212, w: 300, h: 256, r: 16 });
    L.decks.push({ x: Math.min(px - s * 150, CX + s * 40), y: y - 10, w: Math.abs(px - s * 150 - (CX + s * 40)), h: 62, r: 6 });
  }
  L.decks.push({ x: CX - 46, y: 250, w: 92, h: 1092 - 250 - 30, r: 4, spine: true });
  L.head = { x: CX, y: 232, r: 132 };
  L.props.push({ kind: 'pavilion', x: CX, y: 262 });
  const sea = [[-1600, -1400], [W.w + 1600, -1400], [W.w + 1600, shoreY]];
  for (let x = W.w + 1600; x >= -1600; x -= 80) sea.push([x, shoreY + Math.sin(x * 0.011) * 16 + Math.sin(x * 0.027) * 7]);
  L.water.push({ kind: 'sea', pts: sea, shoreY, sparkle: [CX, 300, 620, 300] });
  L.props.push({ kind: 'boat', x: 150, y: 300, drift: 40, hue: 2 }, { kind: 'boat', x: 930, y: 640, drift: 30, hue: 0 }, { kind: 'buoy', x: 250, y: 720 }, { kind: 'buoy', x: 820, y: 250 });
  for (const [x, y, hue] of [[150, 1160, 0], [250, 1338, 1], [830, 1344, 2], [960, 1168, 1], [112, 1300, 2]]) L.props.push({ kind: 'parasol', x, y, hue });
  L.fence.push([[18, 1066], [18, W.gateY + 8], [CX - 104, W.gateY + 8]], [[CX + 104, W.gateY + 8], [W.w - 18, W.gateY + 8], [W.w - 18, 1066]]);
  L.lampPaths = [0, 1, 2];
  L.noTreesAbove = shoreY + 40;
  return L.finish();
}

// A canal town: cobbled quays either side of the water, joined by bridges.
function canal(key) {
  const L = builder(key);
  const mid = (x) => 640 - (x - CX) * 0.14 + Math.sin((x - CX) * 0.006) * 26; // the canal's centre line
  const half = 58;
  L.path([[CX, W.gateY + 70], [CX, W.gateY], [CX, 1250], [CX, 980], [CX, 740], [CX, 520], [CX, 300]], { w: 64, kind: 'cobble', straight: true });
  const quay = (off) => [110, 280, 450, CX, 630, 800, 970].map((x) => [x, mid(x) + off]);
  L.path(quay(half + 44), { w: 50, kind: 'cobble' });
  L.path(quay(-half - 44), { w: 50, kind: 'cobble' });
  L.path([[250, mid(250) + half + 44], [250, mid(250) - half - 44]], { w: 30, kind: 'cobble', straight: true });
  gateRow(L, 1240, 'cobble');
  const spots = [[-1, 980], [1, 930], [-1, 500], [1, 410]];
  for (const [s, y] of spots) {
    const px = CX + s * (y > 700 ? 340 : 316);
    L.plot(px, y, s, [[px - s * 128, y + 10], [CX + s * AVE, y + 10]], { kind: 'cobble' });
  }
  const band = [];
  for (let x = -1600; x <= W.w + 1600; x += 60) band.push([x, mid(x) - half]);
  for (let x = W.w + 1600; x >= -1600; x -= 60) band.push([x, mid(x) + half]);
  L.water.push({ kind: 'canal', pts: band, mid, half, sparkle: [CX, 640, 700, 60] });
  L.bridges.push({ x: CX, y: mid(CX), w: 78, len: half * 2 + 36, angle: Math.PI / 2, stone: true });
  L.bridges.push({ x: 250, y: mid(250), w: 36, len: half * 2 + 30, angle: Math.PI / 2, stone: true });
  L.plaza = { x: CX, y: 262, rx: 170, ry: 86 };
  L.props.push({ kind: 'bandstand', x: CX, y: 250 });
  L.props.push({ kind: 'barge', t0: 0, speed: 16, hue: 0 }, { kind: 'barge', t0: 0.55, speed: -12, hue: 1 });
  for (const x of [140, 400, 700, 900]) L.props.push({ kind: 'lanterns', x, y: mid(x), half });
  L.fence.push([[CX - 104, W.gateY + 8], [18, W.gateY + 8], [18, 60], [W.w - 18, 60], [W.w - 18, W.gateY + 8], [CX + 104, W.gateY + 8]]);
  L.lampPaths = [0, 1, 2];
  L.paved = true;
  return L.finish();
}

const MAKERS = {
  green: () => ring('green', { lake: true, centre: 'fountain' }),
  sand: () => pier('sand'),
  autumn: () => ring('autumn', { lake: false, centre: 'bonfire' }),
  snow: () => ring('snow', { lake: true, frozen: true, centre: 'fir' }),
  city: () => canal('city'),
};
const cache = new Map();

// The map for a town. Towns of the same kind share one.
export function layoutFor(town) {
  const key = townInfo(town).theme.key;
  if (!cache.has(key)) cache.set(key, (MAKERS[key] || MAKERS.green)());
  return cache.get(key);
}

export const plotAt = (town, k) => layoutFor(town).plots[k];
