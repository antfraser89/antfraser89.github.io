// Landscape painting: water, bridges, boards, gardens, trees and the other
// things that make each town's map its own. Attractions live in art.js.
import { prim } from './art.js';

const { rr, circ, ell, line, poly, TAU } = prim;

const trace = (c, pts, close = true) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
};

// ---- ground layers (painted once into the cached ground) -----------------------

// A paved or planked walkway along a polyline.
export function paintPath(c, path, theme, rand) {
  const { pts, w, kind } = path;
  const board = kind === 'board';
  const stone = kind === 'cobble' || kind === 'esplanade';
  const base = board ? theme.board : stone ? theme.stone : theme.path;
  const edge = board ? theme.boardEdge : stone ? theme.stoneEdge : theme.pathEdge;
  c.lineJoin = 'round';
  c.lineCap = kind === 'spur' || board || kind === 'esplanade' ? 'butt' : 'round';
  trace(c, pts, path.closed);
  c.strokeStyle = 'rgba(20,30,40,0.10)';
  c.lineWidth = w + 18;
  c.stroke();
  c.strokeStyle = edge;
  c.lineWidth = w + 9;
  c.stroke();
  c.strokeStyle = base;
  c.lineWidth = w;
  c.stroke();
  // a paler crown down the middle, as if worn by feet
  c.strokeStyle = 'rgba(255,255,255,0.13)';
  c.lineWidth = w * 0.5;
  c.stroke();
  c.lineCap = 'butt';

  // surface detail
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    if (board) {
      // planks across the boards
      c.strokeStyle = 'rgba(60,35,15,0.22)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(ax + nx * w * 0.5, ay + ny * w * 0.5);
      c.lineTo(ax - nx * w * 0.5, ay - ny * w * 0.5);
      c.stroke();
    } else if (stone) {
      for (let k = 0; k < 3; k++) {
        const o = (rand() - 0.5) * (w - 10);
        const t = rand();
        c.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(20,25,40,0.10)';
        c.beginPath();
        c.roundRect(ax + (bx - ax) * t + nx * o - 4, ay + (by - ay) * t + ny * o - 3, 8, 6, 2);
        c.fill();
      }
    } else if (rand() < 0.8) {
      const o = (rand() - 0.5) * (w - 12);
      c.fillStyle = 'rgba(70,50,20,0.10)';
      c.fillRect(ax + nx * o, ay + ny * o, 5 + rand() * 7, 2.2);
    }
  }
}

// A patch of lawn (or boards, or flagstones) for an attraction to stand on.
// `deep` is the bigger pad a 3D model stands on.
export function paintPad(c, x, y, theme, kind, deep = false) {
  const [px, py, w, h] = deep ? [x - 146, y - 208, 292, 234] : [x - 140, y - 106, 280, 132];
  if (kind === 'board') return; // the pier's decks are painted separately
  c.beginPath();
  c.roundRect(px - 3, py - 3, w + 6, h + 6, 26);
  c.fillStyle = 'rgba(20,30,40,0.10)';
  c.fill();
  c.save();
  c.beginPath();
  c.roundRect(px, py, w, h, 24);
  c.fillStyle = theme.plot;
  c.fill();
  c.clip();
  if (kind === 'cobble') {
    c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 1;
    for (let gy = py + 14; gy < py + h; gy += 16) line(c, px, gy, px + w, gy, 'rgba(255,255,255,0.09)', 1);
  } else {
    // mown stripes
    c.fillStyle = 'rgba(255,255,255,0.07)';
    for (let gx = px - 20; gx < px + w + 20; gx += 44) {
      c.beginPath();
      c.moveTo(gx, py + h);
      c.lineTo(gx + 22, py + h);
      c.lineTo(gx + 44, py);
      c.lineTo(gx + 22, py);
      c.fill();
    }
  }
  c.restore();
}

