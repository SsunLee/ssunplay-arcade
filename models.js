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
export function bujangModel(F, scale = 1) {
  // 부장님: balding comb-over, glasses, mustache, white shirt and tie; faces +x
  const g = new T.Group(),
    shirt = 0xf7f6f0,
    pants = 0x2e3546,
    skin = 0xe2b393,
    hair = 0x2b2622,
    frame = 0x1d1f22;
  F.sphere(g, [0.19, 0.11, 0.17], [-0.02, 0.07, 0], pants);
  for (const s of [-1, 1])
    F.rod(g, [0, 0.08, s * 0.085], [0.27, 0.1, s * 0.085], 0.062, pants);
  F.sphere(g, [0.18, 0.24, 0.2], [-0.01, 0.31, 0], shirt);
  F.sphere(g, [0.15, 0.15, 0.17], [0.06, 0.23, 0], shirt);
  const tie = F.cube(g, [0.022, 0.24, 0.055], [0.172, 0.3, 0], 0xc3272f);
  tie.rotation.z = 0.32;
  F.cube(g, [0.03, 0.045, 0.06], [0.15, 0.455, 0], 0xa81f27);
  for (const s of [-1, 1]) {
    const collar = F.cube(
      g,
      [0.02, 0.05, 0.07],
      [0.13, 0.47, s * 0.045],
      shirt,
    );
    collar.rotation.x = s * 0.6;
  }
  F.rod(g, [0, 0.45, 0], [0.01, 0.55, 0], 0.06, skin);
  const head = new T.Group();
  head.position.set(0.02, 0.63, 0);
  F.sphere(head, [0.13, 0.15, 0.13], [0, 0, 0], skin);
  F.sphere(head, [0.118, 0.085, 0.137], [-0.035, -0.012, 0], hair);
  // comb-over: a few thin strands swept across the shiny crown
  for (const [x, r] of [
    [-0.05, 0.128],
    [-0.012, 0.137],
    [0.026, 0.133],
    [0.06, 0.12],
  ]) {
    const arc = new T.TorusGeometry(r, 0.007, 4, 14, 2.1);
    arc.rotateZ(0.55);
    arc.rotateY(Math.PI / 2);
    F.mesh(arc, hair, head, [x, 0, 0], [1, 1.12, 1]);
  }
  for (const s of [-1, 1]) {
    F.sphere(head, [0.026, 0.04, 0.024], [0, -0.01, s * 0.128], skin);
    F.sphere(head, [0.011, 0.012, 0.011], [0.122, 0.015, s * 0.048], 0x15181b);
    const brow = F.cube(
      head,
      [0.012, 0.016, 0.05],
      [0.123, 0.062, s * 0.05],
      hair,
    );
    brow.rotation.x = s * -0.25;
    const lens = new T.TorusGeometry(0.034, 0.0065, 6, 16);
    lens.rotateY(Math.PI / 2);
    F.mesh(lens, frame, head, [0.135, 0.015, s * 0.05]);
    F.rod(head, [0.13, 0.02, s * 0.084], [0.0, 0.02, s * 0.128], 0.005, frame);
    F.sphere(head, [0.02, 0.014, 0.02], [0.108, -0.035, s * 0.075], 0xeb9c8e);
    const tash = F.sphere(
      head,
      [0.02, 0.016, 0.042],
      [0.128, -0.06, s * 0.03],
      hair,
    );
    tash.rotation.x = s * 0.35;
  }
  F.cube(head, [0.008, 0.008, 0.038], [0.138, 0.015, 0], frame);
  F.sphere(head, [0.028, 0.034, 0.03], [0.14, -0.022, 0], 0xd99a7e);
  F.cube(head, [0.01, 0.01, 0.04], [0.124, -0.088, 0], 0x7a3a33);
  const sweat = F.sphere(
    head,
    [0.016, 0.026, 0.016],
    [0.07, 0.07, 0.12],
    F.mat(0x9fd3f2, 0.15, 0.1),
  );
  g.add(head);
  const wheel = new T.TorusGeometry(0.11, 0.014, 6, 20);
  wheel.rotateY(Math.PI / 2);
  const steer = F.mesh(wheel, 0x22272c, g, [0.36, 0.38, 0]);
  steer.rotation.z = 0.45;
  const arms = [-1, 1].map((s) => {
    const arm = new T.Group();
    arm.position.set(0.02, 0.44, s * 0.17);
    F.sphere(arm, [0.07, 0.07, 0.07], [0, 0, 0], shirt);
    F.rod(arm, [0, 0, 0], [0.16, -0.12, -s * 0.01], 0.055, shirt);
    F.rod(
      arm,
      [0.16, -0.12, -s * 0.01],
      [0.32, -0.06, -s * 0.06],
      0.045,
      shirt,
    );
    F.sphere(arm, [0.04, 0.045, 0.04], [0.34, -0.055, -s * 0.065], skin);
    g.add(arm);
    return arm;
  });
  g.scale.setScalar(scale);
  g.userData.animate = (t, nervous = 0) => {
    g.rotation.z = Math.sin(t * 2.3) * 0.02 + nervous * Math.sin(t * 23) * 0.08;
    head.rotation.y = nervous * Math.sin(t * 17) * 0.35;
    head.rotation.z = Math.sin(t * 1.7) * 0.04 + nervous * 0.12;
    for (let i = 0; i < 2; i++)
      arms[i].rotation.z = nervous * (1.1 + Math.sin(t * 19 + i * 2.4) * 0.55);
    sweat.visible = nervous > 0.3;
    sweat.position.y = 0.07 - ((t * 0.6) % 0.12);
  };
  return g;
}
export function carModel(F, spec, type = "sedan") {
  // "sedan" stages drive a white open-top Daewoo Tico so the driver shows from the chase camera; other cabins are open shells behind glass
  const g = new T.Group(),
    color = spec.color,
    dark = 0x20272e,
    glass = new T.MeshStandardMaterial({
      color: 0x9dcbdb,
      roughness: 0.17,
      metalness: 0.1,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
    wheels = [],
    width = type === "bus" ? 2.25 : 1.72,
    tico = type === "sedan";
  F.cube(g, [spec.half * 2, 0.46, width], [0, 0.08, 0], color, true);
  F.cube(
    g,
    [spec.half * 2 - 0.2, 0.1, width + 0.02],
    [0, -0.13, 0],
    0x2c3237,
    true,
  );
  if (type === "bus") {
    F.cube(g, [9.5, 1.04, width - 0.06], [0, 0.79, 0], color, true);
    F.cube(g, [9.5, 0.1, width - 0.06], [0, 2.22, 0], color, true);
    F.cube(g, [0.05, 1.15, 1.9], [4.78, 1.65, 0], glass);
    F.cube(g, [0.05, 0.85, 1.9], [-4.74, 1.75, 0], glass);
    const posts = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 8; i++)
        F.cube(
          g,
          [0.92, 0.88, 0.045],
          [-3.75 + i * 1.08, 1.75, s * 1.115],
          glass,
          true,
        );
      for (let i = 0; i < 7; i++)
        posts.push({
          p: [-3.21 + i * 1.08, 1.76, s * 1.08],
          s: [0.16, 0.9, 0.06],
        });
      posts.push(
        { p: [-4.48, 1.76, s * 1.08], s: [0.54, 0.9, 0.06] },
        { p: [4.51, 1.76, s * 1.08], s: [0.48, 0.9, 0.06] },
        { p: [4.72, 1.76, s * 1.02], s: [0.06, 0.9, 0.15] },
        { p: [-4.72, 1.76, s * 1.02], s: [0.06, 0.9, 0.15] },
      );
    }
    F.batch(g, posts, color);
    const seats = [];
    for (let i = 0; i < 7; i++)
      for (const s of [-1, 1])
        seats.push({
          p: [-3.7 + i * 1.05, 1.45, s * 0.55],
          s: [0.12, 0.6, 0.78],
        });
    F.batch(g, seats, 0x3a4a6e);
    F.cube(g, [9.4, 0.12, 2.18], [0, 2.32, 0], 0xf0e9c9, true);
    F.cube(g, [8.6, 0.12, 2.28], [-0.2, 0.7, 0], 0xf1db8b);
  } else if (type === "kei") {
    F.cube(g, [1.65, 0.35, width - 0.08], [0.68, 0.485, 0], color, true);
    F.cube(g, [1.65, 0.06, width - 0.08], [0.68, 1.205, 0], color, true);
    F.cube(g, [0.03, 0.57, width - 0.24], [1.51, 0.91, 0], glass);
    F.cube(g, [0.03, 0.52, width - 0.12], [-0.13, 0.92, 0], glass);
    for (const s of [-1, 1]) {
      F.cube(g, [1.25, 0.55, 0.03], [0.65, 0.93, s * 0.82], glass, true);
      F.cube(g, [1.38, 0.35, 0.1], [-0.88, 0.5, s * 0.82], color, true);
      for (const x of [-0.12, 1.47])
        F.rod(g, [x, 0.66, s * 0.79], [x, 1.18, s * 0.79], 0.04, color);
    }
    F.cube(g, [1.35, 0.1, 1.5], [-0.86, 0.31, 0], 0x88949a);
  } else if (tico) {
    // short hood, roof chopped off: only the windshield and its frame stand above the doors
    F.cube(g, [3.45, 0.21, width - 0.02], [-0.375, 0.415, 0], color, true);
    const hood = F.cube(
      g,
      [0.86, 0.16, width - 0.06],
      [1.7, 0.39, 0],
      color,
      true,
    );
    hood.rotation.z = -0.09;
    F.rod(g, [0.9, 0.99, -0.8], [0.9, 0.99, 0.8], 0.04, color);
    F.cube(g, [0.5, 0.1, width - 0.1], [-1.86, 0.57, 0], color, true);
    F.cube(g, [3.3, 0.01, width - 0.14], [-0.4, 0.527, 0], 0x2a2d31);
    F.cube(g, [0.32, 0.14, width - 0.2], [1.08, 0.57, 0], 0x2a2d31, true);
    const wind = F.cube(g, [0.035, 0.63, width - 0.16], [1.11, 0.75, 0], glass);
    wind.rotation.z = 0.74;
    for (const s of [-1, 1]) {
      const z = s * 0.81;
      F.rod(g, [1.32, 0.52, z], [0.9, 0.99, z], 0.04, color);
      F.cube(g, [3.2, 0.05, 0.07], [-0.45, 0.545, z], color, true);
      const back = F.cube(
        g,
        [0.1, 0.34, 0.46],
        [-0.46, 0.55, s * 0.4],
        0x4b4f55,
        true,
      );
      back.rotation.z = -0.12;
      F.cube(g, [0.4, 0.12, 0.46], [-0.2, 0.4, s * 0.4], 0x4b4f55, true);
      F.cube(g, [0.1, 0.4, 0.62], [-1.45, 0.56, s * 0.36], 0x4b4f55, true);
      for (const x of [1.18, -0.58])
        F.cube(g, [0.015, 0.4, 0.012], [x, 0.32, s * 0.866], dark);
      F.cube(g, [0.12, 0.03, 0.02], [-0.42, 0.45, s * 0.866], dark);
      F.cube(g, [4.0, 0.04, 0.012], [0, 0.2, s * 0.866], 0x2c3237);
      F.cube(g, [0.1, 0.08, 0.05], [0.98, 0.6, s * 0.92], dark, true);
      const lamp = new T.CylinderGeometry(0.095, 0.095, 0.04, 18);
      lamp.rotateZ(Math.PI / 2);
      F.mesh(lamp, 0xfff2bd, g, [2.15, 0.27, s * 0.56]);
      const bezel = new T.CylinderGeometry(0.115, 0.115, 0.03, 18);
      bezel.rotateZ(Math.PI / 2);
      F.mesh(bezel, 0xc4cbcb, g, [2.14, 0.27, s * 0.56]);
      F.cube(g, [0.03, 0.05, 0.14], [2.15, 0.1, s * 0.6], 0xf2a23a, true);
      F.cube(g, [0.04, 0.26, 0.16], [-2.155, 0.33, s * 0.7], 0xb42322, true);
    }
    F.cube(g, [0.03, 0.09, 0.62], [2.15, 0.25, 0], 0x2c3237, true);
    for (const y of [0.23, 0.27])
      F.cube(g, [0.035, 0.012, 0.58], [2.155, y, 0], 0x7d868c);
    F.cube(g, [0.02, 0.1, 0.34], [2.225, -0.04, 0], 0x3f8a4f);
    F.cube(g, [0.02, 0.11, 0.34], [-2.16, 0.12, 0], 0x3f8a4f);
    F.rod(g, [1.0, 0.52, 0.72], [0.78, 1.32, 0.76], 0.008, dark);
    const wheel = new T.TorusGeometry(0.14, 0.018, 6, 18);
    wheel.rotateY(Math.PI / 2);
    wheel.rotateZ(-0.5);
    F.mesh(wheel, dark, g, [0.48, 0.8, 0.38]);
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
  if (!tico)
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
  const seat = {
      bus: [4.0, 0.95, 0.5, 1.4],
      kei: [0.55, 0.36, 0.38, 0.9],
      sedan: [-0.22, 0.3, 0.38, 1.25],
    }[type] || [-0.42, 0.66, 0.4, 0.85],
    driver = bujangModel(F, seat[3]);
  driver.position.set(seat[0], seat[1], seat[2]);
  g.add(driver);
  g.traverse((o) => {
    if (o.material === glass) o.castShadow = false;
  });
  g.userData.wheels = wheels;
  g.userData.driver = driver;
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
