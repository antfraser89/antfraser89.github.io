// The twelve attractions as 3D models, built from simple solids (see geo.js).
// Each stands on its plot with its middle at the origin and its front toward
// +z, where the queue is. A model is { group, tick(t, anim, running) }: `anim`
// only advances while the ride is running, so things stop where they are.
import { P } from './art.js';
import { Kit, THREE } from './geo.js';

const TAU = Math.PI * 2;
const GOLD = '#e3c583';
const BRASS = '#b48a3c';
const IVORY = '#f4ecd8';
const INK = '#27343f';
const BULB = '#fff0c2';

// A row of lit bulbs from a to b.
function bulbs(k, a, b, n, color = BULB, r = 2.4) {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    k.ball(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, r, color, { glow: true, seg: 6, rings: 4 });
  }
}

// A pitched roof in stripes, ridge along x.
function stripedRoof(k, x, y, z, w, d, rise, n, c1, c2) {
  const sw = w / n;
  for (let i = 0; i < n; i++) k.roof(x - w / 2 + sw * (i + 0.5), y, z, sw + 0.2, d, rise, i % 2 ? c2 : c1);
}

// A wall of vertical stripes facing +z.
function stripedWall(k, x, y, z, w, h, t, n, c1, c2) {
  const sw = w / n;
  for (let i = 0; i < n; i++) k.box(x - w / 2 + sw * (i + 0.5), y, z, sw + 0.2, h, t, i % 2 ? c2 : c1);
}

// A sloping awning over a counter, striped, with a valance along the front.
function awning(k, x, y, z, w, reach, drop, n, c1, c2) {
  const sw = w / n;
  const len = Math.hypot(reach, drop);
  const tilt = Math.atan2(drop, reach);
  for (let i = 0; i < n; i++) {
    const cx = x - w / 2 + sw * (i + 0.5);
    k.put(BOX, i % 2 ? c2 : c1, cx, y - drop / 2, z + reach / 2, { rx: tilt, sx: sw + 0.2, sy: 2.4, sz: len });
    k.box(cx, y - drop - 7, z + reach - 1, sw + 0.2, 7, 2, i % 2 ? c1 : c2);
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

// A little pennant on a pole.
function flag(k, x, y, z, h, color) {
  k.cyl(x, y, z, 0.9, 0.9, h, INK, { seg: 5 });
  k.put(new THREE.ConeGeometry(5, 14, 3), color, x + 7, y + h - 6, z, { rz: -Math.PI / 2, sz: 0.2 });
}

// A simple seated or standing person for rides: a body and a head.
function person(k, x, y, z, shirt, skin = '#e8b88f') {
  k.cyl(x, y, z, 3.6, 4.2, 9, shirt, { seg: 7 });
  k.ball(x, y + 12.5, z, 3.8, skin, { seg: 8, rings: 6 });
}

const SHIRTS = [P.red, P.blue, P.teal, P.gold, P.pink, P.green, P.orange, '#7d5bbe'];

// ---- stalls and games ---------------------------------------------------------------

function toffee() {
  const k = new Kit();
  // the cart
  k.box(0, 20, 0, 116, 36, 56, P.red);
  k.box(0, 54, 0, 124, 5, 64, P.cream);
  k.box(0, 18, 28.5, 104, 22, 1.5, GOLD);
  k.box(0, 21, 29.5, 96, 16, 1.2, P.redDark);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.cyl(sx * 40, 4, sz * 31, 20, 20, 5, P.woodDark, { rx: Math.PI / 2, seg: 18 });
      k.cyl(sx * 40, 6, sz * 33.6, 15, 15, 1, P.wood, { rx: Math.PI / 2, seg: 18 });
      k.cyl(sx * 40, 16.5, sz * 34.4, 4, 4, 1.4, GOLD, { rx: Math.PI / 2, seg: 10 });
    }
    k.bar([sx * 58, 30, 22], [sx * 86, 40, 22], 2, P.woodDark);
    k.bar([sx * 58, 30, -22], [sx * 86, 40, -22], 2, P.woodDark);
    k.bar([sx * 86, 40, -22], [sx * 86, 40, 22], 2.2, P.woodDark);
  }
  // toffee apples in rows, and a copper pan
  for (let i = 0; i < 7; i++) {
    for (const z of [10, 22]) {
      const x = -45 + i * 15;
      k.ball(x, 64, z, 6.2, i % 3 === 1 ? '#8f2f2a' : '#c2303f', { seg: 10 });
      k.cyl(x, 68, z, 0.8, 0.8, 11, IVORY, { seg: 5 });
    }
  }
  k.cyl(-28, 59, -12, 17, 13, 9, '#b9703a', { seg: 14 });
  k.cyl(-28, 66, -12, 15, 15, 1.5, '#7d2a1c', { seg: 14 });
  k.box(24, 59, -12, 40, 12, 22, P.wood);
  // the canopy
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sx * 56, 56, sz * 27, 1.8, 1.8, 62, IVORY, { seg: 6 });
  stripedRoof(k, 0, 116, 0, 144, 84, 26, 9, P.red, P.cream);
  k.box(0, 113, 42, 144, 4, 2, GOLD);
  k.box(0, 113, -42, 144, 4, 2, GOLD);
  bulbs(k, [-68, 110, 44], [68, 110, 44], 9);
  return { group: k.build() };
}