// A lake, a canal, the sea or a sheet of ice.
export function paintWater(c, water, theme, hollow = false) {
  const { pts, kind } = water;
  let [y0, y1] = [Infinity, -Infinity];
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  y0 = Math.max(y0, -260);
  trace(c, pts);
  if (kind !== 'sea') {
    // the bank
    c.strokeStyle = kind === 'canal' ? theme.stoneEdge : theme.bank;
    c.lineWidth = kind === 'canal' ? 20 : 16;
    c.lineJoin = 'round';
    c.stroke();
  }
  if (hollow) {
    // cut the water out of the ground altogether
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = '#000';
    c.fill();
    c.globalCompositeOperation = 'source-over';
    return;
  }
  const g = c.createLinearGradient(0, y0, 0, y1);
  const [deep, shallow] = theme.water;
  if (kind === 'sea') {
    g.addColorStop(0, deep);
    g.addColorStop(0.72, shallow);
    g.addColorStop(1, theme.foam);
  } else {
    g.addColorStop(0, deep);
    g.addColorStop(1, shallow);
  }
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();
  if (kind === 'canal') {
    // stone quay walls throwing a shadow on the water
    trace(c, pts);
    c.strokeStyle = 'rgba(8,20,30,0.34)';
    c.lineWidth = 16;
    c.stroke();
  } else if (kind === 'ice') {
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 14;
    trace(c, pts);
    c.stroke();
  } else {
    // shallows along the edge
    c.strokeStyle = 'rgba(255,255,255,0.16)';
    c.lineWidth = kind === 'sea' ? 44 : 22;
    trace(c, pts);
    c.stroke();
  }
  c.restore();
}

export function paintIce(c, water, rand) {
  c.save();
  trace(c, water.pts);
  c.clip();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.4;
  for (let k = 0; k < 40; k++) {
    const x = 60 + rand() * 960;
    const y = 30 + rand() * 280;
    const r = 30 + rand() * 60;
    const a = rand() * TAU;
    c.beginPath();
    c.arc(x, y, r, a, a + 0.6 + rand() * 1.2);
    c.stroke();
  }
  c.restore();
}

export function paintIsland(c, isle, theme) {
  ell(c, isle.x, isle.y + 5, isle.rx + 9, isle.ry + 8, 'rgba(8,30,40,0.22)');
  ell(c, isle.x, isle.y, isle.rx + 5, isle.ry + 5, theme.bank);
  ell(c, isle.x, isle.y, isle.rx, isle.ry, theme.plot);
}

// A footbridge (wood) or a town bridge (stone), seen from above.
export function paintBridge(c, b, theme) {
  c.save();
  c.translate(b.x, b.y);
  c.rotate(b.angle);
  const [l, w] = [b.len, b.w];
  c.fillStyle = 'rgba(8,20,30,0.25)';
  c.fillRect(-l / 2 + 8, -w / 2 + 7, l - 16, w + 4);
  if (b.stone) {
    rr(c, -l / 2, -w / 2 - 6, l, w + 12, 8, theme.stoneEdge);
    rr(c, -l / 2, -w / 2, l, w, 4, theme.stone);
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(-l / 2, -w * 0.24, l, w * 0.48);
    for (let x = -l / 2 + 10; x < l / 2; x += 18) {
      rr(c, x - 3, -w / 2 - 5, 6, 4, 1, 'rgba(255,255,255,0.22)');
      rr(c, x - 3, w / 2 + 1, 6, 4, 1, 'rgba(255,255,255,0.22)');
    }
  } else {
    rr(c, -l / 2, -w / 2, l, w, 3, theme.board);
    c.strokeStyle = 'rgba(60,35,15,0.25)';
    c.lineWidth = 1.2;
    for (let x = -l / 2 + 7; x < l / 2; x += 9) {
      c.beginPath();
      c.moveTo(x, -w / 2);
      c.lineTo(x, w / 2);
      c.stroke();
    }
    c.fillStyle = theme.boardEdge;
    c.fillRect(-l / 2, -w / 2 - 4, l, 4);
    c.fillRect(-l / 2, w / 2, l, 4);
  }
  c.restore();
}

