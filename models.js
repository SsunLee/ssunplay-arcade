import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
const UP = new T.Vector3(0, 1, 0),
  DIR = new T.Vector3();
export class Factory {
  constructor() {
    this.materials = new Map();
    this.box = new T.BoxGeometry(1, 1, 1);
    this.ball = new T.SphereGeometry(1, 14, 10);
    this.tube = new T.CylinderGeometry(1, 1, 1, 10);
    this.round = new RoundedBoxGeometry(1, 1, 1, 2, 0.08);
  }
  mat(color, roughness = 0.78, metalness = 0) {
    const key = [color, roughness, metalness].join();
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new T.MeshStandardMaterial({ color, roughness, metalness }),
      );
    return this.materials.get(key);
  }
  mesh(geo, mat, parent, pos = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new T.Mesh(geo, typeof mat === "number" ? this.mat(mat) : mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent?.add(m);
    return m;
  }
  cube(parent, size, pos, color, round = false) {
    return this.mesh(round ? this.round : this.box, color, parent, pos, size);
  }
  sphere(parent, size, pos, color) {
    return this.mesh(this.ball, color, parent, pos, size);
  }
  rod(parent, a, b, r, color) {
    const m = this.mesh(this.tube, color, parent);
    this.bone(m, a, b, r);
    return m;
  }
  bone(m, a, b, r) {
    DIR.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const length = DIR.length();
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.scale.set(r, length, r);
    m.quaternion.setFromUnitVectors(UP, DIR.normalize());
  }
  batch(parent, items, color, geo = this.box) {
    const m = new T.InstancedMesh(
        geo,
        typeof color === "number" ? this.mat(color) : color,
        items.length,
      ),
      d = new T.Object3D();
    items.forEach((v, i) => {
      d.position.set(...v.p);
      d.scale.set(...v.s);
      d.rotation.set(...(v.r || [0, 0, 0]));
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
}
export function chairModel(F) {
  const g = new T.Group();
  g.userData.kind = "chair";
  const orange = 0xe68a27,
    dark = 0x252c30;
  F.cube(g, [0.56, 0.105, 0.5], [0, 0.49, 0], orange, true);
  F.cube(g, [0.55, 0.54, 0.085], [0, 0.86, 0.235], orange, true);
  F.cube(g, [0.45, 0.38, 0.01], [0, 0.88, 0.184], 0xe99532, true);
  F.rod(g, [0, 0.13, 0], [0, 0.47, 0], 0.045, 0x848c91);
  F.rod(g, [0, 0.13, 0], [0, 0.26, 0], 0.058, dark);
  const wheels = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5,
      x = Math.sin(a) * 0.34,
      z = Math.cos(a) * 0.34;
    F.rod(g, [0, 0.13, 0], [x, 0.1, z], 0.027, dark);
    const w = new T.Group();
    w.position.set(x, 0.06, z);
    w.rotation.y = a;
    const geo = new T.CylinderGeometry(0.055, 0.055, 0.07, 12);
    geo.rotateZ(Math.PI / 2);
    F.mesh(geo, dark, w);
    g.add(w);
    wheels.push(w);
  }
  for (const s of [-1, 1]) {
    F.rod(g, [s * 0.29, 0.49, 0.05], [s * 0.29, 0.66, 0.05], 0.018, dark);
    F.cube(g, [0.065, 0.035, 0.28], [s * 0.29, 0.68, 0.015], dark, true);
    F.rod(g, [s * 0.22, 0.5, 0.22], [s * 0.22, 0.66, 0.22], 0.016, dark);
  }
  g.userData.wheels = wheels;
  return g;
}
export function humanModel(F) {
  const g = new T.Group(),
    shirt = 0xb6c6d7,
    pants = 0x30374a,
    skin = 0xdcb496,
    dark = 0x242527;
  const parts = [];
  for (const [a, b, r, color] of [
    [0, 2, 0.17, shirt],
    [2, 3, 0.075, skin],
    [5, 6, 0.085, shirt],
    [6, 7, 0.068, shirt],
    [8, 9, 0.085, shirt],
    [9, 10, 0.068, shirt],
    [11, 12, 0.083, pants],
    [12, 13, 0.073, pants],
    [14, 15, 0.083, pants],
    [15, 16, 0.073, pants],
  ])
    parts.push({ m: F.mesh(F.tube, color, g), a, b, r });
  const shoulders = [5, 8].map((i) => ({
    i,
    m: F.sphere(g, [0.112, 0.105, 0.105], [0, 0, 0], shirt),
  }));
  const hands = [7, 10].map((i) => ({
    i,
    m: F.sphere(g, [0.063, 0.075, 0.058], [0, 0, 0], skin),
  }));
  const pelvis = F.sphere(g, [0.17, 0.11, 0.115], [0, 0, 0], pants),
    head = new T.Group();
  F.sphere(head, [0.13, 0.155, 0.13], [0, 0, 0], skin);
  F.sphere(head, [0.136, 0.128, 0.132], [0, 0.063, 0.025], dark);
  F.sphere(head, [0.025, 0.035, 0.025], [0, -0.007, -0.13], skin);
  for (const s of [-1, 1]) {
    F.sphere(head, [0.025, 0.039, 0.025], [s * 0.125, -0.01, 0], skin);
    F.sphere(head, [0.011, 0.014, 0.008], [s * 0.047, 0.019, -0.12], 0x20252a);
  }
  g.add(head);
  const shoes = [13, 16].map((i) => ({
    i,
    m: F.cube(g, [0.13, 0.095, 0.26], [0, 0, 0], 0x252936, true),
    sole: F.cube(g, [0.135, 0.025, 0.265], [0, 0, 0], 0x575b61, true),
  }));
  g.userData.update = (pts, yaw = 0) => {
    for (const p of parts) F.bone(p.m, pts[p.a], pts[p.b], p.r);
    for (const p of [...shoulders, ...hands]) p.m.position.set(...pts[p.i]);
    pelvis.position.set(...pts[0]);
    head.position.set(...pts[4]);
    head.rotation.y = yaw;
    const neck = pts[3],
      h = pts[4];
    head.rotation.z = Math.atan2(h[0] - neck[0], h[1] - neck[1]) * -1;
    head.rotation.x = Math.atan2(h[2] - neck[2], h[1] - neck[1]);
    for (const p of shoes) {
      p.m.position.set(pts[p.i][0], pts[p.i][1] - 0.015, pts[p.i][2] - 0.065);
      p.sole.position.copy(p.m.position);
      p.sole.position.y -= 0.045;
      p.m.rotation.y = p.sole.rotation.y = yaw;
    }
  };
  return g;
}
export function chickenModel(F, scale = 1) {
  const g = new T.Group();
  F.sphere(g, [0.22, 0.26, 0.19], [0, 0.25, 0], 0xfffcf0);
  F.sphere(g, [0.15, 0.16, 0.14], [0.1, 0.53, 0], 0xfffdf4);
  for (let i = 0; i < 3; i++)
    F.sphere(g, [0.055, 0.07, 0.035], [0.02 + i * 0.05, 0.68, 0], 0xdc3b35);
  const beak = F.mesh(
    new T.ConeGeometry(0.052, 0.14, 6),
    0xf1b02a,
    g,
    [0.28, 0.52, 0],
  );
  beak.rotation.z = -Math.PI / 2;
  for (const s of [-1, 1]) {
    F.sphere(g, [0.017, 0.021, 0.011], [0.15, 0.56, s * 0.126], 0x171c1c);
    F.cube(g, [0.11, 0.03, 0.025], [0.035, 0.005, s * 0.08], 0xe7a82c, true);
  }
  const wings = [-1, 1].map((s) =>
    F.sphere(g, [0.17, 0.21, 0.065], [-0.02, 0.26, s * 0.18], 0xe8e7db),
  );
  const tail = F.sphere(g, [0.13, 0.12, 0.12], [-0.23, 0.36, 0], 0xf4f0dd);
  tail.rotation.z = 0.5;
  g.scale.setScalar(scale);
  g.userData.animate = (t, nervous = 0) => {
    g.rotation.z =
      Math.sin(t * 2.3) * 0.025 + nervous * Math.sin(t * 23) * 0.12;
    for (let i = 0; i < 2; i++)
      wings[i].rotation.x =
        (i ? 1 : -1) *
        (Math.sin(t * (nervous ? 20 : 2)) * (nervous ? 0.7 : 0.05));
  };
  return g;
}
export function carModel(F, spec, type = "sedan") {
  const g = new T.Group(),
    color = spec.color,
    dark = 0x20272e,
    glass = F.mat(0x9dcbdb, 0.17, 0.1),
    wheels = [],
    width = type === "bus" ? 2.25 : 1.72;
  F.cube(g, [spec.half * 2, 0.46, width], [0, 0.08, 0], color, true);
  F.cube(
    g,
    [spec.half * 2 - 0.2, 0.1, width + 0.02],
    [0, -0.13, 0],
    0x2c3237,
    true,
  );
  if (type === "bus") {
    F.cube(g, [9.5, 2.0, width - 0.06], [0, 1.27, 0], color, true);
    F.cube(g, [0.05, 1.15, 1.9], [4.78, 1.65, 0], glass);
    for (const s of [-1, 1])
      for (let i = 0; i < 8; i++)
        F.cube(
          g,
          [0.92, 0.88, 0.045],
          [-3.75 + i * 1.08, 1.75, s * 1.115],
          glass,
          true,
        );
    F.cube(g, [9.4, 0.12, 2.18], [0, 2.32, 0], 0xf0e9c9, true);
    F.cube(g, [8.6, 0.12, 2.28], [-0.2, 0.7, 0], 0xf1db8b);
  } else if (type === "kei") {
    F.cube(g, [1.65, 0.93, width - 0.08], [0.68, 0.77, 0], color, true);
    F.cube(g, [0.03, 0.57, width - 0.24], [1.51, 0.91, 0], glass);
    for (const s of [-1, 1]) {
      F.cube(g, [1.25, 0.55, 0.03], [0.65, 0.93, s * 0.82], glass, true);
      F.cube(g, [1.38, 0.35, 0.1], [-0.88, 0.5, s * 0.82], color, true);
    }
    F.cube(g, [1.35, 0.1, 1.5], [-0.86, 0.31, 0], 0x88949a);
  } else {
    F.cube(g, [1.65, 0.15, width - 0.1], [1.15, 0.37, 0], color, true);
    F.cube(g, [0.65, 0.17, width - 0.08], [-1.6, 0.39, 0], color, true);
    F.cube(g, [1.9, 0.08, 1.45], [-0.35, 0.35, 0], 0x38332c, true);
    for (const s of [-1, 1]) {
      F.cube(g, [0.52, 0.35, 0.59], [-0.46, 0.59, s * 0.4], 0x754c34, true);
      const back = F.cube(
        g,
        [0.13, 0.56, 0.59],
        [-0.73, 0.89, s * 0.4],
        0x80573c,
        true,
      );
      back.rotation.z = -0.13;
      F.cube(g, [1.9, 0.33, 0.08], [-0.2, 0.48, s * 0.84], color, true);
    }
    const wind = F.cube(g, [0.055, 0.58, width - 0.18], [0.75, 0.73, 0], glass);
    wind.rotation.z = 0.25;
    F.rod(g, [0.7, 0.46, -0.81], [0.86, 1.02, -0.81], 0.035, color);
    F.rod(g, [0.7, 0.46, 0.81], [0.86, 1.02, 0.81], 0.035, color);
    F.rod(g, [0.86, 1.02, -0.81], [0.86, 1.02, 0.81], 0.035, color);
    if (type === "sports") {
      F.cube(g, [0.4, 0.08, 2.05], [-2.12, 0.72, 0], color);
      for (const s of [-1, 1])
        F.rod(g, [-1.9, 0.35, s * 0.65], [-1.9, 0.75, s * 0.65], 0.025, dark);
    }
  }
  for (let i = 0; i < 2; i++)
    for (const s of [-1, 1]) {
      const w = new T.Group();
      w.position.set(spec.axles[i], spec.hub, s * (width * 0.5 + 0.035));
      const tyre = new T.CylinderGeometry(spec.radius, spec.radius, 0.23, 18);
      tyre.rotateX(Math.PI / 2);
      F.mesh(tyre, dark, w);
      const rim = new T.CylinderGeometry(
        spec.radius * 0.57,
        spec.radius * 0.57,
        0.245,
        12,
      );
      rim.rotateX(Math.PI / 2);
      F.mesh(rim, 0xb8c1c6, w);
      for (let a = 0; a < 5; a++) {
        const spoke = F.cube(
          w,
          [spec.radius * 1.02, 0.055, 0.253],
          [0, 0, 0],
          0x4a555d,
        );
        spoke.rotation.z = (a * Math.PI) / 5;
      }
      g.add(w);
      wheels.push({ mesh: w, axle: i });
    }
  for (const s of [-1, 1]) {
    F.cube(
      g,
      [0.04, 0.12, 0.36],
      [spec.half + 0.005, 0.15, s * width * 0.32],
      0xfff2bd,
      true,
    );
    F.cube(
      g,
      [0.04, 0.12, 0.3],
      [-spec.half - 0.005, 0.15, s * width * 0.32],
      0xb42322,
      true,
    );
  }
  F.cube(
    g,
    [0.08, 0.1, width * 0.93],
    [spec.half + 0.035, -0.04, 0],
    0xc4cbcb,
    true,
  );
  F.cube(
    g,
    [0.08, 0.1, width * 0.93],
    [-spec.half - 0.035, -0.04, 0],
    0xc4cbcb,
    true,
  );
  const chicken = chickenModel(F, type === "bus" ? 1.8 : 1);
  chicken.position.set(
    type === "bus" ? 3.8 : type === "kei" ? 0.65 : -0.23,
    type === "bus" ? 2.4 : type === "kei" ? 1.28 : 0.68,
    0.37,
  );
  g.add(chicken);
  g.userData.wheels = wheels;
  g.userData.chicken = chicken;
  return g;
}
export function noiseTexture(colors, size = 128, seed = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * size * 0.7; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.globalAlpha = 0.2 + rand() * 0.5;
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  const texture = new T.CanvasTexture(c);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