function ducks() {
  const k = new Kit();
  // the pond
  k.cyl(0, 0, 0, 74, 78, 26, P.blueDark, { seg: 10 });
  k.cyl(0, 26, 0, 78, 78, 4, P.cream, { seg: 10 });
  k.cyl(0, 27, 0, 68, 68, 3.4, P.sky, { seg: 10, plain: true });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    k.box(Math.cos(a) * 76.5, 4, Math.sin(a) * 76.5, 14, 16, 2, i % 2 ? P.gold : P.cream, { ry: -a + Math.PI / 2 });
  }
  // prizes on the middle stand
  k.cyl(0, 27, 0, 18, 22, 36, P.red, { seg: 10 });
  k.cyl(0, 63, 0, 24, 24, 3, GOLD, { seg: 10 });
  [[-9, P.pink], [9, P.teal], [0, P.gold]].forEach(([dx, c], i) => {
    k.ball(dx, 74, i === 2 ? -8 : 6, 7, c, { seg: 8 });
    k.ball(dx, 84, i === 2 ? -8 : 6, 4.6, c, { seg: 8 });
  });
  // the tent
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.52;
    k.cyl(Math.cos(a) * 80, 0, Math.sin(a) * 80, 2, 2, 104, IVORY, { seg: 6 });
  }
  k.tent(0, 104, 0, 92, 44, [P.blue, P.cream], { seg: 12 });
  k.cyl(0, 98, 0, 92, 92, 7, GOLD, { seg: 12, open: true });
  k.ball(0, 150, 0, 5, GOLD);
  flag(k, 0, 150, 0, 22, P.red);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    k.ball(Math.cos(a) * 92, 97, Math.sin(a) * 92, 2.4, BULB, { glow: true, seg: 6, rings: 4 });
  }
  const group = k.build();
  // the ducks go round and round
  const flock = new Kit();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const r = 44 + (i % 3) * 9;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    flock.ball(x, 33, z, 6, '#f7cf3f', { sy: 0.8, seg: 8 });
    flock.ball(x - Math.sin(a) * 5, 38.5, z + Math.cos(a) * 5, 3.6, '#f7cf3f', { seg: 8 });
    flock.cone(x - Math.sin(a) * 9, 37, z + Math.cos(a) * 9, 1.6, 4, P.orange, { rx: Math.PI / 2, ry: -a, seg: 5 });
  }
  const ring = flock.build({ shadow: false });
  group.add(ring);
  return { group, tick: (t, anim) => { ring.rotation.y = t * 0.25 + anim * 0.9; } };
}

function coconut() {
  const k = new Kit();
  k.box(0, 0, -10, 196, 5, 120, P.wood);
  // back and side walls in stripes
  stripedWall(k, 0, 5, -68, 196, 104, 4, 12, P.green, P.cream);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) k.box(sx * 96, 5, -58 + i * 19, 4, 104 - i * 6, 19.2, i % 2 ? P.cream : P.green);
  }
  // the shy: coconuts on their posts, with a net of sacking behind
  k.box(0, 5, -60, 180, 62, 3, '#cdb78a');
  for (let i = 0; i < 5; i++) {
    const x = -68 + i * 34;
    k.cyl(x, 5, -44, 2.2, 2.6, 44 + (i % 2) * 10, P.woodDark, { seg: 6 });
    k.cyl(x, 49 + (i % 2) * 10, -44, 6, 3, 5, P.red, { seg: 8 });
    k.ball(x, 60 + (i % 2) * 10, -44, 8.5, '#6f4a2a', { seg: 9 });
  }
  // the counter, with the balls to throw
  k.box(0, 5, 44, 196, 34, 12, P.red);
  k.box(0, 39, 44, 202, 4, 18, P.cream);
  for (let i = 0; i < 7; i++) k.ball(-66 + i * 9, 46.5, 44, 3.6, i % 2 ? IVORY : P.gold, { seg: 7 });
  for (const sx of [-1, 1]) k.cyl(sx * 96, 5, 48, 2.4, 2.4, 106, IVORY, { seg: 6 });
  // roof, awning and sign
  k.box(0, 109, -10, 204, 5, 124, P.greenDark);
  awning(k, 0, 112, 50, 204, 34, 16, 12, P.green, P.cream);
  k.box(0, 116, 30, 120, 26, 5, GOLD);
  k.box(0, 119, 32.5, 110, 20, 2, P.greenDark);
  bulbs(k, [-56, 145, 32], [56, 145, 32], 8);
  return { group: k.build() };
}

function floss() {
  const k = new Kit();
  k.box(0, 0, 0, 104, 5, 96, P.creamDark);
  // the kiosk, striped all round
  for (let i = 0; i < 8; i++) {
    const c = i % 2 ? P.cream : P.pinkLight;
    const x = -42 + i * 12;
    k.box(x, 5, 40, 12.2, 34, 3, c);
    k.box(x, 5, -40, 12.2, 84, 3, c);
    k.box(-46, 5, -35 + i * 10, 3, 84, 10.2, c);
    k.box(46, 5, -35 + i * 10, 3, 84, 10.2, c);
  }
  k.box(0, 39, 44, 104, 4, 16, P.cream);
  for (const sx of [-1, 1]) k.box(sx * 43, 43, 40, 6, 46, 4, P.pink);
  k.box(0, 5, 0, 84, 28, 74, '#5a3350');
  // candy floss on sticks along the counter
  [-30, -10, 10, 30].forEach((x, i) => {
    k.cyl(x, 43, 46, 0.8, 0.8, 12, IVORY, { seg: 5 });
    k.blob(x, 61, 46, 8, i % 2 ? '#f5b9d0' : '#bfe0f2');
  });
  // the drum where it is spun
  k.cyl(0, 33, 0, 24, 20, 12, P.steel, { seg: 14 });
  k.blob(0, 50, 0, 15, '#f5b9d0');
  // a scalloped roof with a great cloud of floss on top
  k.box(0, 89, 0, 112, 6, 104, P.pink);
  k.tent(0, 95, 0, 62, 30, [P.pink, P.cream], { seg: 12 });
  k.cyl(0, 121, 0, 3, 3, 26, IVORY, { seg: 6 });
  for (const [x, y, z, r] of [[0, 158, 0, 22], [-15, 148, 6, 15], [15, 150, -5, 16], [3, 172, -2, 14], [-6, 160, -12, 13], [8, 162, 12, 12]]) k.blob(x, y, z, r, '#f5b9d0');
  bulbs(k, [-54, 92, 53], [54, 92, 53], 8);
  return { group: k.build() };
}

