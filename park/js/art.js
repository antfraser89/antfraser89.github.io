// Every picture in the game is drawn here with canvas paths: no image files.
// Attractions are drawn around their base-centre point, y going up as negative.
import { GUEST_LOOKS } from './config.js';

const TAU = Math.PI * 2;

if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  // Older Safari: a plain-radius fallback is close enough.
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rad = Math.min(Array.isArray(r) ? r[0] : r || 0, w / 2, h / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  };
}

export const P = {
  red: '#cf3f47', redDark: '#9c2630', cream: '#f8efd9', creamDark: '#decfaa', gold: '#eebf4d', goldDark: '#bd8a1f',
  blue: '#3a5fbf', blueDark: '#27408f', sky: '#62b9dc', skyLight: '#bfe0f2', teal: '#1d9a8a', tealDark: '#10695f',
  pink: '#d9507f', pinkLight: '#f5b9d0', purple: '#4a2f78', purpleDark: '#2a1a48', wood: '#ad7240',
  woodDark: '#7f552c', steel: '#c5cbd3', steelDark: '#89929f', ink: '#262033', white: '#ffffff', green: '#3f9a5a',
  greenDark: '#2a6f47', orange: '#e8742a',
};

// ---- primitives -----------------------------------------------------------

function rect(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
}
function rr(c, x, y, w, h, r, col) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = col;
  c.fill();
}
function circ(c, x, y, r, col) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = col;
  c.fill();
}
function ell(c, x, y, rx, ry, col) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  c.fillStyle = col;
  c.fill();
}
function line(c, x1, y1, x2, y2, col, w) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = col;
  c.lineWidth = w;
  c.stroke();
}
function poly(c, pts, col) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fillStyle = col;
  c.fill();
}
function shadow(c, x, y, rx, ry) {
  ell(c, x, y, rx, ry, 'rgba(20,20,45,0.2)');
}
// Canvas lettering uses the display face once it has loaded (main.js says when).
let displayReady = false;
export function setDisplayFont(ready) {
  displayReady = ready;
}
export const displayFont = (size) => (displayReady
  ? `800 ${size}px "Playfair Display", Georgia, "Times New Roman", serif`
  : `800 ${size}px Georgia, "Times New Roman", serif`);
// Small labels and numbers: a geometric sans that stays legible at map sizes.
export const uiFont = (size, weight = 700) => `${weight} ${size}px "Jost", "Trebuchet MS", system-ui, sans-serif`;

function label(c, text, x, y, size, col) {
  c.font = displayFont(size);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = col;
  c.fillText(text, x, y);
}

// Striped canopy with a scalloped lower edge.
function awning(c, x, y, w, h, n, a, b) {
  const inset = w * 0.07;
  const sw = w / n;
  const tw = (w - inset * 2) / n;
  for (let k = 0; k < n; k++) {
    const x0 = x + k * sw;
    c.beginPath();
    c.moveTo(x + inset + k * tw, y);
    c.lineTo(x + inset + (k + 1) * tw, y);
    c.lineTo(x0 + sw, y + h);
    c.arc(x0 + sw / 2, y + h, sw / 2, 0, Math.PI);
    c.closePath();
    c.fillStyle = k % 2 ? b : a;
    c.fill();
  }
}

function bulbRow(c, x1, y1, x2, y2, n, t, r = 2.4) {
  const phase = Math.floor(t * 2.5);
  for (let k = 0; k < n; k++) {
    const u = n === 1 ? 0.5 : k / (n - 1);
    circ(c, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, r, (k + phase) % 3 ? '#fff3b0' : '#d9a441');
  }
}

function head(c, x, y, r, k) {
  const L = GUEST_LOOKS;
  circ(c, x, y, r, L.skins[k % L.skins.length]);
  c.beginPath();
  c.arc(x, y - r * 0.1, r, Math.PI * 1.05, Math.PI * 1.95);
  c.closePath();
  c.fillStyle = L.hairs[(k * 3 + 1) % L.hairs.length];
  c.fill();
}

function flag(c, x, y, col, t, dir = 1) {
  line(c, x, y, x, y - 18, P.steelDark, 1.6);
  const w = Math.sin(t * 4) * 2;
  poly(c, [x, y - 18, x + 15 * dir, y - 14 + w, x, y - 9], col);
}

function star(c, x, y, r, col, rot = -Math.PI / 2) {
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 ? r * 0.45 : r;
    const a = rot + (k * Math.PI) / 5;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
  c.fillStyle = col;
  c.fill();
}

// ---- 0: toffee apple cart ---------------------------------------------------

function toffee(c, o) {
  shadow(c, 0, 1, 74, 9);
  rect(c, -62, -122, 4, 60, P.cream);
  rect(c, 58, -122, 4, 60, P.cream);
  // vendor
  const bob = o.run ? Math.sin(o.t * 9) * 1.6 : 0;
  rr(c, -11, -100 + bob, 22, 34, 7, P.blue);
  rr(c, -8, -92 + bob, 16, 26, 4, P.white);
  head(c, 0, -106 + bob, 8.5, 2);
  rr(c, -11, -117 + bob, 22, 4, 2, P.cream);
  rr(c, -7, -122 + bob, 14, 6, 2, P.cream);
  rect(c, -7, -118 + bob, 14, 2, P.red);
  // cart body
  rr(c, -58, -64, 116, 46, 7, P.wood);
  line(c, -56, -48, 56, -48, P.woodDark, 1.5);
  line(c, -56, -33, 56, -33, P.woodDark, 1.5);
  rr(c, -40, -60, 80, 34, 5, P.red);
  rr(c, -36, -56, 72, 26, 4, P.redDark);
  circ(c, 0, -42, 9, '#ff6b5e');
  line(c, 0, -51, 2, -58, P.cream, 2);
  circ(c, -3, -45, 2.4, 'rgba(255,255,255,0.7)');
  // counter and stock
  rr(c, -66, -72, 132, 9, 3, '#e9c48a');
  for (let k = 0; k < 5; k++) {
    const x = -44 + k * 22;
    const lift = o.run && k === Math.floor(o.t * 2) % 5 ? -4 : 0;
    line(c, x, -74 + lift, x, -96 + lift, '#f1e0c0', 2);
    circ(c, x, -80 + lift, 7.5, '#c9252d');
    circ(c, x, -82 + lift, 7.5, '#a8541a');
    circ(c, x, -79 + lift, 7.2, '#d92b33');
    circ(c, x - 2.5, -82 + lift, 2, 'rgba(255,255,255,0.75)');
  }
  // wheels
  for (const x of [-40, 40]) {
    circ(c, x, -14, 15, '#3b2a1e');
    circ(c, x, -14, 11.5, '#d9a55a');
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      line(c, x - Math.cos(a) * 11, -14 - Math.sin(a) * 11, x + Math.cos(a) * 11, -14 + Math.sin(a) * 11, '#8a5a2b', 1.6);
    }
    circ(c, x, -14, 3.2, '#3b2a1e');
  }
  rr(c, -72, -140, 144, 7, 3, P.redDark);
  awning(c, -80, -134, 160, 20, 8, P.red, P.cream);
  bulbRow(c, -70, -137, 70, -137, 9, o.t);
}

// ---- 1: hook-a-duck ---------------------------------------------------------

function ducks(c, o) {
  shadow(c, 0, 1, 90, 10);
  rect(c, -84, -128, 5, 82, P.white);
  rect(c, 79, -128, 5, 82, P.white);
  rr(c, -80, -118, 160, 66, 4, P.skyLight);
  // prizes hanging on the back wall
  const toys = [P.pink, P.gold, P.green, P.orange, P.purple, P.red];
  for (let k = 0; k < 6; k++) {
    const x = -62 + k * 25;
    const sway = Math.sin(o.t * 2 + k) * 1.2;
    line(c, x, -118, x + sway, -104, P.steelDark, 1);
    circ(c, x + sway, -97, 7, toys[k]);
    circ(c, x + sway - 5, -103, 3, toys[k]);
    circ(c, x + sway + 5, -103, 3, toys[k]);
    circ(c, x + sway - 2.2, -98, 1, P.ink);
    circ(c, x + sway + 2.2, -98, 1, P.ink);
  }
  // tub
  rr(c, -88, -52, 176, 52, 8, P.blue);
  for (let k = 0; k < 8; k++) {
    c.beginPath();
    c.arc(-77 + k * 22, -22, 11, Math.PI, 0);
    c.fillStyle = P.blueDark;
    c.fill();
  }
  rect(c, -88, -22, 176, 14, P.blueDark);
  rr(c, -88, -10, 176, 10, [0, 0, 8, 8], '#22388a');
  ell(c, 0, -52, 84, 14, P.white);
  ell(c, 0, -52, 78, 11, P.sky);
  ell(c, -24, -55, 30, 3, 'rgba(255,255,255,0.45)');
  const speed = o.run ? 26 : 7;
  for (let k = 0; k < 5; k++) {
    const u = (((k * 31 + o.t * speed) % 140) + 140) % 140;
    const x = u - 70;
    const edge = 1 - Math.abs(x) / 78;
    const y = -53 + Math.sin(o.t * 3 + k * 1.7) * 1.4 - (1 - edge) * 2;
    ell(c, x, y, 8, 5.5, '#ffd21f');
    circ(c, x + 6, y - 6, 4.5, '#ffd21f');
    poly(c, [x + 9.5, y - 7, x + 15, y - 5.5, x + 9.5, y - 4], P.orange);
    circ(c, x + 7, y - 7, 1, P.ink);
    line(c, x + 4, y - 10, x + 4, y - 14, P.steelDark, 1);
    c.beginPath();
    c.arc(x + 4, y - 16, 2, 0, TAU);
    c.strokeStyle = P.steelDark;
    c.lineWidth = 1;
    c.stroke();
  }
  poly(c, [-92, -150, 0, -180, 92, -150], P.blueDark);
  poly(c, [-46, -165, 0, -180, 46, -165, 46, -150, -46, -150], '#365bd0');
  awning(c, -98, -152, 196, 24, 9, P.blue, P.white);
  flag(c, 0, -178, P.gold, o.t);
  bulbRow(c, -86, -152, 86, -152, 11, o.t);
}

// ---- 2: teacup twirl --------------------------------------------------------

function teacup(c, x, y, col, spin, riders, k) {
  ell(c, x, y + 2, 23, 6, P.white);
  const side = Math.cos(spin) >= 0 ? 1 : -1;
  c.beginPath();
  c.arc(x + side * 19, y - 12, 6.5, 0, TAU);
  c.strokeStyle = col;
  c.lineWidth = 3.4;
  c.stroke();
  c.beginPath();
  c.moveTo(x - 18, y - 22);
  c.quadraticCurveTo(x - 17, y + 2, x - 8, y + 2);
  c.lineTo(x + 8, y + 2);
  c.quadraticCurveTo(x + 17, y + 2, x + 18, y - 22);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.save();
  c.clip();
  rect(c, x - 20, y - 12, 40, 4.5, 'rgba(255,255,255,0.75)');
  c.restore();
  if (riders) {
    head(c, x - 6, y - 25, 5.5, k);
    head(c, x + 6, y - 25, 5.5, k + 3);
  }
  ell(c, x, y - 22, 18, 4.5, 'rgba(255,255,255,0.55)');
}

