import * as T from "three";
import { Factory, noiseTexture } from "./models.js";
import { RWY, DEG, rng } from "./runway-engine.js";
// World frame matches the engine: x along runway 14R, y up, z to the right of the centreline.
const V = new T.Vector3(), LOOK = new T.Vector3(), L = RWY.length, W = RWY.width;
const lerp = (a, b, k) => a + (b - a) * k;

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A slab whose root and tip chords are given (x leading/trailing), spanning z. */
function wingGeometry({ rootLE, rootTE, tipLE, tipTE, span, thick = 0.35, tipThick = 0.12, dihedral = 0, side = 1 }) {
  const g = new T.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const tip = p.getZ(i) + 0.5, lead = p.getX(i) + 0.5, up = p.getY(i);
    const x = lerp(lerp(rootTE, rootLE, lead), lerp(tipTE, tipLE, lead), tip),
      z = tip * span * side,
      y = up * lerp(thick, tipThick, tip) + tip * span * Math.tan(dihedral * DEG);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
const finGeometry = () => {
  const s = new T.Shape();
  s.moveTo(-12.6, 0);
  s.lineTo(-19.4, 0);
  s.lineTo(-21.6, 6.6);
  s.lineTo(-19.6, 6.6);
  s.closePath();
  const g = new T.ExtrudeGeometry(s, { depth: 0.36, bevelEnabled: false });
  g.translate(0, 0, -0.18);
  return g;
};

/** Twin-engine single-aisle jet in a fictional SSUN AIR livery. Origin at the main wheels, nose +x. */
export function airlinerModel(F) {
  const plane = new T.Group(), body = new T.Group();
  plane.add(body);
  const white = F.mat(0xf6f7f4, 0.45, 0.1), grey = F.mat(0xb9bfc2, 0.5, 0.35), dark = F.mat(0x22282d, 0.4, 0.2),
    green = F.mat(0x2f6b52, 0.5, 0.05), yellow = F.mat(0xf6d24a, 0.5, 0.05), glass = F.mat(0x18232c, 0.15, 0.6);
  const cy = 4;
  const fus = F.mesh(new T.CylinderGeometry(2, 2, 24, 28), white, body, [0, cy, 0]);
  fus.rotation.z = Math.PI / 2;
  const nose = F.mesh(new T.SphereGeometry(2, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), white, body, [12, cy, 0]);
  nose.rotation.z = -Math.PI / 2;
  nose.scale.set(1, 2.2, 1);
  // tail cone sweeps upward so the aircraft can rotate before the tail meets the runway
  const cone = new T.CylinderGeometry(0.42, 2, 9.5, 28, 6);
  const cp = cone.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const k = (cp.getY(i) + 4.75) / 9.5;
    cp.setX(i, cp.getX(i) + k * k * 1.9); // local +x becomes world up after the turn below
  }
  cone.computeVertexNormals();
  cone.rotateZ(Math.PI / 2);
  F.mesh(cone, white, body, [-16.75, cy, 0]);
  // cockpit glazing
  for (const s of [-1, 1])
    for (const [z, w] of [[0.45, 0.8], [1.25, 0.65]]) {
      const pane = F.cube(body, [0.9, 0.5, w], [14.25 - z * 0.35, cy + 1.15, s * z], glass);
      pane.rotation.z = -0.55;
      pane.rotation.x = s * 0.35 * z;
    }
  // cabin windows, doors and cheatline
  const windows = [];
  for (let x = -10.5; x < 10.6; x += 0.95) if (Math.abs(x - 7.6) > 0.8) for (const s of [-1, 1]) windows.push({ p: [x, cy + 0.55, s * 1.93], s: [0.32, 0.42, 0.08] });
  F.batch(body, windows, glass);
  for (const s of [-1, 1]) {
    F.cube(body, [33, 0.32, 0.06], [-1.5, cy - 0.45, s * 1.96], green);
    F.cube(body, [30, 0.12, 0.06], [-1.5, cy - 0.78, s * 1.86], yellow);
    for (const x of [10.4, -11]) F.cube(body, [0.9, 1.75, 0.05], [x, cy + 0.15, s * 1.985], F.mat(0xdfe2e1, 0.5, 0.1));
  }
  const title = canvasTexture(1024, 128, (c, w, h) => {
    c.fillStyle = "#2f6b52";
    c.font = "900 92px 'Space Grotesk', 'Arial Black', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("SSUN AIR", w / 2 - 70, h / 2 + 4);
    c.fillStyle = "#e8b828";
    c.font = "800 58px sans-serif";
    c.fillText("쑨에어", w / 2 + 330, h / 2 + 6);
  });
  const titleMat = new T.MeshStandardMaterial({ map: title, transparent: true, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const m = F.mesh(new T.PlaneGeometry(9.5, 1.2), titleMat, body, [1.5, cy + 1.25, s * 1.62]);
    m.rotation.x = s * -0.67;
    if (s < 0) m.rotation.y = Math.PI;
    m.castShadow = false;
  }
  // wings with sharklets, engines and pylons
  const wing = { rootLE: 2.4, rootTE: -5.2, tipLE: -5.6, tipTE: -7.3, span: 17, dihedral: 5 };
  for (const s of [-1, 1]) {
    F.mesh(wingGeometry({ ...wing, side: s }), white, body, [0, 2.75, 0]);
    const tipY = 2.75 + 17 * Math.tan(5 * DEG);
    const winglet = F.mesh(wingGeometry({ rootLE: -5.5, rootTE: -7.3, tipLE: -7.1, tipTE: -7.9, span: 2.2, thick: 0.14, tipThick: 0.08, side: 1 }), green, body, [0, tipY, s * 17]);
    winglet.rotation.x = -Math.PI / 2 + s * 0.25;
    F.mesh(wingGeometry({ rootLE: -13, rootTE: -16.6, tipLE: -17.4, tipTE: -18.8, span: 6.2, thick: 0.22, tipThick: 0.1, dihedral: 6, side: s }), white, body, [0, cy + 0.6, 0]);
    // flap track fairings
    for (const z of [3.6, 8.4, 12]) F.cube(body, [2.4, 0.4, 0.3], [lerp(-5.2, -7.3, z / 17) - 0.6, 2.55 + z * 0.087, s * z], grey, true);
    const eng = new T.Group();
    eng.position.set(0.9, 1.75, s * 5.7);
    body.add(eng);
    const nac = F.mesh(new T.CylinderGeometry(0.88, 1.05, 4.4, 24, 1, true), white, eng);
    nac.rotation.z = Math.PI / 2;
    const lip = F.mesh(new T.TorusGeometry(1.0, 0.1, 8, 24), grey, eng, [2.2, 0, 0]);
    lip.rotation.y = Math.PI / 2;
    const fan = F.mesh(new T.CircleGeometry(0.97, 24), dark, eng, [1.9, 0, 0]);
    fan.rotation.y = Math.PI / 2;
    const spinner = F.mesh(new T.ConeGeometry(0.3, 0.6, 14), F.mat(0x9fa6aa, 0.3, 0.7), eng, [2.1, 0, 0]);
    spinner.rotation.z = -Math.PI / 2;
    const ex = F.mesh(new T.ConeGeometry(0.62, 1.4, 16), grey, eng, [-2.7, 0, 0]);
    ex.rotation.z = Math.PI / 2;
    F.cube(eng, [3.2, 0.9, 0.3], [-0.6, 0.95, 0], white);
    const band = F.mesh(new T.CylinderGeometry(1.07, 1.07, 0.5, 24, 1, true), green, eng, [0.6, 0, 0]);
    band.rotation.z = Math.PI / 2;
  }
  F.cube(body, [7, 0.9, 3.6], [-1.6, 2.15, 0], F.mat(0xe7e9e7, 0.5, 0.1), true); // wing-body fairing
  // vertical fin with the sun-and-S tail logo
  const fin = F.mesh(finGeometry(), green, body, [0, cy + 1.6, 0]);
  fin.castShadow = true;
  const logo = canvasTexture(256, 256, (c, w) => {
    c.fillStyle = "#f6d24a";
    c.beginPath();
    c.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2f6b52";
    c.font = "900 150px 'Space Grotesk', 'Arial Black', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("S", w / 2, w / 2 + 10);
  });
  const logoMat = new T.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const m = F.mesh(new T.PlaneGeometry(2.9, 2.9), logoMat, body, [-18.6, cy + 4.6, s * 0.2]);
    if (s < 0) m.rotation.y = Math.PI;
    m.castShadow = false;
  }
  // landing gear (retractable)
  const gear = new T.Group();
  body.add(gear);
  const tyre = new T.CylinderGeometry(0.58, 0.58, 0.42, 18);
  tyre.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    F.rod(gear, [0, 0.6, s * 3.8], [0.1, 2.6, s * 3.6], 0.17, grey);
    for (const o of [-0.28, 0.28]) F.mesh(tyre, dark, gear, [0, 0.58, s * 3.8 + o]);
  }
  const noseTyre = new T.CylinderGeometry(0.4, 0.4, 0.28, 16);
  noseTyre.rotateX(Math.PI / 2);
  F.rod(gear, [11, 0.42, 0], [11.1, 2.4, 0], 0.13, grey);
  for (const o of [-0.2, 0.2]) F.mesh(noseTyre, dark, gear, [11, 0.4, o]);
  // navigation lights
  const lamp = (color, pos) => {
    const m = new T.MeshBasicMaterial({ color });
    return F.mesh(new T.SphereGeometry(0.22, 8, 6), m, body, pos);
  };
  const tip = 2.75 + 17 * Math.tan(5 * DEG);
  lamp(0xff3030, [-6.0, tip, -17.1]);
  lamp(0x30ff70, [-6.0, tip, 17.1]);
  const strobe = lamp(0xffffff, [-21.2, cy + 0.6, 0]);
  const beacon = lamp(0xff2020, [-2, cy + 2.05, 0]);
  const landing = [lamp(0xfff6d8, [1.6, 2.6, 2.4]), lamp(0xfff6d8, [1.6, 2.6, -2.4])];
  plane.userData = { body, gear, strobe, beacon, landing };
  plane.rotation.order = "YZX";
  return plane;
}