// ---- rides -------------------------------------------------------------------------

function teacups() {
  const k = new Kit();
  k.cyl(0, 0, 0, 108, 112, 10, P.pink, { seg: 28 });
  k.cyl(0, 10, 0, 104, 104, 2, P.cream, { seg: 28 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    k.ball(Math.cos(a) * 108, 11, Math.sin(a) * 108, 2.6, BULB, { glow: true, seg: 6, rings: 4 });
  }
  const group = k.build();
  // the turntable carries the pot and the cups
  const table = new THREE.Group();
  table.position.y = 12;
  group.add(table);
  const pot = new Kit();
  pot.cyl(0, 0, 0, 70, 70, 3, P.creamDark, { seg: 24 });
  pot.ball(0, 30, 0, 27, P.cream, { sy: 0.92, seg: 16, rings: 10 });
  pot.cyl(0, 3, 0, 16, 20, 6, GOLD, { seg: 14 });
  pot.cyl(0, 52, 0, 13, 15, 4, GOLD, { seg: 14 });
  pot.ball(0, 60, 0, 5, P.red);
  pot.tube([[24, 26, 0], [36, 30, 0], [42, 44, 0], [46, 52, 0]], 4.5, P.cream, { seg: 10 });
  pot.ring(-30, 32, 0, 12, 3, P.cream, { rx: 0, seg: 14 });
  for (let i = 0; i < 4; i++) pot.ball(Math.cos(i * 1.57 + 0.6) * 22, 34, Math.sin(i * 1.57 + 0.6) * 22, 3.4, P.pink, { seg: 6 });
  table.add(pot.build());
  const cups = [];
  const colours = [P.teal, P.gold, P.blue, P.red, '#7d5bbe'];
  for (let i = 0; i < 5; i++) {
    const c = new Kit();
    c.cyl(0, 0, 0, 27, 27, 2.5, P.cream, { seg: 18 });
    c.cyl(0, 2.5, 0, 22, 14, 22, colours[i], { seg: 18 });
    c.cyl(0, 22, 0, 23, 23, 2.4, GOLD, { seg: 18, open: true });
    c.cyl(0, 12, 0, 16, 12, 10, '#3a2a30', { seg: 12 });
    c.ring(24, 14, 0, 8, 2.4, colours[i], { rx: 0, seg: 12 });
    person(c, -6, 12, 4, SHIRTS[i]);
    person(c, 7, 12, -5, SHIRTS[(i + 3) % SHIRTS.length]);
    const cup = c.build();
    const a = (i / 5) * TAU;
    cup.position.set(Math.cos(a) * 72, 0, Math.sin(a) * 72);
    table.add(cup);
    cups.push(cup);
  }
  return {
    group,
    tick: (t, anim) => {
      table.rotation.y = anim * 0.7;
      cups.forEach((cup, i) => { cup.rotation.y = -anim * (2.2 + i * 0.3) + i; });
    },
  };
}

function helter() {
  const k = new Kit();
  k.cyl(0, 0, 0, 62, 66, 8, P.creamDark, { seg: 20 });
  // the tower, banded like a stick of rock
  const [h, r0, r1] = [196, 44, 24];
  for (let i = 0; i < 7; i++) {
    const [ya, yb] = [(i / 7) * h, ((i + 1) / 7) * h];
    const [ra, rb] = [r0 + (r1 - r0) * (i / 7), r0 + (r1 - r0) * ((i + 1) / 7)];
    k.cyl(0, 8 + ya, 0, rb, ra, yb - ya, i % 2 ? P.red : P.cream, { seg: 18 });
  }
  // the slide winds down the outside
  const turns = 3.25;
  const chute = [];
  const rail = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    const y = 8 + h * 0.92 * (1 - u);
    const r = r1 + (r0 - r1) * u + 13;
    const a = u * turns * TAU + 0.6;
    chute.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    rail.push([Math.cos(a) * (r + 9), y + 7, Math.sin(a) * (r + 9)]);
  }
  k.tube(chute, 7, P.teal, { seg: 150, sides: 6 });
  k.tube(rail, 2, P.gold, { seg: 150, sides: 4 });
  // the run-out at the bottom
  const end = chute[chute.length - 1];
  k.box(end[0] * 1.25, 4, end[2] * 1.25, 30, 5, 22, P.teal, { ry: 0.6 });
  // the hut at the top
  k.cyl(0, 8 + h, 0, 32, 30, 5, GOLD, { seg: 16 });
  k.cyl(0, 13 + h, 0, 22, 22, 28, P.cream, { seg: 14 });
  for (let i = 0; i < 4; i++) k.box(Math.cos(i * 1.57) * 22.4, 22 + h, Math.sin(i * 1.57) * 22.4, 9, 13, 2, P.blueDark, { ry: -i * 1.57 + Math.PI / 2 });
  k.cone(0, 41 + h, 0, 30, 34, P.red, { seg: 14 });
  k.ball(0, 77 + h, 0, 4, GOLD);
  flag(k, 0, 78 + h, 0, 22, P.blue);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    k.ball(Math.cos(a) * 32, 12 + h, Math.sin(a) * 32, 2.4, BULB, { glow: true, seg: 6, rings: 4 });
  }
  // door and steps
  k.box(0, 8, 43, 22, 36, 4, P.blueDark);
  k.box(0, 0, 58, 34, 6, 18, P.wood);
  return { group: k.build() };
}