function teacups(c, o) {
  shadow(c, 0, 4, 114, 15);
  ell(c, 0, -6, 110, 27, '#b0527a');
  ell(c, 0, -14, 110, 27, '#f7a8c9');
  ell(c, 0, -14, 84, 20, '#fbd0e2');
  ell(c, 0, -14, 58, 13, '#f7a8c9');
  const cols = [P.teal, P.gold, P.blue, P.red, P.purple];
  const cups = [];
  for (let k = 0; k < 5; k++) {
    const a = o.anim * 1.25 + (k * TAU) / 5 + 0.4;
    cups.push({ x: Math.cos(a) * 74, y: -18 + Math.sin(a) * 17, d: Math.sin(a), k, spin: a * 2.4 + k });
  }
  cups.sort((p, q) => p.d - q.d);
  let potDrawn = false;
  const pot = () => {
    ell(c, 0, -22, 20, 5, 'rgba(0,0,0,0.15)');
    c.beginPath();
    c.moveTo(22, -46);
    c.quadraticCurveTo(40, -48, 42, -64);
    c.lineTo(36, -66);
    c.quadraticCurveTo(34, -54, 22, -56);
    c.closePath();
    c.fillStyle = P.cream;
    c.fill();
    c.beginPath();
    c.arc(-25, -46, 10, 0, TAU);
    c.strokeStyle = P.cream;
    c.lineWidth = 4;
    c.stroke();
    ell(c, 0, -44, 26, 22, P.cream);
    rect(c, -24, -48, 48, 6, P.pink);
    ell(c, 0, -64, 14, 4.5, P.creamDark);
    circ(c, 0, -69, 4, P.pink);
    if (o.run) {
      for (let k = 0; k < 3; k++) {
        const u = (o.t * 0.7 + k / 3) % 1;
        circ(c, 40 + Math.sin(u * 6 + k) * 4, -70 - u * 26, 3 + u * 3, `rgba(255,255,255,${0.5 * (1 - u)})`);
      }
    }
  };
  for (const cup of cups) {
    if (!potDrawn && cup.d > 0) {
      pot();
      potDrawn = true;
    }
    teacup(c, cup.x, cup.y, cols[cup.k], cup.spin, o.riders > 0, cup.k);
  }
  if (!potDrawn) pot();
  for (let k = 0; k < 13; k++) {
    const a = Math.PI * (0.06 + (0.88 * k) / 12);
    circ(c, Math.cos(a) * 108, -8 + Math.sin(a) * 26, 2.4, (k + Math.floor(o.t * 2.5)) % 3 ? '#fff3b0' : '#d9a441');
  }
}

// ---- 3: helter skelter ------------------------------------------------------

function helter(c, o) {
  shadow(c, 6, 2, 66, 10);
  const half = (y) => 46 + (y / 196) * 19; // y is negative going up
  c.save();
  c.beginPath();
  c.moveTo(-46, 0);
  c.lineTo(-27, -196);
  c.lineTo(27, -196);
  c.lineTo(46, 0);
  c.closePath();
  c.fillStyle = P.cream;
  c.fill();
  c.clip();
  for (let y = -250; y < 30; y += 46) poly(c, [-60, y + 34, 60, y, 60, y + 23, -60, y + 57], P.red);
  rect(c, -60, -200, 22, 200, 'rgba(0,0,0,0.07)');
  c.restore();
  rr(c, -11, -34, 22, 34, [11, 11, 0, 0], '#5a2d1a');
  // the slide: four front-facing turns, then the run-out
  const bands = [-158, -118, -78, -38];
  for (const y of bands) {
    const w = half(y) + 9;
    c.beginPath();
    c.moveTo(-w, y - 6);
    c.quadraticCurveTo(0, y + 8, w + 2, y + 14);
    c.lineTo(w + 2, y + 27);
    c.quadraticCurveTo(0, y + 21, -w, y + 7);
    c.closePath();
    c.fillStyle = P.sky;
    c.fill();
    c.beginPath();
    c.moveTo(-w, y + 7);
    c.quadraticCurveTo(0, y + 21, w + 2, y + 27);
    c.strokeStyle = '#2a8fc0';
    c.lineWidth = 3;
    c.stroke();
  }
  c.beginPath();
  c.moveTo(54, -24);
  c.quadraticCurveTo(70, -18, 84, -6);
  c.lineTo(84, 0);
  c.lineTo(54, -10);
  c.closePath();
  c.fillStyle = P.sky;
  c.fill();
  rr(c, 62, -6, 34, 7, 3, P.red);
  if (o.run && o.riders > 0) {
    const u = (o.anim * 0.55) % 1;
    const band = Math.min(3, Math.floor(u * 4));
    const v = u * 4 - band;
    const y0 = bands[band];
    const w = half(y0) + 9;
    const x = -w + v * (2 * w);
    const y = y0 + 2 + v * 17 - Math.sin(v * Math.PI) * 4;
    rr(c, x - 7, y - 3, 14, 5, 2, P.gold);
    head(c, x, y - 8, 5, Math.floor(o.anim * 0.55));
  }
  rr(c, -36, -206, 72, 12, 3, P.gold);
  for (let k = 0; k < 7; k++) rect(c, -33 + k * 11, -216, 2, 12, P.goldDark);
  rr(c, -36, -218, 72, 3, 1.5, P.goldDark);
  rr(c, -21, -238, 42, 34, 3, P.cream);
  rr(c, -7, -230, 14, 18, [7, 7, 0, 0], '#5a2d1a');
  poly(c, [-30, -238, 0, -272, 30, -238], P.red);
  poly(c, [-10, -238, 0, -272, 10, -238], P.cream);
  flag(c, 0, -270, P.blue, o.t);
  bulbRow(c, -46, -4, -28, -192, 8, o.t);
  bulbRow(c, 46, -4, 28, -192, 8, o.t + 0.4);
}

// ---- 4: coconut shy ---------------------------------------------------------

function coconut(c, o) {
  shadow(c, 0, 1, 96, 10);
  rect(c, -94, -132, 5, 90, P.cream);
  rect(c, 89, -132, 5, 90, P.cream);
  rr(c, -90, -126, 180, 86, 4, P.greenDark);
  for (let k = 0; k < 8; k++) rect(c, -84 + k * 23, -126, 8, 86, '#3c9461');
  rect(c, -84, -66, 168, 6, P.woodDark);
  const hit = o.run ? Math.floor(o.anim * 1.1) % 4 : -1;
  const u = o.run ? (o.anim * 1.1) % 1 : 0;
  for (let k = 0; k < 4; k++) {
    const x = -60 + k * 40;
    rect(c, x - 2.5, -88, 5, 22, P.white);
    rect(c, x - 2.5, -82, 5, 5, P.red);
    rect(c, x - 2.5, -72, 5, 5, P.red);
    c.beginPath();
    c.arc(x, -89, 7, 0, Math.PI);
    c.fillStyle = P.gold;
    c.fill();
    const wob = k === hit && u > 0.75 ? Math.sin(o.anim * 40) * 3 : 0;
    c.save();
    c.translate(x + wob, -97);
    c.rotate(wob * 0.06);
    ell(c, 0, 0, 9.5, 11, '#6b4226');
    ell(c, -3, -3, 4, 5, '#84563a');
    circ(c, -2, -5, 1.1, '#2e1a0e');
    circ(c, 2.5, -5, 1.1, '#2e1a0e');
    circ(c, 0, -1.5, 1.1, '#2e1a0e');
    c.restore();
  }
  if (hit >= 0 && u < 0.78) {
    const v = u / 0.78;
    const tx = -60 + hit * 40;
    const x = 30 + (tx - 30) * v;
    const y = -54 + (-97 + 54) * v - Math.sin(v * Math.PI) * 26;
    circ(c, x, y, 4.2, P.cream);
    c.beginPath();
    c.arc(x, y, 4.2, 0.5, 2.2);
    c.strokeStyle = P.red;
    c.lineWidth = 1;
    c.stroke();
  }
  rr(c, -94, -46, 188, 46, 7, P.cream);
  for (let k = 0; k < 6; k++) {
    const x = -75 + k * 30;
    poly(c, [x, -34, x + 11, -22, x, -10, x - 11, -22], k % 2 ? P.greenDark : P.red);
  }
  rr(c, -98, -52, 196, 9, 3, P.woodDark);
  rr(c, 52, -66, 26, 15, 3, P.steel);
  circ(c, 59, -68, 4.4, P.cream);
  circ(c, 68, -69, 4.4, P.cream);
  circ(c, 64, -73, 4.4, P.cream);
  rr(c, -62, -176, 124, 26, 8, P.gold);
  rr(c, -58, -172, 116, 18, 6, P.goldDark);
  label(c, 'COCONUTS', 0, -162.5, 13, P.cream);
  awning(c, -104, -154, 208, 24, 9, P.greenDark, P.cream);
  bulbRow(c, -92, -154, 92, -154, 11, o.t);
}

// ---- 5: candy floss kiosk ---------------------------------------------------

function cloud(c, x, y, s, col, wob = 0) {
  circ(c, x, y, 11 * s, col);
  circ(c, x - 9 * s + wob, y + 4 * s, 8 * s, col);
  circ(c, x + 9 * s - wob, y + 4 * s, 8 * s, col);
  circ(c, x - 4 * s, y - 7 * s, 7.5 * s, col);
  circ(c, x + 5 * s, y - 6 * s, 7 * s, col);
  circ(c, x - 3 * s, y - 5 * s, 3 * s, 'rgba(255,255,255,0.45)');
}

function floss(c, o) {
  shadow(c, 0, 1, 70, 9);
  rr(c, -56, -94, 112, 94, 8, '#ff8fc0');
  c.save();
  c.beginPath();
  c.roundRect(-56, -40, 112, 40, [0, 0, 8, 8]);
  c.clip();
  for (let k = 0; k < 8; k++) rect(c, -56 + k * 16, -40, 8, 40, P.white);
  c.restore();
  rr(c, -45, -88, 90, 42, 6, '#3a2340');
  // vendor and the spinning drum
  const bob = o.run ? Math.sin(o.t * 8) * 1.4 : 0;
  rr(c, -30, -70 + bob, 22, 26, 6, P.white);
  head(c, -19, -74 + bob, 8, 4);
  rr(c, -27, -84 + bob, 16, 4, 2, P.pink);
  ell(c, 20, -52, 20, 6, P.steel);
  ell(c, 20, -54, 15, 4, '#eef1f5');
  const spin = o.run ? o.t * 9 : o.t * 0.8;
  for (let k = 0; k < 3; k++) {
    const a = spin + (k * TAU) / 3;
    circ(c, 20 + Math.cos(a) * 6, -64 + Math.sin(a) * 2.5, 8, 'rgba(255,170,215,0.85)');
  }
  circ(c, 20, -67, 7, 'rgba(255,205,232,0.9)');
  rr(c, -62, -50, 124, 9, 3, P.cream);
  line(c, -48, -50, -48, -72, '#f1e0c0', 2);
  cloud(c, -48, -80, 0.8, P.pinkLight);
  line(c, 50, -50, 50, -72, '#f1e0c0', 2);
  cloud(c, 50, -80, 0.8, '#a9dcff');
  // domed roof
  c.beginPath();
  c.moveTo(-68, -94);
  c.quadraticCurveTo(-60, -134, 0, -138);
  c.quadraticCurveTo(60, -134, 68, -94);
  c.closePath();
  c.fillStyle = '#7ad7ff';
  c.fill();
  c.save();
  c.clip();
  rect(c, -40, -140, 16, 50, 'rgba(255,255,255,0.5)');
  rect(c, -8, -140, 16, 50, 'rgba(255,255,255,0.5)');
  rect(c, 24, -140, 16, 50, 'rgba(255,255,255,0.5)');
  c.restore();
  for (let k = 0; k < 8; k++) {
    c.beginPath();
    c.arc(-59.5 + k * 17, -94, 8.5, 0, Math.PI);
    c.fillStyle = k % 2 ? P.white : P.pink;
    c.fill();
  }
  poly(c, [-6, -136, 6, -136, 0, -118], P.cream);
  const wob = Math.sin(o.t * 2) * 1.2;
  cloud(c, 0, -156, 1.75, P.pinkLight, wob);
  bulbRow(c, -62, -97, 62, -97, 8, o.t);
}

