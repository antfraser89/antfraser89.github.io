// Everything in the 3D park that is not an attraction: trees, lamps, the gate,
// the bandstand, boats, fences, the pier's legs, and the crowd.
import { P } from './art.js';
import { GUEST_LOOKS } from './config.js';
import { GLOW, Kit, PAINT, THREE } from './geo.js';

const TAU = Math.PI * 2;
const GOLD = '#e3c583';
const IVORY = '#f4ecd8';
const STONE = '#e3dbc8';
const IRON = '#27343f';
const BULB = '#fff0c2';
const HULLS = [['#b3343c', '#f4ecd8'], ['#2c6f8f', '#f4ecd8'], ['#d99a16', '#fff6e0']];

const geometryOf = (kit, lit = false) => {
  const group = kit.build();
  const mesh = group.children.find((m) => (m.material === GLOW) === lit);
  return mesh ? mesh.geometry : null;
};

// ---- trees ------------------------------------------------------------------------

export function treeKind(theme, v) {
  if (theme.weather === 'snow') return 'fir';
  if (theme.key === 'sand') return v % 2 ? 'palm' : 'round';
  return v % 5 === 3 ? 'poplar' : 'round';
}

function treeGeometry(theme, kind) {
  const [mid, light, dark] = theme.tree;
  const k = new Kit();
  if (kind === 'fir') {
    k.cyl(0, 0, 0, 3, 4, 18, theme.trunk, { seg: 6 });
    [[14, 27, 34], [34, 21, 30], [52, 15, 26], [68, 9, 20]].forEach(([y, r, h], i) => {
      k.cone(0, y, 0, r, h, i % 2 ? mid : dark, { seg: 8 });
      k.cone(0, y + h * 0.42, 0, r * 0.55, h * 0.6, light, { seg: 8 });
    });
  } else if (kind === 'poplar') {
    k.cyl(0, 0, 0, 3, 4, 22, theme.trunk, { seg: 6 });
    k.blob(0, 58, 0, 15, dark, { sy: 2.7 });
    k.blob(-3, 62, 2, 10, mid, { sy: 2.8 });
  } else if (kind === 'palm') {
    k.tube([[0, 0, 0], [5, 22, 0], [6, 44, 0], [3, 62, 0]], 3.2, theme.trunk, { seg: 8, sides: 6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      k.put(new THREE.ConeGeometry(6, 40, 4), i % 2 ? mid : dark, 3 + Math.cos(a) * 16, 60, Math.sin(a) * 16, { ry: -a, rz: -1.95, sz: 0.3 });
    }
    k.ball(3, 62, 0, 5, dark, { seg: 6 });
  } else {
    k.cyl(0, 0, 0, 3.4, 4.6, 30, theme.trunk, { seg: 6 });
    k.blob(0, 50, 0, 24, mid);
    k.blob(-13, 40, 6, 16, dark);
    k.blob(13, 42, -6, 17, dark);
    k.blob(-5, 63, -3, 14, light);
    k.blob(9, 56, 8, 12, light);
    if (theme.fruit) for (const [x, y, z] of [[-14, 46, 14], [10, 58, 15], [18, 44, 6], [-4, 38, 18]]) k.ball(x, y, z, 2.6, theme.fruit, { seg: 6 });
  }
  return geometryOf(k);
}

// All the trees of a town as a handful of instanced meshes.
export function buildTrees(items, theme) {
  const group = new THREE.Group();
  const byKind = new Map();
  for (const it of items) {
    const kind = treeKind(theme, it.v);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(it);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const tint = new THREE.Color();
  for (const [kind, list] of byKind) {
    const mesh = new THREE.InstancedMesh(treeGeometry(theme, kind), PAINT, list.length);
    list.forEach((it, i) => {
      const s = it.s * 1.25;
      q.setFromAxisAngle(up, (it.x * 0.37 + it.y * 0.91) % TAU);
      m.compose(new THREE.Vector3(it.x, 0, it.y), q, new THREE.Vector3(s, s * (0.92 + ((it.x * 7) % 10) / 60), s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.setScalar(0.86 + ((it.x * 13 + it.y * 7) % 30) / 100));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// ---- street furniture -----------------------------------------------------------

export function buildLamps(items) {
  const post = new Kit();
  post.cyl(0, 0, 0, 3.4, 4.4, 6, IRON, { seg: 8 });
  post.cyl(0, 6, 0, 1.6, 2.2, 58, IRON, { seg: 6 });
  post.ring(0, 34, 0, 2.6, 0.9, IRON, { seg: 8 });
  post.bar([-11, 60, 0], [11, 60, 0], 1.1, IRON, { seg: 5 });
  for (const sx of [-1, 1]) post.cyl(sx * 11, 60, 0, 2.6, 1.4, 3, IRON, { seg: 6 });
  post.cone(0, 64, 0, 2.6, 8, IRON, { seg: 6 });
  const globe = new Kit();
  for (const sx of [-1, 1]) globe.ball(sx * 11, 67, 0, 4.8, BULB, { glow: true, seg: 8, rings: 6 });
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  for (const [geo, material, shadow] of [[geometryOf(post), PAINT, true], [geometryOf(globe, true), GLOW, false]]) {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    items.forEach((it, i) => mesh.setMatrixAt(i, m.makeRotationY((it.x + it.y) % 3).setPosition(it.x, 0, it.y)));
    mesh.castShadow = shadow;
    group.add(mesh);
  }
  return group;
}

export function buildBenches(items) {
  const k = new Kit();
  k.box(0, 9, 0, 34, 2.4, 11, P.wood);
  k.box(0, 12, -5, 34, 11, 2, P.wood, { rx: -0.16 });
  for (const sx of [-1, 1]) {
    k.box(sx * 14, 0, 0, 2.4, 9, 11, IRON);
    k.box(sx * 14, 9, -5, 2.4, 14, 2.4, IRON);
  }
  const mesh = new THREE.InstancedMesh(geometryOf(k), PAINT, Math.max(1, items.length));
  const m = new THREE.Matrix4();
  items.forEach((it, i) => mesh.setMatrixAt(i, m.makeRotationY(it.ry || 0).setPosition(it.x, 0, it.y)));
  mesh.count = items.length;
  mesh.castShadow = true;
  return mesh;
}

export function buildFence(items, color) {
  const k = new Kit();
  for (const f of items) {
    const n = Math.max(1, Math.round(Math.hypot(f.x2 - f.x1, f.y2 - f.y1) / 30));
    for (let i = 0; i <= n; i++) {
      k.box(f.x1 + ((f.x2 - f.x1) * i) / n, 0, f.y1 + ((f.y2 - f.y1) * i) / n, 4, 17, 4, color);
    }
    k.bar([f.x1, 6, f.y1], [f.x2, 6, f.y2], 1.1, color, { seg: 4 });
    k.bar([f.x1, 12, f.y1], [f.x2, 12, f.y2], 1.1, color, { seg: 4 });
  }
  return k.build();
}

// A flat sign with lettering on it, readable from both sides.
function lettering(text, w, h, bg, fg) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const c = cv.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = fg;
  c.lineWidth = 6;
  c.strokeRect(9, 9, cv.width - 18, cv.height - 18);
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let size = cv.height * 0.62;
  c.font = `italic 900 ${size}px "Playfair Display", Georgia, serif`;
  const wide = c.measureText(text).width;
  if (wide > cv.width - 50) {
    size *= (cv.width - 50) / wide;
    c.font = `italic 900 ${size}px "Playfair Display", Georgia, serif`;
  }
  c.fillText(text, cv.width / 2, cv.height / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const group = new THREE.Group();
  for (const flip of [0, Math.PI]) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    plane.rotation.y = flip;
    plane.position.z = flip ? -0.2 : 0.2;
    group.add(plane);
  }
  return group;
}

export function buildGate(title) {
  const k = new Kit();
  for (const s of [-1, 1]) {
    const x = s * 96;
    k.box(x, 0, 0, 36, 10, 36, '#b9ad95');
    k.box(x, 10, 0, 28, 108, 28, STONE);
    for (let i = 1; i < 5; i++) k.box(x, 10 + i * 22, 0, 29, 1.4, 29, '#c9bfa8');
    k.box(x, 118, 0, 36, 9, 36, GOLD);
    k.box(x, 127, 0, 8, 16, 8, IRON);
    k.ball(x, 138, 0, 7, BULB, { glow: true });
    k.cone(x, 143, 0, 9, 9, IRON, { seg: 4, ry: Math.PI / 4 });
  }
  // the arch: green lacquer edged in brass, like the machine
  const n = 18;
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const at = (u) => [-108 + 216 * u, 124 + Math.sin(u * Math.PI) * 44];
    const [x0, y0] = at(u0);
    const [x1, y1] = at(u1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const tilt = Math.atan2(y1 - y0, x1 - x0);
    k.put(new THREE.BoxGeometry(len + 0.6, 34, 10), '#0e3d33', (x0 + x1) / 2, (y0 + y1) / 2, 0, { rz: tilt });
    k.put(new THREE.BoxGeometry(len + 0.6, 3, 12), GOLD, (x0 + x1) / 2 - Math.sin(tilt) * 17, (y0 + y1) / 2 + Math.cos(tilt) * 17, 0, { rz: tilt });
    k.put(new THREE.BoxGeometry(len + 0.6, 3, 12), GOLD, (x0 + x1) / 2 + Math.sin(tilt) * 17, (y0 + y1) / 2 - Math.cos(tilt) * 17, 0, { rz: tilt });
    if (i % 2 === 0) k.ball((x0 + x1) / 2 - Math.sin(tilt) * 21, (y0 + y1) / 2 + Math.cos(tilt) * 21, 0, 2.8, BULB, { glow: true, seg: 6, rings: 4 });
  }
  const group = k.build();
  const sign = lettering(title, 150, 30, '#0e3d33', '#f5e6bd');
  sign.position.set(0, 160, 0);
  sign.children[0].position.z = 5.6;
  sign.children[1].position.z = -5.6;
  group.add(sign);
  return group;
}

export function buildBooth() {
  const k = new Kit();
  k.box(0, 0, 0, 38, 46, 32, P.red);
  for (let i = 0; i < 5; i++) k.box(-16 + i * 8, 0, 16.4, 4, 22, 1, P.cream);
  k.box(0, 24, 16.6, 26, 16, 1, '#1b2330');
  k.box(0, 22, 18, 32, 2.4, 6, P.cream);
  k.cone(0, 46, 0, 31, 22, P.cream, { seg: 4, ry: Math.PI / 4 });
  k.cone(0, 46.5, 0, 25, 18, P.red, { seg: 4, ry: Math.PI / 4 });
  k.ball(0, 70, 0, 3, GOLD);
  k.ball(0, 30, 13, 4.2, '#e8b88f', { seg: 8 });
  k.cyl(0, 22, 13, 4.4, 5, 6, P.blue, { seg: 7 });
  return k.build();
}

export function buildBandstand(scale = 1) {
  const k = new Kit();
  k.cyl(0, 0, 0, 64, 68, 14, STONE, { seg: 8 });
  k.cyl(0, 14, 0, 60, 60, 2, P.wood, { seg: 8, plain: true });
  k.box(0, 0, 66, 30, 5, 16, STONE);
  k.box(0, 5, 62, 30, 5, 10, STONE);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    const [x, z] = [Math.cos(a) * 58, Math.sin(a) * 58];
    k.cyl(x, 14, z, 1.8, 2.2, 62, IVORY, { seg: 6 });
    const b = ((i + 1) / 8) * TAU + TAU / 16;
    if (i !== 1) k.bar([x, 28, z], [Math.cos(b) * 58, 28, Math.sin(b) * 58], 1.2, IVORY, { seg: 4 });
    k.ball(x, 74, z, 2.8, BULB, { glow: true, seg: 6, rings: 4 });
  }
  k.tent(0, 76, 0, 76, 40, ['#1f8a66', IVORY], { seg: 16 });
  k.cyl(0, 71, 0, 76, 76, 6, GOLD, { seg: 16, open: true });
  k.ball(0, 120, 0, 5, GOLD);
  // the band
  [[-18, P.red], [0, P.blueDark], [18, P.red]].forEach(([x, coat], i) => {
    k.cyl(x, 16, -6, 5, 6, 16, coat, { seg: 7 });
    k.ball(x, 37, -6, 5, '#e8b88f', { seg: 8 });
    k.cyl(x, 41, -6, 5.4, 5.4, 4, IRON, { seg: 8 });
    k.cone(x + 3, 28, 4, 4 + i, 12, GOLD, { rx: Math.PI / 2, seg: 8 });
  });
  const group = k.build();
  group.scale.setScalar(scale);
  return group;
}

export function buildFountain(waterColor) {
  const k = new Kit();
  k.cyl(0, 0, 0, 50, 54, 9, STONE, { seg: 20 });
  k.cyl(0, 7, 0, 44, 44, 1.6, waterColor, { seg: 20, plain: true });
  k.cyl(0, 0, 0, 8, 10, 32, STONE, { seg: 10 });
  k.cyl(0, 32, 0, 22, 9, 8, STONE, { seg: 14 });
  k.cyl(0, 38.5, 0, 19, 19, 1.4, waterColor, { seg: 14, plain: true });
  k.cyl(0, 38, 0, 4, 5, 20, STONE, { seg: 8 });
  k.cyl(0, 58, 0, 11, 5, 5, STONE, { seg: 12 });
  k.ball(0, 66, 0, 3.6, STONE);
  const group = k.build();
  // the water: droplets on a loop
  const N = 150;
  const pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#eefaff', size: 3.4, transparent: true, opacity: 0.85, depthWrite: false }));
  spray.frustumCulled = false;
  group.add(spray);
  return {
    group,
    tick: (t) => {
      for (let i = 0; i < N; i++) {
        const u = (t * 0.75 + i * 0.6180339) % 1;
        const a = i * 2.39996;
        const upper = i % 3 === 0;
        const reach = upper ? 14 : 34 + (i % 5) * 2;
        const [y0, lift] = upper ? [68, 16] : [44, 22];
        pos[i * 3] = Math.cos(a) * reach * u;
        pos[i * 3 + 1] = y0 + lift * 4 * u * (1 - u) - (y0 - (upper ? 40 : 9)) * u * u;
        pos[i * 3 + 2] = Math.sin(a) * reach * u;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// fire is its own light: always bright, whatever the hour
const FLAME = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

export function buildBonfire() {
  const k = new Kit();
  k.cyl(0, 0, 0, 30, 34, 3, '#4a4037', { seg: 12 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    k.bar([Math.cos(a) * 26, 2, Math.sin(a) * 26], [Math.cos(a + 0.5) * 4, 34, Math.sin(a + 0.5) * 4], 3.4, '#5b3d24', { seg: 6 });
  }
  const group = k.build();
  const flames = [['#e2572b', 22, 46], ['#f08a2c', 16, 58], ['#fbd75b', 10, 44], ['#fff1b0', 5, 30]].map(([color, r, h], i) => {
    const f = new Kit().cone(0, 0, 0, r, h, color, { seg: 7, plain: true }).build({ material: FLAME, shadow: false, receive: false });
    f.position.y = 6 + i * 3;
    group.add(f);
    return f;
  });
  return {
    group,
    tick: (t) => {
      flames.forEach((f, i) => {
        f.scale.set(1 + Math.sin(t * 7 + i * 2) * 0.12, 1 + Math.sin(t * 9 + i * 1.7) * 0.22, 1 + Math.cos(t * 8 + i) * 0.12);
        f.rotation.y = t * (1 + i * 0.4);
        f.position.x = Math.sin(t * 5 + i) * 2;
      });
    },
  };
}

// The great fir in the middle of a winter park, hung with lights.
export function buildFir() {
  const k = new Kit();
  k.cyl(0, 0, 0, 7, 9, 26, '#5b4632', { seg: 8 });
  const cols = ['#ffd75e', '#ff7a7a', '#8fd3ff', '#b6f36b'];
  for (let i = 0; i < 6; i++) {
    const r = 58 - i * 9;
    const y = 18 + i * 27;
    k.cone(0, y, 0, r, 50, i % 2 ? '#2f7d68' : '#256355', { seg: 10 });
    k.cone(0, y + 22, 0, r * 0.52, 28, '#eef4fa', { seg: 10 });
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU + i;
      k.ball(Math.cos(a) * r * 0.86, y + 6, Math.sin(a) * r * 0.86, 3, cols[(i + j) % 4], { glow: true, seg: 6, rings: 4 });
    }
  }
  k.ball(0, 206, 0, 8, '#ffd75e', { glow: true, seg: 6, rings: 4 });
  return k.build();
}

export function buildTopiary(theme) {
  const [mid, light, dark] = theme.tree;
  const k = new Kit();
  k.box(0, 0, 0, 20, 14, 20, '#c9bfa8');
  k.box(0, 14, 0, 24, 4, 24, STONE);
  k.cone(0, 18, 0, 14, 50, theme.weather === 'snow' ? mid : dark, { seg: 8 });
  k.ball(0, 70, 0, 4, theme.weather === 'snow' ? light : mid, { seg: 6 });
  return k.build();
}

export function buildBoat(hue) {
  const [hull, sail] = HULLS[hue % HULLS.length];
  const k = new Kit();
  k.box(0, -4, 0, 16, 9, 40, hull);
  k.cone(0, -4, 27, 8, 14, hull, { rx: Math.PI / 2, seg: 4, ry: 0 });
  k.box(0, 5, 0, 17, 1.4, 41, IVORY);
  k.cyl(0, 5, 2, 1, 1, 56, '#5b4632', { seg: 5 });
  // a mainsail and a jib, both thin triangles standing fore and aft
  k.put(new THREE.ConeGeometry(18, 46, 3), sail, 0, 34, -9, { sx: 0.05 });
  k.put(new THREE.ConeGeometry(11, 32, 3), '#e6dcc4', 0, 26, 14, { sx: 0.05 });
  k.ball(0, 62, 2, 2.4, BULB, { glow: true, seg: 6, rings: 4 });
  return k.build();
}

export function buildBarge(hue) {
  const [hull] = HULLS[hue % HULLS.length];
  const k = new Kit();
  k.box(0, -6, 0, 92, 12, 24, '#243340');
  k.cone(50, -6, 0, 12, 12, '#243340', { rz: -Math.PI / 2, seg: 4 });
  k.box(0, 6, 0, 94, 3, 25, hull);
  k.box(-8, 9, 0, 46, 15, 18, '#f1e6cf');
  k.box(-8, 24, 0, 50, 3, 21, hull);
  for (const x of [-22, -8, 6]) for (const sz of [-1, 1]) k.box(x, 13, sz * 9.2, 8, 7, 0.8, '#ffd98a', { glow: true });
  k.cyl(40, 9, 0, 0.9, 0.9, 20, '#243340', { seg: 5 });
  k.ball(40, 31, 0, 4.2, '#ffb24d', { glow: true, seg: 8, rings: 6 });
  return k.build();
}

export function buildDucks() {
  const k = new Kit();
  [[0, 0, 1], [17, 7, 0.8], [33, 1, 0.7]].forEach(([x, z, s], i) => {
    const c = i ? '#f3e39a' : '#fbfbf6';
    k.ball(x, 2 * s, z, 6.5 * s, c, { sy: 0.7, sz: 1.3, seg: 8 });
    k.ball(x, 7 * s, z + 6 * s, 3.4 * s, c, { seg: 8 });
    k.cone(x, 6.4 * s, z + 10 * s, 1.5 * s, 4 * s, '#f08a2c', { rx: Math.PI / 2, seg: 5 });
  });
  return k.build({ shadow: false });
}

export function buildSkater(color) {
  const k = new Kit();
  k.box(-2.5, 0, 0, 3, 10, 3.4, IRON);
  k.box(2.5, 0, 0, 3, 10, 3.4, IRON);
  k.cyl(0, 10, 0, 4.4, 5, 13, color, { seg: 7 });
  k.ball(0, 27, 0, 4.4, '#f3d2b0', { seg: 8 });
  k.cyl(0, 29, 0, 4.7, 4.7, 4, color, { seg: 8 });
  k.bar([-5, 20, 0], [-11, 16, 4], 1.4, color, { seg: 4 });
  k.bar([5, 20, 0], [11, 16, -4], 1.4, color, { seg: 4 });
  return k.build();
}

export function buildBuoy() {
  const k = new Kit();
  k.cyl(0, -3, 0, 8, 8, 5, '#f4ecd8', { seg: 10 });
  k.cone(0, 2, 0, 7, 20, '#c9453c', { seg: 8 });
  k.ball(0, 23, 0, 2.6, '#ffd75e', { glow: true, seg: 6, rings: 4 });
  return k.build({ shadow: false });
}

export function buildParasol(hue) {
  const [a, b] = HULLS[hue % HULLS.length];
  const k = new Kit();
  k.cyl(0, 0, 0, 1.3, 1.3, 46, '#6b5a48', { seg: 5 });
  k.tent(0, 40, 0, 32, 14, [a, b], { seg: 10 });
  // a deckchair in its shade
  k.box(20, 9, 4, 18, 2, 30, a, { rx: -0.5 });
  k.bar([11, 0, -8], [11, 20, 12], 1.2, '#7a5230', { seg: 4 });
  k.bar([29, 0, -8], [29, 20, 12], 1.2, '#7a5230', { seg: 4 });
  k.bar([11, 0, 14], [11, 12, -4], 1.2, '#7a5230', { seg: 4 });
  k.bar([29, 0, 14], [29, 12, -4], 1.2, '#7a5230', { seg: 4 });
  return k.build();
}

export function buildBales() {
  const k = new Kit();
  for (const [x, y, z, ry] of [[-17, 0, 0, 0.1], [17, 0, 2, -0.15], [0, 18, 1, 0.3]]) {
    k.box(x, y, z, 32, 18, 20, '#d8b25a', { ry });
    k.box(x, y + 7, z, 33, 2, 21, '#a8853c', { ry });
  }
  return k.build();
}

// Paper lanterns strung from one bank of the canal to the other.
export function buildLanterns(items) {
  const k = new Kit();
  const cols = ['#e2572b', '#f7b733', '#e06a8a', '#f08a2c'];
  for (const it of items) {
    const a = [it.x - 14, it.y - it.half - 12];
    const b = [it.x + 14, it.y + it.half + 12];
    k.cyl(a[0], 0, a[1], 1.4, 1.8, 40, IRON, { seg: 5 });
    k.cyl(b[0], 0, b[1], 1.4, 1.8, 40, IRON, { seg: 5 });
    let last = null;
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      const p = [a[0] + (b[0] - a[0]) * u, 40 - Math.sin(u * Math.PI) * 13, a[1] + (b[1] - a[1]) * u];
      if (last) k.bar(last, p, 0.4, IRON, { seg: 3 });
      if (i > 0 && i < 8) k.ball(p[0], p[1] - 5, p[2], 4.2, cols[i % 4], { glow: true, sy: 1.25, seg: 8, rings: 6 });
      last = p;
    }
  }
  return k.build({ shadow: false });
}

// Bunting between two points.
export function buildBunting(a, b, sag = 14) {
  const k = new Kit();
  const cols = [P.red, GOLD, P.blue, IVORY, P.teal];
  let last = null;
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - Math.sin(u * Math.PI) * sag, a[2] + (b[2] - a[2]) * u];
    if (last) k.bar(last, p, 0.4, IRON, { seg: 3 });
    if (i > 0 && i < 14) k.put(new THREE.ConeGeometry(4.2, 9, 3), cols[i % cols.length], p[0], p[1] - 5, p[2], { rx: Math.PI, sz: 0.15 });
    last = p;
  }
  return k.build({ shadow: false });
}

// What holds the pier up, and the walls of the bridges.
export function buildStructures(L, theme) {
  const k = new Kit();
  const pile = '#3b2a1c';
  for (const d of L.decks) {
    k.box(d.x + d.w / 2, -5, d.y + d.h / 2, d.w + 4, 5, d.h + 4, theme.boardEdge);
    for (let x = d.x + 10; x < d.x + d.w; x += 44) {
      for (const z of d.spine ? [] : [d.y + 6, d.y + d.h - 6]) k.cyl(x, -22, z, 3, 3, 20, pile, { seg: 6 });
    }
    if (d.spine) for (let z = d.y + 20; z < d.y + d.h; z += 60) for (const x of [d.x + 6, d.x + d.w - 6]) k.cyl(x, -22, z, 3.4, 3.4, 20, pile, { seg: 6 });
  }
  if (L.head) {
    k.cyl(L.head.x, -5, L.head.y, L.head.r + 3, L.head.r + 3, 5, theme.boardEdge, { seg: 28, sz: 0.74 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      k.cyl(L.head.x + Math.cos(a) * (L.head.r - 8), -22, L.head.y + Math.sin(a) * (L.head.r - 8) * 0.74, 3.4, 3.4, 20, pile, { seg: 6 });
      // a rail round the head of the pier
      const b = ((i + 1) / 12) * TAU;
      const at = (ang, y) => [L.head.x + Math.cos(ang) * (L.head.r - 3), y, L.head.y + Math.sin(ang) * (L.head.r - 3) * 0.74];
      k.cyl(...at(a, 0), 1.2, 1.2, 13, IVORY, { seg: 5 });
      if (Math.sin(a) < 0.9 || Math.sin(b) < 0.9) k.bar(at(a, 12), at(b, 12), 0.9, IVORY, { seg: 4 });
    }
  }
  for (const b of L.bridges) {
    // a parapet down each side (every bridge here runs north to south)
    const wall = b.stone ? theme.stoneEdge : theme.boardEdge;
    for (const sx of [-1, 1]) {
      const x = b.x + sx * (b.w / 2 + (b.stone ? 4 : 2));
      if (b.stone) {
        k.box(x, 0, b.y, 7, 11, b.len, wall);
        k.box(x, 11, b.y, 9, 2, b.len + 2, theme.stone);
      } else {
        for (let z = b.y - b.len / 2; z <= b.y + b.len / 2 + 1; z += 18) k.box(x, 0, z, 2.6, 13, 2.6, wall);
        k.bar([x, 12, b.y - b.len / 2], [x, 12, b.y + b.len / 2], 1.1, wall, { seg: 4 });
      }
    }
    // and the arch underneath, down to the water
    k.box(b.x, -12, b.y - b.len / 2 + 6, b.w + 6, 12, 10, wall);
    k.box(b.x, -12, b.y + b.len / 2 - 6, b.w + 6, 12, 10, wall);
    k.box(b.x, -4, b.y, b.w + 2, 4, b.len, wall);
  }
  return k.parts.length ? k.build() : null;
}

// ---- the crowd ----------------------------------------------------------------------

// Up to `max` guests drawn as four instanced meshes: legs, body, head, hair.
export class Crowd {
  constructor(max) {
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const make = (geo) => {
      const mesh = new THREE.InstancedMesh(geo, mat(), max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      return mesh;
    };
    this.legs = make(new THREE.BoxGeometry(6.6, 9, 4.6).translate(0, 4.5, 0));
    this.body = make(new THREE.CylinderGeometry(4, 5, 11.5, 8).translate(0, 14.6, 0));
    this.head = make(new THREE.SphereGeometry(4.3, 10, 8).translate(0, 24.4, 0));
    this.hair = make(new THREE.SphereGeometry(4.7, 10, 6, 0, TAU, 0, Math.PI * 0.52).translate(0, 24.8, -0.5));
    this.group = new THREE.Group();
    this.group.add(this.legs, this.body, this.head, this.hair);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.colors = {
      shirts: GUEST_LOOKS.shirts.map((h) => new THREE.Color(h)),
      skins: GUEST_LOOKS.skins.map((h) => new THREE.Color(h)),
      hairs: GUEST_LOOKS.hairs.map((h) => new THREE.Color(h)),
      trousers: GUEST_LOOKS.trousers.map((h) => new THREE.Color(h)),
    };
  }

  update(guests, time, fadeFrom) {
    let n = 0;
    const max = this.body.instanceMatrix.count;
    for (const g of guests) {
      if (n >= max) break;
      const fade = g.mode === 'leave' ? Math.max(0, Math.min(1, (fadeFrom - g.y) / 34)) : 1;
      const show = g.alpha * fade;
      if (show < 0.05) continue;
      // face the way they are walking, turning smoothly
      const dx = g.x - (g.px ?? g.x);
      const dz = g.y - (g.pz ?? g.y);
      g.px = g.x;
      g.pz = g.y;
      if (dx * dx + dz * dz > 0.01) {
        const want = Math.atan2(dx, dz);
        let diff = want - (g.hd ?? want);
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.hd = (g.hd ?? want) + diff * 0.25;
      }
      const hd = g.hd ?? 0;
      const step = g.moving ? Math.abs(Math.sin(time * 9 + g.bob)) : 0;
      const k = show * g.tall;
      this.e.set(g.moving ? 0.1 : 0, hd, 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.m.compose(this.p.set(g.x, step * 1.4, g.y), this.q, this.s.set(k, k, k));
      this.legs.setMatrixAt(n, this.m);
      this.body.setMatrixAt(n, this.m);
      this.head.setMatrixAt(n, this.m);
      this.hair.setMatrixAt(n, this.m);
      this.legs.setColorAt(n, this.colors.trousers[g.legs % this.colors.trousers.length]);
      this.body.setColorAt(n, this.colors.shirts[g.shirt % this.colors.shirts.length]);
      this.head.setColorAt(n, this.colors.skins[g.skin % this.colors.skins.length]);
      this.hair.setColorAt(n, g.hat ? this.colors.shirts[(g.shirt + 3) % this.colors.shirts.length] : this.colors.hairs[g.hair % this.colors.hairs.length]);
      n++;
    }
    for (const mesh of [this.legs, this.body, this.head, this.hair]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