// Boards on piles over the water.
export function paintDeck(c, d, theme, pass) {
  if (pass === 0) {
    // shadow and piles first, so they sit under every deck
    c.fillStyle = 'rgba(6,24,38,0.28)';
    c.beginPath();
    c.roundRect(d.x + 6, d.y + 12, d.w, d.h, d.r);
    c.fill();
    c.fillStyle = '#3b2a1c';
    for (let x = d.x + 14; x < d.x + d.w - 6; x += 34) c.fillRect(x, d.y + d.h - 2, 6, 13);
    return;
  }
  c.beginPath();
  c.roundRect(d.x - 3, d.y - 3, d.w + 6, d.h + 6, d.r + 2);
  c.fillStyle = theme.boardEdge;
  c.fill();
  c.save();
  c.beginPath();
  c.roundRect(d.x, d.y, d.w, d.h, d.r);
  c.fillStyle = theme.board;
  c.fill();
  c.clip();
  c.strokeStyle = 'rgba(60,35,15,0.2)';
  c.lineWidth = 1.2;
  if (d.spine) {
    for (let y = d.y + 6; y < d.y + d.h; y += 11) line(c, d.x, y, d.x + d.w, y, 'rgba(60,35,15,0.2)', 1.2);
  } else {
    for (let x = d.x + 6; x < d.x + d.w; x += 11) line(c, x, d.y, x, d.y + d.h, 'rgba(60,35,15,0.2)', 1.2);
  }
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.fillRect(d.x, d.y, d.w, d.h * 0.4);
  c.restore();
}

export function paintPierHead(c, h, theme, pass) {
  if (pass === 0) {
    ell(c, h.x + 6, h.y + 14, h.r, h.r * 0.74, 'rgba(6,24,38,0.28)');
    return;
  }
  ell(c, h.x, h.y, h.r + 4, h.r * 0.74 + 4, theme.boardEdge);
  c.save();
  c.beginPath();
  c.ellipse(h.x, h.y, h.r, h.r * 0.74, 0, 0, TAU);
  c.fillStyle = theme.board;
  c.fill();
  c.clip();
  for (let y = h.y - h.r; y < h.y + h.r; y += 11) line(c, h.x - h.r, y, h.x + h.r, y, 'rgba(60,35,15,0.2)', 1.2);
  c.restore();
}

// The formal garden inside the loop.
export function paintGarden(c, g, theme, beds, rand, snow) {
  c.save();
  c.beginPath();
  c.ellipse(g.x, g.y, g.rx, g.ry, 0, 0, TAU);
  c.fillStyle = theme.plot;
  c.fill();
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = g.y - g.ry; y < g.y + g.ry; y += 36) c.fillRect(g.x - g.rx, y, g.rx * 2, 18);
  c.restore();
  // gravel walks crossing at the middle
  const walk = (x1, y1, x2, y2) => {
    line(c, x1, y1, x2, y2, theme.pathEdge, 30);
    line(c, x1, y1, x2, y2, theme.path, 23);
  };
  walk(g.x, g.y - g.ry - 20, g.x, g.y + g.ry + 20);
  walk(g.x - g.rx - 20, g.y, g.x + g.rx + 20, g.y);
  ell(c, g.x, g.y, 78, 60, theme.pathEdge);
  ell(c, g.x, g.y, 73, 56, theme.path);
  if (snow) return;
  const blooms = theme.blooms;
  for (const b of beds) {
    ell(c, b.x, b.y + 2, b.rx + 4, b.ry + 4, 'rgba(20,30,20,0.16)');
    ell(c, b.x, b.y, b.rx, b.ry, theme.soil);
    for (let k = 0; k < 90; k++) {
      const a = rand() * TAU;
      const r = Math.sqrt(rand());
      const col = blooms[Math.floor((r * 2.2 + rand() * 0.6)) % blooms.length];
      circ(c, b.x + Math.cos(a) * r * (b.rx - 5), b.y + Math.sin(a) * r * (b.ry - 5), 2.6 + rand() * 1.6, col);
    }
  }
}