function dodgems() {
  const k = new Kit();
  const [w, d] = [228, 158];
  k.box(0, 0, 0, w + 14, 9, d + 14, P.red);
  k.box(0, 9, 0, w, 2, d, '#3d4654', { plain: true });
  // kerb in yellow and red
  for (let i = 0; i < 12; i++) {
    const x = -w / 2 + (i + 0.5) * (w / 12);
    k.box(x, 11, d / 2 + 2, w / 12 + 0.2, 7, 5, i % 2 ? P.gold : P.red);
    k.box(x, 11, -d / 2 - 2, w / 12 + 0.2, 7, 5, i % 2 ? P.red : P.gold);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 8; i++) k.box(sx * (w / 2 + 2), 11, -d / 2 + (i + 0.5) * (d / 8), 5, 7, d / 8 + 0.2, i % 2 ? P.gold : P.red);
  }
  // posts and the roof with its lit fascia
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.cyl(sx * (w / 2 + 1), 9, sz * (d / 2 + 1), 3, 3, 96, IVORY, { seg: 8 });
  k.box(0, 105, 0, w + 26, 9, d + 26, P.blueDark);
  k.box(0, 114, 0, w + 12, 4, d + 12, '#1a2a52');
  k.box(0, 100, d / 2 + 13.5, w + 26, 16, 2, P.red);
  k.box(0, 103, d / 2 + 14.6, 128, 12, 1.2, GOLD);
  bulbs(k, [-w / 2 - 10, 102, d / 2 + 16], [-70, 102, d / 2 + 16], 5);
  bulbs(k, [70, 102, d / 2 + 16], [w / 2 + 10, 102, d / 2 + 16], 5);
  bulbs(k, [-w / 2 - 13.5, 102, -d / 2], [-w / 2 - 13.5, 102, d / 2], 8);
  bulbs(k, [w / 2 + 13.5, 102, -d / 2], [w / 2 + 13.5, 102, d / 2], 8);
  // the wire mesh the cars draw their power from
  k.box(0, 101, 0, w, 1, d, '#2a3340', { plain: true });
  const group = k.build();
  const cars = [];
  const paint = [P.red, P.gold, P.teal, P.pink, P.blue, P.green];
  for (let i = 0; i < 6; i++) {
    const c = new Kit();
    c.box(0, 2, 0, 30, 5, 40, '#1f2a33');
    c.box(0, 5, -1, 24, 11, 32, paint[i]);
    c.box(0, 16, -10, 22, 9, 10, paint[i]);
    c.box(0, 15, 12, 20, 4, 6, GOLD);
    c.cyl(0, 16, -14, 0.9, 0.9, 82, '#89929f', { seg: 5 });
    c.ball(0, 9, 19.5, 2.2, BULB, { glow: true, seg: 6, rings: 4 });
    person(c, 0, 14, -1, SHIRTS[(i * 3) % SHIRTS.length]);
    const car = c.build();
    car.position.y = 11;
    group.add(car);
    cars.push(car);
  }
  return {
    group,
    tick: (t, anim) => {
      cars.forEach((car, i) => {
        const a = anim * (0.8 + (i % 3) * 0.17) + i * 1.9;
        const x = Math.sin(a * 0.9 + i) * (w / 2 - 26) * Math.cos(a * 0.31 + i * 2);
        const z = Math.cos(a * 0.7 + i * 1.3) * (d / 2 - 28);
        car.rotation.y = Math.atan2(x - car.position.x, z - car.position.z) || car.rotation.y;
        car.position.x = x;
        car.position.z = z;
      });
    },
  };
}