// ---- 6: dodgems -------------------------------------------------------------

function dodgems(c, o) {
  shadow(c, 0, 5, 126, 14);
  rr(c, -116, -126, 232, 74, 4, '#3e2a78');
  for (let k = 0; k < 6; k++) star(c, -92 + k * 37, -100 + (k % 2) * 16, 6, 'rgba(255,197,61,0.8)');
  c.beginPath();
  c.moveTo(-110, -70);
  for (let k = 0; k <= 11; k++) c.lineTo(-110 + k * 20, k % 2 ? -62 : -72);
  c.strokeStyle = P.pink;
  c.lineWidth = 3;
  c.stroke();
  rr(c, -122, -30, 244, 34, 8, '#5a5f73');
  rr(c, -118, -62, 236, 44, 10, '#30343f');
  rr(c, -100, -56, 90, 5, 2.5, 'rgba(255,255,255,0.08)');
  c.beginPath();
  c.roundRect(-118, -62, 236, 44, 10);
  c.strokeStyle = P.gold;
  c.lineWidth = 4.5;
  c.stroke();
  const cols = [P.red, P.blue, P.green, P.gold, P.pink];
  const cars = [];
  for (let k = 0; k < 5; k++) {
    const a = o.anim;
    cars.push({
      x: Math.sin(a * (0.9 + 0.17 * k) + k * 1.9) * 84,
      y: -40 + Math.cos(a * (1.15 + 0.13 * k) + k * 2.4) * 11,
      k,
    });
  }
  cars.sort((p, q) => p.y - q.y);
  for (const car of cars) {
    const { x, y, k } = car;
    line(c, x - 9, y - 10, x - 9, -124, P.steel, 1.4);
    if (o.run && (Math.floor(o.t * 14) + k) % 5 === 0) star(c, x - 9, -124, 5, '#fff3b0', o.t * 9);
    rr(c, x - 17, y - 5, 34, 9, 4.5, '#1e1e24');
    rr(c, x - 14, y - 14, 28, 13, 6, cols[k]);
    rr(c, x - 9, y - 12, 18, 4, 2, 'rgba(255,255,255,0.35)');
    circ(c, x + 11, y - 6, 2.2, '#fff3b0');
    if (o.riders > 0 && o.run) head(c, x + 1, y - 17, 5.2, k + 1);
  }
  for (const x of [-118, 112]) {
    rect(c, x, -132, 6, 104, P.red);
    for (let y = -124; y < -34; y += 22) rect(c, x, y, 6, 8, P.cream);
  }
  rr(c, -128, -152, 256, 26, 6, P.red);
  rr(c, -128, -152, 256, 8, [6, 6, 0, 0], P.cream);
  rr(c, -58, -172, 116, 28, 9, P.gold);
  rr(c, -54, -168, 108, 20, 6, '#7a1f1f');
  label(c, 'DODGEMS', 0, -157.5, 14, P.gold);
  bulbRow(c, -120, -130, 120, -130, 15, o.t);
}

// ---- 7: galloping carousel --------------------------------------------------

function horse(c, x, y, s, f, col, saddle, dim) {
  line(c, x, y - 78 * s, x, y + 6, P.gold, 2);
  c.save();
  c.translate(x, y - 20 * s);
  c.scale(f * s, s);
  if (dim) c.globalAlpha *= 0.55;
  c.lineCap = 'round';
  line(c, -8, 3, -14, 15, col, 3.2);
  line(c, -4, 4, -3, 16, col, 3.2);
  line(c, 7, 3, 14, 12, col, 3.2);
  line(c, 9, 4, 8, 16, col, 3.2);
  ell(c, 0, 0, 14, 7.5, col);
  c.beginPath();
  c.moveTo(7, -4);
  c.lineTo(15, -17);
  c.lineTo(21, -14);
  c.lineTo(13, 2);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  c.beginPath();
  c.ellipse(20, -15, 6.5, 3.8, 0.5, 0, TAU);
  c.fill();
  poly(c, [13, -19, 16, -24, 18, -18], col);
  line(c, 9, -5, 15, -17, saddle, 3);
  c.beginPath();
  c.moveTo(-13, -2);
  c.quadraticCurveTo(-23, -2, -22, 10);
  c.strokeStyle = saddle;
  c.lineWidth = 3.4;
  c.stroke();
  rr(c, -6, -9, 12, 9, 3, saddle);
  circ(c, 21.5, -16, 1, P.ink);
  c.lineCap = 'butt';
  c.restore();
}

function carousel(c, o) {
  shadow(c, 0, 5, 116, 15);
  ell(c, 0, -6, 110, 21, '#8a1f2b');
  ell(c, 0, -13, 110, 21, '#f4d9a0');
  ell(c, 0, -13, 92, 16, '#e9c583');
  const cols = ['#ffffff', '#f3d6a8', '#d9d9e8', '#ffffff', '#c8a27a', '#f0f0f0', '#e9cfa8'];
  const saddles = [P.red, P.blue, P.teal, P.pink, P.purple, P.green, P.orange];
  const hs = [];
  for (let k = 0; k < 7; k++) {
    const a = o.anim * 0.85 + (k * TAU) / 7;
    hs.push({ a, d: Math.sin(a), x: Math.cos(a) * 84, k });
  }
  hs.sort((p, q) => p.d - q.d);
  const draw = (h) => {
    const bob = Math.sin(o.anim * 3.2 + h.k * 2.1) * 6;
    horse(c, h.x, -14 + h.d * 11 - 8 + bob, 1.08 + 0.16 * h.d, h.d > 0 ? -1 : 1, cols[h.k], saddles[h.k], h.d < 0);
  };
  for (const h of hs) if (h.d <= 0) draw(h);
  rr(c, -21, -150, 42, 138, 4, P.cream);
  rect(c, -21, -40, 42, 6, P.gold);
  rect(c, -21, -122, 42, 6, P.gold);
  for (const y of [-100, -68]) ell(c, 0, y, 10, 13, P.skyLight);
  for (const y of [-100, -68]) ell(c, -3, y - 4, 3, 5, 'rgba(255,255,255,0.7)');
  for (const h of hs) if (h.d > 0) draw(h);
  // striped canopy
  for (let k = 0; k < 10; k++) {
    poly(c, [0, -206, -114 + k * 22.8, -152, -114 + (k + 1) * 22.8, -152], k % 2 ? P.cream : P.red);
  }
  awning(c, -118, -154, 236, 14, 12, P.redDark, P.gold);
  circ(c, 0, -208, 6.5, P.gold);
  flag(c, 0, -212, P.blue, o.t);
  bulbRow(c, -112, -153, 112, -153, 15, o.t);
}

// ---- 8: ghost train ---------------------------------------------------------

function ghost(c, o) {
  shadow(c, 0, 4, 124, 12);
  poly(c, [-118, 0, -118, -120, -86, -152, -42, -128, 0, -170, 42, -128, 86, -152, 118, -120, 118, 0], P.purple);
  c.save();
  c.clip();
  for (let y = -150; y < 0; y += 18) rect(c, -120, y, 240, 2, 'rgba(0,0,0,0.14)');
  for (let k = 0; k < 14; k++) rect(c, -112 + k * 18 + (k % 2) * 6, -150 + ((k * 37) % 120), 2, 18, 'rgba(0,0,0,0.12)');
  c.restore();
  c.beginPath();
  c.moveTo(-118, -120);
  c.lineTo(-86, -152);
  c.lineTo(-42, -128);
  c.lineTo(0, -170);
  c.lineTo(42, -128);
  c.lineTo(86, -152);
  c.lineTo(118, -120);
  c.strokeStyle = P.purpleDark;
  c.lineWidth = 6;
  c.lineJoin = 'round';
  c.stroke();
  // crooked windows
  const flick = Math.sin(o.t * 13) > 0.6 || Math.sin(o.t * 5.3) > 0.9 ? 0.45 : 1;
  for (const x of [-98, 80]) {
    c.save();
    c.translate(x + 9, -108);
    c.rotate(x < 0 ? -0.12 : 0.1);
    rr(c, -10, -13, 20, 26, 3, P.purpleDark);
    c.globalAlpha *= flick;
    rr(c, -7, -10, 14, 20, 2, '#ffd75e');
    c.globalAlpha /= flick;
    rect(c, -1, -10, 2, 20, P.purpleDark);
    rect(c, -7, -1, 14, 2, P.purpleDark);
    c.restore();
  }
  // tunnel mouths
  for (const x of [-64, 64]) {
    rr(c, x - 34, -76, 68, 76, [34, 34, 0, 0], P.woodDark);
    rr(c, x - 28, -70, 56, 70, [28, 28, 0, 0], '#120a1f');
  }
  rect(c, -118, -9, 236, 3, P.steelDark);
  rect(c, -118, -3, 236, 3, P.steelDark);
  for (let k = 0; k < 13; k++) rect(c, -114 + k * 19, -10, 4, 11, 'rgba(60,40,30,0.55)');
  // the cart: out of the left tunnel, into the right
  let cx = 0;
  let show = true;
  if (o.run) {
    if (o.p < 0.22) cx = (o.p / 0.22) * 70;
    else if (o.p > 0.78) cx = -70 + ((o.p - 0.78) / 0.22) * 70;
    else show = false;
  }
  if (show) {
    c.save();
    c.beginPath();
    c.rect(-64, -70, 128, 72);
    c.clip();
    rr(c, cx - 23, -32, 46, 24, 7, P.green);
    rr(c, cx - 23, -16, 46, 8, [0, 0, 7, 7], P.greenDark);
    rr(c, cx + 14, -38, 9, 14, 4, P.greenDark);
    circ(c, cx - 13, -7, 5.5, '#1e1e24');
    circ(c, cx + 13, -7, 5.5, '#1e1e24');
    circ(c, cx - 13, -7, 2, P.steel);
    circ(c, cx + 13, -7, 2, P.steel);
    if (o.run && o.riders > 0) {
      head(c, cx - 8, -37, 5.5, 1);
      head(c, cx + 5, -37, 5.5, 4);
    }
    c.restore();
  }
  // the ghost over the door
  const gy = -124 + Math.sin(o.t * 2) * 3;
  c.beginPath();
  c.moveTo(-22, gy + 24);
  c.lineTo(-22, gy);
  c.arc(0, gy, 22, Math.PI, 0);
  c.lineTo(22, gy + 24);
  for (let k = 0; k < 4; k++) c.quadraticCurveTo(22 - k * 11 - 5.5, gy + 14, 22 - (k + 1) * 11, gy + 24);
  c.closePath();
  c.fillStyle = '#f2f6ff';
  c.fill();
  ell(c, -8, gy - 2, 4, 6, P.ink);
  ell(c, 8, gy - 2, 4, 6, P.ink);
  ell(c, 0, gy + 10, 4.5, 5.5, P.ink);
  rr(c, -58, -96, 116, 20, 4, P.purpleDark);
  label(c, 'GHOST TRAIN', 0, -85.5, 12.5, '#b6f36b');
  // bats
  for (let k = 0; k < 2; k++) {
    const a = o.t * (1.1 + k * 0.4) + k * 3;
    const bx = Math.cos(a) * (70 + k * 14);
    const by = -168 + Math.sin(a * 1.7) * 14 - k * 10;
    const flap = Math.sin(o.t * 16 + k) * 4;
    poly(c, [bx, by, bx - 9, by - 4 + flap, bx - 5, by + 2, bx, by + 1, bx + 5, by + 2, bx + 9, by - 4 + flap], P.purpleDark);
  }
}

