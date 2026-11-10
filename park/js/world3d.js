// The park in real-time 3D (WebGL, through three.js). The ground is the same
// painted map the flat renderer uses, laid on a plane with the water cut out
// of it; everything else is a model lit by one sun, with real shadows.
// Labels, pop-up numbers and confetti are drawn on a 2D canvas laid over the top.
import { GAME_TITLE, PLOTS, STAGES, WORLD as W, townInfo } from './config.js';
import * as A from './art.js';
import * as E from './economy.js';
import { money } from './format.js';
import { GLOW, Kit, THREE, dispose } from './geo.js';
import { layoutFor } from './layout.js';
import { buildAttraction, buildForSale, buildSplat, buildStageKit } from './models.js';
import * as PR from './props3d.js';
import { M, buildGround, buildScenery, buildTile, darkness } from './render.js';
import { designAt, isOpen, mulberry32 } from './sim.js';

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const WATER_Y = -9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (u) => {
  const v = clamp(u, 0, 1);
  return v * v * (3 - 2 * v);
};

// A soft round blob of light, for halos and pools.
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Small ripples for the water to catch the sun on.
function rippleTexture() {
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d');
  const img = c.createImageData(n, n);
  const height = (x, y) => Math.sin((x * 3 + y * 2) * (TAU / n)) * 0.5 + Math.sin((x * 5 - y * 4) * (TAU / n) + 1.7) * 0.3 + Math.sin((x * 9 + y * 7) * (TAU / n) + 0.4) * 0.2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const i = (y * n + x) * 4;
      img.data[i] = 128 + dx * 90;
      img.data[i + 1] = 128 + dy * 90;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 120, 1 / 120);
  return t;
}

// Lights drawn as camera-facing discs: cheap, and no limit on how many.
class Halos {
  constructor(max, texture, flat) {
    const geo = new THREE.PlaneGeometry(1, 1);
    if (flat) geo.rotateX(-Math.PI / 2);
    this.flat = flat;
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = flat ? 2 : 3;
    this.items = [];
    this.m = new THREE.Matrix4();
    this.s = new THREE.Vector3();
    this.q = new THREE.Quaternion();
  }

  clear() {
    this.items.length = 0;
  }

  add(x, y, z, size, color) {
    if (this.items.length < this.mesh.instanceMatrix.count) this.items.push({ p: new THREE.Vector3(x, y, z), size, color: new THREE.Color(color) });
  }

  // Lay them out to face the camera (or the sky, if flat) at the given strength.
  place(camera, strength) {
    this.mesh.visible = strength > 0.01;
    if (!this.mesh.visible) return;
    this.mesh.material.opacity = strength;
    this.mesh.count = this.items.length;
    this.items.forEach((it, i) => {
      if (!this.flat) this.q.copy(camera.quaternion);
      this.m.compose(it.p, this.q, this.s.set(it.size, this.flat ? 1 : it.size, it.size));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, it.color);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export function createRenderer3D(canvas, world, hooks = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#cfe2ea', 3200, 11000);
  const camera = new THREE.PerspectiveCamera(30, 1, 30, 16000);

  // labels, pop-up numbers, confetti and the weather go on a 2D canvas on top
  const over = document.createElement('canvas');
  over.id = 'labels';
  canvas.after(over);
  const ctx = over.getContext('2d');

  // ---- light and sky ----------------------------------------------------------

  const hemi = new THREE.HemisphereLight('#ffffff', '#777777', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -980, right: 980, top: 1050, bottom: -1050, near: 200, far: 7000 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 2.5;
  sun.target.position.set(W.w / 2, 0, W.h / 2 - 40);
  scene.add(hemi, sun, sun.target);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(13000, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color() }, low: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 low; varying vec3 vDir; void main() { float h = clamp(vDir.y * 2.4, 0.0, 1.0); gl_FragColor = vec4(mix(low, top, pow(h, 0.55)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  const glowTex = glowTexture();
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff2cc', blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
  sunDisc.scale.setScalar(2600);
  scene.add(sunDisc);
  const starGeo = new THREE.BufferGeometry();
  {
    const r = mulberry32(77);
    const pos = [];
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU;
      const y = 0.08 + r() * 0.9;
      const k = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * k * 12000, y * 12000, Math.sin(a) * k * 12000);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  const halos = new Halos(220, glowTex, false);
  const pools = new Halos(120, glowTex, true);
  scene.add(halos.mesh, pools.mesh);
  const ripples = rippleTexture();

  // ---- the town ---------------------------------------------------------------

  let town = -1;
  let theme = null;
  let L = layoutFor(world.state.town);
  let land = null; // everything built for the current town
  let ticks = []; // things that move by themselves
  let waters = [];
  let surf = null;
  const plots = PLOTS.map(() => ({ group: new THREE.Group(), key: '', model: null }));
  const plotRoot = new THREE.Group();
  for (const p of plots) plotRoot.add(p.group);
  scene.add(plotRoot);
  const crowd = new PR.Crowd(170);
  scene.add(crowd.group);
  const animT = PLOTS.map(() => 0);
  const pops = PLOTS.map(() => 0);
  const weather = [];

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe9b8', transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
  ring.visible = false;
  ring.renderOrder = 4;
  scene.add(ring);

  const balloons = [0, 1].map(() => {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(17, 16, 12), mat);
    ball.scale.y = 1.2;
    ball.position.y = 30;
    const knot = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 6), mat);
    knot.position.y = 8;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 34, 4), new THREE.MeshBasicMaterial({ color: '#f4ecd8' }));
    string.position.y = -10;
    const gift = new Kit().box(0, -36, 0, 13, 10, 13, '#f2c14e').box(0, -36, 0, 14, 10.4, 3, '#b8303f').box(0, -36, 0, 3, 10.4, 14, '#b8303f').build({ shadow: false });
    g.add(ball, knot, string, gift);
    g.visible = false;
    g.userData.mat = mat;
    scene.add(g);
    return g;
  });

  function buildTown() {
    if (land) {
      scene.remove(land);
      land.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.material.map && o.userData.ownMap) o.material.map.dispose();
      });
    }
    land = new THREE.Group();
    scene.add(land);
    ticks = [];
    waters = [];
    surf = null;
    halos.clear();
    pools.clear();
    const seed = 1000 + town * 77;