function carousel() {
  const k = new Kit();
  k.cyl(0, 0, 0, 106, 110, 12, P.red, { seg: 28 });
  k.cyl(0, 12, 0, 102, 102, 2, P.cream, { seg: 28 });
  // the centre column, panelled and gilded
  k.cyl(0, 14, 0, 20, 22, 124, P.cream, { seg: 12 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    k.box(Math.cos(a) * 21.5, 34, Math.sin(a) * 21.5, 13, 70, 2, i % 2 ? P.blue : P.pink, { ry: -a + Math.PI / 2 });
  }
  k.cyl(0, 14, 0, 26, 26, 8, GOLD, { seg: 12 });
  k.cyl(0, 124, 0, 30, 24, 10, GOLD, { seg: 12 });
  // the canopy
  k.tent(0, 140, 0, 118, 48, [P.red, P.cream], { seg: 16 });
  k.cyl(0, 128, 0, 118, 118, 14, P.cream, { seg: 16, open: true });
  k.cyl(0, 126, 0, 119, 119, 4, GOLD, { seg: 16, open: true });
  k.ball(0, 192, 0, 7, GOLD);
  flag(k, 0, 194, 0, 24, P.blue);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    k.ball(Math.cos(a) * 119, 132, Math.sin(a) * 119, 2.8, BULB, { glow: true, seg: 6, rings: 4 });
  }
  const group = k.build();
  // the horses gallop round, rising and falling on their poles
  const ring = new THREE.Group();
  ring.position.y = 14;
  group.add(ring);
  const poles = new Kit();
  const horses = [];
  const coats = [IVORY, '#8a5a2e', '#2a2a30', '#d9c7a0'];
  for (let i = 0; i < 12; i++) {
    const inner = i % 3 === 2;
    const a = (i / 12) * TAU;
    const r = inner ? 50 : 82;
    const [x, z] = [Math.cos(a) * r, Math.sin(a) * r];
    poles.cyl(x, 0, z, 1.3, 1.3, 114, GOLD, { seg: 6 });
    const hk = new Kit();
    const coat = coats[i % coats.length];
    hk.ball(0, 0, 0, 9, coat, { sx: 1.9, sy: 0.9, sz: 0.85, seg: 10 });
    hk.box(13, 4, 0, 7, 16, 6, coat, { rz: -0.5 });
    hk.box(20, 15, 0, 13, 6.5, 5.5, coat, { rz: 0.3 });
    for (const [lx, lean] of [[-10, 0.3], [-6, -0.2], [8, 0.4], [12, -0.3]]) hk.box(lx, -15, 0, 3.2, 14, 3.2, coat, { rz: lean });
    hk.box(0, 6, 0, 13, 4, 12, i % 2 ? P.red : P.blue);
    hk.cone(-16, 2, 0, 3, 14, '#3a2a30', { rz: 1.9, seg: 5 });
    if (i % 2 === 0) person(hk, 0, 9, 0, SHIRTS[i % SHIRTS.length]);
    const horse = hk.build();
    horse.position.set(x, 44, z);
    horse.rotation.y = -a - Math.PI / 2;
    ring.add(horse);
    horses.push(horse);
  }
  ring.add(poles.build({ shadow: false }));
  return {
    group,
    tick: (t, anim) => {
      ring.rotation.y = -anim * 0.8;
      horses.forEach((horse, i) => { horse.position.y = 46 + Math.sin(anim * 3 + i * 1.6) * 13; });
    },
  };
}

function ghost() {
  const k = new Kit();
  const [w, h, d] = [212, 112, 96];
  k.box(0, 0, -20, w, h, d, P.purple);
  k.box(0, 0, -20, w + 8, 8, d + 8, P.purpleDark);
  // crooked gables
  [[-66, 34, 0.06], [0, 48, -0.03], [66, 30, 0.05]].forEach(([x, rise, lean]) => {
    k.roof(x, h, -20, 64, d + 6, rise, P.purpleDark, { ry: Math.PI / 2, rz: lean });
  });
  // two tunnel mouths
  for (const sx of [-1, 1]) {
    k.box(sx * 54, 0, 28.5, 50, 44, 3, '#0a0812');
    k.cyl(sx * 54, 44, 28.5, 25, 25, 3, '#0a0812', { rx: Math.PI / 2, seg: 16 });
    k.ring(sx * 54, 44, 30, 26, 2.6, '#7fd36a', { rx: 0, seg: 18, arc: Math.PI, glow: true });
  }
  // the sign, and windows with something green behind them
  k.box(0, 82, 29, 126, 24, 3, '#16101f');
  k.box(0, 85, 30.4, 116, 18, 1.2, '#7fd36a', { glow: true });
  k.box(0, 88, 31.2, 106, 12, 1, '#16101f');
  for (const x of [-84, 84]) k.box(x, 60, 28.6, 16, 22, 1.5, '#b6f36b', { glow: true });
  // cobwebby fence posts and a couple of tombstones
  for (const [x, z] of [[-92, 52], [92, 56]]) {
    k.box(x, 0, z, 16, 22, 5, '#8d96a3', { rz: x < 0 ? 0.08 : -0.1 });
    k.cyl(x, 22, z, 8, 8, 5, '#8d96a3', { rx: Math.PI / 2, seg: 10 });
  }
  const group = k.build();
  // the ghost on the roof bobs about
  const gk = new Kit();
  gk.cyl(0, 0, 0, 15, 19, 26, '#f4f6fa', { seg: 12 });
  gk.ball(0, 26, 0, 15, '#f4f6fa', { seg: 12 });
  for (let i = 0; i < 6; i++) gk.cone(Math.cos(i * 1.05) * 14, -8, Math.sin(i * 1.05) * 14, 6, 10, '#f4f6fa', { rx: Math.PI, seg: 6 });
  gk.ball(-6, 28, 13, 3.2, '#16101f', { sy: 1.4, seg: 6 });
  gk.ball(6, 28, 13, 3.2, '#16101f', { sy: 1.4, seg: 6 });
  gk.ball(0, 19, 14, 3.6, '#16101f', { sy: 1.3, seg: 6 });
  for (const sx of [-1, 1]) gk.ball(sx * 19, 16, 3, 5.5, '#f4f6fa', { sy: 1.5, seg: 6 });
  const spook = gk.build();
  spook.position.set(0, h + 62, -8);
  group.add(spook);
  // the train runs out of one tunnel, across the front and into the other
  const track = new THREE.CatmullRomCurve3([[54, 3, 30], [70, 3, 62], [0, 3, 80], [-70, 3, 62], [-54, 3, 30], [-50, 3, -40], [0, 3, -56], [50, 3, -40]].map((p) => new THREE.Vector3(...p)), true);
  const rails = new Kit();
  rails.tube([[54, 2, 30], [70, 2, 62], [0, 2, 80], [-70, 2, 62], [-54, 2, 30]], 1.6, '#89929f', { seg: 40, sides: 4 });
  group.add(rails.build({ shadow: false }));
  const carts = [0, 1].map((i) => {
    const c = new Kit();
    c.box(0, 2, 0, 20, 12, 28, i ? '#7fd36a' : P.orange);
    c.box(0, 12, -10, 20, 12, 5, i ? '#7fd36a' : P.orange);
    c.box(0, 3, 14.6, 16, 7, 1.4, P.purpleDark);
    person(c, -4.5, 12, -1, SHIRTS[i * 2]);
    person(c, 4.5, 12, -1, SHIRTS[i * 2 + 5]);
    const cart = c.build();
    group.add(cart);
    return cart;
  });
  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  return {
    group,
    tick: (t, anim) => {
      spook.position.y = h + 62 + Math.sin(t * 1.6) * 6;
      spook.rotation.y = Math.sin(t * 0.7) * 0.5;
      carts.forEach((cart, i) => {
        const u = (((anim * 0.085 + i * 0.5 + 0.06) % 1) + 1) % 1;
        track.getPointAt(u, at);
        track.getPointAt((u + 0.01) % 1, ahead);
        cart.position.copy(at);
        cart.rotation.y = Math.atan2(ahead.x - at.x, ahead.z - at.z);
        cart.visible = at.z > 18; // out of sight inside the building
      });
    },
  };
}