// ---- 9: whirling waltzer ----------------------------------------------------

function waltzCar(c, x, y, col, spin, riders, k) {
  ell(c, x, y + 2, 19, 7, 'rgba(0,0,0,0.25)');
  const facing = Math.cos(spin) > -0.15;
  c.beginPath();
  c.moveTo(x - 18, y);
  c.bezierCurveTo(x - 20, y - 30, x + 20, y - 30, x + 18, y);
  c.closePath();
  c.fillStyle = col;
  c.fill();
  if (facing) {
    ell(c, x, y - 4, 14, 6.5, 'rgba(0,0,0,0.3)');
    if (riders) {
      head(c, x - 6, y - 10, 5.4, k);
      head(c, x + 6, y - 10, 5.4, k + 2);
    }
    rr(c, x - 15, y - 3, 30, 5, 2.5, P.steel);
  } else {
    star(c, x, y - 12, 7, 'rgba(255,255,255,0.8)');
  }
}

function waltzer(c, o) {
  shadow(c, 0, 5, 126, 15);
  rr(c, -118, -128, 236, 90, 10, '#177e86');
  c.beginPath();
  c.moveTo(-112, -92);
  for (let k = 0; k <= 14; k++) c.lineTo(-112 + k * 16, k % 2 ? -78 : -98);
  c.strokeStyle = P.gold;
  c.lineWidth = 5;
  c.stroke();
  for (let k = 0; k < 5; k++) star(c, -88 + k * 44, -114, 6, P.pinkLight);
  const wob = o.run ? Math.sin(o.anim * 2.2) * 2.5 : 0;
  ell(c, 0, -20, 116, 30, '#7a1f5c');
  ell(c, 0, -28 + wob * 0.3, 116, 29, P.pink);
  for (let k = 0; k < 8; k++) {
    const a = o.anim * 0.9 + (k * TAU) / 8;
    line(c, 0, -28, Math.cos(a) * 114, -28 + Math.sin(a) * 28, 'rgba(255,255,255,0.3)', 2);
  }
  ell(c, 0, -28, 60, 15, 'rgba(255,255,255,0.14)');
  const cols = [P.gold, P.blue, P.teal, P.red, P.purple, P.orange];
  const cars = [];
  for (let k = 0; k < 6; k++) {
    const a = o.anim * 0.9 + (k * TAU) / 6;
    cars.push({ x: Math.cos(a) * 82, y: -27 + Math.sin(a) * 19 + Math.sin(a + o.anim) * wob, d: Math.sin(a), k, spin: o.anim * 3.4 + k * 1.3 });
  }
  cars.sort((p, q) => p.d - q.d);
  let hub = false;
  const drawHub = () => {
    rr(c, -8, -66, 16, 38, 4, P.gold);
    ell(c, 0, -30, 22, 8, P.goldDark);
    circ(c, 0, -70, 8, P.cream);
    star(c, 0, -70, 5, P.pink, o.anim * 2);
  };
  for (const car of cars) {
    if (!hub && car.d > 0) {
      drawHub();
      hub = true;
    }
    waltzCar(c, car.x, car.y, cols[car.k], car.spin, o.riders > 0 && o.run, car.k);
  }
  if (!hub) drawHub();
  for (let k = 0; k < 15; k++) {
    const a = Math.PI * (0.05 + (0.9 * k) / 14);
    circ(c, Math.cos(a) * 114, -18 + Math.sin(a) * 29, 2.4, (k + Math.floor(o.t * 2.5)) % 3 ? '#fff3b0' : '#d9a441');
  }
  rect(c, -120, -134, 6, 112, P.cream);
  rect(c, 114, -134, 6, 112, P.cream);
  rr(c, -128, -154, 256, 24, 8, P.pink);
  rr(c, -128, -154, 256, 7, [8, 8, 0, 0], '#ff7fb0');
  rr(c, -62, -176, 124, 30, 9, P.gold);
  rr(c, -58, -172, 116, 22, 6, '#177e86');
  label(c, 'WALTZER', 0, -160.5, 15, P.cream);
  bulbRow(c, -120, -132, 120, -132, 15, o.t);
}

// ---- 10: big wheel ----------------------------------------------------------

function wheel(c, o) {
  shadow(c, 0, 4, 104, 12);
  const cy = -156;
  const R = 104;
  line(c, -66, -4, 0, cy, P.steelDark, 8);
  line(c, 66, -4, 0, cy, P.steelDark, 8);
  line(c, -66, -4, 0, cy, P.steel, 4);
  line(c, 66, -4, 0, cy, P.steel, 4);
  line(c, -40, -64, 40, -64, P.steelDark, 4);
  const rot = o.anim * 0.32;
  c.beginPath();
  c.arc(0, cy, R, 0, TAU);
  c.strokeStyle = P.red;
  c.lineWidth = 5;
  c.stroke();
  c.beginPath();
  c.arc(0, cy, R - 14, 0, TAU);
  c.strokeStyle = P.gold;
  c.lineWidth = 2.5;
  c.stroke();
  c.beginPath();
  c.arc(0, cy, R * 0.45, 0, TAU);
  c.strokeStyle = P.cream;
  c.lineWidth = 1.8;
  c.stroke();
  for (let k = 0; k < 16; k++) {
    const a = rot + (k * TAU) / 16;
    line(c, 0, cy, Math.cos(a) * R, cy + Math.sin(a) * R, P.cream, 1.6);
  }
  for (let k = 0; k < 24; k++) {
    const a = rot + (k * TAU) / 24;
    circ(c, Math.cos(a) * R, cy + Math.sin(a) * R, 2.5, (k + Math.floor(o.t * 2.5)) % 3 ? '#fff3b0' : '#d9a441');
  }
  const cols = [P.red, P.gold, P.green, P.sky, P.blue, P.purple, P.pink, P.orange];
  for (let k = 0; k < 8; k++) {
    const a = rot + (k * TAU) / 8;
    const x = Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    const sway = o.run ? Math.sin(o.t * 2 + k) * 1.5 : 0;
    line(c, x, y, x + sway, y + 6, P.steelDark, 2);
    rr(c, x - 12 + sway, y + 5, 24, 19, 6, cols[k]);
    rr(c, x - 13 + sway, y + 3, 26, 7, [6, 6, 2, 2], 'rgba(0,0,0,0.22)');
    rr(c, x - 8 + sway, y + 11, 16, 7, 2, P.skyLight);
    if (o.riders > 0 && o.run) {
      circ(c, x - 3.5 + sway, y + 15, 2.8, GUEST_LOOKS.skins[k % 6]);
      circ(c, x + 3.5 + sway, y + 15, 2.8, GUEST_LOOKS.skins[(k + 2) % 6]);
    }
  }
  circ(c, 0, cy, 14, P.gold);
  circ(c, 0, cy, 10, P.goldDark);
  star(c, 0, cy, 8, P.cream, rot * 2);
  rr(c, -78, -24, 156, 24, 6, P.blue);
  rr(c, -78, -24, 156, 7, [6, 6, 0, 0], '#6f8cf0');
  for (let k = 0; k < 9; k++) rect(c, -66 + k * 16.5, -12, 6, 12, P.blueDark);
  rr(c, 44, -52, 30, 30, 4, P.cream);
  rr(c, 49, -47, 20, 12, 2, P.skyLight);
  poly(c, [40, -52, 59, -64, 78, -52], P.red);
}

// ---- 11: comet coaster ------------------------------------------------------

const TRACK = buildTrack();

function buildTrack() {
  const pts = [];
  const push = (x, y, loop = false) => pts.push({ x, y, loop, s: 0 });
  // Catmull-Rom through a list of control points
  const spline = (cp, per = 10) => {
    for (let i = 1; i < cp.length - 2; i++) {
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const [p0, p1, p2, p3] = [cp[i - 1], cp[i], cp[i + 1], cp[i + 2]];
        const f = (a, b, d, e) => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t * t + (-a + 3 * b - 3 * d + e) * t * t * t);
        push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
      }
    }
  };
  spline([
    [20, -24], [-20, -24], [-92, -24], [-122, -40], [-112, -96], [-92, -196], [-78, -214], [-62, -198],
    [-46, -120], [-30, -64], [-6, -50], [22, -48], [40, -48],
  ]);
  for (let k = 0; k <= 30; k++) {
    const a = Math.PI / 2 - (k / 30) * TAU;
    push(26 + Math.cos(a) * 42, -90 + Math.sin(a) * 42, true);
  }
  spline([
    [10, -48], [26, -48], [50, -52], [72, -84], [96, -130], [116, -92], [128, -44], [112, -24], [60, -24],
    [-20, -24], [-60, -24],
  ]);
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    pts[i].s = s;
    s += Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  return { pts, length: s };
}

function trackAt(dist) {
  const { pts, length } = TRACK;
  const d = ((dist % length) + length) % length;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].s <= d) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[(lo + 1) % pts.length];
  const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = (d - a.s) / seg;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, ang: Math.atan2(b.y - a.y, b.x - a.x) };
}

