// Collectable cards: a little painting for each, plus the card frame.
// Paintings are drawn in a 100 x 100 box centred on the origin.
import { ATTRACTIONS, CARD_SETS } from './config.js';
import { P, displayFont, drawAttraction, drawBandstand, drawGull, drawSymbol, prim } from './art.js';

const { rect, rr, circ, ell, line, poly, star, label, cloud, TAU } = prim;

const stick = (c, x1, y1, x2, y2, w = 4) => line(c, x1, y1, x2, y2, '#f1e0c0', w);
const shine = (c, x, y, rx = 6, ry = 3.5) => ell(c, x, y, rx, ry, 'rgba(255,255,255,0.6)');
const ground = (c, y = 40, rx = 30) => ell(c, 0, y, rx, 6, 'rgba(0,0,0,0.15)');

const ART = {
  // ---- Sweet Tooth ----
  toffeeapple(c) {
    ground(c, 34, 24);
    stick(c, 0, -46, 0, -8, 5);
    circ(c, 0, 8, 28, '#a8541a');
    circ(c, 0, 10, 27, '#d92b33');
    c.beginPath();
    c.arc(0, 8, 28, Math.PI, 0);
    c.fillStyle = '#a8541a';
    c.fill();
    for (const x of [-18, -4, 12]) rr(c, x, 4, 9, 14, 4.5, '#a8541a');
    shine(c, -11, -8, 8, 5);
  },
  lolly(c) {
    stick(c, 0, 8, 0, 46, 5);
    circ(c, 0, -10, 30, '#ff7fb0');
    for (let k = 0; k < 4; k++) {
      c.beginPath();
      c.arc(0, -10, 26 - k * 6.5, k * 1.4, k * 1.4 + Math.PI * 1.3);
      c.strokeStyle = k % 2 ? '#fff6e0' : '#e5484d';
      c.lineWidth = 5;
      c.stroke();
    }
    shine(c, -12, -24, 7, 4);
  },
  floss(c) {
    poly(c, [-7, 6, 7, 6, 2, 46, -2, 46], '#fff6e0');
    poly(c, [-7, 6, -1, 6, -2, 46], '#e8d9b5');
    cloud(c, 0, -14, 2.6, '#ffb3d9');
  },
  rock(c) {
    c.save();
    c.rotate(-0.6);
    rr(c, -44, -11, 88, 22, 6, '#ff9ac4');
    c.beginPath();
    c.roundRect(-44, -11, 88, 22, 6);
    c.clip();
    for (let k = -4; k <= 4; k++) poly(c, [k * 14 - 3, -11, k * 14 + 4, -11, k * 14 - 3, 11, k * 14 - 10, 11], '#ffffff');
    rect(c, -44, -11, 88, 5, 'rgba(255,255,255,0.35)');
    c.restore();
    c.save();
    c.rotate(-0.6);
    ell(c, 44, 0, 5, 11, '#fff6e0');
    label(c, '★', 44, 1, 9, P.red);
    c.restore();
  },
  icecream(c) {
    poly(c, [-20, -2, 20, -2, 0, 46], '#e0a35a');
    for (let k = -2; k <= 2; k++) line(c, k * 8, -2, k * 3 + 4, 30 - Math.abs(k) * 6, '#b9772e', 1.4);
    circ(c, -12, -12, 15, '#fffaf0');
    circ(c, 12, -12, 15, '#fff6e0');
    circ(c, 0, -26, 16, '#fffaf0');
    circ(c, 0, -40, 9, '#fff6e0');
    c.save();
    c.rotate(0.5);
    rr(c, -2, -52, 9, 36, 3, '#6b4226');
    c.restore();
  },
  doughnut(c) {
    ground(c, 30, 34);
    ell(c, 0, 6, 40, 30, '#d99a4e');
    ell(c, 0, 0, 40, 28, '#ff8fc0');
    for (const [x, w] of [[-24, 10], [-4, 12], [18, 9]]) rr(c, x, 14, w, 14, 5, '#ff8fc0');
    ell(c, 0, 0, 13, 8, '#b9772e');
    const cols = ['#ffffff', '#ffd75e', '#5cc8f0', '#46a758', '#e5484d'];
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4;
      c.save();
      c.translate(Math.cos(a) * 26, Math.sin(a) * 17 - 1);
      c.rotate(k);
      rr(c, -4, -1.5, 8, 3, 1.5, cols[k % 5]);
      c.restore();
    }
  },
  popcorn(c) {
    for (const [x, y, r] of [[-18, -22, 12], [0, -30, 14], [18, -22, 12], [-9, -14, 11], [10, -13, 11], [-24, -10, 9], [25, -10, 9]]) {
      circ(c, x, y, r, '#fff3c4');
      circ(c, x - 3, y - 3, r * 0.45, '#fffbe6');
    }
    c.save();
    c.beginPath();
    c.moveTo(-30, -8);
    c.lineTo(30, -8);
    c.lineTo(22, 44);
    c.lineTo(-22, 44);
    c.closePath();
    c.fillStyle = '#fff6e0';
    c.fill();
    c.clip();
    for (let k = -3; k <= 3; k += 2) poly(c, [k * 9 - 5, -8, k * 9 + 5, -8, k * 7 + 4, 44, k * 7 - 4, 44], P.red);
    c.restore();
    rr(c, -32, -12, 64, 8, 4, '#f3e3bd');
  },
  humbug(c) {
    ground(c, 30, 30);
    c.save();
    c.rotate(-0.25);
    poly(c, [-48, -14, -30, -4, -30, 6, -48, 16], '#fff6e0');
    poly(c, [48, -14, 30, -4, 30, 6, 48, 16], '#fff6e0');
    c.beginPath();
    c.ellipse(0, 0, 32, 24, 0, 0, TAU);
    c.fillStyle = '#3b2a1e';
    c.fill();
    c.clip();
    for (let k = -3; k <= 3; k++) {
      c.beginPath();
      c.ellipse(k * 11, 0, 3, 26, 0, 0, TAU);
      c.fillStyle = '#fff6e0';
      c.fill();
    }
    c.restore();
    shine(c, -10, -12, 9, 4);
  },
  sundae(c) {
    poly(c, [-22, -10, 22, -10, 8, 26, -8, 26], '#dff3ff');
    rect(c, -3, 26, 6, 12, '#bfe6ff');
    ell(c, 0, 40, 18, 5, '#bfe6ff');
    poly(c, [-18, -4, 18, -4, 13, 6, -13, 6], '#ff8fc0');
    poly(c, [-13, 6, 13, 6, 9, 18, -9, 18], '#ffd75e');
    circ(c, -10, -16, 11, '#fffaf0');
    circ(c, 10, -16, 11, '#ffb3d9');
    circ(c, 0, -28, 12, '#fffaf0');
    circ(c, 0, -42, 6.5, P.red);
    line(c, 0, -47, 6, -54, P.greenDark, 2);
    c.save();
    c.rotate(0.45);
    rr(c, 2, -50, 8, 30, 2, '#e0a35a');
    c.restore();
    line(c, -22, -10, -10, 22, 'rgba(255,255,255,0.7)', 2.5);
  },

  // ---- Every One a Winner ----
  duck(c) {
    ell(c, 0, 34, 40, 6, '#5cc8f0');
    ell(c, -4, 14, 34, 22, '#ffd21f');
    poly(c, [-34, 4, -48, -8, -30, 16], '#ffd21f');
    circ(c, 18, -16, 19, '#ffd21f');
    poly(c, [34, -18, 52, -12, 34, -6], P.orange);
    circ(c, 22, -22, 4, P.ink);
    circ(c, 23.2, -23.2, 1.4, '#fff');
    ell(c, -8, 14, 16, 10, '#f2b800');
    shine(c, 10, -28, 6, 3);
  },
  coconut(c) {
    ground(c, 36, 30);
    ell(c, 0, 2, 34, 38, '#6b4226');
    for (let k = 0; k < 16; k++) {
      const a = k * 0.9;
      line(c, Math.cos(a) * 12, 2 + Math.sin(a) * 14, Math.cos(a) * 30, 2 + Math.sin(a) * 34, '#84563a', 1.6);
    }
    ell(c, -8, -10, 12, 14, '#84563a');
    circ(c, -8, -22, 4, '#2e1a0e');
    circ(c, 8, -22, 4, '#2e1a0e');
    circ(c, 0, -10, 4, '#2e1a0e');
  },
  hoopla(c) {
    ground(c, 36, 30);
    rect(c, -4, -30, 8, 62, P.woodDark);
    rr(c, -24, 26, 48, 10, 4, P.wood);
    for (const [y, col] of [[14, P.red], [0, P.gold], [-34, P.blue]]) {
      c.beginPath();
      c.ellipse(0, y, y === -34 ? 30 : 26, y === -34 ? 11 : 9, y === -34 ? -0.3 : 0, 0, TAU);
      c.strokeStyle = col;
      c.lineWidth = 8;
      c.stroke();
    }
    rect(c, -4, -8, 8, 16, P.woodDark);
  },
  mallet(c) {
    c.save();
    c.rotate(-0.6);
    rr(c, -4, -14, 8, 62, 4, P.woodDark);
    rr(c, -34, -44, 68, 34, 8, P.red);
    rr(c, -34, -44, 14, 34, 7, '#ff7a7a');
    rr(c, 20, -44, 14, 34, 7, P.redDark);
    rect(c, -8, -44, 16, 34, P.gold);
    c.restore();
    star(c, 30, 26, 10, P.gold);
  },
  dart(c) {
    c.save();
    c.rotate(-0.75);
    poly(c, [-46, 0, -30, -14, -22, 0, -30, 14], P.red);
    poly(c, [-46, 0, -30, -14, -26, -6], '#ff7a7a');
    rr(c, -24, -4, 40, 8, 4, P.gold);
    rr(c, 14, -3, 20, 6, 3, P.steel);
    poly(c, [34, -3, 50, 0, 34, 3], P.steelDark);
    c.restore();
    circ(c, 30, -30, 9, '#fff6e0');
    circ(c, 30, -30, 5, P.red);
  },
  cans(c) {
    ground(c, 40, 40);
    const can = (x, y, col) => {
      rr(c, x - 13, y - 30, 26, 32, 3, P.steel);
      rect(c, x - 13, y - 22, 26, 14, col);
      ell(c, x, y - 30, 13, 4, '#eef1f5');
      rect(c, x - 10, y - 28, 3, 28, 'rgba(255,255,255,0.4)');
    };
    can(-28, 38, P.red);
    can(0, 38, P.blue);
    can(28, 38, P.green);
    can(-14, 6, P.gold);
    can(14, 6, P.pink);
    can(0, -26, P.teal);
  },
  goldfish(c) {
    poly(c, [-10, -46, 10, -46, 4, -34, -4, -34], '#dff3ff');
    rr(c, -8, -40, 16, 5, 2, P.red);
    c.beginPath();
    c.moveTo(-6, -34);
    c.bezierCurveTo(-46, -20, -38, 40, 0, 40);
    c.bezierCurveTo(38, 40, 46, -20, 6, -34);
    c.closePath();
    c.fillStyle = 'rgba(160,220,250,0.75)';
    c.fill();
    ell(c, 0, 16, 30, 20, 'rgba(92,200,240,0.6)');
    ell(c, -2, 14, 15, 9, P.orange);
    poly(c, [10, 14, 26, 4, 26, 24], '#ff9a4d');
    poly(c, [-6, 6, 2, -4, 4, 8], '#ff9a4d');
    circ(c, -10, 12, 2.4, P.ink);
    circ(c, -22, -2, 3, 'rgba(255,255,255,0.8)');
    circ(c, -16, -12, 2, 'rgba(255,255,255,0.8)');
    line(c, -20, -18, -28, 6, 'rgba(255,255,255,0.7)', 2.5);
  },
  yoyo(c) {
    line(c, 0, -48, 0, -14, '#fff6e0', 2);
    circ(c, 0, -48, 5, 'transparent');
    c.beginPath();
    c.arc(0, -46, 5, 0, TAU);
    c.strokeStyle = '#fff6e0';
    c.lineWidth = 2;
    c.stroke();
    circ(c, 0, 12, 32, '#2a46a8');
    circ(c, 0, 10, 32, P.blue);
    circ(c, 0, 10, 22, '#6f8cf0');
    star(c, 0, 10, 16, '#fff3b0');
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8;
      circ(c, Math.cos(a) * 27, 10 + Math.sin(a) * 27, 2.6, ['#ff7a9a', '#b6f36b', '#ffd75e', '#8fd3ff'][k % 4]);
    }
  },
  teddy(c) {
    ground(c, 42, 32);
    const fur = '#c98e52';
    const dark = '#a06a36';
    circ(c, -24, -34, 11, fur);
    circ(c, 24, -34, 11, fur);
    circ(c, -24, -34, 5.5, '#f1d9b0');
    circ(c, 24, -34, 5.5, '#f1d9b0');
    ell(c, -30, 18, 12, 9, dark);
    ell(c, 30, 18, 12, 9, dark);
    ell(c, -18, 38, 13, 9, dark);
    ell(c, 18, 38, 13, 9, dark);
    ell(c, 0, 18, 28, 26, fur);
    ell(c, 0, 22, 16, 15, '#f1d9b0');
    circ(c, 0, -18, 26, fur);
    ell(c, 0, -10, 12, 9, '#f1d9b0');
    circ(c, -10, -22, 3.4, P.ink);
    circ(c, 10, -22, 3.4, P.ink);
    ell(c, 0, -13, 4.5, 3, P.ink);
    poly(c, [-16, 2, 0, 8, -16, 14], P.red);
    poly(c, [16, 2, 0, 8, 16, 14], P.red);
    circ(c, 0, 8, 4, P.redDark);
  },

  // ---- The Showfolk ----
  tophat(c) {
    ground(c, 34, 40);
    ell(c, 0, 28, 44, 10, '#1e1e24');
    rr(c, -26, -40, 52, 68, 4, '#2b2b33');
    ell(c, 0, -40, 26, 7, '#3d3d48');
    rect(c, -26, 10, 52, 12, P.red);
    rr(c, -8, 10, 16, 12, 2, P.gold);
    rect(c, -22, -38, 6, 46, 'rgba(255,255,255,0.12)');
    star(c, 32, -30, 8, P.gold);
  },
  megaphone(c) {
    c.save();
    c.rotate(-0.3);
    poly(c, [-30, -10, 34, -34, 34, 34, -30, 10], P.red);
    poly(c, [-30, -10, 34, -34, 34, -18, -30, -2], '#ff7a7a');
    ell(c, 34, 0, 9, 34, '#fff6e0');
    ell(c, 34, 0, 5, 24, P.redDark);
    rr(c, -42, -9, 14, 18, 4, '#2b2b33');
    rr(c, -18, 8, 9, 26, 4, '#2b2b33');
    c.restore();
    for (const [x, y] of [[36, -34], [44, -14], [40, 8]]) line(c, x, y, x + 8, y - 4, P.gold, 3);
  },
  tickets(c) {
    ground(c, 34, 36);
    ell(c, -8, 6, 30, 30, '#e8a63a');
    ell(c, -8, 6, 22, 22, '#ffc53d');
    ell(c, -8, 6, 8, 8, '#8a5a2b');
    c.save();
    c.translate(18, 22);
    c.rotate(0.12);
    rr(c, -8, -12, 44, 22, 3, '#ffd75e');
    for (let k = 0; k < 4; k++) circ(c, -8, -9 + k * 5.6, 1.8, '#c98a1e');
    label(c, 'ADMIT', 15, -4, 8, '#8a5a2b');
    label(c, 'ONE', 15, 5, 8, P.red);
    c.restore();
  },
  clubs(c) {
    const club = (x, rot, col) => {
      c.save();
      c.translate(x, 6);
      c.rotate(rot);
      rr(c, -3.5, 4, 7, 34, 3.5, '#fff6e0');
      c.beginPath();
      c.ellipse(0, -16, 12, 24, 0, 0, TAU);
      c.fillStyle = col;
      c.fill();
      rect(c, -11, -22, 22, 6, '#fff6e0');
      rect(c, -11, -8, 22, 4, P.gold);
      circ(c, 0, 40, 5, P.gold);
      c.restore();
    };
    club(-22, -0.5, P.red);
    club(22, 0.5, P.blue);
    club(0, 0, P.green);
  },
  dumbbell(c) {
    ground(c, 34, 44);
    rr(c, -30, -5, 60, 10, 4, P.steel);
    for (const s of [-1, 1]) {
      circ(c, s * 30, 0, 24, '#2b2b33');
      circ(c, s * 30, -2, 24, '#3d3d48');
      ell(c, s * 30 - 8, -12, 8, 5, 'rgba(255,255,255,0.18)');
    }
    label(c, '1', -30, 0, 16, '#fff6e0');
    label(c, 'TON', 30, 0, 12, '#fff6e0');
  },
  crystal(c) {
    ground(c, 40, 30);
    poly(c, [-26, 40, 26, 40, 18, 24, -18, 24], P.goldDark);
    rr(c, -22, 20, 44, 8, 4, P.gold);
    circ(c, 0, -6, 34, '#7a5cc8');
    circ(c, 0, -6, 34, 'rgba(180,220,255,0.55)');
    for (const [x, y, r] of [[-8, -4, 10], [10, -12, 7], [4, 8, 8]]) circ(c, x, y, r, 'rgba(255,255,255,0.28)');
    star(c, 6, -8, 9, '#fff3b0');
    star(c, -12, 6, 5, '#fff3b0');
    ell(c, -14, -22, 9, 5, 'rgba(255,255,255,0.7)');
  },
  drum(c) {
    ground(c, 40, 38);
    rr(c, -36, -14, 72, 50, 6, P.red);
    for (let k = 0; k < 6; k++) line(c, -36 + k * 14.4, -12, -28.8 + k * 14.4, 34, P.gold, 2.4);
    rect(c, -36, -14, 72, 8, P.gold);
    rect(c, -36, 28, 72, 8, P.gold);
    ell(c, 0, -14, 36, 11, '#fff6e0');
    ell(c, 0, -14, 30, 8, '#f3e6c4');
    c.save();
    c.rotate(-0.5);
    rr(c, 2, -52, 5, 34, 2.5, P.woodDark);
    circ(c, 4.5, -54, 6, '#fff6e0');
    c.restore();
    c.save();
    c.rotate(0.5);
    rr(c, -7, -52, 5, 34, 2.5, P.woodDark);
    circ(c, -4.5, -54, 6, '#fff6e0');
    c.restore();
  },
  moustache(c) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(0, -4);
      c.bezierCurveTo(s * 14, -22, s * 40, -6, s * 46, -26);
      c.bezierCurveTo(s * 50, 4, s * 24, 20, 0, 6);
      c.closePath();
      c.fillStyle = '#3b2a1e';
      c.fill();
    }
    line(c, -30, -4, -12, 2, 'rgba(255,255,255,0.18)', 3);
    line(c, 30, -4, 12, 2, 'rgba(255,255,255,0.18)', 3);
    circ(c, -46, -26, 4, '#3b2a1e');
    circ(c, 46, -26, 4, '#3b2a1e');
    rr(c, -14, 22, 28, 9, 4, P.red);
    poly(c, [-14, 22, -26, 16, -26, 36, -14, 31], P.redDark);
    poly(c, [14, 22, 26, 16, 26, 36, 14, 31], P.redDark);
  },
  organ(c) {
    ground(c, 42, 40);
    circ(c, -24, 34, 9, '#3b2a1e');
    circ(c, 24, 34, 9, '#3b2a1e');
    circ(c, -24, 34, 4, P.gold);
    circ(c, 24, 34, 4, P.gold);
    rr(c, -38, -12, 76, 44, 6, P.red);
    rr(c, -32, -6, 64, 32, 4, '#7a1f1f');
    for (let k = 0; k < 7; k++) rr(c, -27 + k * 8, -30 - Math.abs(3 - k) * -4 - 12, 6, 30 + Math.abs(3 - k) * -4 + 12, 3, k % 2 ? P.gold : '#ffe08a');
    rr(c, -38, -14, 76, 7, 3, P.gold);
    star(c, 0, 12, 10, P.gold);
    line(c, 38, 8, 50, 8, P.steelDark, 3.5);
    line(c, 50, 8, 50, -6, P.steelDark, 3.5);
    circ(c, 50, -8, 4.5, P.woodDark);
  },

  // ---- Bright Lights ----
  bulb(c) {
    circ(c, 0, -10, 40, 'rgba(255,215,94,0.22)');
    c.beginPath();
    c.moveTo(-12, 16);
    c.bezierCurveTo(-40, -6, -30, -46, 0, -46);
    c.bezierCurveTo(30, -46, 40, -6, 12, 16);
    c.closePath();
    c.fillStyle = '#ffd75e';
    c.fill();
    ell(c, -10, -26, 7, 11, 'rgba(255,255,255,0.65)');
    line(c, -6, 14, -4, -6, '#d99a16', 2);
    line(c, 6, 14, 4, -6, '#d99a16', 2);
    line(c, -4, -6, 4, -6, '#d99a16', 2);
    rr(c, -12, 16, 24, 20, 3, P.steel);
    for (let k = 0; k < 3; k++) rect(c, -12, 20 + k * 6, 24, 2, P.steelDark);
    rr(c, -6, 36, 12, 7, 3, '#2b2b33');
  },
  lantern(c) {
    line(c, 0, -50, 0, -38, '#3b3350', 2);
    rr(c, -12, -40, 24, 8, 3, '#2b2b33');
    c.save();
    c.beginPath();
    c.ellipse(0, 0, 34, 34, 0, 0, TAU);
    c.fillStyle = P.red;
    c.fill();
    c.clip();
    for (let k = -3; k <= 3; k++) {
      c.beginPath();
      c.ellipse(0, 0, Math.abs(k) * 11 + 1, 34, 0, 0, TAU);
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1.6;
      c.stroke();
    }
    ell(c, 0, 6, 16, 22, 'rgba(255,220,120,0.55)');
    c.restore();
    rr(c, -12, 32, 24, 8, 3, '#2b2b33');
    line(c, 0, 40, 0, 50, P.gold, 3);
    circ(c, 0, 50, 3, P.gold);
  },
  bunting(c) {
    c.beginPath();
    c.moveTo(-48, -30);
    c.quadraticCurveTo(0, 0, 48, -30);
    c.strokeStyle = '#3b3350';
    c.lineWidth = 2;
    c.stroke();
    const cols = [P.red, P.gold, P.blue, P.green, P.pink];
    for (let k = 0; k < 5; k++) {
      const u = (k + 0.5) / 5;
      const x = -48 + 96 * u;
      const y = -30 + 60 * u * (1 - u);
      poly(c, [x - 10, y, x + 10, y, x, y + 26], cols[k]);
      poly(c, [x - 10, y, x - 2, y, x - 4, y + 16], 'rgba(255,255,255,0.25)');
    }
    c.beginPath();
    c.moveTo(-48, 6);
    c.quadraticCurveTo(0, 36, 48, 6);
    c.stroke();
    for (let k = 0; k < 6; k++) {
      const u = (k + 0.5) / 6;
      const x = -48 + 96 * u;
      const y = 6 + 60 * u * (1 - u);
      poly(c, [x - 8, y, x + 8, y, x, y + 20], cols[(k + 2) % 5]);
    }
  },
  sparkler(c) {
    line(c, -26, 44, 8, -10, P.steelDark, 3.5);
    for (let k = 0; k < 14; k++) {
      const a = k * 0.45;
      const r = 14 + ((k * 7) % 20);
      line(c, 10, -14, 10 + Math.cos(a) * r, -14 + Math.sin(a) * r, k % 2 ? '#fff3b0' : P.gold, 2);
      star(c, 10 + Math.cos(a) * (r + 5), -14 + Math.sin(a) * (r + 5), 3.5, '#ffffff');
    }
    star(c, 10, -14, 13, '#fffbe0');
  },
  rocket(c) {
    c.save();
    c.rotate(0.5);
    rr(c, -3, 14, 6, 38, 3, P.woodDark);
    poly(c, [-14, 14, 14, 14, 20, 26, -20, 26], P.redDark);
    rr(c, -14, -30, 28, 46, 6, P.blue);
    rect(c, -14, -12, 28, 8, P.gold);
    rect(c, -14, 2, 28, 5, '#fff6e0');
    poly(c, [-14, -28, 0, -52, 14, -28], P.red);
    star(c, 0, -20, 6, '#fff3b0');
    c.restore();
    for (const [x, y, r] of [[-30, 30, 7], [-38, 18, 5], [-24, 42, 5]]) star(c, x, y, r, P.gold);
  },
  glitter(c) {
    line(c, 0, -50, 0, -36, P.steelDark, 2.5);
    circ(c, 0, 0, 36, P.steelDark);
    c.save();
    c.beginPath();
    c.arc(0, 0, 36, 0, TAU);
    c.clip();
    const cols = ['#eef1f5', '#c9ced6', '#9ad7ff', '#ffb3d9', '#fff3b0', '#8d96a3'];
    for (let r = -4; r <= 4; r++) {
      for (let q = -4; q <= 4; q++) rr(c, q * 9 - 4 + (r % 2) * 4, r * 9 - 4, 8, 8, 1.5, cols[Math.abs(r * 3 + q * 5) % cols.length]);
    }
    circ(c, -12, -14, 14, 'rgba(255,255,255,0.3)');
    c.restore();
    star(c, 30, -28, 8, '#ffffff');
    star(c, -34, 22, 6, '#ffffff');
  },
  moon(c) {
    circ(c, 0, 0, 44, 'rgba(255,220,140,0.16)');
    circ(c, 0, 0, 36, '#ffd98a');
    circ(c, 0, 0, 36, 'rgba(255,170,60,0.25)');
    for (const [x, y, r] of [[-12, -10, 8], [12, 6, 10], [-6, 18, 6], [16, -18, 5], [-22, 6, 4]]) circ(c, x, y, r, 'rgba(200,130,40,0.28)');
    ell(c, -14, -20, 10, 6, 'rgba(255,255,255,0.4)');
    star(c, 38, -34, 5, '#ffffff');
    star(c, -40, -28, 4, '#ffffff');
    star(c, -36, 34, 4, '#ffffff');
  },
  neon(c) {
    rr(c, -44, -44, 88, 88, 10, '#1b1f4a');
    c.lineJoin = 'round';
    const outline = (r, col, w) => {
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const rad = k % 2 ? r * 0.45 : r;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad + 2);
      }
      c.closePath();
      c.strokeStyle = col;
      c.lineWidth = w;
      c.stroke();
    };
    outline(34, 'rgba(255,90,170,0.35)', 12);
    outline(34, '#ff5aaa', 5);
    outline(34, '#ffd0e8', 1.8);
    outline(16, 'rgba(90,220,255,0.4)', 8);
    outline(16, '#7ae4ff', 3);
  },
  catherine(c) {
    line(c, 0, 0, 0, 48, P.woodDark, 5);
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (k * TAU) / 3 + i * 0.16;
        const r = 4 + i * 0.95;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.strokeStyle = [P.gold, '#ff7a9a', '#8fd3ff'][k];
      c.lineWidth = 4;
      c.stroke();
    }
    for (let k = 0; k < 10; k++) {
      const a = k * 0.63;
      star(c, Math.cos(a) * 44, Math.sin(a) * 44, 4, '#fff3b0');
    }
    circ(c, 0, 0, 7, P.red);
  },

  // ---- Seaside Special ----
  bucket(c) {
    ground(c, 40, 36);
    c.save();
    c.rotate(0.4);
    rr(c, 12, -40, 6, 54, 3, P.woodDark);
    poly(c, [4, 12, 26, 12, 22, 36, 8, 36], P.blue);
    c.restore();
    poly(c, [-32, -14, 22, -14, 14, 40, -24, 40], P.red);
    poly(c, [-32, -14, -18, -14, -16, 40, -24, 40], '#ff7a7a');
    rr(c, -35, -18, 60, 8, 4, P.redDark);
    c.beginPath();
    c.arc(-5, -16, 28, Math.PI, 0);
    c.strokeStyle = '#fff6e0';
    c.lineWidth = 3.5;
    c.stroke();
    star(c, -5, 14, 11, P.gold);
  },
  beachball(c) {
    ground(c, 40, 30);
    c.save();
    c.beginPath();
    c.arc(0, 0, 38, 0, TAU);
    c.fillStyle = '#fff6e0';
    c.fill();
    c.clip();
    const cols = [P.red, P.gold, P.blue, P.green, P.orange, P.pink];
    for (let k = 0; k < 6; k++) {
      c.beginPath();
      c.moveTo(-6, -10);
      const a0 = (k * TAU) / 6;
      const a1 = ((k + 0.62) * TAU) / 6;
      c.lineTo(-6 + Math.cos(a0) * 80, -10 + Math.sin(a0) * 80);
      c.lineTo(-6 + Math.cos(a1) * 80, -10 + Math.sin(a1) * 80);
      c.closePath();
      c.fillStyle = cols[k];
      c.fill();
    }
    c.restore();
    circ(c, -6, -10, 7, '#fff6e0');
    ell(c, -16, -22, 9, 5, 'rgba(255,255,255,0.5)');
  },
  deckchair(c) {
    ground(c, 42, 38);
    line(c, -28, 40, 14, -40, P.woodDark, 5);
    line(c, 28, 40, -18, -14, P.woodDark, 5);
    line(c, -30, 40, 30, 40, P.woodDark, 4);
    c.save();
    c.beginPath();
    c.moveTo(12, -38);
    c.quadraticCurveTo(-18, 10, 20, 28);
    c.lineTo(30, 20);
    c.quadraticCurveTo(-2, 4, 22, -34);
    c.closePath();
    c.fillStyle = '#fff6e0';
    c.fill();
    c.clip();
    for (let k = 0; k < 8; k++) {
      c.save();
      c.rotate(0.5);
      rect(c, -50, -44 + k * 14, 100, 6, k % 2 ? P.blue : P.red);
      c.restore();
    }
    c.restore();
  },
  chipcone(c) {
    drawSymbol(c, 'chips', 0, 2, 100);
    rr(c, 20, -34, 16, 6, 3, '#e5484d');
  },
  crab(c) {
    ground(c, 34, 38);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) line(c, s * 20, 10 + k * 6, s * (40 + k * 2), 20 + k * 7, P.redDark, 4);
      line(c, s * 22, -4, s * 38, -22, P.redDark, 5);
      c.beginPath();
      c.arc(s * 40, -30, 12, s > 0 ? -2.4 : -0.7, s > 0 ? 0.9 : 3.9);
      c.lineTo(s * 40, -30);
      c.closePath();
      c.fillStyle = P.red;
      c.fill();
    }
    ell(c, 0, 8, 32, 22, P.red);
    ell(c, 0, 2, 26, 12, '#ff7a7a');
    for (const s of [-1, 1]) {
      line(c, s * 10, -10, s * 12, -24, P.red, 3.5);
      circ(c, s * 12, -26, 6.5, '#fff');
      circ(c, s * 13, -26, 3, P.ink);
    }
    c.beginPath();
    c.arc(0, 12, 9, 0.15 * Math.PI, 0.85 * Math.PI);
    c.strokeStyle = P.ink;
    c.lineWidth = 2;
    c.stroke();
  },
  sandcastle(c) {
    ground(c, 40, 42);
    const sand = '#f1c66a';
    const dark = '#d9a441';
    rr(c, -40, 6, 80, 34, 4, sand);
    for (const x of [-36, -16, 4, 24]) rect(c, x, -2, 12, 10, sand);
    rr(c, -20, -30, 40, 40, 3, sand);
    for (const x of [-18, -4, 10]) rect(c, x, -38, 9, 10, sand);
    rect(c, 8, -30, 12, 40, 'rgba(0,0,0,0.07)');
    rr(c, -7, 16, 14, 24, [7, 7, 0, 0], dark);
    line(c, 0, -38, 0, -54, P.woodDark, 2.5);
    poly(c, [0, -54, 18, -48, 0, -42], P.red);
    for (const [x, y] of [[-28, 20], [26, 26], [-10, -12], [12, -4]]) circ(c, x, y, 1.8, dark);
  },
  postcard(c) {
    c.save();
    c.rotate(-0.12);
    rr(c, -42, -30, 84, 60, 4, '#fff6e0');
    rr(c, -38, -26, 46, 52, 2, '#8fd3ff');
    rect(c, -38, 8, 46, 18, '#f1c66a');
    circ(c, -6, -12, 9, '#ffd75e');
    poly(c, [-30, 8, -18, -8, -6, 8], '#3e63dd');
    rr(c, 22, -24, 16, 20, 2, P.red);
    star(c, 30, -14, 5, '#fff6e0');
    for (let k = 0; k < 3; k++) line(c, 14, 6 + k * 7, 38, 6 + k * 7, '#c9b68a', 1.6);
    c.restore();
  },
  lighthouse(c) {
    ell(c, 0, 40, 40, 7, '#5cc8f0');
    poly(c, [-30, 40, 30, 40, 18, 30, -18, 30], '#8d96a3');
    c.save();
    c.beginPath();
    c.moveTo(-18, 32);
    c.lineTo(-11, -22);
    c.lineTo(11, -22);
    c.lineTo(18, 32);
    c.closePath();
    c.fillStyle = '#fff6e0';
    c.fill();
    c.clip();
    for (let k = 0; k < 3; k++) rect(c, -20, -14 + k * 18, 40, 9, P.red);
    c.restore();
    rr(c, -15, -28, 30, 7, 2, '#2b2b33');
    rr(c, -10, -42, 20, 14, 2, '#fff3b0');
    poly(c, [-13, -42, 0, -54, 13, -42], P.red);
    poly(c, [10, -40, 48, -50, 48, -22, 10, -32], 'rgba(255,243,176,0.5)');
    rr(c, -4, 16, 8, 14, [4, 4, 0, 0], '#5a2d1a');
  },
  gull(c) {
    drawGull(c, -6, 40, 0.92, 0.6, true);
  },
};