export function paintFountainBasin(c, x, y, theme) {
  ell(c, x, y + 4, 50, 31, 'rgba(20,30,40,0.2)');
  ell(c, x, y, 47, 29, '#e9e1cf');
  ell(c, x, y, 41, 24, '#b9ad95');
  ell(c, x, y, 38, 22, theme.water[1]);
  ell(c, x, y - 2, 24, 12, 'rgba(255,255,255,0.18)');
}

// ---- things that stand up (depth-sorted with the guests) -------------------------

// Trees with some body to them: a shadow thrown to one side, three tones of leaf.
export function drawTree(c, x, y, theme, v = 0, s = 1) {
  const [mid, light, dark] = theme.tree;
  c.fillStyle = 'rgba(15,30,30,0.17)';
  c.beginPath();
  c.ellipse(x + 13 * s, y + 2 * s, 26 * s, 8 * s, 0.05, 0, TAU);
  c.fill();
  const kind = theme.weather === 'snow' ? 'fir' : theme.key === 'sand' ? (v % 2 ? 'palm' : 'round') : v % 5 === 3 ? 'poplar' : 'round';
  if (kind === 'palm') {
    c.beginPath();
    c.moveTo(x - 3 * s, y);
    c.quadraticCurveTo(x + 7 * s, y - 30 * s, x + 2 * s, y - 60 * s);
    c.lineTo(x + 7 * s, y - 60 * s);
    c.quadraticCurveTo(x + 13 * s, y - 30 * s, x + 4 * s, y);
    c.closePath();
    c.fillStyle = theme.trunk;
    c.fill();
    c.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.55;
      c.beginPath();
      c.moveTo(x + 4 * s, y - 60 * s);
      c.quadraticCurveTo(x + 4 * s + Math.cos(a) * 22 * s, y - 72 * s + Math.sin(a) * 12 * s, x + 4 * s + Math.cos(a) * 36 * s, y - 52 * s + Math.sin(a) * 6 * s);
      c.strokeStyle = k % 2 ? mid : dark;
      c.lineWidth = 6 * s;
      c.stroke();
    }
    c.lineCap = 'butt';
    return;
  }
  rr(c, x - 3.5 * s, y - 24 * s, 7 * s, 26 * s, 3 * s, theme.trunk);
  if (kind === 'fir' || kind === 'pine') {
    for (let k = 0; k < 4; k++) {
      const w = (27 - k * 5.5) * s;
      const by = y - (14 + k * 17) * s;
      poly(c, [x - w, by, x, by - 32 * s, x + w, by], k % 2 ? mid : dark);
      poly(c, [x - w, by, x - w * 0.2, by - 25 * s, x - w * 0.1, by], 'rgba(255,255,255,0.08)');
      if (kind === 'fir') poly(c, [x - w * 0.55, by - 14 * s, x, by - 32 * s, x + w * 0.55, by - 14 * s], light);
    }
    return;
  }
  if (kind === 'poplar') {
    ell(c, x, y - 50 * s, 15 * s, 40 * s, dark);
    ell(c, x - 3 * s, y - 54 * s, 11 * s, 34 * s, mid);
    ell(c, x - 6 * s, y - 60 * s, 5 * s, 22 * s, light);
    return;
  }
  // a rounded crown built from clumps, darker underneath and lit from the left
  const clumps = [[-15, -30, 15], [15, -31, 16], [0, -24, 15], [-8, -46, 16], [10, -47, 15], [0, -58, 13]];
  for (const [dx, dy, r] of clumps) circ(c, x + dx * s + 2 * s, y + dy * s + 3 * s, r * s, dark);
  for (const [dx, dy, r] of clumps) circ(c, x + dx * s, y + dy * s, r * s * 0.92, mid);
  for (const [dx, dy, r] of [[-12, -36, 9], [-4, -54, 9], [8, -44, 7]]) circ(c, x + dx * s - 3 * s, y + dy * s - 3 * s, r * s, light);
  if (v % 4 === 1 && theme.fruit) for (const [dx, dy] of [[-10, -36], [9, -48], [3, -30], [-2, -56]]) circ(c, x + dx * s, y + dy * s, 2.5 * s, theme.fruit);
}