function waltzer() {
  const k = new Kit();
  k.cyl(0, 0, 0, 112, 116, 12, P.redDark, { seg: 28 });
  // a painted backdrop curving round the back, zig-zagged and lit
  for (let i = 0; i < 11; i++) {
    const a = Math.PI * 1.08 + (i / 10) * Math.PI * 0.84;
    const [x, z] = [Math.cos(a) * 118, Math.sin(a) * 118];
    k.box(x, 0, z, 36, 92 + Math.sin((i / 10) * Math.PI) * 34, 4, i % 2 ? P.teal : P.pink, { ry: -a + Math.PI / 2 });
    k.box(Math.cos(a) * 115, 40, Math.sin(a) * 115, 24, 24, 2, GOLD, { ry: -a + Math.PI / 2, rz: Math.PI / 4 });
    k.ball(Math.cos(a) * 115, 96 + Math.sin((i / 10) * Math.PI) * 34, Math.sin(a) * 115, 3, BULB, { glow: true, seg: 6, rings: 4 });
  }
  // the pay box in the middle
  k.cyl(0, 12, 0, 20, 22, 40, P.cream, { seg: 10 });
  k.cone(0, 52, 0, 27, 22, P.teal, { seg: 10 });
  k.ball(0, 76, 0, 4, GOLD);
  const group = k.build();
  const deck = new THREE.Group();
  deck.position.y = 12;
  group.add(deck);
  const floor = new Kit();
  floor.cyl(0, 0, 0, 106, 106, 3, P.creamDark, { seg: 28 });
  for (let i = 0; i < 12; i++) floor.box(Math.cos(i * 0.5236) * 60, 3, Math.sin(i * 0.5236) * 60, 84, 0.6, 5, P.pink, { ry: -i * 0.5236, plain: true });
  deck.add(floor.build({ shadow: false }));
  const tubs = [];
  const paint = [P.teal, P.gold, P.pink, P.blue, P.red, '#7d5bbe'];
  for (let i = 0; i < 6; i++) {
    const c = new Kit();
    c.cyl(0, 0, 0, 21, 17, 13, paint[i], { seg: 16 });
    c.cyl(0, 13, 0, 22, 22, 2, GOLD, { seg: 16, open: true });
    // a high curved back
    for (let j = 0; j < 7; j++) {
      const a = Math.PI * 0.75 + (j / 6) * Math.PI * 1.5;
      c.box(Math.cos(a) * 20, 13, Math.sin(a) * 20, 10, 20 - Math.abs(j - 3) * 3, 3, paint[i], { ry: -a + Math.PI / 2 });
    }
    c.cyl(0, 9, 0, 16, 14, 4, '#3a2a30', { seg: 12 });
    person(c, -6, 12, -4, SHIRTS[i]);
    person(c, 6, 12, -4, SHIRTS[(i + 4) % SHIRTS.length]);
    const tub = c.build();
    const a = (i / 6) * TAU;
    tub.position.set(Math.cos(a) * 72, 3, Math.sin(a) * 72);
    deck.add(tub);
    tubs.push(tub);
  }
  return {
    group,
    tick: (t, anim) => {
      deck.rotation.y = anim * 0.9;
      tubs.forEach((tub, i) => { tub.rotation.y = anim * (3 + (i % 3) * 0.8) * (i % 2 ? 1 : -1) + i; });
    },
  };
}

