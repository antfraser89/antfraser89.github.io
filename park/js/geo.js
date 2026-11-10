// A small kit for building 3D models out of simple solids. Every solid added
// to a Kit is baked into one mesh (one draw call) with its colour stored per
// vertex, so a whole fairground ride costs the same to draw as a single box.
// y is up; a solid's (x, y, z) is the middle of its base unless noted.
import * as THREE from './vendor/three.module.min.js';

export { THREE };

// Shared by every painted surface in the park.
export const PAINT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.02 });
// Lit bulbs, lanterns and windows: unaffected by the scene's lights. The
// renderer turns its colour up at night and down by day.
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpScale = new THREE.Vector3();
const tmpPos = new THREE.Vector3();
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export class Kit {
  constructor() {
    this.parts = [];
    this.lit = [];
  }

  // Any geometry, placed with its own origin at (x, y, z).
  put(geo, color, x, y, z, o = {}) {
    tmpEuler.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ');
    tmpQuat.setFromEuler(tmpEuler);
    tmpScale.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale);
    (o.glow ? this.lit : this.parts).push({ geo, color, matrix: tmpMatrix.clone(), plain: !!o.plain });
    return this;
  }

  box(x, y, z, w, h, d, color, o = {}) {
    return this.put(UNIT_BOX, color, x, y + h / 2, z, { ...o, sx: w, sy: h, sz: d });
  }

  cyl(x, y, z, rTop, rBottom, h, color, o = {}) {
    return this.put(new THREE.CylinderGeometry(rTop, rBottom, h, o.seg || 16, 1, !!o.open), color, x, y + h / 2, z, o);
  }

  cone(x, y, z, r, h, color, o = {}) {
    return this.put(new THREE.ConeGeometry(r, h, o.seg || 16), color, x, y + h / 2, z, o);
  }

  // A sphere centred on (x, y, z); sy squashes or stretches it.
  ball(x, y, z, r, color, o = {}) {
    return this.put(new THREE.SphereGeometry(r, o.seg || 12, o.rings || 8), color, x, y, z, o);
  }

  // A blobby, faceted lump: tree crowns, candy floss, sawdust.
  blob(x, y, z, r, color, o = {}) {
    return this.put(new THREE.IcosahedronGeometry(r, o.detail ?? 1), color, x, y, z, o);
  }

  // A ring lying flat unless turned with rx / rz.
  ring(x, y, z, R, r, color, o = {}) {
    return this.put(new THREE.TorusGeometry(R, r, o.tubeSeg || 6, o.seg || 24, o.arc || Math.PI * 2), color, x, y, z, { rx: Math.PI / 2, ...o });
  }

  // A pipe through a list of [x, y, z] points.
  tube(points, r, color, o = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), !!o.closed, 'catmullrom', 0.5);
    return this.put(new THREE.TubeGeometry(curve, o.seg || points.length * 6, r, o.sides || 5, !!o.closed), color, 0, 0, 0, o);
  }

  // A straight bar from one point to another.
  bar(a, b, r, color, o = {}) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), quat, new THREE.Vector3(1, 1, 1));
    (o.glow ? this.lit : this.parts).push({ geo: new THREE.CylinderGeometry(r, r, len, o.seg || 6), color, matrix: m, plain: !!o.plain });
    return this;
  }

  // A pitched roof: a ridge along x, eaves at y, apex `rise` above.
  roof(x, y, z, w, d, rise, color, o = {}) {
    const g = new THREE.BufferGeometry();
    const [hw, hd] = [w / 2, d / 2];
    const v = [
      -hw, 0, hd, hw, 0, hd, hw, rise, 0, -hw, 0, hd, hw, rise, 0, -hw, rise, 0, // front slope
      hw, 0, -hd, -hw, 0, -hd, -hw, rise, 0, hw, 0, -hd, -hw, rise, 0, hw, rise, 0, // back slope
      -hw, 0, -hd, -hw, 0, hd, -hw, rise, 0, hw, 0, hd, hw, 0, -hd, hw, rise, 0, // gables
    ];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.put(g, color, x, y, z, o);
  }

  // A striped awning or tent roof: n segments round a cone, in alternating colours.
  tent(x, y, z, r, h, colors, o = {}) {
    const n = o.seg || 12;
    for (let k = 0; k < n; k++) {
      const g = new THREE.ConeGeometry(r, h, 1, 1, true, (k / n) * Math.PI * 2, (Math.PI * 2) / n);
      this.put(g, colors[k % colors.length], x, y + h / 2, z, o);
    }
    return this;
  }

  // Bake everything into meshes. Returns a Group holding the painted mesh and,
  // if anything glows, a second mesh for the lit parts.
  build(o = {}) {
    const group = new THREE.Group();
    const bake = (list, material) => {
      if (!list.length) return null;
      let total = 0;
      const flat = list.map((p) => {
        const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
        g.applyMatrix4(p.matrix);
        total += g.attributes.position.count;
        return g;
      });
      const pos = new Float32Array(total * 3);
      const nor = new Float32Array(total * 3);
      const col = new Float32Array(total * 3);
      let at = 0;
      flat.forEach((g, i) => {
        const n = g.attributes.position.count;
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, at * 3);
        nor.set(g.attributes.normal.array, at * 3);
        tmpColor.set(list[i].color);
        // darker toward the foot of each solid: a cheap stand-in for the
        // light that never quite reaches the bottom of things
        g.computeBoundingBox();
        const [lo, hi] = [g.boundingBox.min.y, g.boundingBox.max.y];
        const span = Math.max(1e-3, hi - lo);
        for (let k = 0; k < n; k++) {
          const lift = list[i].plain ? 1 : 0.86 + 0.14 * Math.min(1, (g.attributes.position.getY(k) - lo) / Math.min(span, 60));
          col[(at + k) * 3] = tmpColor.r * lift;
          col[(at + k) * 3 + 1] = tmpColor.g * lift;
          col[(at + k) * 3 + 2] = tmpColor.b * lift;
        }
        at += n;
        g.dispose();
      });
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
      merged.computeBoundingSphere();
      return new THREE.Mesh(merged, material);
    };
    const painted = bake(this.parts, o.material || PAINT);
    if (painted) {
      painted.castShadow = o.shadow !== false;
      painted.receiveShadow = o.receive !== false;
      group.add(painted);
    }
    const lit = bake(this.lit, GLOW);
    if (lit) group.add(lit);
    return group;
  }
}

// Free the GPU memory of everything under an object.
export function dispose(object) {
  object.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.userData.ownMap && o.material) {
      if (o.material.map) o.material.map.dispose();
      o.material.dispose();
    }
  });
}