export function drawTopiary(c, x, y, theme) {
  const [mid, light, dark] = theme.tree;
  ell(c, x + 8, y + 1, 16, 5, 'rgba(15,30,30,0.17)');
  rr(c, x - 9, y - 12, 18, 13, 3, '#c9bfa8');
  rr(c, x - 11, y - 14, 22, 5, 2, '#e3dbc8');
  poly(c, [x - 13, y - 14, x, y - 60, x + 13, y - 14], theme.weather === 'snow' ? mid : dark);
  poly(c, [x - 13, y - 14, x, y - 60, x - 2, y - 14], mid);
  poly(c, [x - 9, y - 22, x - 2, y - 50, x - 4, y - 22], light);
  if (theme.weather === 'snow') poly(c, [x - 6, y - 40, x, y - 60, x + 6, y - 40], '#f4f8fc');
}

// A handsome cast-iron lamp with two globes.
export function drawLamp(c, x, y, lit) {
  ell(c, x + 6, y + 1, 11, 3.5, 'rgba(15,30,30,0.18)');
  rr(c, x - 4, y - 5, 8, 6, 2, '#1f2a33');
  rr(c, x - 1.6, y - 62, 3.2, 58, 1.5, '#27343f');
  rr(c, x - 3, y - 30, 6, 3, 1, '#1f2a33');
  c.strokeStyle = '#27343f';
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(x - 11, y - 60);
  c.quadraticCurveTo(x - 11, y - 68, x, y - 66);
  c.quadraticCurveTo(x + 11, y - 68, x + 11, y - 60);
  c.stroke();
  for (const dx of [-11, 11]) {
    if (lit) circ(c, x + dx, y - 56, 8, 'rgba(255,224,150,0.35)');
    circ(c, x + dx, y - 56, 5, lit ? '#fff3c9' : '#e8e3d4');
    rr(c, x + dx - 3, y - 62.5, 6, 2.4, 1, '#1f2a33');
  }
  poly(c, [x - 2.5, y - 66, x, y - 73, x + 2.5, y - 66], '#27343f');
}

export function drawFountain(c, x, y, t) {
  // the bowl and plinth
  rr(c, x - 6, y - 34, 12, 30, 3, '#d8cfba');
  ell(c, x, y - 34, 19, 6, '#c9bfa8');
  ell(c, x, y - 36, 17, 4.5, '#8fc6d2');
  rr(c, x - 3, y - 54, 6, 20, 2, '#e3dbc8');
  ell(c, x, y - 54, 9, 3.2, '#c9bfa8');
  // water rising and falling in arcs
  c.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + 0.3;
    const reach = 24 + Math.sin(t * 2.2 + k) * 2.5;
    const ex = x + Math.cos(a) * reach;
    const ey = y - 12 + Math.sin(a) * reach * 0.42;
    c.beginPath();
    c.moveTo(x, y - 56);
    c.quadraticCurveTo(x + Math.cos(a) * reach * 0.6, y - 84 - Math.sin(t * 3 + k) * 3, ex, ey);
    c.strokeStyle = 'rgba(235,250,255,0.72)';
    c.lineWidth = 2;
    c.stroke();
    const sp = (t * 1.6 + k * 0.37) % 1;
    c.beginPath();
    c.ellipse(ex, ey, 3 + sp * 7, 1.4 + sp * 3, 0, 0, TAU);
    c.strokeStyle = `rgba(255,255,255,${0.55 * (1 - sp)})`;
    c.lineWidth = 1.2;
    c.stroke();
  }
  c.lineCap = 'butt';
  const jet = 14 + Math.sin(t * 2.6) * 3;
  rr(c, x - 1.6, y - 58 - jet, 3.2, jet, 1.6, 'rgba(240,252,255,0.85)');
  circ(c, x, y - 59 - jet, 3.4, 'rgba(255,255,255,0.8)');
}