function drawArt(c, art, size) {
  c.save();
  c.scale(size / 100, size / 100);
  if (art.startsWith('ride:')) {
    const d = ATTRACTIONS.find((a) => a.id === art.slice(5));
    const k = Math.min(92 / d.w, 92 / (d.h + 12));
    c.translate(0, 46);
    c.scale(k, k);
    drawAttraction(c, d.index, { t: 0.4, anim: 0.7, run: false, p: 0, riders: 0 });
  } else if (art === 'bandstand') {
    c.translate(0, 42);
    c.scale(0.52, 0.52);
    drawBandstand(c, 0, 0, 0.3);
  } else {
    ART[art](c);
  }
  c.restore();
}

const FRAME = ['#8fa0b8', '#57b072', '#4f7df0', '#9a5fd6', '#f2b233'];

// Draw a whole card. `owned` false gives a silhouette with a question mark.
export function drawCard(ctx, card, w, h, owned = true) {
  const set = CARD_SETS[card.set];
  const r = w * 0.085;
  const b = w * 0.05;
  const frame = FRAME[card.stars - 1];
  ctx.save();
  if (card.gold && owned) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.35, '#f2b233');
    g.addColorStop(0.6, '#fff8d0');
    g.addColorStop(1, '#c98a1e');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = owned ? frame : '#b9b2a0';
  }
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();

  // picture window
  const px = b;
  const py = b;
  const pw = w - b * 2;
  const ph = h * 0.63;
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, r * 0.6);
  if (owned) {
    const bg = ctx.createRadialGradient(w / 2, py + ph * 0.45, 4, w / 2, py + ph * 0.5, pw * 0.8);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, set.color + '55');
    ctx.fillStyle = bg;
  } else {
    ctx.fillStyle = '#e2dccb';
  }
  ctx.fill();
  ctx.save();
  ctx.clip();
  const size = Math.min(pw, ph) * 0.86;
  if (owned) {
    ctx.translate(w / 2, py + ph / 2);
    drawArt(ctx, card.art, size);
  } else {
    // paint the art off-screen, then flatten it to a single shade
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(pw);
    tmp.height = Math.ceil(ph);
    const tc = tmp.getContext('2d');
    tc.translate(pw / 2, ph / 2);
    drawArt(tc, card.art, size);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'source-in';
    tc.fillStyle = '#c4bca6';
    tc.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(tmp, px, py);
    ctx.font = `900 ${Math.round(ph * 0.42)}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('?', w / 2, py + ph / 2 + 2);
  }
  ctx.restore();

  // name plate
  const ny = py + ph + b * 0.6;
  const nh = h - ny - b;
  ctx.beginPath();
  ctx.roundRect(px, ny, pw, nh, r * 0.5);
  ctx.fillStyle = owned ? '#fffaf0' : '#efe9d8';
  ctx.fill();
  const name = owned ? card.name : '???';
  let fs = Math.min(nh * 0.38, w * 0.128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = owned ? '#2b2140' : '#9a927c';
  const words = name.split(' ');
  let lines = [name];
  ctx.font = displayFont(fs);
  if (ctx.measureText(name).width > pw * 0.92 && words.length > 1) {
    // break into two lines as evenly as the words allow
    let best = 1;
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const wide = Math.max(ctx.measureText(words.slice(0, i).join(' ')).width, ctx.measureText(words.slice(i).join(' ')).width);
      if (wide < bestW) {
        bestW = wide;
        best = i;
      }
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    fs = Math.min(fs, nh * 0.29);
    ctx.font = displayFont(fs);
    const wide = Math.max(ctx.measureText(lines[0]).width, ctx.measureText(lines[1]).width);
    if (wide > pw * 0.92) fs *= (pw * 0.92) / wide;
  } else if (ctx.measureText(name).width > pw * 0.92) {
    fs *= (pw * 0.92) / ctx.measureText(name).width;
  }
  ctx.font = displayFont(fs);
  const starY = ny + nh * 0.83;
  const textMid = ny + nh * (lines.length > 1 ? 0.35 : 0.38);
  lines.forEach((ln, i) => ctx.fillText(ln, w / 2, textMid + (i - (lines.length - 1) / 2) * fs * 1.08));
  const sr = w * 0.045;
  for (let k = 0; k < card.stars; k++) {
    star(ctx, w / 2 + (k - (card.stars - 1) / 2) * sr * 2.3, starY, sr, owned ? (card.gold ? '#d99a16' : frame) : '#c4bca6');
  }
  if (card.gold && owned) {
    star(ctx, w * 0.84, h * 0.1, w * 0.06, '#ffffff');
    star(ctx, w * 0.14, h * 0.6, w * 0.04, '#ffffff');
  }
  ctx.restore();
}

const cache = new Map();

// A data URL for a card picture, made once and reused.
export function cardImage(card, owned = true, w = 150) {
  const key = `${card.id}|${owned ? 1 : 0}|${w}`;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas');
    const scale = 2;
    cv.width = w * scale;
    cv.height = Math.round(w * 1.36) * scale;
    const c = cv.getContext('2d');
    c.scale(scale, scale);
    drawCard(c, card, w, Math.round(w * 1.36), owned);
    cache.set(key, cv.toDataURL());
  }
  return cache.get(key);
}

export function symbolImage(id, size = 64) {
  const key = `sym|${id}|${size}`;
  if (!cache.has(key)) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size * 2;
    drawSymbol(cv.getContext('2d'), id, size, size, size * 1.9);
    cache.set(key, cv.toDataURL());
  }
  return cache.get(key);
}