function coaster(c, o) {
  shadow(c, 0, 4, 132, 13);
  const { pts, length } = TRACK;
  for (let i = 0; i < pts.length; i += 5) {
    const p = pts[i];
    if (p.loop || p.y > -34) continue;
    line(c, p.x, p.y, p.x, -2, P.steel, 1.6);
  }
  for (let i = 0; i + 10 < pts.length; i += 10) {
    const p = pts[i];
    const q = pts[i + 10];
    if (p.loop || q.loop || p.y > -60 || q.y > -60) continue;
    line(c, p.x, Math.min(-4, p.y + 60), q.x, q.y, 'rgba(201,206,214,0.7)', 1.1);
  }
  line(c, 26, -48, 26, -2, P.steel, 2);
  line(c, -6, -70, -6, -2, P.steel, 1.6);
  line(c, 58, -70, 58, -2, P.steel, 1.6);
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
  c.strokeStyle = P.redDark;
  c.lineWidth = 5;
  c.stroke();
  c.strokeStyle = '#ff7a7a';
  c.lineWidth = 1.6;
  c.stroke();
  // the train
  const lap = o.run ? o.p : 0;
  // slow up the lift hill, quick everywhere else
  const eased = lap < 0.38 ? (lap / 0.38) * 0.3 : 0.3 + ((lap - 0.38) / 0.62) * 0.7;
  const headDist = 34 + eased * length;
  const cols = [P.gold, P.blue, P.gold];
  for (let k = 2; k >= 0; k--) {
    const p = trackAt(headDist - k * 19);
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.ang);
    rr(c, -9, -11, 18, 9, 3.5, cols[k]);
    rr(c, -9, -5, 18, 3, 1.5, 'rgba(0,0,0,0.25)');
    if (o.run && o.riders > 0) head(c, -1, -14, 4.6, k + 2);
    c.restore();
  }
  // station
  rect(c, -84, -62, 4, 44, P.cream);
  rect(c, 36, -62, 4, 44, P.cream);
  rr(c, -90, -18, 136, 18, 5, P.blue);
  rr(c, -90, -18, 136, 6, [5, 5, 0, 0], '#6f8cf0');
  rr(c, -92, -72, 140, 12, 4, P.gold);
  rr(c, -92, -64, 140, 4, 2, P.goldDark);
  // comet sign
  c.beginPath();
  c.moveTo(-58, -86);
  c.quadraticCurveTo(-30, -96, -8, -82);
  c.quadraticCurveTo(-30, -84, -58, -76);
  c.closePath();
  c.fillStyle = P.orange;
  c.fill();
  star(c, -4, -84, 11, P.gold, o.t * 0.8);
  bulbRow(c, -86, -66, 42, -66, 9, o.t);
}

// ---- public: attractions ------------------------------------------------------

const DRAW = [toffee, ducks, teacups, helter, coconut, floss, dodgems, carousel, ghost, waltzer, wheel, coaster];

const IDLE = { t: 0, anim: 0, run: false, p: 0, riders: 0 };

export function drawAttraction(c, i, o = IDLE) {
  DRAW[i](c, o);
}

// Warm glows drawn additively after dark: [x, y, radius, tint]
export const LIGHTS = [
  [[0, -110, 90, 0]],
  [[0, -120, 100, 0], [0, -50, 70, 2]],
  [[0, -30, 120, 1]],
  [[0, -120, 80, 0], [0, -230, 60, 0]],
  [[0, -120, 105, 0]],
  [[0, -90, 85, 1], [0, -156, 55, 1]],
  [[-60, -100, 100, 0], [60, -100, 100, 0], [0, -40, 90, 2]],
  [[0, -150, 130, 0], [0, -60, 100, 0]],
  [[-98, -108, 40, 0], [80, -108, 40, 0], [0, -124, 60, 2]],
  [[-60, -110, 100, 1], [60, -110, 100, 1], [0, -30, 100, 0]],
  [[0, -156, 150, 0], [0, -30, 70, 2]],
  [[-20, -70, 110, 0], [26, -90, 80, 2], [-78, -200, 60, 0]],
];

// ---- guests -----------------------------------------------------------------

export function drawGuest(c, g, time) {
  const L = GUEST_LOOKS;
  const { x, y } = g;
  const s = g.tall;
  const stride = g.moving ? Math.sin(time * 12 + g.bob) : 0;
  const hop = g.moving ? Math.abs(stride) * 1.2 : 0;
  c.fillStyle = 'rgba(20,20,45,0.2)';
  c.beginPath();
  c.ellipse(x, y, 6.5, 2.6, 0, 0, TAU);
  c.fill();
  c.fillStyle = L.trousers[g.legs];
  c.fillRect(x - 4.4, y - 9 * s, 3.6, 9 * s - Math.max(0, stride) * 2.4);
  c.fillRect(x + 0.8, y - 9 * s, 3.6, 9 * s - Math.max(0, -stride) * 2.4);
  c.fillStyle = L.shirts[g.shirt];
  c.beginPath();
  c.roundRect(x - 6, y - 21 * s - hop, 12, 13.5 * s, 4.2);
  c.fill();
  const hy = y - 25.5 * s - hop;
  c.fillStyle = L.skins[g.skin];
  c.beginPath();
  c.arc(x, hy, 5.4, 0, TAU);
  c.fill();
  c.fillStyle = L.hairs[g.hair];
  c.beginPath();
  c.arc(x - g.face * 0.8, hy - 0.8, 5.5, Math.PI * 1.02, Math.PI * 1.98);
  c.closePath();
  c.fill();
  if (g.hat) {
    c.fillStyle = L.shirts[(g.shirt + 5) % L.shirts.length];
    c.fillRect(x - 6.5 + g.face * 1.5, hy - 4.2, 13, 2.2);
    c.beginPath();
    c.arc(x, hy - 4, 5, Math.PI, 0);
    c.fill();
  }
}

export function drawEmote(c, kind, x, y, a) {
  c.globalAlpha = a;
  circ(c, x, y, 9, 'rgba(255,255,255,0.95)');
  poly(c, [x - 3, y + 7, x + 3, y + 7, x, y + 12], 'rgba(255,255,255,0.95)');
  if (kind === 'heart') {
    circ(c, x - 2.6, y - 1.4, 3, P.red);
    circ(c, x + 2.6, y - 1.4, 3, P.red);
    poly(c, [x - 5.4, y - 0.2, x + 5.4, y - 0.2, x, y + 5.6], P.red);
  } else if (kind === 'star') {
    star(c, x, y, 6.2, P.gold);
  } else if (kind === 'note') {
    circ(c, x - 2, y + 3, 2.6, P.blue);
    rect(c, x - 0.2, y - 5, 1.6, 8, P.blue);
    rect(c, x - 0.2, y - 5, 5, 2.2, P.blue);
  } else if (kind === 'sad') {
    circ(c, x - 2.6, y - 1.5, 1.2, P.ink);
    circ(c, x + 2.6, y - 1.5, 1.2, P.ink);
    c.beginPath();
    c.arc(x, y + 4.6, 3, Math.PI * 1.15, Math.PI * 1.85);
    c.strokeStyle = P.ink;
    c.lineWidth = 1.3;
    c.stroke();
  } else {
    circ(c, x - 2.6, y - 1.5, 1.2, P.ink);
    circ(c, x + 2.6, y - 1.5, 1.2, P.ink);
    c.beginPath();
    c.arc(x, y + 0.5, 3.6, Math.PI * 0.15, Math.PI * 0.85);
    c.strokeStyle = P.ink;
    c.lineWidth = 1.3;
    c.stroke();
  }
  c.globalAlpha = 1;
}

// ---- scenery ----------------------------------------------------------------

export function drawTree(c, x, y, town, v = 0, s = 1) {
  shadow(c, x, y, 20 * s, 6 * s);
  if (town.sea && v % 3 === 0) {
    // a seaside palm
    c.beginPath();
    c.moveTo(x - 3 * s, y);
    c.quadraticCurveTo(x + 6 * s, y - 26 * s, x + 2 * s, y - 52 * s);
    c.lineTo(x + 7 * s, y - 52 * s);
    c.quadraticCurveTo(x + 12 * s, y - 26 * s, x + 4 * s, y);
    c.closePath();
    c.fillStyle = town.trunk;
    c.fill();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.62;
      c.beginPath();
      c.moveTo(x + 4 * s, y - 52 * s);
      c.quadraticCurveTo(x + 4 * s + Math.cos(a) * 20 * s, y - 62 * s + Math.sin(a) * 12 * s, x + 4 * s + Math.cos(a) * 32 * s, y - 44 * s + Math.sin(a) * 6 * s);
      c.strokeStyle = town.tree[k % 3];
      c.lineWidth = 6 * s;
      c.lineCap = 'round';
      c.stroke();
      c.lineCap = 'butt';
    }
    return;
  }
  rr(c, x - 4 * s, y - 22 * s, 8 * s, 24 * s, 3 * s, town.trunk);
  const [a, b, d] = town.tree;
  if (town.weather === 'snow') {
    // firs with snowy shoulders
    for (let k = 0; k < 3; k++) {
      const w = (24 - k * 6) * s;
      const by = y - (16 + k * 18) * s;
      poly(c, [x - w, by, x, by - 30 * s, x + w, by], k % 2 ? b : a);
      poly(c, [x - w * 0.5, by - 15 * s, x, by - 30 * s, x + w * 0.5, by - 15 * s], d);
    }
    return;
  }
  circ(c, x - 12 * s, y - 34 * s, 15 * s, d);
  circ(c, x + 12 * s, y - 36 * s, 16 * s, a);
  circ(c, x, y - 48 * s, 19 * s, b);
  circ(c, x - 6 * s, y - 54 * s, 6 * s, 'rgba(255,255,255,0.14)');
  if (v % 4 === 1 && !town.sea) {
    circ(c, x - 9 * s, y - 40 * s, 2.4 * s, '#ffdf6b');
    circ(c, x + 8 * s, y - 50 * s, 2.4 * s, '#ffdf6b');
    circ(c, x + 3 * s, y - 34 * s, 2.4 * s, '#ffdf6b');
  }
}

export function drawLamp(c, x, y, lit) {
  shadow(c, x, y, 7, 2.6);
  rr(c, x - 3.5, y - 5, 7, 6, 2, '#2f3350');
  rect(c, x - 1.6, y - 58, 3.2, 54, '#2f3350');
  rr(c, x - 7, y - 74, 14, 17, 4, lit ? '#ffe9a6' : '#f4ead0');
  rr(c, x - 9, y - 78, 18, 5, 2.5, '#2f3350');
  rect(c, x - 0.8, y - 73, 1.6, 15, 'rgba(47,51,80,0.5)');
}

export function drawBench(c, x, y) {
  shadow(c, x, y, 20, 4);
  rect(c, x - 17, y - 9, 3, 9, '#5f3f24');
  rect(c, x + 14, y - 9, 3, 9, '#5f3f24');
  rr(c, x - 20, y - 12, 40, 5, 2, P.wood);
  rr(c, x - 20, y - 24, 40, 5, 2, P.wood);
  rr(c, x - 20, y - 18, 40, 4, 2, P.woodDark);
}

export function drawBunting(c, x1, y1, x2, y2, sag, t) {
  const n = 9;
  c.beginPath();
  c.moveTo(x1, y1);
  c.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag * 2, x2, y2);
  c.strokeStyle = 'rgba(60,50,70,0.7)';
  c.lineWidth = 1.2;
  c.stroke();
  const cols = [P.red, P.gold, P.blue, P.green, P.pink];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = x1 + (x2 - x1) * u;
    const y = y1 + (y2 - y1) * u + sag * 4 * u * (1 - u);
    const sw = Math.sin(t * 3 + k) * 1.2;
    poly(c, [x - 5, y, x + 5, y, x + sw, y + 11], cols[k % cols.length]);
  }
}