function wheel() {
  const k = new Kit();
  const [hub, R] = [158, 122];
  k.box(0, 0, 0, 200, 8, 96, P.creamDark);
  k.box(0, 8, 34, 80, 5, 22, P.wood);
  // the frame
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) k.bar([sx * 84, 6, sz * 30], [0, hub, sz * 20], 4.4, P.blueDark, { seg: 8 });
    k.bar([-48, 70, sz * 25.6], [48, 70, sz * 25.6], 2.6, P.blueDark, { seg: 6 });
  }
  k.cyl(0, hub, 0, 9, 9, 50, GOLD, { rx: Math.PI / 2, seg: 12 });
  // the ticket hut
  k.box(-78, 8, 30, 28, 30, 24, P.red);
  k.roof(-78, 38, 30, 34, 30, 12, P.cream);
  const group = k.build();
  // the wheel itself
  const rim = new THREE.Group();
  rim.position.y = hub;
  group.add(rim);
  const wk = new Kit();
  for (const sz of [-1, 1]) {
    wk.ring(0, 0, sz * 13, R, 3, P.red, { rx: 0, seg: 48 });
    wk.ring(0, 0, sz * 13, R * 0.56, 2, P.cream, { rx: 0, seg: 36 });
  }
  const cars = [];
  const paint = [P.red, P.gold, P.teal, P.blue, P.pink, P.green, P.orange, '#7d5bbe', P.red, P.gold, P.teal, P.blue];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const [x, y] = [Math.cos(a) * R, Math.sin(a) * R];
    for (const sz of [-1, 1]) wk.bar([0, 0, sz * 13], [x, y, sz * 13], 1.5, P.cream, { seg: 5 });
    wk.bar([x, y, -13], [x, y, 13], 1.6, P.blueDark, { seg: 5 });
    wk.ball(x, y, 15.5, 3.2, BULB, { glow: true, seg: 6, rings: 4 });
    wk.ball(Math.cos(a) * R * 0.56, Math.sin(a) * R * 0.56, 15, 2.2, BULB, { glow: true, seg: 6, rings: 4 });
    // each car hangs from the rim and stays the right way up
    const c = new Kit();
    c.bar([0, 0, 0], [0, -10, 0], 1, P.blueDark, { seg: 4 });
    c.box(0, -30, 0, 22, 13, 20, paint[i]);
    c.box(0, -17, 0, 22, 1.4, 20, GOLD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.cyl(sx * 10, -17, sz * 9, 0.8, 0.8, 9, IVORY, { seg: 4 });
    c.cone(0, -9, 0, 16, 7, paint[i], { seg: 4, ry: Math.PI / 4 });
    if (i % 2) person(c, 0, -25, 0, SHIRTS[i % SHIRTS.length]);
    const car = c.build();
    car.position.set(x, y, 0);
    rim.add(car);
    cars.push(car);
  }
  rim.add(wk.build());
  return {
    group,
    tick: (t, anim) => {
      const a = t * 0.05 + anim * 0.32;
      rim.rotation.z = a;
      for (const car of cars) car.rotation.z = -a;
    },
  };
}

function coaster() {
  const k = new Kit();
  // the circuit: out of the station, up the lift hill, a drop, a loop and home
  const pts = [
    [-96, 14, 62], [-40, 14, 66], [30, 14, 66], [88, 20, 58], [112, 44, 28], [108, 96, -14], [84, 156, -48], [44, 196, -66],
    [0, 204, -70], [-40, 186, -64], [-72, 128, -50], [-88, 60, -34], [-70, 22, -14], [-36, 16, -2],
    // the loop, leaning a little so the track can pass itself
    [-8, 20, 4], [22, 52, 8], [30, 96, 12], [8, 128, 16], [-22, 110, 20], [-24, 62, 24], [4, 24, 28], [44, 16, 30],
    [84, 18, 22], [104, 20, -6], [84, 22, -34], [20, 20, -40], [-60, 18, -30], [-116, 16, 0], [-124, 14, 40],
  ];
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), true, 'catmullrom', 0.5);
  const N = 260;
  const frames = curve.computeFrenetFrames(N, true);
  const left = [];
  const right = [];
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const p = curve.getPointAt(i / N);
    // keep the sleepers level on the flat and let them roll through the loop
    side.crossVectors(frames.tangents[i], up);
    if (side.lengthSq() < 0.05) side.copy(frames.binormals[i]);
    side.normalize().multiplyScalar(5.5);
    left.push([p.x + side.x, p.y + side.y, p.z + side.z]);
    right.push([p.x - side.x, p.y - side.y, p.z - side.z]);
    if (i % 3 === 0) k.bar(left[i], right[i], 1, '#5b4632', { seg: 4 });
    // trestles under the high parts
    if (i % 9 === 0 && p.y > 30 && frames.tangents[i].y > -0.85 && frames.tangents[i].y < 0.85) {
      k.bar([p.x, p.y - 3, p.z], [p.x, 0, p.z], 2, IVORY, { seg: 5 });
      if (p.y > 80) k.bar([p.x, p.y * 0.5, p.z], [p.x + (p.x > 0 ? 26 : -26), 0, p.z], 1.4, IVORY, { seg: 4 });
    }
  }
  k.tube(left, 1.7, P.red, { closed: true, seg: N, sides: 5 });
  k.tube(right, 1.7, P.red, { closed: true, seg: N, sides: 5 });
  // the station
  k.box(-30, 0, 78, 150, 10, 34, P.wood);
  for (const x of [-98, -30, 38]) for (const z of [64, 92]) k.cyl(x, 10, z, 2, 2, 46, IVORY, { seg: 6 });
  stripedRoof(k, -30, 56, 78, 156, 40, 14, 8, P.blue, P.cream);
  k.box(-30, 54, 99, 156, 5, 2, GOLD);
  bulbs(k, [-104, 52, 100], [44, 52, 100], 9);
  flag(k, 0, 204, -70, 26, P.gold);
  const group = k.build();
  const train = [0, 1, 2].map((i) => {
    const c = new Kit();
    c.box(0, 1, 0, 13, 9, 20, i ? P.blue : P.red);
    c.box(0, 10, -7, 13, 7, 4, i ? P.blue : P.red);
    if (!i) c.cone(0, 3, 12, 6, 12, GOLD, { rx: Math.PI / 2, seg: 6 });
    person(c, 0, 9, 0, SHIRTS[i * 3]);
    const car = c.build();
    group.add(car);
    return car;
  });
  const at = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const rise = new THREE.Vector3();
  const m = new THREE.Matrix4();
  return {
    group,
    tick: (t, anim) => {
      train.forEach((car, i) => {
        const u = (((anim * 0.075 - i * 0.022 + 0.02) % 1) + 1) % 1;
        curve.getPointAt(u, at);
        curve.getPointAt((u + 0.004) % 1, ahead);
        // roll with the track: "up" is whatever is square to the rails here
        const f = frames.tangents[Math.floor(u * N) % N];
        side.crossVectors(f, up);
        if (side.lengthSq() < 0.05) side.copy(frames.binormals[Math.floor(u * N) % N]);
        rise.crossVectors(side.normalize(), f).normalize();
        ahead.sub(at).normalize();
        m.makeBasis(side.crossVectors(rise, ahead).normalize(), rise, ahead);
        car.quaternion.setFromRotationMatrix(m);
        car.position.copy(at).addScaledVector(rise, 2);
      });
    },
  };
}