const lightPoints = (positions, color, size = 4) => {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  return new T.Points(geo, new T.PointsMaterial({ color, size, sizeAttenuation: false, depthWrite: false, transparent: true }));
};

export class RunwayView {
  constructor(canvas, game, { preview = false } = {}) {
    this.canvas = canvas;
    this.game = game;
    this.preview = preview;
    this.F = new Factory();
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(50, 1, 1.5, 30000);
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.dead = false;
    this.clock = 0;
    this.shake = 0;
    this.smoke = [];
    this.lights();
    this.airport();
    this.plane = airlinerModel(this.F);
    this.scene.add(this.plane);
    this.particles();
    this.resize();
    this.cameraReady = false;
    this.render(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.dataset.renderer = "WebGL 3D";
  }
  lights() {
    const sky = 0x9cc3e4;
    this.scene.background = new T.Color(sky);
    this.scene.fog = new T.Fog(0xc4d8e6, 2500, 16000);
    this.hemi = new T.HemisphereLight(0xe2efff, 0x7c8a5a, 2.0);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
  }
  airport() {
    const F = this.F, root = new T.Group(), rand = rng(1404);
    this.scene.add(root);
    this.root = root;
    const grass = noiseTexture(["#7d9a52", "#89a65b", "#71904a", "#94ad62"], 128, 14);
    grass.repeat.set(900, 900);
    const ground = F.mesh(new T.PlaneGeometry(40000, 40000), new T.MeshStandardMaterial({ color: 0xc4cfa0, map: grass, roughness: 1 }), root, [L / 2, -0.6, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const flat = (w, d, x, z, mat, y = 0.03) => {
      const m = F.mesh(new T.PlaneGeometry(w, d), mat, root, [x, y, z]);
      m.rotation.x = -Math.PI / 2;
      m.castShadow = false;
      return m;
    };
    const asphaltTex = noiseTexture(["#55595c", "#5e6265", "#4c5053", "#666a6d"], 128, 22);
    asphaltTex.repeat.set(L / 40, 2);
    const asphalt = new T.MeshStandardMaterial({ color: 0xd8dcdd, map: asphaltTex, roughness: 0.92 });
    const concrete = new T.MeshStandardMaterial({ color: 0xa9adab, map: asphaltTex, roughness: 0.95 });
    flat(L + 240, W + 18, L / 2, 0, concrete, 0.02); // shoulders and blast pads
    flat(L, W, L / 2, 0, asphalt, 0.04);
    // ICAO-style markings, mirrored for both ends
    const white = [], yellow = [], y = 0.07;
    const mark = (list, x0, x1, z, w) => list.push({ p: [(x0 + x1) / 2, y, z], s: [Math.abs(x1 - x0), 0.02, w] });
    const end = (f) => {
      // f maps a distance from this threshold to world x
      for (let i = 0; i < 8; i++) for (const s of [-1, 1]) mark(white, f(6), f(36), s * (1.8 + i * 3.6), 1.8);
      for (const s of [-1, 1]) mark(white, f(RWY.aim), f(RWY.aim + 50), s * 13, 9);
      for (const [d, n] of [[150, 3], [300, 3], [600, 2], [750, 2], [900, 1], [1050, 1]])
        for (let i = 0; i < n; i++) for (const s of [-1, 1]) mark(white, f(d), f(d + 22.5), s * (9 + i * 3.3), 1.8);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) mark(yellow, f(-8 - i * 18), f(-18 - i * 18), s * 7, 3);
    };
    end((d) => d);
    end((d) => L - d);
    for (let x = 100; x < L - 130; x += 50) mark(white, x, x + 30, 0, 0.9);
    for (const s of [-1, 1]) mark(white, 0, L, s * (W / 2 - 0.6), 0.9);
    const paint = new T.MeshStandardMaterial({ color: 0xf2f2ec, roughness: 0.7 });
    const paintY = new T.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.7 });
    for (const [list, m] of [[white, paint], [yellow, paintY]]) this.F.batch(root, list, m).castShadow = false;
    // runway designations: read from the approach, number above the L/R letter
    const designation = (text, letter) =>
      canvasTexture(256, 512, (c, w, h) => {
        c.fillStyle = "#f2f2ec";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "700 230px 'Arial Narrow', 'Roboto Condensed', sans-serif";
        c.save();
        c.scale(0.62, 1);
        c.fillText(text, w / 2 / 0.62, h * 0.27);
        c.fillText(letter, w / 2 / 0.62, h * 0.74);
        c.restore();
      });
    for (const [text, letter, x, turn] of [["14", "R", 75, -1], ["32", "L", L - 75, 1]]) {
      const g = new T.PlaneGeometry(13, 26);
      g.rotateX(-Math.PI / 2);
      g.rotateY((turn * Math.PI) / 2);
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: designation(text, letter), transparent: true, roughness: 0.7, depthWrite: false }));
      m.position.set(x, 0.08, 0);
      m.receiveShadow = true;
      root.add(m);
    }
    // parallel taxiway, connectors, apron
    const twyZ = -185, taxi = new T.MeshStandardMaterial({ color: 0xc6cacb, map: asphaltTex, roughness: 0.95 });
    flat(L + 200, 26, L / 2, twyZ, taxi, 0.025);
    const twyLine = [], blue = [];
    for (let x = -80; x < L + 100; x += 4) twyLine.push({ p: [x, 0.06, twyZ], s: [2.6, 0.02, 0.4] });
    for (const cx of [60, 700, 1350, 2000, 2600, L - 60]) {
      flat(25, Math.abs(twyZ) - W / 2, cx, (twyZ - W / 2) / 2, taxi, 0.022);
      for (let z = -W / 2 - 4; z > twyZ; z -= 5) twyLine.push({ p: [cx, 0.06, z], s: [0.4, 0.02, 2.8] });
      // holding point bars
      for (const o of [-1.2, 1.2, -3, 3]) twyLine.push({ p: [cx + (o > 0 ? 1 : -1) * 0, 0.065, -W / 2 - 75 + o], s: [24, 0.02, 0.35] });
    }
    for (let x = -80; x < L + 100; x += 60) blue.push(x, 1, twyZ - 14, x, 1, twyZ + 14);
    F.batch(root, twyLine, paintY).castShadow = false;
    flat(1800, 230, 1500, -330, concrete, 0.02);
    // terminal, tower, hangars
    const term = new T.Group();
    term.position.set(1500, 0, -470);
    root.add(term);
    F.cube(term, [980, 18, 34], [0, 9, 0], F.mat(0xe6e3dc, 0.6));
    F.cube(term, [990, 1.6, 40], [0, 18.6, 0], F.mat(0x9ea6ab, 0.4, 0.3));
    const glassMat = F.mat(0x5b7a90, 0.12, 0.6);
    F.cube(term, [960, 9, 0.6], [0, 9, 17.2], glassMat);
    for (let i = -6; i <= 6; i++) {
      F.cube(term, [4, 4, 34], [i * 72, 6, 35], F.mat(0xd6d6d0, 0.5, 0.2));
      F.cube(term, [6, 7, 6], [i * 72, 3.5, 54], F.mat(0xc9ccc9, 0.5, 0.2));
    }
    const sign = canvasTexture(1024, 128, (c, w, h) => {
      c.fillStyle = "#24435a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff";
      c.font = "700 70px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("김포 · GIMPO  SSUN TERMINAL", w / 2, h / 2 + 4);
    });
    F.mesh(new T.PlaneGeometry(120, 15), new T.MeshBasicMaterial({ map: sign }), term, [0, 23, 17.4]);
    F.cube(term, [122, 17, 1], [0, 23, 16.8], F.mat(0x24435a));
    const tower = new T.Group();
    tower.position.set(2350, 0, -300);
    root.add(tower);
    F.mesh(new T.CylinderGeometry(3.2, 4.4, 52, 18), F.mat(0xe9e7e0, 0.6), tower, [0, 26, 0]);
    F.mesh(new T.CylinderGeometry(8.6, 6.4, 4, 12), F.mat(0xd6d4cf, 0.5), tower, [0, 53, 0]);
    F.mesh(new T.CylinderGeometry(8.2, 8.6, 5.5, 12), F.mat(0x3c5b70, 0.1, 0.6), tower, [0, 57.7, 0]);
    F.mesh(new T.CylinderGeometry(9.2, 8.4, 1.4, 12), F.mat(0xcfd2d2, 0.4, 0.3), tower, [0, 61.1, 0]);
    F.rod(tower, [0, 61.6, 0], [0, 70, 0], 0.25, 0xd23c2a);
    for (let i = 0; i < 3; i++) {
      const hx = 2700 + i * 115, hz = -330;
      F.cube(root, [100, 22, 70], [hx, 11, hz], F.mat(0xdedfd9, 0.6, 0.15));
      const roof = F.mesh(new T.CylinderGeometry(35, 35, 100, 20, 1, false, 0, Math.PI), F.mat(0xb7c0c4, 0.4, 0.4), root, [hx, 22, hz]);
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(0.35, 1, 1);
    }
    // parked airliners at the gates
    for (const [x, rot] of [[1180, 0], [1396, 0], [1756, 0]]) {
      const p = airlinerModel(F);
      p.userData.landing.forEach((m) => (m.visible = false));
      p.position.set(x, 0, -385);
      p.rotation.y = Math.PI / 2 + rot;
      root.add(p);
    }
    // apartment blocks and the hills beyond (northern Seoul feel)
    const blocks = [], blocks2 = [];
    for (let i = 0; i < 160; i++) {
      const side = i % 3 === 0 ? -1 : 1, x = -1500 + rand() * (L + 4000), z = side * (900 + rand() * 2600), h = 25 + rand() * 60;
      (i % 4 ? blocks : blocks2).push({ p: [x, h / 2, z], s: [55 + rand() * 30, h, 14], r: [0, (rand() - 0.5) * 0.4, 0] });
    }
    F.batch(root, blocks, F.mat(0xeeebe2, 0.8)).castShadow = false;
    F.batch(root, blocks2, F.mat(0xd9d2c4, 0.8)).castShadow = false;
    const hills = [];
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = 7000 + rand() * 7000, h = 300 + rand() * 650;
      hills.push({ p: [L / 2 + Math.cos(a) * r, h * 0.45, Math.sin(a) * r], s: [1200 + rand() * 1800, h, 1200 + rand() * 1600], r: [0, rand() * 3, 0] });
    }
    F.batch(root, hills, F.mat(0x6e8790, 0.95), new T.ConeGeometry(0.5, 1, 7)).castShadow = false;
    const river = flat(30000, 900, L / 2, 3400, new T.MeshStandardMaterial({ color: 0x7ea9c4, roughness: 0.3, metalness: 0.1 }), 0.5);
    river.receiveShadow = false;
    // lights: edges, threshold/end bars, approach lights and the PAPI
    const edge = [], green = [], red = [], approach = [];
    for (let x = 0; x <= L; x += 60) for (const s of [-1, 1]) edge.push(x, 0.5, s * (W / 2 + 1.5));
    for (let z = -W / 2; z <= W / 2; z += 3) { green.push(-1, 0.4, z); red.push(L + 1, 0.4, z); }
    for (let x = -900; x < -20; x += 30) for (let k = -2; k <= 2; k++) approach.push(x, 0.8, k * 1.1);
    for (let k = -14; k <= 14; k++) if (Math.abs(k) > 2) approach.push(-300, 0.8, k * 1.5);
    root.add(lightPoints(edge, 0xfff3cf, 3), lightPoints(green, 0x46ff7a, 4), lightPoints(red, 0xff3b30, 4), lightPoints(approach, 0xffffff, 3), lightPoints(blue, 0x3f6dff, 3));
    const papiPos = [];
    for (let i = 0; i < 4; i++) {
      const z = -(W / 2 + 15 + (3 - i) * 9);
      F.cube(root, [1.2, 1, 2.2], [RWY.papiX, 0.6, z], F.mat(0x30363a));
      papiPos.push(RWY.papiX + 0.7, 1, z);
    }
    this.papi = lightPoints(papiPos, 0xffffff, 7);
    this.papi.geometry.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
    this.papi.material.vertexColors = true;
    root.add(this.papi);
    // windsock beside the touchdown zone
    const sock = new T.Group();
    sock.position.set(320, 0, 75);
    root.add(sock);
    F.rod(sock, [0, 0, 0], [0, 7, 0], 0.12, 0xdadada);
    this.sock = F.mesh(new T.ConeGeometry(0.7, 4.5, 10, 1, true), F.mat(0xf06a2b, 0.7), sock, [2.2, 7, 0]);
    this.sock.rotation.z = -Math.PI / 2;
    this.sockRoot = sock;
  }
  particles() {
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(new Float32Array(300 * 3), 3));
    this.smokePoints = new T.Points(geo, new T.PointsMaterial({ color: 0xe4e4e0, size: 2.6, transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(this.smokePoints);
  }
  puff(n, spread = 1, life = 1.6) {
    const p = this.plane.position;
    for (let i = 0; i < n; i++)
      this.smoke.push({ x: p.x + (Math.random() - 0.5) * 2, y: 0.6 + Math.random(), z: p.z + (Math.random() < 0.5 ? -3.8 : 3.8) * (spread > 2 ? Math.random() : 1), vx: -4 + Math.random() * 6, vy: 0.6 + Math.random() * spread, vz: (Math.random() - 0.5) * 3 * spread, life });
  }
  handle(e) {
    if (e.type === "touchdown") {
      this.shake = Math.min(1.2, e.fpm / 500);
      this.puff(60);
    }
    if (e.type === "fail" || (e.type === "stage" && e.stage === "landing" && !e.ok && this.game.landing?.reason !== "goaround")) {
      this.shake = 1.5;
      this.puff(160, 6, 3.5);
    }
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    const g = this.game, a = g.ac, p = this.plane, u = p.userData;
    p.position.set(a.x, Math.max(0, a.h), a.z);
    p.rotation.set(a.bank * DEG, -a.psi, a.pitch * DEG);
    u.gear.visible = a.gear;
    u.strobe.visible = Math.sin(this.clock * 7) > 0.85;
    u.beacon.visible = Math.sin(this.clock * 4.2 + 1) > 0.4;
    // PAPI shows what the pilot's eye sees
    const col = this.papi.geometry.attributes.color, lights = g.papi;
    lights.forEach((white, i) => col.setXYZ(i, 1, white ? 1 : 0.13, white ? 1 : 0.1));
    col.needsUpdate = true;
    const wdir = (g.wind.dir - RWY.heading) * DEG;
    this.sockRoot.rotation.y = Math.PI - wdir;
    this.sock.rotation.x = Math.sin(this.clock * 3) * 0.08;
    // camera: chase behind along the runway so the crab angle and the runway are both visible
    const portrait = this.camera.aspect < 0.8, back = portrait ? 78 : 58, up = portrait ? 15 : 12;
    if (this.preview) {
      V.set(a.x + 34, 9, a.z + 46);
      LOOK.set(a.x - 2, 4, a.z);
    } else if (g.phase === "result" || g.phase === "clear") {
      const k = this.clock * 0.12;
      V.set(a.x + Math.cos(k) * 70 - 20, Math.max(6, a.h + 14), a.z + Math.sin(k) * 70 + 30);
      LOOK.set(a.x, Math.max(2, a.h + 3), a.z);
    } else if (g.stage === "takeoff") {
      V.set(a.x - back, Math.max(a.h, 0) + up - 2, a.z + (portrait ? 0 : 6));
      LOOK.set(a.x + 60, Math.max(a.h, 0) + 2, a.z);
    } else {
      const ahead = 320;
      V.set(a.x - back, a.h + up, a.z * 0.85);
      LOOK.set(a.x + ahead, Math.max(0, a.h - ahead * Math.tan(3.2 * DEG)) + 2, a.z * 0.6);
    }
    if (!this.cameraReady) {
      this.camera.position.copy(V);
      this.look = LOOK.clone();
      this.cameraReady = true;
    } else {
      const k = 1 - Math.exp(-dt * (g.phase === "fly" ? 6 : 2));
      this.camera.position.lerp(V, k);
      this.look.lerp(LOOK, k);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.look);
    this.sun.position.set(a.x - 120, Math.max(0, a.h) + 220, a.z + 160);
    this.sun.target.position.set(a.x, Math.max(0, a.h), a.z);
    // tyre smoke and debris
    const arr = this.smokePoints.geometry.attributes.position.array;
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.life <= 0) this.smoke.splice(i, 1);
    }
    this.smoke = this.smoke.slice(-300);
    for (let i = 0; i < 300; i++) {
      const s = this.smoke[i];
      arr[i * 3] = s?.x ?? 0;
      arr[i * 3 + 1] = s?.y ?? -999;
      arr[i * 3 + 2] = s?.z ?? 0;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;
  }
  render(dt) {
    if (this.dead) return;
    this.clock += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.phase = this.game.phase;
    this.canvas.dataset.stage = this.game.stage;
  }
  destroy() {
    this.dead = true;
    this.observer?.disconnect();
    const geos = new Set(), mats = new Set(), textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          mats.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        }
    });
    for (const v of geos) v.dispose();
    for (const v of mats) v.dispose();
    for (const v of textures) v.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