export function drawGate(c, x, y, title, t) {
  // stone piers with brass caps and a lantern on each
  for (const s of [-1, 1]) {
    const px = x + s * 92;
    shadow(c, px + 6, y, 20, 5);
    rr(c, px - 15, y - 10, 30, 10, 2, '#b9ad95');
    rr(c, px - 12, y - 118, 24, 110, 3, '#e9e1cf');
    rect(c, px + 3, y - 118, 9, 110, 'rgba(90,70,40,0.16)');
    for (let k = 1; k < 5; k++) rect(c, px - 12, y - 118 + k * 22, 24, 1.4, 'rgba(90,70,40,0.25)');
    rr(c, px - 16, y - 126, 32, 10, 3, '#d9b976');
    rect(c, px - 16, y - 126, 32, 3, '#f5e6bd');
    rr(c, px - 5, y - 144, 10, 18, 3, '#27343f');
    circ(c, px, y - 136, 9, 'rgba(255,224,150,0.3)');
    circ(c, px, y - 136, 4.6, '#fff3c9');
    poly(c, [px - 7, y - 144, px, y - 153, px + 7, y - 144], '#27343f');
    flag(c, px, y - 152, s < 0 ? '#b8303f' : '#d9b976', t + s, s);
  }
  // the sign: green lacquer in a brass frame, like the machine
  c.beginPath();
  c.moveTo(x - 104, y - 108);
  c.quadraticCurveTo(x, y - 176, x + 104, y - 108);
  c.lineTo(x + 104, y - 74);
  c.quadraticCurveTo(x, y - 140, x - 104, y - 74);
  c.closePath();
  c.fillStyle = '#0e3d33';
  c.fill();
  c.strokeStyle = '#d9b976';
  c.lineWidth = 3.4;
  c.stroke();
  // lettering follows the arch, spaced by each letter's real width
  c.save();
  // a short name is set large; a long one shrinks to fit the arch
  const text = title.toUpperCase();
  c.font = displayFont(20);
  const natural = [...text].reduce((n, ch) => n + c.measureText(ch).width + 2, 0);
  const px = Math.max(13, Math.min(30, (20 * 150) / natural));
  c.font = displayFont(px);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#f5e6bd';
  const widths = [...text].map((ch) => c.measureText(ch).width + px * 0.12);
  const total = widths.reduce((a, b) => a + b, 0);
  const fit = Math.min(1, 176 / total);
  let cursor = x - (total * fit) / 2;
  for (let k = 0; k < text.length; k++) {
    const lx = cursor + (widths[k] * fit) / 2;
    cursor += widths[k] * fit;
    const dx = (lx - x) / 104;
    const ly = y - 91 - 33 * (1 - dx * dx);
    c.save();
    c.translate(lx, ly);
    c.rotate(dx * 0.6);
    c.scale(fit, 1);
    c.lineWidth = px * 0.22;
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(15,17,45,0.55)';
    c.strokeText(text[k], 0, 0);
    c.fillText(text[k], 0, 0);
    c.restore();
  }
  c.restore();
  for (let k = 0; k < 13; k++) {
    const u = k / 12;
    const lx = x - 100 + 200 * u;
    const dx = (lx - x) / 104;
    circ(c, lx, y - 110 - 33 * (1 - dx * dx), 2.2, (k + Math.floor(t * 2.5)) % 3 ? '#fff3c9' : '#c79a45');
  }
}

export function drawTicketBooth(c, x, y) {
  shadow(c, x, y, 26, 6);
  rr(c, x - 22, y - 50, 44, 50, 4, P.red);
  rr(c, x - 16, y - 42, 32, 18, 3, '#3a2340');
  head(c, x, y - 30, 7, 5);
  rr(c, x - 20, y - 24, 40, 5, 2, P.cream);
  poly(c, [x - 28, y - 50, x, y - 72, x + 28, y - 50], P.cream);
  poly(c, [x - 10, y - 57.8, x, y - 72, x + 10, y - 57.8, x + 10, y - 50, x - 10, y - 50], P.red);
  label(c, 'TICKETS', x, y - 12, 8.5, P.cream);
}

export function drawBandstand(c, x, y, t) {
  shadow(c, x, y + 2, 78, 12);
  ell(c, x, y - 4, 74, 15, '#8a5a2b');
  ell(c, x, y - 12, 74, 15, P.cream);
  for (let k = 0; k < 6; k++) {
    const px = x - 62 + k * 24.8;
    rect(c, px - 2, y - 84, 4, 72 + Math.sin((k / 5) * Math.PI) * 8, P.white);
  }
  // the band: three players bobbing in time
  for (let k = 0; k < 3; k++) {
    const px = x - 26 + k * 26;
    const bob = Math.sin(t * 5 + k * 2) * 1.5;
    rr(c, px - 7, y - 38 + bob, 14, 22, 5, k === 1 ? P.red : P.blue);
    head(c, px, y - 44 + bob, 6.5, k + 1);
    circ(c, px + 8, y - 30 + bob, 4.5, P.gold);
  }
  for (let k = 0; k < 5; k++) rr(c, x - 60 + k * 26, y - 26, 20, 5, 2, P.gold);
  poly(c, [x - 84, y - 84, x, y - 132, x + 84, y - 84], P.teal);
  poly(c, [x - 28, y - 84, x, y - 132, x + 28, y - 84], P.tealDark);
  awning(c, x - 86, y - 86, 172, 10, 10, P.tealDark, P.cream);
  circ(c, x, y - 134, 5, P.gold);
  for (let k = 0; k < 3; k++) {
    const u = (t * 0.35 + k / 3) % 1;
    const nx = x + 40 + k * 12 + Math.sin(u * 6 + k) * 8;
    const ny = y - 96 - u * 50;
    c.globalAlpha = 1 - u;
    circ(c, nx, ny, 3.2, P.ink);
    rect(c, nx + 2, ny - 11, 1.6, 11, P.ink);
    c.globalAlpha = 1;
  }
}

export function drawForSale(c, x, y, state) {
  // state: 'open' (next to buy), 'afford', 'locked'
  shadow(c, x, y, 26, 6);
  rect(c, x - 16, y - 34, 4, 34, P.woodDark);
  rect(c, x + 12, y - 34, 4, 34, P.woodDark);
  rr(c, x - 30, y - 60, 60, 34, 5, state === 'locked' ? '#b9b3a6' : P.cream);
  c.beginPath();
  c.roundRect(x - 30, y - 60, 60, 34, 5);
  c.strokeStyle = state === 'afford' ? P.green : state === 'locked' ? '#8f897b' : P.woodDark;
  c.lineWidth = 3;
  c.stroke();
  if (state === 'locked') {
    rr(c, x - 7, y - 46, 14, 11, 2, '#6f6a5f');
    c.beginPath();
    c.arc(x, y - 46, 5, Math.PI, 0);
    c.strokeStyle = '#6f6a5f';
    c.lineWidth = 2.6;
    c.stroke();
  } else {
    label(c, 'FOR', x, y - 50, 9, P.woodDark);
    label(c, 'SALE', x, y - 38, 12, state === 'afford' ? P.greenDark : P.red);
  }
}

export function drawBalloon(c, x, y, col, t) {
  const sway = Math.sin(t * 2.2) * 4;
  c.beginPath();
  c.moveTo(x, y + 26);
  c.quadraticCurveTo(x + sway, y + 44, x - sway * 0.5, y + 66);
  c.strokeStyle = 'rgba(40,40,60,0.6)';
  c.lineWidth = 1.4;
  c.stroke();
  rr(c, x - sway * 0.5 - 9, y + 64, 18, 14, 3, P.gold);
  rect(c, x - sway * 0.5 - 1.5, y + 64, 3, 14, P.red);
  rect(c, x - sway * 0.5 - 9, y + 69.5, 18, 3, P.red);
  ell(c, x, y, 22, 27, col);
  poly(c, [x - 4, y + 26, x + 4, y + 26, x, y + 31], col);
  ell(c, x - 8, y - 10, 5, 8, 'rgba(255,255,255,0.4)');
  star(c, x + 2, y + 2, 8, 'rgba(255,255,255,0.85)');
}

// ---- shared with the card painter ---------------------------------------------

export const prim = { rect, rr, circ, ell, line, poly, star, label, head, shadow, cloud, TAU };

// ---- slot machine symbols -------------------------------------------------------
// Drawn in a 100 x 100 box centred on the origin. One style for all eight:
// lit from the upper left, a fine dark outline, a soft shadow underneath.