export function drawBonfire(c, x, y, t) {
  ell(c, x, y + 2, 34, 11, 'rgba(15,20,25,0.22)');
  ell(c, x, y, 28, 9, '#4a4037');
  c.lineCap = 'round';
  for (const [a, b] of [[-22, 16], [22, -14], [-12, -18], [14, 20]]) line(c, x + a, y - 2, x + b * 0.4, y - 26, '#5b3d24', 6);
  c.lineCap = 'butt';
  for (let k = 0; k < 5; k++) {
    const ph = t * 5 + k * 1.7;
    const h = 40 + Math.sin(ph) * 9 - k * 5;
    const w = 15 - k * 2.2;
    const dx = Math.sin(ph * 0.7) * 3 + (k - 2) * 4;
    c.beginPath();
    c.moveTo(x + dx - w, y - 8);
    c.quadraticCurveTo(x + dx - w * 0.6, y - h * 0.6, x + dx + Math.sin(ph) * 4, y - 8 - h);
    c.quadraticCurveTo(x + dx + w * 0.6, y - h * 0.6, x + dx + w, y - 8);
    c.closePath();
    c.fillStyle = ['#e2572b', '#f08a2c', '#f7b733', '#fbd75b', '#fff1b0'][k];
    c.fill();
  }
  for (let k = 0; k < 6; k++) {
    const u = (t * 0.5 + k / 6) % 1;
    circ(c, x + Math.sin(k * 3.1 + u * 5) * 12, y - 46 - u * 46, 1.6 * (1 - u) + 0.5, `rgba(255,214,120,${0.9 * (1 - u)})`);
  }
}

// The big fir in the middle of a winter park, hung with lights.
export function drawFir(c, x, y, t) {
  ell(c, x + 12, y + 2, 44, 12, 'rgba(15,30,40,0.2)');
  rr(c, x - 7, y - 20, 14, 22, 3, '#5b4632');
  for (let k = 0; k < 5; k++) {
    const w = 52 - k * 9;
    const by = y - 14 - k * 26;
    poly(c, [x - w, by, x, by - 48, x + w, by], k % 2 ? '#2f7d68' : '#256355');
    poly(c, [x - w * 0.5, by - 22, x, by - 48, x + w * 0.5, by - 22], '#eef4fa');
  }
  const cols = ['#ffd75e', '#ff7a7a', '#8fd3ff', '#b6f36b'];
  for (let k = 0; k < 16; k++) {
    const row = k % 5;
    const w = 44 - row * 8;
    const lx = x + Math.sin(k * 2.4) * w * 0.7;
    const ly = y - 20 - row * 26 - (k % 3) * 5;
    const on = 0.55 + 0.45 * Math.sin(t * 3 + k * 1.9);
    c.globalAlpha = on;
    circ(c, lx, ly, 2.8, cols[k % 4]);
    c.globalAlpha = 1;
  }
  prim.star(c, x, y - 170, 9, '#ffd75e');
}

const HULLS = [['#b3343c', '#f4ecd8'], ['#2c6f8f', '#f4ecd8'], ['#d99a16', '#fff6e0']];