    // the painted ground, with holes where the water goes
    const tex = new THREE.CanvasTexture(buildGround(L, theme, seed, buildTile(theme, seed + 3, L.paved), true));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W.w + 2 * M, W.h + 2 * M).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: '#dcdcdc', roughness: 1, alphaTest: 0.5 }));
    ground.position.set(W.w / 2, 0, W.h / 2);
    ground.receiveShadow = true;
    ground.userData.ownMap = true;
    land.add(ground);

    // the country beyond, out to the horizon, with the same holes in it
    const far = new THREE.Shape();
    far.moveTo(-7000, 7000);
    far.lineTo(W.w + 7000, 7000);
    far.lineTo(W.w + 7000, -W.h - 7000);
    far.lineTo(-7000, -W.h - 7000);
    far.closePath();
    for (const w of L.water) {
      const outline = new THREE.Shape(w.pts.map(([x, y]) => new THREE.Vector2(x, -y)));
      const flat = new THREE.ShapeGeometry(outline).rotateX(-Math.PI / 2);
      if (w.frozen) {
        const ice = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: theme.water[1], roughness: 0.3 }));
        ice.position.y = -0.3;
        ice.receiveShadow = true;
        land.add(ice);
        continue;
      }
      far.holes.push(new THREE.Path(w.pts.map(([x, y]) => new THREE.Vector2(x, -y))));
      const deep = new THREE.Color(theme.water[0]);
      const surface = new THREE.Mesh(flat, new THREE.MeshPhongMaterial({ color: deep.clone().lerp(new THREE.Color(theme.water[1]), 0.35), specular: '#fff6d8', shininess: 140, normalMap: ripples, normalScale: new THREE.Vector2(0.16, 0.16), transparent: true, opacity: 0.92 }));
      surface.position.y = WATER_Y;
      surface.receiveShadow = true;
      const bed = new THREE.Mesh(flat, new THREE.MeshBasicMaterial({ color: deep.clone().multiplyScalar(0.8) }));
      bed.position.y = WATER_Y - 3;
      land.add(bed, surface);
      waters.push(surface);
      if (w.kind === 'sea') {
        // a line of surf that washes up the beach and back
        const pts = w.pts.filter((p) => p[1] > w.shoreY - 40 && p[0] > -900 && p[0] < W.w + 900).reverse();
        const v = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const [a, b] = [pts[i], pts[i + 1]];
          v.push(a[0], 0, a[1], b[0], 0, b[1], b[0], 0, b[1] - 16, a[0], 0, a[1], b[0], 0, b[1] - 16, a[0], 0, a[1] - 16);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        surf = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
        surf.position.y = WATER_Y + 0.6;
        land.add(surf);
      }
    }
    const beyond = new THREE.Mesh(new THREE.ShapeGeometry(far).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
    beyond.position.y = -0.7;
    beyond.receiveShadow = true;
    land.add(beyond);

    const structures = PR.buildStructures(L, theme);
    if (structures) land.add(structures);

    // scenery
    const items = buildScenery(L, theme, seed + 5, true);
    const of = (kind) => items.filter((it) => it.kind === kind);
    land.add(PR.buildTrees(of('tree'), theme));
    const lamps = of('lamp');
    land.add(PR.buildLamps(lamps));
    for (const it of lamps) {
      halos.add(it.x, 67, it.y, 120, '#ffd88a');
      pools.add(it.x, 0.8, it.y, 250, '#ffcf80');
    }
    const benches = of('bench');
    if (benches.length) land.add(PR.buildBenches(benches));
    if (of('fence').length) land.add(PR.buildFence(of('fence'), theme.fence));
    if (of('lanterns').length) {
      land.add(PR.buildLanterns(of('lanterns')));
      for (const it of of('lanterns')) {
        halos.add(it.x, 30, it.y, 150, '#ffb070');
        pools.add(it.x, WATER_Y + 1, it.y, 200, '#ff9a50');
      }
    }
    const at = (obj, it, y = 0) => {
      obj.position.set(it.x, y, it.y);
      land.add(obj);
      return obj;
    };
    for (const it of items) {
      switch (it.kind) {
        case 'gate':
          at(PR.buildGate(GAME_TITLE), it);
          halos.add(it.x, 150, it.y, 420, '#ffd88a');
          pools.add(it.x, 0.8, it.y + 40, 420, '#ffcf80');
          break;
        case 'booth': at(PR.buildBooth(), it); break;
        case 'bunting': land.add(PR.buildBunting([it.x - it.half, 74, it.y], [it.x + it.half, 74, it.y])); break;
        case 'bandstand':
        case 'pavilion':
          at(PR.buildBandstand(it.kind === 'pavilion' ? 1.3 : 1), it);
          halos.add(it.x, 60, it.y, 330, '#ffd88a');
          pools.add(it.x, 0.8, it.y, 360, '#ffcf80');
          break;
        case 'fountain': {
          const f = PR.buildFountain(theme.water[1]);
          at(f.group, it);
          ticks.push(f.tick);
          halos.add(it.x, 44, it.y, 200, '#9fd8ff');
          break;
        }
        case 'bonfire': {
          const f = PR.buildBonfire();
          at(f.group, it);
          ticks.push(f.tick);
          halos.add(it.x, 30, it.y, 420, '#ffa450');
          pools.add(it.x, 0.8, it.y, 520, '#ff9a40');
          break;
        }
        case 'fir':
          at(PR.buildFir(), it);
          halos.add(it.x, 110, it.y, 360, '#bfe6ff');
          break;
        case 'topiary': at(PR.buildTopiary(theme), it); break;
        case 'parasol': at(PR.buildParasol(it.hue), it); break;
        case 'bales': at(PR.buildBales(), it); break;
        case 'boat': {
          const b = at(PR.buildBoat(it.hue), it, WATER_Y + 3);
          b.rotation.y = it.hue * 1.3;
          ticks.push((t) => {
            b.position.x = it.x + Math.sin(t * 0.13 + it.hue * 2) * it.drift;
            b.position.y = WATER_Y + 3 + Math.sin(t * 1.1 + it.hue) * 1.2;
            b.rotation.z = Math.sin(t * 0.8 + it.hue) * 0.05;
          });
          break;
        }
        case 'barge': {
          const b = PR.buildBarge(it.hue);
          land.add(b);
          const canal = L.water[0];
          const span = W.w + 2 * M;
          ticks.push((t) => {
            const u = (((it.t0 + (t * it.speed) / span) % 1) + 1) % 1;
            const x = -M + u * span;
            b.position.set(x, WATER_Y + 5, canal.mid(x));
            b.rotation.y = it.speed > 0 ? 0 : Math.PI;
          });
          break;
        }
        case 'ducks': {
          const d = at(PR.buildDucks(), it, WATER_Y + 1);
          ticks.push((t) => {
            d.position.x = it.x + Math.sin(t * 0.3) * 24;
            d.rotation.y = Math.cos(t * 0.3) > 0 ? Math.PI / 2 : -Math.PI / 2;
          });
          break;
        }
        case 'buoy': {
          const b = at(PR.buildBuoy(), it, WATER_Y + 2);
          ticks.push((t) => {
            b.position.y = WATER_Y + 2 + Math.sin(t * 1.5 + it.x) * 1.6;
            b.rotation.z = Math.sin(t * 1.1 + it.x) * 0.12;
          });
          break;
        }
        case 'skaters':
          ['#b3343c', '#2c6f8f', '#d99a16'].forEach((color, k) => {
            const sk = PR.buildSkater(color);
            land.add(sk);
            ticks.push((t) => {
              const a = t * (0.5 + k * 0.12) + k * 2.1;
              sk.position.set(it.x + Math.cos(a) * (46 + k * 16), 0, it.y + Math.sin(a) * (24 + k * 9));
              sk.rotation.y = -a;
              sk.rotation.z = 0.16;
            });
          });
          break;
        default: break;
      }
    }

    // each plot's place, and the light it throws at night
    L.plots.forEach((p, k) => {
      plots[k].group.position.set(p.x, 0, p.y - 96);
      plots[k].key = '';
    });
    weather.length = 0;
    if (theme.weather) {
      const r = mulberry32(seed + 9);
      for (let k = 0; k < 46; k++) weather.push({ x: r(), y: r(), z: 0.5 + r() * 0.8, ph: r() * TAU, k });
    }
    animT.fill(0);
    townHalos = halos.items.length;
    townPools = pools.items.length;
    lightKey = '';
  }
  let townHalos = 0; // how many of the lights belong to the town rather than to a plot
  let townPools = 0;
  let lightKey = '';

  function setTown() {
    if (world.state.town === town) return;
    town = world.state.town;
    theme = townInfo(town).theme;
    L = layoutFor(town);
    buildTown();
  }

  // Keep each plot's model in step with the game: built, upgraded, pied, for sale.
  function syncPlots() {
    const s = world.state;
    L.plots.forEach((p, k) => {
      const plot = s.plots[k];
      const node = plots[k];
      const d = designAt(s, k);
      const afford = plot.stage === 0 && s.coins >= E.stageCost(s.town, k, 1);
      const key = plot.stage === 0 ? `sale:${afford}` : `${d.id}:${plot.stage}:${plot.splat}`;
      if (node.key === key) return;
      node.key = key;
      for (const child of [...node.group.children]) {
        node.group.remove(child);
        dispose(child);
      }
      node.model = null;
      if (plot.stage === 0) {
        const sign = buildForSale(afford);
        sign.position.z = 70;
        node.group.add(sign);
        return;
      }
      node.model = buildAttraction(d);
      node.group.add(node.model.group);
      const kit = buildStageKit(plot.stage, p.side);
      if (kit) node.group.add(kit);
      if (plot.splat) node.group.add(buildSplat(d.w, d.h));
    });
  }

  // ---- camera -----------------------------------------------------------------

  // The camera circles a spot on the ground: (x, z), a heading and a zoom.
  const rig = { x: W.w / 2, z: W.h * 0.62, home: W.h * 0.62, yaw: 0, zoom: 1, base: 2600, tx: null, tz: null, yawTo: null, minZoom: 0.78, maxZoom: 3.4 };
  const insets = { top: 104, bottom: 84, right: 0 };
  let vw = 300;
  let vh = 300;
  let dpr = 1;
  let time = 0;
  let selected = -1;
  let pointer = -1;
  let sheetCover = 0;
  let cover = 0;
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usableH = () => vh - insets.top - insets.bottom;
  const centreX = () => (vw - insets.right) / 2;
  const centreY = () => insets.top + usableH() / 2;

  // Pulled right back the camera looks nearly straight down; close in, it
  // drops low enough to look across the park to the horizon.
  const pitchFor = (zoom) => (zoom < 1 ? lerp(50, 72, clamp((1 - zoom) / 0.3, 0, 1)) : lerp(50, 16, ease((zoom - 1) / 2.4))) * RAD;

  function place(drift = 0) {
    const d = rig.base / rig.zoom;
    const phi = pitchFor(rig.zoom);
    const yaw = rig.yaw + drift;
    camera.position.set(rig.x + Math.sin(yaw) * Math.cos(phi) * d, Math.sin(phi) * d + 30, rig.z + Math.cos(yaw) * Math.cos(phi) * d);
    camera.lookAt(rig.x, 30, rig.z);
    // put the middle of the picture in the middle of the clear space, not of the screen
    camera.setViewOffset(vw, vh, vw / 2 - centreX(), vh / 2 - centreY(), vw, vh);
    camera.updateMatrixWorld();
  }
  const v3 = new THREE.Vector3();
  const pt = { x: 0, y: 0, ok: false };
  // Where a point in the world lands on screen (left in `pt`).
  function proj(x, y, z) {
    v3.set(x, y, z).project(camera);
    pt.x = (v3.x * 0.5 + 0.5) * vw;
    pt.y = (-v3.y * 0.5 + 0.5) * vh;
    pt.ok = v3.z < 1 && v3.z > -1;
    return pt.ok;
  }
  // Screen pixels per world unit at a point: how big things there appear.
  function scaleAt(x, z) {
    proj(x, 0, z);
    const [bx, by] = [pt.x, pt.y];
    proj(x, 20, z);
    return Math.hypot(pt.x - bx, pt.y - by) / 20;
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  // The spot on the ground under a point on the screen.
  function groundAt(sx, sy) {
    ray.setFromCamera(ndc.set((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1), camera);
    if (!ray.ray.intersectPlane(floor, hit) || hit.distanceTo(camera.position) > 9000) return null;
    return { x: hit.x, z: hit.z };
  }

  function clampRig() {
    rig.zoom = clamp(rig.zoom, rig.minZoom, rig.maxZoom);
    rig.x = clamp(rig.x, 60, W.w - 60);
    const hidden = Math.max(rig.tx === null ? cover : sheetCover, insets.bottom) - insets.bottom;
    // at the usual distance the gate stays at the foot of the view; closer in you can walk the camera down to it
    const south = lerp(rig.home, W.h - 120, clamp((rig.zoom - 1) / 0.6, 0, 1));
    rig.z = clamp(rig.z, 160, south + hidden * 2.2);
    place();
  }

  // The camera's z that puts the road outside the gate at the foot of the view.
  function homeZ() {
    const want = vh - insets.bottom - 4;
    let lo = 0;
    let hi = W.h + 1400;
    for (let i = 0; i < 22; i++) {
      rig.z = (lo + hi) / 2;
      place();
      proj(W.w / 2, 0, W.gateY + 84);
      if (!pt.ok || pt.y > want) lo = rig.z;
      else hi = rig.z;
    }
    return (lo + hi) / 2;
  }

  // How far back the camera has to be for the park to sit nicely in this window.
  function fitBase() {
    const keep = { ...rig };
    Object.assign(rig, { zoom: 1, yaw: 0, x: W.w / 2 });
    const search = (ok) => {
      let lo = 500;
      let hi = 12000;
      for (let i = 0; i < 18; i++) {
        rig.base = (lo + hi) / 2;
        rig.z = homeZ();
        place();
        if (ok()) hi = rig.base;
        else lo = rig.base;
      }
      return hi;
    };
    const wide = search(() => proj(70, 0, W.gateY - 140) && pt.x >= 0);
    const tall = search(() => proj(W.w / 2, 0, 150) && pt.y >= insets.top + 60);
    const base = Math.min(Math.max(wide, tall), wide * 2);
    rig.base = base;
    const home = homeZ();
    Object.assign(rig, keep, { home });
    return base;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = canvas.clientWidth || window.innerWidth;
    vh = canvas.clientHeight || window.innerHeight;
    gl.setPixelRatio(dpr);
    gl.setSize(vw, vh, false);
    over.width = Math.round(vw * dpr);
    over.height = Math.round(vh * dpr);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    rig.base = fitBase();
    clampRig();
  }

  function resetView() {
    resize();
    Object.assign(rig, { zoom: 1, yaw: 0, x: W.w / 2, tx: null, tz: null, yawTo: null });
    introT = -1;
    rig.z = rig.home;
    clampRig();
  }

  // Glide so plot k sits in the clear space above any open sheet.
  function focus(k) {
    if (introT >= 0) {
      introT = -1;
      rig.zoom = 1;
      rig.yaw = 0;
    }
    const p = L.plots[k];
    const clearBottom = vh - Math.max(insets.bottom, sheetCover);
    place();
    const g = groundAt(centreX(), (insets.top + clearBottom) / 2 + 40);
    if (!g) return;
    const wantX = Math.abs(rig.yaw) < 0.2 && vw < 700 ? W.w / 2 + (p.x - W.w / 2) * 0.45 : p.x;
    rig.tx = rig.x + (wantX - g.x);
    rig.tz = rig.z + (p.y - 80 - g.z);
  }

  // First look at the park: a slow sweep round and down.
  let introT = -1;
  function intro() {
    resetView();
    introT = 0;
  }

  // Turn the view by an eighth of a circle.
  function rotate(dir) {
    introT = -1;
    const step = Math.PI / 4;
    rig.yawTo = (Math.round((rig.yawTo ?? rig.yaw) / step) + dir) * step;
  }

  function updateCamera(dt) {
    if (introT >= 0) {
      introT = Math.min(1, introT + dt / 2.6);
      const u = 1 - Math.pow(1 - introT, 3);
      rig.zoom = lerp(0.74, 1, u);
      rig.yaw = lerp(-0.7, 0, u);
      rig.x = W.w / 2;
      rig.z = homeZ();
      rig.home = Math.max(rig.home, rig.z);
      if (introT >= 1) {
        introT = -1;
        rig.z = rig.home = homeZ();
      }
    }
    const k = 1 - Math.exp(-dt * 7);
    if (rig.yawTo !== null) {
      rig.yaw = lerp(rig.yaw, rig.yawTo, k);
      if (Math.abs(rig.yaw - rig.yawTo) < 0.002) {
        rig.yaw = rig.yawTo;
        rig.yawTo = null;
      }
    }
    if (rig.tx !== null) {
      const [bx, bz] = [rig.x, rig.z];
      rig.x = lerp(rig.x, rig.tx, k);
      rig.z = lerp(rig.z, rig.tz, k);
      clampRig();
      if (Math.abs(rig.x - bx) + Math.abs(rig.z - bz) < 0.05) rig.tx = rig.tz = null;
    }
    clampRig();
    // never quite still: a slow drift from side to side
    place(calm || introT >= 0 ? 0 : Math.sin(time * 0.2) * 0.012);
  }

  // ---- input ------------------------------------------------------------------

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  const span = () => {
    const [a, b] = [...pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now(), turn: e.button === 2 || e.shiftKey || e.altKey };
    } else if (pointers.size === 2) {
      pinch = { ...span(), zoom: rig.zoom, yaw: rig.yaw };
      if (drag) drag.moved = true;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2 && pinch) {
      // pinch to zoom, twist to turn
      const now = span();
      introT = -1;
      rig.yawTo = null;
      rig.zoom = clamp((pinch.zoom * now.d) / Math.max(1, pinch.d), rig.minZoom, rig.maxZoom);
      rig.yaw = pinch.yaw - (now.a - pinch.a);
      clampRig();
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
    if (drag.moved) {
      introT = -1;
      rig.tx = rig.tz = null;
      if (drag.turn) {
        rig.yawTo = null;
        rig.yaw -= (e.clientX - drag.x) * 0.006;
      } else {
        // keep the ground under the finger
        place();
        const from = groundAt(drag.x, drag.y);
        const to = groundAt(e.clientX, e.clientY);
        if (from && to) {
          rig.x += from.x - to.x;
          rig.z += from.z - to.z;
        }
      }
      clampRig();
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
      drag = { x: p.x, y: p.y, sx: p.x, sy: p.y, moved: true, t: 0, turn: false };
    }
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    introT = -1;
    if (e.shiftKey || e.ctrlKey) {
      rig.yawTo = null;
      rig.yaw += (e.deltaY || e.deltaX) * 0.0016;
      clampRig();
      return;
    }
    // zoom about the spot under the pointer
    place();
    const before = groundAt(e.clientX, e.clientY);
    rig.zoom = clamp(rig.zoom * Math.exp(-e.deltaY * 0.0014), rig.minZoom, rig.maxZoom);
    place();
    const after = groundAt(e.clientX, e.clientY);
    if (before && after) {
      rig.x += before.x - after.x;
      rig.z += before.z - after.z;
    }
    rig.tx = rig.tz = null;
    clampRig();
  }, { passive: false });
  canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());

  // What is under a tap? Balloons first, then the nearest plot.
  function pick(sx, sy) {
    place();
    for (const b of world.balloons) {
      if (proj(b.x, balloonY(b), b.y) && Math.hypot(sx - pt.x, sy - pt.y) < 46) return { balloon: b };
    }
    let best = -1;
    let bestD = Infinity;
    for (const p of L.plots) {
      const built = world.state.plots[p.index].stage > 0;
      const d = designAt(world.state, p.index);
      const [cz, tall] = [p.y - (built ? 70 : 30), built ? d.h + 20 : 60];
      if (!proj(p.x, 0, cz)) continue;
      const [bx, by] = [pt.x, pt.y];
      proj(p.x, tall, cz);
      const s = Math.hypot(pt.x - bx, pt.y - by) / tall;
      const half = (built ? d.w / 2 + 20 : 90) * s;
      if (Math.abs(sx - bx) > half || sy < pt.y - 12 || sy > by + 70 * s) continue;
      const dist = Math.abs(sy - (by + pt.y) / 2) + Math.abs(sx - bx) * 0.5;
      if (dist < bestD) {
        bestD = dist;
        best = p.index;
      }
    }
    return best >= 0 ? { plot: best } : null;
  }
  const balloonY = (b) => 150 + Math.sin(b.t * 1.3) * 10;

  // ---- effects (on the 2D layer) ----------------------------------------------------

  const particles = [];
  const popups = [];
  const rockets = [];
  const sparks = [];
  let rocketIn = 0;
  let showUntil = 0;

  function popText(x, y, text, color = '#fff6e0', size = 14) {
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

  // Throw a handful of bits into the air from a spot in the park.
  function burst(x, y, n, palette, opts = {}) {
    place();
    if (!proj(x, opts.shape === 'puff' ? 6 : 70, y)) return;
    const [ox, oy] = [pt.x, pt.y];
    const s = clamp(scaleAt(x, y), 0.2, 2.5);
    for (let k = 0; k < n; k++) {
      if (particles.length > 500) particles.shift();
      const a = opts.up ? -Math.PI / 2 + (Math.random() - 0.5) * 1.6 : Math.random() * TAU;
      const sp = (opts.speed || 150) * (0.4 + Math.random() * 0.8) * s;
      particles.push({
        x: ox + (Math.random() - 0.5) * (opts.spread || 10) * s,
        y: oy + (Math.random() - 0.5) * (opts.spreadY ?? opts.spread ?? 10) * s,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: (opts.gravity ?? 420) * s,
        t: 0,
        life: (opts.life || 0.9) * (0.7 + Math.random() * 0.6),
        size: (opts.size || 5) * (0.7 + Math.random() * 0.6) * Math.max(0.6, s * 1.3),
        color: palette[Math.floor(Math.random() * palette.length)],
        shape: opts.shape || 'rect',
        rot: Math.random() * TAU,
        vr: (Math.random() - 0.5) * 14,
      });
    }
  }
  const CONFETTI = ['#e5484d', '#ffc53d', '#3e63dd', '#46a758', '#e93d82', '#fff6e0'];
  const confetti = (x, y, n = 36) => burst(x, y, n, CONFETTI, { up: true, speed: 260, life: 1.3, spread: 60 });
  const coins = (x, y, n = 4) => burst(x, y, n, ['#e6ba4f', '#fdeeb5'], { up: true, speed: 150, life: 0.75, shape: 'coin', size: 5 });
  const dust = (x, y, w = 120) => burst(x, y, 20, ['#f1e6cc', '#e2d2b0', '#fff8e8'], { up: true, speed: 70, life: 1.0, size: 13, shape: 'puff', spread: w * 0.9, spreadY: 14, gravity: -30 });
  const custard = (x, y) => burst(x, y, 34, ['#fff3c4', '#ffe9a6', '#ffffff'], { speed: 260, life: 0.9, size: 9, shape: 'coin' });

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
        if (rockets.length <= 6) {
          rockets.push({
            x: vw * (0.12 + Math.random() * 0.76),
            y: vh - insets.bottom + 10,
            ty: insets.top + usableH() * (0.08 + Math.random() * 0.4),
            vy: -(vh * 0.9 + Math.random() * vh * 0.3),
            color: ['#ffd75e', '#ff7a9a', '#8fd3ff', '#b6f36b', '#ffb36b', '#d0a2ff'][Math.floor(Math.random() * 6)],
          });
        }
      }
    }
    for (let k = rockets.length - 1; k >= 0; k--) {
      const rk = rockets[k];
      rk.y += rk.vy * dt;
      if (rk.y <= rk.ty) {
        rockets.splice(k, 1);
        const big = 90 + Math.random() * 110;
        for (let j = 0; j < 38; j++) {
          const a = (j / 38) * TAU + Math.random() * 0.2;
          const sp = big * (0.75 + Math.random() * 0.35);
          sparks.push({ x: rk.x, y: rk.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.9 + Math.random() * 0.5, color: rk.color });
        }
        if (hooks.onBang) hooks.onBang();
      }
    }
    for (const sp of sparks) {
      sp.t += dt;
      sp.vx *= 1 - dt * 1.6;
      sp.vy = sp.vy * (1 - dt * 1.6) + 70 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
    }
    for (let k = sparks.length - 1; k >= 0; k--) if (sparks[k].t >= sparks[k].life) sparks.splice(k, 1);
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
  }
  const TONE = {
    plain: { bg: 'rgba(14,22,34,0.82)', edge: 'rgba(224,190,120,0.45)', fg: '#f0dcae' },
    go: { bg: 'rgba(24,104,78,0.94)', edge: 'rgba(190,240,215,0.6)', fg: '#ffffff' },
    done: { bg: 'rgba(196,158,86,0.96)', edge: 'rgba(255,244,214,0.8)', fg: '#1d1608' },
    alert: { bg: 'rgba(168,44,58,0.95)', edge: 'rgba(255,214,214,0.6)', fg: '#ffffff' },
  };

  function drawOverlay(dark) {
    const s = world.state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // a soft vignette pulls the eye to the middle of the park
    const vg = ctx.createRadialGradient(centreX(), vh * 0.46, Math.min(vw, vh) * 0.36, centreX(), vh * 0.46, Math.max(vw, vh) * 0.78);
    vg.addColorStop(0, 'rgba(10,18,30,0)');
    vg.addColorStop(1, 'rgba(10,18,30,0.3)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    // what the guests think of it all
    for (const g of world.guests) {
      if (!(g.emoteT > 0 && g.emote) || !proj(g.x, 36, g.y)) continue;
      const u = 1 - g.emoteT / 1.5;
      const k = clamp(scaleAt(g.x, g.y) * 1.5, 0.5, 1.6);
      ctx.save();
      ctx.translate(pt.x, pt.y - u * 12 * k);
      ctx.scale(k, k);
      A.drawEmote(ctx, g.emote, 0, 0, clamp(g.emoteT * 3, 0, 1) * g.alpha);
      ctx.restore();
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

    // a label in front of every plot
    for (const p of L.plots) {
      const k = p.index;
      const plot = s.plots[k];
      if (!proj(p.x, 0, plot.stage === 0 ? p.y - 14 : p.y + 40)) continue;
      const [sx, sy] = [pt.x, pt.y];
      if (sx < -160 || sx > vw + 160 || sy < -80 || sy > vh + 120) continue;
      const size = clamp(7 + scaleAt(p.x, p.y) * 11, 9.5, 14);
      const px = clamp(sx, size * 3, Math.max(vw - size * 3, size * 3));
      if (plot.stage === 0) {
        const cost = E.stageCost(s.town, k, 1);
        pill(px, sy + size, money(cost), s.coins >= cost ? TONE.go : TONE.plain, size + 1);
        continue;
      }
      const rt = world.rt[k];
      if (plot.splat) {
        pill(px, sy, 'Clean up ' + money(E.repairCost(s.town, k, plot.stage)), TONE.alert, size);
        continue;
      }
      const done = plot.stage >= STAGES;
      const can = !done && s.coins >= E.stageCost(s.town, k, plot.stage + 1);
      pill(px, sy, `${can ? '▲ ' : ''}★ ${plot.stage}/${STAGES}`, can ? TONE.go : done ? TONE.done : TONE.plain, size, rt.phase === 'run' ? rt.t / rt.dur : -1);
    }
    if (pointer >= 0) {
      const p = L.plots[pointer];
      const built = s.plots[pointer].stage > 0;
      if (proj(p.x, built ? designAt(s, pointer).h + 30 : 70, p.y - (built ? 96 : 26))) {
        const by = pt.y - 8 - Math.abs(Math.sin(time * 3.2)) * 10;
        ctx.beginPath();
        ctx.moveTo(pt.x - 12, by - 19);
        ctx.lineTo(pt.x + 12, by - 19);
        ctx.lineTo(pt.x, by);
        ctx.closePath();
        ctx.fillStyle = '#e0be78';
        ctx.fill();
        ctx.strokeStyle = '#0e1622';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }

    for (const p of popups) {
      if (!proj(p.x, 80, p.y)) continue;
      const u = p.t / 1.3;
      ctx.globalAlpha = clamp((1 - u) * 2.2, 0, 1);
      ctx.font = A.uiFont(Math.round(p.size * clamp(0.5 + scaleAt(p.x, p.y) * 1.2, 0.8, 1.3) * 1.05), 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,18,30,0.9)';
      ctx.strokeText(p.text, pt.x, pt.y - u * 46);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, pt.x, pt.y - u * 46);
    }
    ctx.globalAlpha = 1;

    // leaves, snow or blossom on the air
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

  // ---- the light of the day -------------------------------------------------------

  const C = (hex) => new THREE.Color(hex);
  const SKY = {
    top: [C('#4f8fc7'), C('#3f5f9a'), C('#070b1c')],
    low: [C('#d6e8ee'), C('#ffcf9a'), C('#1c2748')],
    sun: [C('#fff4dc'), C('#ffc078'), C('#8fa6e8')],
    hemiSky: [C('#dce9ff'), C('#ffd9b4'), C('#4a5c94')],
    hemiGround: [C('#a9a688'), C('#a08666'), C('#2a3350')],
  };
  const tone = new THREE.Color();
  const blend = (set, gold, night) => tone.copy(set[0]).lerp(set[1], gold).lerp(set[2], night);
  const sunDir = new THREE.Vector3();
  let nightShown = -1;

  function light(dark) {
    const gold = clamp(dark / 0.45, 0, 1);
    const night = clamp((dark - 0.45) / 0.55, 0, 1);
    const lit = clamp((dark - 0.25) / 0.5, 0, 1);
    // the sun sinks into the south-west; after dark the moon takes over from the east
    const elev = lerp(lerp(56, 15, gold), 48, night) * RAD;
    const azim = lerp(-2.1, 0.9, night);
    sunDir.set(Math.sin(azim) * Math.cos(elev), Math.sin(elev), Math.cos(azim) * Math.cos(elev));
    sun.position.copy(sun.target.position).addScaledVector(sunDir, 3200);
    sun.color.copy(blend(SKY.sun, gold, night));
    sun.intensity = lerp(lerp(2.5, 2.3, gold), 0.8, night);
    hemi.color.copy(blend(SKY.hemiSky, gold, night));
    hemi.groundColor.copy(blend(SKY.hemiGround, gold, night));
    hemi.intensity = lerp(lerp(2.3, 1.9, gold), 1.5, night);
    sky.material.uniforms.top.value.copy(blend(SKY.top, gold, night));
    sky.material.uniforms.low.value.copy(blend(SKY.low, gold, night));
    scene.fog.color.copy(sky.material.uniforms.low.value);
    gl.toneMappingExposure = lerp(1.0, 0.92, night);
    sunDisc.position.copy(camera.position).addScaledVector(sunDir, 11000);
    sunDisc.material.opacity = lerp(1, 0.55, night);
    stars.material.opacity = night * 0.9;
    stars.position.copy(camera.position);
    sky.position.copy(camera.position);
    GLOW.color.setScalar(lerp(0.62, 1, lit));
    for (const w of waters) w.material.specular.copy(sun.color).multiplyScalar(lerp(0.9, 0.5, night));
    if (Math.abs(lit - nightShown) > 0.004) nightShown = lit;
    return nightShown;
  }

  // The lights each built plot throws at night.
  function plotLights() {
    const s = world.state;
    const extra = [];
    for (const p of L.plots) {
      if (!isOpen(s, p.index)) continue;
      const d = designAt(s, p.index);
      const z = p.y - 96;
      extra.push([p.x, d.h * 0.55, z, Math.max(d.w, d.h) * 1.9, '#ffd88a', false]);
      extra.push([p.x, 0.8, z + 40, d.w * 2.4, '#ffcf80', true]);
      if (s.plots[p.index].stage >= 3) extra.push([p.x, 80, z + 92, 300, '#ffb4d0', false]);
    }
    return extra;
  }

  // ---- thumbnails -----------------------------------------------------------------

  const thumbs = new Map();
  // A little portrait of an attraction, rendered from its model.
  function thumbnail(design, w = 88, h = 74) {
    const key = `${design.id}|${w}|${h}`;
    if (thumbs.has(key)) return thumbs.get(key);
    const k = 3;
    const target = new THREE.WebGLRenderTarget(w * k, h * k);
    const model = buildAttraction(design);
    const box = new THREE.Box3().setFromObject(model.group);
    const size = box.getSize(new THREE.Vector3());
    const mid = box.getCenter(new THREE.Vector3());
    const stage = new THREE.Scene();
    const key1 = new THREE.DirectionalLight('#fff4dc', 3.2);
    key1.position.set(-1.2, 2, 1.6);
    stage.add(model.group, new THREE.HemisphereLight('#e8f0ff', '#807868', 1.5), key1);
    const cam = new THREE.PerspectiveCamera(24, w / h, 10, 6000);
    const reach = Math.max(size.y, size.x / (w / h), size.z * 0.6) * 0.5;
    const dist = (reach / Math.tan((12 * RAD))) * 1.12;
    cam.position.set(mid.x + dist * 0.42, mid.y + dist * 0.4, mid.z + dist * 0.82);
    cam.lookAt(mid);
    const keepGlow = GLOW.color.getHex();
    GLOW.color.setScalar(1);
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(stage, cam);
    const raw = new Uint8Array(w * k * h * k * 4);
    gl.readRenderTargetPixels(target, 0, 0, w * k, h * k, raw);
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 1);
    GLOW.color.setHex(keepGlow);
    target.dispose();
    dispose(model.group);
    // the pixels come back upside down and in linear light: flip and gamma-correct them
    const cv = document.createElement('canvas');
    cv.width = w * k;
    cv.height = h * k;
    const c = cv.getContext('2d');
    const img = c.createImageData(w * k, h * k);
    const row = w * k * 4;
    for (let y = 0; y < h * k; y++) {
      for (let x = 0; x < row; x += 4) {
        const from = (h * k - 1 - y) * row + x;
        const to = y * row + x;
        for (let ch = 0; ch < 3; ch++) img.data[to + ch] = Math.round(Math.pow(raw[from + ch] / 255, 1 / 2.2) * 255);
        img.data[to + 3] = raw[from + 3];
      }
    }
    c.putImageData(img, 0, 0);
    thumbs.set(key, cv);
    return cv;
  }

  // ---- the frame --------------------------------------------------------------------

  function draw(dt) {
    time += dt;
    setTown();
    if (Math.abs(cover - sheetCover) > 0.5) cover = lerp(cover, sheetCover, 1 - Math.exp(-dt * 12));
    updateCamera(dt);
    updateEffects(dt);
    syncPlots();
    const s = world.state;
    const dark = darkness(s.clock);
    const lit = light(dark);

    L.plots.forEach((p, k) => {
      const rt = world.rt[k];
      if (rt.phase === 'run') animT[k] += dt;
      const node = plots[k];
      if (node.model) node.model.tick(time + k * 1.7, animT[k], rt.phase === 'run');
      // freshly built: drop in, overshoot and settle
      if (pops[k] > 0) {
        const u = 1 - pops[k];
        const wob = 1 + Math.sin(u * Math.PI * 3) * (1 - u) * 0.16;
        const grow = Math.min(1, u * 3.2);
        node.group.scale.set(wob * (0.85 + grow * 0.15), (2 - wob) * (0.5 + grow * 0.5), wob * (0.85 + grow * 0.15));
      } else if (rt.pulse > 0) {
        const squash = 1 + Math.sin(rt.pulse * Math.PI) * 0.02;
        node.group.scale.set(squash, 2 - squash, squash);
      } else {
        node.group.scale.set(1, 1, 1);
      }
    });
    for (const tick of ticks) tick(time);
    crowd.update(world.guests, time, W.spawnY + 40);
    ripples.offset.set(time * 0.012, time * 0.008);
    if (surf) {
      surf.position.z = Math.sin(time * 0.7) * 6;
      surf.material.opacity = 0.45 + Math.sin(time * 0.7) * 0.25;
    }

    world.balloons.forEach((b, i) => {
      const g = balloons[i];
      if (!g) return;
      g.visible = true;
      g.position.set(b.x, balloonY(b), b.y);
      g.rotation.z = Math.sin(b.t * 0.9) * 0.08;
      g.userData.mat.color.set(b.color);
    });
    for (let i = world.balloons.length; i < balloons.length; i++) balloons[i].visible = false;

    if (selected >= 0) {
      const p = L.plots[selected];
      ring.visible = true;
      ring.position.set(p.x, 1.4, p.y - 96);
      ring.scale.set(170, 1, 132);
      ring.material.opacity = 0.55 + Math.sin(time * 4) * 0.25;
      ring.rotation.y = time * 0.3;
    } else {
      ring.visible = false;
    }

    // the plots' own lights change as things are built
    const key = L.plots.map((p) => (isOpen(s, p.index) ? designAt(s, p.index).id + s.plots[p.index].stage : '-')).join('|');
    if (key !== lightKey) {
      lightKey = key;
      halos.items.length = townHalos;
      pools.items.length = townPools;
      for (const [x, y, z, size, color, flat] of plotLights()) (flat ? pools : halos).add(x, y, z, size, color);
    }
    halos.place(camera, lit * 0.55);
    pools.place(camera, lit * 0.34);

    gl.render(scene, camera);
    drawOverlay(dark);
  }

  setTown();
  resetView();

  return {
    is3D: true,
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
    rotate,
    thumbnail,
    pop: (k) => { pops[k] = 1; },
    burst,
    cam: rig,
    toScreen: (x, y) => {
      place();
      proj(x, 0, y);
      return { x: pt.x, y: pt.y, s: scaleAt(x, y) };
    },
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