const OUT = '#3a2a14';
const lin = (c, x0, y0, x1, y1, stops) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
const rad = (c, x, y, r, stops) => {
  const g = c.createRadialGradient(x, y, 1, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
const GOLD = (c) => lin(c, -30, -36, 30, 38, [[0, '#fdeeb5'], [0.45, '#e6ba4f'], [1, '#a06e16']]);
function ink(c, fill, lw = 2.4, stroke = OUT) {
  c.fillStyle = fill;
  c.fill();
  if (!lw) return;
  c.strokeStyle = stroke;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.stroke();
}
const cast = (c, y = 41, rx = 32) => ell(c, 2, y, rx, 5.5, 'rgba(40,25,10,0.2)');
function glintArc(c, r, a0 = -2.6, a1 = -1.5, w = 3, alpha = 0.75) {
  c.beginPath();
  c.arc(0, 0, r, a0, a1);
  c.strokeStyle = `rgba(255,255,255,${alpha})`;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.stroke();
  c.lineCap = 'butt';
}
function starPath(c, x, y, R, r, n = 5) {
  c.beginPath();
  for (let k = 0; k < n * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / n;
    const rr2 = k % 2 ? r : R;
    c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
  }
  c.closePath();
}
function smallCoin(c, x, y, r) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  ink(c, lin(c, x - r, y - r, x + r, y + r, [[0, '#fdeeb5'], [0.5, '#e6ba4f'], [1, '#a06e16']]), 1.6, '#7a5210');
  c.beginPath();
  c.arc(x, y, r * 0.62, 0, TAU);
  c.strokeStyle = 'rgba(122,82,16,0.55)';
  c.lineWidth = 1;
  c.stroke();
}

function symCoin(c) {
  cast(c, 42, 30);
  c.beginPath();
  c.arc(0, 0, 39, 0, TAU);
  ink(c, GOLD(c));
  // a milled edge
  c.strokeStyle = 'rgba(110,70,10,0.45)';
  c.lineWidth = 1.2;
  c.beginPath();
  for (let k = 0; k < 40; k++) {
    const a = (k * TAU) / 40;
    c.moveTo(Math.cos(a) * 33.5, Math.sin(a) * 33.5);
    c.lineTo(Math.cos(a) * 37.5, Math.sin(a) * 37.5);
  }
  c.stroke();
  c.beginPath();
  c.arc(0, 0, 31, 0, TAU);
  ink(c, rad(c, -10, -12, 44, [[0, '#fff5cc'], [0.55, '#efc85e'], [1, '#c08a20']]), 1.5, '#8a5d10');
  // the pound sign, struck into the metal
  label(c, '£', 1.4, 3.6, 46, '#fff3c4');
  label(c, '£', 0, 2.2, 46, '#8a5d10');
  glintArc(c, 35);
}

function symSack(c) {
  cast(c, 43, 36);
  smallCoin(c, -31, 34, 9);
  smallCoin(c, 32, 36, 7.5);
  // a velvet purse
  c.beginPath();
  c.moveTo(-13, -24);
  c.bezierCurveTo(-54, -2, -46, 42, 0, 42);
  c.bezierCurveTo(46, 42, 54, -2, 13, -24);
  c.closePath();
  ink(c, rad(c, -14, 0, 58, [[0, '#46a482'], [0.6, '#1f6d54'], [1, '#0e3d30']]), 2.4, '#0b2a21');
  c.strokeStyle = 'rgba(6,36,28,0.45)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-9, -20);
  c.quadraticCurveTo(-24, 6, -18, 33);
  c.moveTo(10, -20);
  c.quadraticCurveTo(26, 4, 21, 31);
  c.stroke();
  c.beginPath();
  c.moveTo(-15, -24);
  for (const [x, y] of [[-25, -46], [-9, -39], [0, -48], [9, -39], [25, -46], [15, -24]]) c.lineTo(x, y);
  c.closePath();
  ink(c, lin(c, 0, -48, 0, -24, [[0, '#3c9374'], [1, '#17543f']]), 2.2, '#0b2a21');
  // gold cord and its tassels
  for (const sx of [-1, 1]) {
    line(c, sx * 12, -25, sx * 22, -10, '#8a5d10', 3.6);
    line(c, sx * 12, -25, sx * 22, -10, '#e6ba4f', 2);
    smallCoin(c, sx * 23, -8, 3.4);
  }
  c.beginPath();
  c.roundRect(-18, -30, 36, 8.5, 4);
  ink(c, GOLD(c), 1.6, '#7a5210');
  c.beginPath();
  c.arc(0, 11, 15.5, 0, TAU);
  ink(c, rad(c, -5, 5, 22, [[0, '#fff5cc'], [0.6, '#e6ba4f'], [1, '#b07c1a']]), 1.8, '#7a5210');
  label(c, '£', 0, 12.5, 23, '#7a5210');
  c.save();
  c.rotate(0.35);
  ell(c, -20, 6, 4.5, 15, 'rgba(255,255,255,0.16)');
  c.restore();
}

function symPie(c) {
  cast(c, 38, 40);
  // a fluted tin
  c.beginPath();
  c.moveTo(-43, 6);
  c.lineTo(43, 6);
  c.lineTo(33, 34);
  c.lineTo(-33, 34);
  c.closePath();
  ink(c, lin(c, -43, 0, 43, 0, [[0, '#f4f6f9'], [0.3, '#c7ced8'], [0.72, '#96a1b0'], [1, '#d7dce4']]), 2.2, '#465060');
  for (let k = -3; k <= 3; k++) line(c, k * 11, 10, k * 9.3, 31, 'rgba(60,70,90,0.4)', 1.4);
  c.beginPath();
  c.roundRect(-47, 0, 94, 9, 4.5);
  ink(c, lin(c, 0, 0, 0, 9, [[0, '#ffffff'], [1, '#c7ced8']]), 2, '#465060');
  // whipped cream: outline the whole heap, then fill it
  const puffs = [];
  for (let k = 0; k < 5; k++) puffs.push([-30 + k * 15, -6, 13]);
  for (let k = 0; k < 4; k++) puffs.push([-22 + k * 15, -17, 11]);
  puffs.push([-6, -27, 10], [9, -27, 10]);
  c.strokeStyle = '#9c7f4c';
  c.lineWidth = 4;
  for (const [x, y, r] of puffs) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.stroke();
  }
  const cream = rad(c, -12, -26, 56, [[0, '#ffffff'], [0.6, '#fbf2de'], [1, '#e3cfa6']]);
  for (const [x, y, r] of puffs) circ(c, x, y, r, cream);
  c.strokeStyle = 'rgba(170,140,90,0.45)';
  c.lineWidth = 1.4;
  for (const [x, y, r] of puffs.slice(0, 9)) {
    c.beginPath();
    c.arc(x, y, r * 0.62, 0.3, 1.9);
    c.stroke();
  }
  c.beginPath();
  c.arc(2, -38, 8.5, 0, TAU);
  ink(c, rad(c, -1, -41, 12, [[0, '#f0828a'], [0.5, '#c2303f'], [1, '#7d1c28']]), 1.8, '#4f0f18');
  circ(c, -1, -41.5, 2.2, 'rgba(255,255,255,0.8)');
  line(c, 2, -46, 9, -54, '#2f6b3f', 2.2);
}

function symBarrel(c) {
  cast(c, 41, 36);
  c.beginPath();
  c.moveTo(-30, -14);
  c.quadraticCurveTo(-41, 12, -30, 39);
  c.lineTo(30, 39);
  c.quadraticCurveTo(41, 12, 30, -14);
  c.closePath();
  ink(c, lin(c, -38, 0, 38, 0, [[0, '#8a5a2e'], [0.32, '#cf9455'], [0.62, '#b67b3d'], [1, '#6c431f']]));
  c.save();
  c.clip();
  for (let k = -2; k <= 2; k++) rect(c, k * 14 - 0.8, -20, 1.6, 62, 'rgba(70,40,15,0.5)');
  for (const y of [-5, 24]) {
    rect(c, -42, y, 84, 8, '#5e4619');
    c.fillStyle = lin(c, -40, 0, 40, 0, [[0, '#b48a3c'], [0.35, '#f5e6bd'], [0.7, '#c79a45'], [1, '#8a6a2a']]);
    c.fillRect(-42, y + 1.2, 84, 5.6);
    for (const x of [-24, 0, 24]) circ(c, x, y + 4, 1.5, '#5e4619');
  }
  c.restore();
  c.beginPath();
  c.ellipse(0, -14, 30, 9, 0, 0, TAU);
  ink(c, '#4d2f15', 2.2);
  // sawdust heaped over the brim
  const heap = [];
  for (let k = 0; k < 7; k++) heap.push([-22 + k * 7.4, -21 - Math.sin(k * 1.3) * 4, 8]);
  c.strokeStyle = '#8a6a34';
  c.lineWidth = 3.4;
  for (const [x, y, r] of heap) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.stroke();
  }
  for (const [x, y, r] of heap) circ(c, x, y, r, '#f0dcae');
  for (const [x, y] of [[-16, -22], [-4, -18], [12, -24], [20, -19]]) circ(c, x, y, 1.1, '#b7975a');
  // the prize ticket
  c.save();
  c.translate(1, -31);
  c.rotate(-0.1);
  c.beginPath();
  c.roundRect(-12, -14, 24, 26, 4);
  ink(c, '#fbf6e9', 1.8);
  label(c, '?', 0, 0, 22, '#b8303f');
  c.restore();
}

function symLock(c) {
  cast(c, 42, 30);
  const shackle = () => {
    c.beginPath();
    c.moveTo(-19, 4);
    c.lineTo(-19, -12);
    c.arc(0, -12, 19, Math.PI, 0);
    c.lineTo(19, 4);
  };
  c.lineCap = 'butt';
  shackle();
  c.strokeStyle = '#3d4654';
  c.lineWidth = 13.5;
  c.stroke();
  shackle();
  c.strokeStyle = lin(c, -26, 0, 26, 0, [[0, '#f4f6f9'], [0.45, '#b9c2ce'], [1, '#7f8a99']]);
  c.lineWidth = 9;
  c.stroke();
  c.beginPath();
  c.arc(0, -12, 21.5, Math.PI * 1.1, Math.PI * 1.5);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.lineWidth = 2.4;
  c.stroke();
  c.beginPath();
  c.roundRect(-32, -5, 64, 45, 10);
  ink(c, lin(c, -20, -5, 20, 40, [[0, '#fbe6a0'], [0.5, '#dcae42'], [1, '#9e7018']]));
  c.beginPath();
  c.roundRect(-25.5, 1.5, 51, 32, 6);
  c.strokeStyle = 'rgba(110,74,12,0.55)';
  c.lineWidth = 1.4;
  c.stroke();
  for (const [x, y] of [[-21, 6], [21, 6], [-21, 29], [21, 29]]) circ(c, x, y, 1.6, 'rgba(110,74,12,0.6)');
  circ(c, 0, 13.5, 7.5, OUT);
  poly(c, [-3.6, 15, 3.6, 15, 5.6, 29, -5.6, 29], OUT);
  c.beginPath();
  c.roundRect(-26, -1, 34, 5, 2.5);
  c.fillStyle = 'rgba(255,255,255,0.45)';
  c.fill();
}

function symToken(c) {
  cast(c, 42, 30);
  c.beginPath();
  c.arc(0, 0, 39, 0, TAU);
  ink(c, rad(c, -10, -12, 50, [[0, '#b99aee'], [0.6, '#7d5bbe'], [1, '#48307f']]), 2.4, '#2a1a52');
  // ivory inserts round the edge, as on a gaming chip
  for (let k = 0; k < 8; k++) {
    c.save();
    c.rotate((k * TAU) / 8);
    c.beginPath();
    c.roundRect(-5.5, -38.5, 11, 8, 2);
    c.fillStyle = '#f3ebff';
    c.fill();
    c.restore();
  }
  c.beginPath();
  c.arc(0, 0, 27.5, 0, TAU);
  ink(c, rad(c, -8, -10, 34, [[0, '#7a55c0'], [1, '#3b2470']]), 1.6, '#d9c6ff');
  starPath(c, 0, 1.5, 19, 8.2);
  ink(c, GOLD(c), 1.8, '#6e4a0c');
  starPath(c, 0, 1.5, 9, 4);
  c.fillStyle = '#fff3c4';
  c.fill();
  glintArc(c, 35, -2.6, -1.6, 2.6, 0.6);
}

function symStar(c) {
  cast(c, 42, 28);
  const [R, r] = [45, 19.5];
  starPath(c, 0, 4, R, r);
  c.fillStyle = '#8a5d10';
  c.fill();
  starPath(c, 0, 0, R, r);
  ink(c, GOLD(c));
  // cut like a jewel: each point has a lit face and a shaded one
  for (let k = 0; k < 10; k++) {
    const a0 = -Math.PI / 2 + (k * Math.PI) / 5;
    const a1 = a0 + Math.PI / 5;
    const [r0, r1] = k % 2 ? [r, R] : [R, r];
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    c.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    c.closePath();
    c.fillStyle = k % 2 ? 'rgba(120,70,0,0.2)' : 'rgba(255,255,255,0.3)';
    c.fill();
  }
  starPath(c, 0, 0, R, r);
  c.strokeStyle = OUT;
  c.lineWidth = 2.4;
  c.lineJoin = 'round';
  c.stroke();
  for (const [x, y, s] of [[-34, -30, 6.5], [36, -24, 5], [31, 33, 4], [-36, 28, 4]]) {
    starPath(c, x, y, s, s * 0.28, 4);
    ink(c, '#ffffff', 1, 'rgba(160,110,20,0.7)');
  }
}