export function drawBoat(c, x, y, t, hue = 0, drift = 30) {
  const bx = x + Math.sin(t * 0.13 + hue * 2) * drift;
  const by = y + Math.sin(t * 1.1 + hue) * 1.5;
  const [hull, sail] = HULLS[hue % HULLS.length];
  ell(c, bx + 3, by + 5, 27, 5, 'rgba(8,30,45,0.22)');
  c.beginPath();
  c.moveTo(bx - 24, by - 5);
  c.quadraticCurveTo(bx, by + 9, bx + 26, by - 6);
  c.lineTo(bx + 20, by + 3);
  c.quadraticCurveTo(bx, by + 8, bx - 18, by + 3);
  c.closePath();
  c.fillStyle = hull;
  c.fill();
  line(c, bx - 1, by - 5, bx - 1, by - 46, '#5b4632', 2);
  const lean = Math.sin(t * 0.7 + hue) * 2;
  poly(c, [bx + 1, by - 44, bx + 20 + lean, by - 9, bx + 1, by - 9], sail);
  poly(c, [bx - 3, by - 38, bx - 16 + lean, by - 9, bx - 3, by - 9], '#e6dcc4');
  // wake
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.ellipse(bx, by + 4, 32 + Math.sin(t * 1.4) * 2, 6, 0, 0.15, Math.PI - 0.15);
  c.stroke();
}

export function drawBarge(c, x, y, t, hue = 0, dir = 1) {
  const [hull] = HULLS[hue % HULLS.length];
  ell(c, x + 3, y + 7, 46, 8, 'rgba(6,20,30,0.3)');
  c.beginPath();
  c.moveTo(x - 44, y - 6);
  c.lineTo(x + 44, y - 6);
  c.quadraticCurveTo(x + 50 * (dir > 0 ? 1 : 0.9), y + 3, x + 38, y + 7);
  c.lineTo(x - 38, y + 7);
  c.quadraticCurveTo(x - 50 * (dir < 0 ? 1 : 0.9), y + 3, x - 44, y - 6);
  c.closePath();
  c.fillStyle = '#243340';
  c.fill();
  rr(c, x - 40, y - 9, 80, 5, 2, hull);
  rr(c, x - 22, y - 22, 40, 14, 3, '#f1e6cf');
  for (const wx of [-14, -2, 10]) rr(c, x + wx, y - 19, 7, 7, 1.5, '#ffd98a');
  rr(c, x - 24, y - 25, 44, 4, 2, hull);
  // a lantern on a pole at the bow
  const lx = x + dir * 34;
  line(c, lx, y - 8, lx, y - 26, '#243340', 1.6);
  circ(c, lx, y - 29, 4.5, '#ffb24d');
  circ(c, lx, y - 29, 8, 'rgba(255,190,90,0.3)');
  c.strokeStyle = 'rgba(255,255,255,0.3)';
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(x - dir * 46, y + 3);
  c.lineTo(x - dir * (70 + Math.sin(t * 2) * 3), y - 1);
  c.moveTo(x - dir * 46, y + 5);
  c.lineTo(x - dir * (70 + Math.sin(t * 2) * 3), y + 9);
  c.stroke();
}

export function drawDucks(c, x, y, t) {
  for (let k = 0; k < 3; k++) {
    const dx = x + k * 17 + Math.sin(t * 0.3) * 24;
    const dy = y + (k % 2) * 7 + Math.sin(t * 1.3 + k) * 0.8;
    ell(c, dx, dy + 2, 9 - k, 2.5, 'rgba(255,255,255,0.28)');
    ell(c, dx, dy, 6.5 - k, 4 - k * 0.5, k ? '#f3e39a' : '#fbfbf6');
    circ(c, dx + 5 - k * 0.6, dy - 4, 3 - k * 0.3, k ? '#f3e39a' : '#fbfbf6');
    rr(c, dx + 7 - k * 0.6, dy - 4.5, 3.4, 1.8, 0.8, '#f08a2c');
  }
}