const BUILDERS = { toffee, ducks, teacups, helter, coconut, floss, dodgems, carousel, ghost, waltzer, wheel, coaster };

export function buildAttraction(design) {
  const model = (BUILDERS[design.id] || toffee)();
  if (!model.tick) model.tick = () => {};
  model.tick(0, 0.6);
  return model;
}

// ---- what each star adds round a plot ----------------------------------------------------

// Fencing, lights, flags and finally a gold star, as the plot is upgraded.
// `side` is which way the entrance faces along x; the front (+z) stays open.
export function buildStageKit(stage, side, half = 138, back = -104, front = 92) {
  const k = new Kit();
  if (stage >= 2) {
    // a white picket fence down the sides and across the back
    const runs = [[[-half, back], [half, back]], [[-half, back], [-half, front]], [[half, back], [half, front]]];
    for (const [[x1, z1], [x2, z2]] of runs) {
      const n = Math.round(Math.hypot(x2 - x1, z2 - z1) / 12);
      for (let i = 0; i <= n; i++) {
        const [x, z] = [x1 + ((x2 - x1) * i) / n, z1 + ((z2 - z1) * i) / n];
        k.box(x, 0, z, 3, 15, 3, IVORY);
        k.cone(x, 15, z, 2.4, 4, IVORY, { seg: 4, ry: Math.PI / 4 });
      }
      k.bar([x1, 5, z1], [x2, 5, z2], 1, IVORY, { seg: 4 });
      k.bar([x1, 11, z1], [x2, 11, z2], 1, IVORY, { seg: 4 });
    }
  }
  if (stage >= 3) {
    // strings of lights swagged between tall poles at the front
    for (const sx of [-1, 1]) {
      k.cyl(sx * half, 0, front, 2, 2.6, 96, INK, { seg: 6 });
      k.ball(sx * half, 99, front, 4, GOLD);
    }
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const x = -half + u * half * 2;
      const y = 94 - Math.sin(u * Math.PI) * 20;
      k.ball(x, y, front, 2.6, [BULB, '#ff9c8a', '#9fd8ff', '#c9f08a'][i % 4], { glow: true, seg: 6, rings: 4 });
    }
  }
  if (stage >= 4) {
    // pennants at the back corners and planters by the way in
    for (const sx of [-1, 1]) {
      k.cyl(sx * half, 0, back, 1.6, 2, 120, IVORY, { seg: 6 });
      k.put(new THREE.ConeGeometry(9, 26, 3), sx < 0 ? P.red : P.blue, sx * half + 14, 108, back, { rz: -Math.PI / 2, sz: 0.2 });
      k.box(sx * (half - 22), 0, front + 4, 30, 10, 12, P.woodDark);
      for (let i = 0; i < 4; i++) {
        k.ball(sx * (half - 22) - 10 + i * 7, 12, front + 4, 4, P.green, { seg: 6 });
        k.ball(sx * (half - 22) - 10 + i * 7, 16, front + 4, 2.6, [P.pink, P.gold, IVORY, P.orange][i], { seg: 6 });
      }
    }
  }
  if (stage >= 5) {
    // top marks: a gold star on a post by the entrance
    const x = -side * (half - 6);
    k.cyl(x, 0, front + 14, 2, 2.6, 60, BRASS, { seg: 6 });
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 6.5 : 15;
      if (i) star.lineTo(Math.cos(a) * r, -Math.sin(a) * r);
      else star.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
    }
    k.put(new THREE.ExtrudeGeometry(star, { depth: 4, bevelEnabled: false }), GOLD, x, 72, front + 12);
    k.ball(x, 72, front + 18, 3, BULB, { glow: true, seg: 6, rings: 4 });
  }
  return k.parts.length || k.lit.length ? k.build() : null;
}

// An empty plot: a sign on a post, and a tag that goes green when you can afford it.
export function buildForSale(afford) {
  const k = new Kit();
  k.cyl(0, 0, 0, 2.2, 2.6, 44, P.woodDark, { seg: 6 });
  k.box(0, 30, 2, 46, 26, 3, IVORY);
  k.box(0, 28, 2, 50, 30, 2, P.woodDark);
  k.box(0, 47, 3.8, 34, 5, 1, afford ? '#2a8c6a' : P.red);
  k.box(0, 38, 3.8, 26, 3, 1, INK);
  k.box(0, 33, 3.8, 30, 3, 1, INK);
  return k.build();
}

// Custard, after a rival's pie has landed.
export function buildSplat(w, h) {
  const k = new Kit();
  const c = '#fff0b8';
  k.blob(0, h * 0.72, 10, Math.min(w, h) * 0.3, c, { sy: 0.7 });
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7;
    k.blob(Math.cos(a) * w * 0.3, h * (0.3 + ((i * 37) % 50) / 100), 20 + Math.sin(a) * 30, 9 + (i % 3) * 5, c, { sy: 1.5 });
  }
  k.cyl(0, 1, 60, 40, 46, 2, c, { seg: 12, sz: 0.5 });
  return k.build({ shadow: false });
}