function symChips(c) {
  cast(c, 45, 14);
  for (const [x, top, tilt] of [[-18, -40, -0.2], [-6, -47, -0.05], [8, -45, 0.12], [20, -37, 0.3], [0, -35, 0]]) {
    c.save();
    c.translate(x, 0);
    c.rotate(tilt);
    c.beginPath();
    c.roundRect(-5, top, 10, 44, 3);
    ink(c, lin(c, -5, 0, 5, 0, [[0, '#ffe59a'], [0.5, '#f0b93c'], [1, '#c2861c']]), 1.5, '#8a5d10');
    c.restore();
  }
  // a paper cone with a fine stripe
  const cone = () => {
    c.beginPath();
    c.moveTo(-32, -8);
    c.lineTo(32, -8);
    c.lineTo(6, 45);
    c.lineTo(-6, 45);
    c.closePath();
  };
  c.save();
  cone();
  c.fillStyle = lin(c, -32, 0, 32, 0, [[0, '#fffaf0'], [0.6, '#f6ecd6'], [1, '#dccdaa']]);
  c.fill();
  c.clip();
  for (let k = -3; k <= 3; k++) poly(c, [k * 10 - 2.4, -8, k * 10 + 2.4, -8, k * 2 + 0.6, 45, k * 2 - 0.6, 45], '#b8303f');
  c.restore();
  cone();
  c.strokeStyle = OUT;
  c.lineWidth = 2.2;
  c.lineJoin = 'round';
  c.stroke();
  c.beginPath();
  c.roundRect(-35, -13, 70, 8.5, 4);
  ink(c, lin(c, 0, -13, 0, -4, [[0, '#fffaf0'], [1, '#e2d2ac']]), 2, OUT);
}

const SYMBOL = { coin: symCoin, sack: symSack, pie: symPie, barrel: symBarrel, lock: symLock, token: symToken, star: symStar, chips: symChips };

export function drawSymbol(c, id, x, y, size) {
  c.save();
  c.translate(x, y);
  c.scale(size / 100, size / 100);
  SYMBOL[id](c);
  c.restore();
}

// ---- what each star adds to a plot ---------------------------------------------

function planter(c, x, y) {
  rr(c, x - 15, y - 12, 30, 12, 3, '#8a5a2b');
  rect(c, x - 15, y - 12, 30, 3, '#a8733a');
  const cols = ['#ff6b8b', '#ffd75e', '#ffffff', '#ff9a4d'];
  for (let k = 0; k < 4; k++) {
    circ(c, x - 10 + k * 6.7, y - 15, 3.4, '#3f9b4b');
    circ(c, x - 10 + k * 6.7, y - 17.5, 3, cols[k]);
  }
}

// Decor behind the attraction (drawn before it).
export function drawPlotBack(c, w, stage, t) {
  if (stage >= 3) {
    const hw = w / 2 + 12;
    for (const s of [-1, 1]) {
      rect(c, s * hw - 2, -150, 4, 150, '#3b3350');
      circ(c, s * hw, -152, 4, P.gold);
    }
    c.beginPath();
    c.moveTo(-hw, -150);
    c.quadraticCurveTo(0, -128, hw, -150);
    c.strokeStyle = 'rgba(60,50,70,0.75)';
    c.lineWidth = 1.2;
    c.stroke();
    const n = 9;
    const phase = Math.floor(t * 2.5);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = -hw + 2 * hw * u;
      const y = -150 + 44 * u * (1 - u);
      circ(c, x, y + 3, 3, (k + phase) % 3 ? ['#fff3b0', '#ff9ab0', '#9ad7ff'][k % 3] : '#b9a37b');
    }
  }
}

// Decor in front of the attraction (drawn after it).
export function drawPlotFront(c, w, side, stage, t) {
  const hw = w / 2;
  if (stage >= 2) {
    // a picket fence either side of the way in
    for (const s of [-1, 1]) {
      const x0 = s * hw * 0.44;
      const x1 = s * (hw + 6);
      rect(c, Math.min(x0, x1), 9, Math.abs(x1 - x0), 3, '#fffaf0');
      rect(c, Math.min(x0, x1), 16, Math.abs(x1 - x0), 3, '#fffaf0');
      const n = Math.max(3, Math.round(Math.abs(x1 - x0) / 11));
      for (let k = 0; k <= n; k++) {
        const x = x0 + ((x1 - x0) * k) / n;
        poly(c, [x - 3, 22, x - 3, 5, x, 1, x + 3, 5, x + 3, 22], '#fffaf0');
      }
      rr(c, x0 - 4, -2, 8, 26, 2, '#f1e3bf');
      circ(c, x0, -4, 4.5, P.gold);
    }
  }
  if (stage >= 3) {
    planter(c, -hw - 4, 22);
    planter(c, hw + 4, 22);
  }
  if (stage >= 4) {
    for (const s of [-1, 1]) {
      const x = s * (hw + 20);
      shadow(c, x, 6, 7, 2.5);
      rect(c, x - 1.6, -96, 3.2, 102, '#e8d9b5');
      circ(c, x, -98, 4, P.gold);
      const wave = Math.sin(t * 3 + s) * 2.5;
      poly(c, [x, -94, x + s * 24, -88 + wave, x + s * 18, -78 + wave, x + s * 24, -68 + wave, x, -62], s < 0 ? P.red : P.blue);
      star(c, x + s * 10, -78 + wave * 0.5, 4.5, P.gold);
    }
  }
  if (stage >= 5) {
    const x = side * (hw - 6);
    shadow(c, x, 26, 12, 3.5);
    rect(c, x - 2, -8, 4, 34, '#8a5a2b');
    circ(c, x, -22, 17, P.goldDark);
    circ(c, x, -24, 17, P.gold);
    star(c, x, -24, 11, '#fffbe0', -Math.PI / 2 + Math.sin(t * 2) * 0.15);
    for (let k = 0; k < 5; k++) {
      const u = (t * 0.6 + k / 5) % 1;
      const a = k * 2.4 + 1;
      const px = Math.cos(a) * (hw * 0.9);
      const py = -30 - ((k * 53) % 110) - u * 14;
      c.globalAlpha = Math.sin(u * Math.PI) * 0.9;
      star(c, px, py, 5, '#fff3b0', u * 3);
      c.globalAlpha = 1;
    }
  }
}

// A custard pie has landed.
export function drawSplat(c, w, h, t) {
  const y = -h * 0.5;
  const r = Math.min(w, h) * 0.3;
  c.save();
  c.translate(0, y);
  for (let k = 0; k < 9; k++) {
    const a = (k * TAU) / 9 + 0.3;
    circ(c, Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.7, r * (0.34 + ((k * 7) % 5) * 0.03), '#ffe9a6');
  }
  circ(c, 0, 0, r * 0.8, '#fff3c4');
  for (const [dx, len] of [[-0.5, 1.5], [0.1, 2.1], [0.55, 1.2]]) {
    rr(c, dx * r - r * 0.1, r * 0.3, r * 0.2, r * len * (0.85 + Math.sin(t * 1.5 + dx) * 0.05), r * 0.1, '#ffe9a6');
  }
  circ(c, -r * 0.25, -r * 0.2, r * 0.22, 'rgba(255,255,255,0.7)');
  ell(c, r * 0.1, r * 0.1, r * 0.34, r * 0.1, P.steel);
  c.restore();
  rr(c, -34, -30, 68, 22, 4, '#fff6e0');
  c.beginPath();
  c.roundRect(-34, -30, 68, 22, 4);
  c.strokeStyle = P.red;
  c.lineWidth = 3;
  c.stroke();
  label(c, 'CLOSED', 0, -18.5, 13, P.red);
}

// ---- Chips the gull ---------------------------------------------------------

export function drawGull(c, x, y, s, t, happy = false) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  const bob = Math.sin(t * 3) * 2;
  ell(c, 0, 4, 34, 7, 'rgba(0,0,0,0.16)');
  line(c, -8, -12, -10, 2, P.orange, 4);
  line(c, 8, -12, 10, 2, P.orange, 4);
  poly(c, [-18, 2, -4, 2, -10, -3], P.orange);
  poly(c, [4, 2, 18, 2, 10, -3], P.orange);
  c.translate(0, bob);
  poly(c, [-30, -34, -52, -30, -34, -22], '#9aa3ad');
  ell(c, 0, -34, 34, 24, '#ffffff');
  c.beginPath();
  c.ellipse(-8, -34, 24, 15, 0.25, 0, TAU);
  c.fillStyle = '#aab3bd';
  c.fill();
  poly(c, [-30, -30, -40, -22, -24, -24], '#3b3f4a');
  circ(c, 24, -62, 19, '#ffffff');
  poly(c, [38, -64, 62, -58, 38, -52], P.gold);
  poly(c, [38, -58, 62, -58, 38, -52], P.goldDark);
  circ(c, 52, -56, 2.2, P.red);
  circ(c, 28, -66, 4.4, P.ink);
  circ(c, 29.4, -67.4, 1.5, '#ffffff');
  if (happy) {
    line(c, 20, -74, 30, -76, P.ink, 2.4);
    rr(c, 58, -64, 22, 6, 2, '#f2b93b');
  } else {
    line(c, 20, -76, 31, -73, P.ink, 2.4);
  }
  c.restore();
}

// A lucky-dip tub for the raid screen, open or still full of sawdust.
export function drawTub(c, x, y, s, open, found) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  symBarrel(c);
  if (open) {
    ell(c, 0, -14, 30, 9, '#5a3416');
    if (found) {
      for (const [dx, dy] of [[-12, -16], [10, -18], [0, -26], [-4, -12], [14, -10]]) {
        circ(c, dx, dy + 2, 9, P.goldDark);
        circ(c, dx, dy, 9, '#ffd75e');
      }
    } else {
      for (let k = 0; k < 5; k++) circ(c, -16 + k * 8, -15, 6, '#e6cf96');
    }
  }
  c.restore();
}

export function drawPack(c, x, y, s, type) {
  const col = { bronze: ['#c98a4e', '#9a5f2c', '#f0c49a'], silver: ['#c9ced6', '#8d96a3', '#f4f6f9'], gold: ['#ffc53d', '#d99a16', '#fff3b0'] }[type];
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  ell(c, 0, 44, 30, 6, 'rgba(0,0,0,0.18)');
  rr(c, -30, -42, 60, 84, 8, col[1]);
  rr(c, -30, -45, 60, 84, 8, col[0]);
  rr(c, -24, -39, 48, 72, 5, col[1]);
  for (let k = 0; k < 7; k++) poly(c, [-30 + k * 8.6, -45, -26 + k * 8.6, -51, -22 + k * 8.6, -45], col[0]);
  star(c, 0, -4, 17, col[2]);
  star(c, 0, -4, 8, col[0]);
  rr(c, -20, 20, 40, 7, 3.5, col[2]);
  rr(c, -24, -39, 10, 72, 5, 'rgba(255,255,255,0.16)');
  c.restore();
}