export function drawSkaters(c, x, y, t) {
  for (let k = 0; k < 3; k++) {
    const a = t * (0.5 + k * 0.12) + k * 2.1;
    const sx = x + Math.cos(a) * (46 + k * 16);
    const sy = y + Math.sin(a) * (20 + k * 7);
    ell(c, sx + 3, sy + 1, 6, 2, 'rgba(60,90,120,0.25)');
    rr(c, sx - 3, sy - 15, 6, 12, 3, ['#b3343c', '#2c6f8f', '#d99a16'][k]);
    circ(c, sx, sy - 18, 3.4, '#f3d2b0');
    line(c, sx - 2, sy - 3, sx - 3 - Math.sin(a) * 3, sy, '#2a3340', 1.6);
    line(c, sx + 2, sy - 3, sx + 3 + Math.sin(a) * 3, sy, '#2a3340', 1.6);
  }
}

export function drawBuoy(c, x, y, t) {
  const by = y + Math.sin(t * 1.5 + x) * 2;
  ell(c, x, by + 3, 10, 3, 'rgba(255,255,255,0.3)');
  poly(c, [x - 6, by, x, by - 18, x + 6, by], '#c9453c');
  rr(c, x - 4.5, by - 9, 9, 3.5, 1, '#f4ecd8');
  circ(c, x, by - 19, 2.2, '#ffd75e');
}

const SHADES = [['#b3343c', '#f4ecd8'], ['#2c6f8f', '#f4ecd8'], ['#d99a16', '#f4ecd8']];

// A parasol and a deckchair on the sand.
export function drawParasol(c, x, y, hue = 0) {
  const [a, b] = SHADES[hue % SHADES.length];
  ell(c, x + 12, y + 2, 30, 7, 'rgba(60,40,10,0.16)');
  // deckchair
  line(c, x + 14, y, x + 30, y - 16, '#7a5230', 2.4);
  line(c, x + 30, y, x + 16, y - 12, '#7a5230', 2.4);
  poly(c, [x + 15, y - 11, x + 29, y - 15, x + 27, y - 4, x + 18, y - 1], a);
  // parasol
  line(c, x, y, x - 2, y - 44, '#6b5a48', 2.4);
  c.beginPath();
  c.moveTo(x - 30, y - 38);
  c.quadraticCurveTo(x - 2, y - 66, x + 26, y - 38);
  c.closePath();
  c.fillStyle = a;
  c.fill();
  c.save();
  c.clip();
  c.fillStyle = b;
  for (const sx of [-22, -4, 14]) {
    c.beginPath();
    c.moveTo(x - 2, y - 64);
    c.lineTo(x + sx, y - 36);
    c.lineTo(x + sx + 8, y - 36);
    c.closePath();
    c.fill();
  }
  c.restore();
}

export function drawBales(c, x, y) {
  ell(c, x + 6, y + 2, 34, 7, 'rgba(40,30,10,0.18)');
  for (const [dx, dy] of [[-16, 0], [16, 0], [0, -17]]) {
    rr(c, x + dx - 16, y + dy - 18, 32, 18, 4, '#d8b25a');
    rr(c, x + dx - 16, y + dy - 18, 32, 6, 3, '#e6c675');
    line(c, x + dx - 6, y + dy - 18, x + dx - 6, y + dy, '#a8853c', 1.4);
    line(c, x + dx + 6, y + dy - 18, x + dx + 6, y + dy, '#a8853c', 1.4);
  }
}

// Low posts and rope round the edge of the boards.
export function drawRail(c, x1, y1, x2, y2) {
  const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / 34));
  c.strokeStyle = '#f1e9d6';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x1, y1 - 12);
  c.lineTo(x2, y2 - 12);
  c.stroke();
  for (let k = 0; k <= n; k++) {
    const x = x1 + ((x2 - x1) * k) / n;
    const y = y1 + ((y2 - y1) * k) / n;
    rr(c, x - 2, y - 15, 4, 16, 1.5, '#f1e9d6');
  }
}
