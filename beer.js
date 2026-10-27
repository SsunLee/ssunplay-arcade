import * as T from "three";
import { Factory, noiseTexture } from "./models.js";
import { clamp, lerp } from "./engine.js";
import { BeerOverflow } from "./beer-overflow.js";
const up = new T.Vector3(0, 1, 0),
  dir = new T.Vector3();
function vesselGeometry() {
  const n = 48,
    positions = new Float32Array((2 * n + 2) * 3),
    indices = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(
      i,
      n + i,
      j,
      j,
      n + i,
      n + j,
      2 * n,
      i,
      j,
      2 * n + 1,
      n + j,
      n + i,
    );
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}
function fillGeometry(geo, lo, hi, angle, time, foam = false) {
  const a = geo.attributes.position.array,
    n = 48,
    tan = Math.tan(angle);
  for (let row = 0; row < 2; row++) {
    const level = row ? hi : lo;
    for (let i = 0; i < n; i++) {
      const phase = (i / n) * Math.PI * 2,
        r = 0.371 + 0.16 * clamp(level / 1.72, 0, 1),
        x = Math.cos(phase) * r,
        z = Math.sin(phase) * r,
        y = clamp(
          level -
            tan * x +
            (foam && row ? Math.sin(phase * 7 + time * 1.3) * 0.009 : 0),
          0.083,
          1.79,
        );
      const k = (row * n + i) * 3;
      a[k] = x;
      a[k + 1] = y;
      a[k + 2] = z;
    }
  }
  a.set([0, clamp(lo, 0.083, 1.79), 0], 2 * n * 3);
  a.set([0, clamp(hi, 0.083, 1.79), 0], (2 * n + 1) * 3);
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}
export class BeerView {
  constructor(canvas, game, { preview = false } = {}) {
    this.canvas = canvas;
    this.game = game;
    this.preview = preview;
    this.dead = false;
    this.F = new Factory();
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x203634);
    this.scene.fog = new T.Fog(0x203634, 9, 19);
    this.camera = new T.PerspectiveCamera(42, 1, 0.06, 40);
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.add(new T.HemisphereLight(0xe7f1e5, 0x5c3923, 2.2));
    const key = new T.DirectionalLight(0xffe1a8, 3.1);
    key.position.set(-3, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, {
      left: -4,
      right: 4,
      top: 5,
      bottom: -3,
      near: 0.5,
      far: 18,
    });
    key.shadow.bias = -0.0003;
    this.scene.add(key);
    const rim = new T.PointLight(0xa9ead1, 36, 12);
    rim.position.set(0, 3, -2);
    this.scene.add(rim);
    this.build();
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.render(0);
    canvas.dataset.renderer = "WebGL 3D";
  }
  build() {
    const F = this.F,
      root = this.scene;
    const wood = F.mat(0x9a6040, 0.36);
    wood.map = noiseTexture(
      ["#925a36", "#af7850", "#75462c", "#bc875a"],
      128,
      17,
    );
    wood.map.repeat.set(2, 6);
    F.cube(root, [9, 0.3, 5], [0, -0.16, 0], wood);
    F.cube(root, [9, 5, 0.2], [0, 2.1, -2.6], 0x24443c);
    for (let x = -4.3; x < 4.4; x += 0.42)
      F.cube(root, [0.035, 4, 0.045], [x, 2.2, -2.46], 0x37584c);
    for (const y of [0.75, 2.1])
      F.cube(root, [8, 0.1, 0.65], [0, y, -2.1], 0x815238);
    for (let i = 0; i < 10; i++) {
      const bottle = new T.Group(),
        x = -3.5 + i * 0.77;
      F.mesh(
        new T.CylinderGeometry(0.15, 0.18, 0.7, 16),
        i % 3 === 0 ? 0x693d22 : 0x294e32,
        bottle,
        [0, 0.4, 0],
      );
      F.mesh(
        new T.CylinderGeometry(0.067, 0.067, 0.32, 12),
        0x35513a,
        bottle,
        [0, 0.91, 0],
      );
      F.mesh(
        new T.CylinderGeometry(0.08, 0.08, 0.05, 12),
        0xc4ad76,
        bottle,
        [0, 1.08, 0],
      );
      F.cube(
        bottle,
        [0.23, 0.26, 0.015],
        [0, 0.45, 0.16],
        i % 2 ? 0xe4d9b2 : 0x9cba9d,
        true,
      );
      bottle.position.set(x, i % 2 ? 0.81 : 2.16, -2.1);
      root.add(bottle);
    }
    const sign = document.createElement("canvas");
    sign.width = 512;
    sign.height = 256;
    const ctx = sign.getContext("2d");
    ctx.fillStyle = "#213d34";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "#bca777";
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, 488, 232);
    ctx.textAlign = "center";
    ctx.fillStyle = "#dfc995";
    ctx.font = "bold 62px Georgia";
    ctx.fillText("SSUN", 256, 109);
    ctx.font = "21px sans-serif";
    ctx.letterSpacing = "7px";
    ctx.fillText("T A P R O O M", 256, 163);
    ctx.font = "15px sans-serif";
    ctx.fillText("A LITTLE SKILL. A PERFECT POUR.", 256, 205);
    const tex = new T.CanvasTexture(sign);
    tex.colorSpace = T.SRGBColorSpace;
    F.mesh(
      new T.PlaneGeometry(2.3, 1.15),
      new T.MeshBasicMaterial({ map: tex }),
      root,
      [-0.5, 3.25, -2.36],
    );
    F.mesh(
      new T.CylinderGeometry(1.17, 1.17, 0.055, 64),
      0x1d302d,
      root,
      [0.1, 0.04, 0.15],
    );
    F.mesh(
      new T.TorusGeometry(1.11, 0.015, 8, 64),
      0x928064,
      root,
      [0.1, 0.07, 0.15],
    ).rotation.x = Math.PI / 2;
    const brass = new T.MeshStandardMaterial({
      color: 0xc6a65e,
      metalness: 0.78,
      roughness: 0.23,
    });
    F.mesh(
      new T.CylinderGeometry(0.27, 0.32, 0.13, 24),
      brass,
      root,
      [1.1, 0.1, -0.35],
    );
    F.rod(root, [1.1, 0.1, -0.35], [1.1, 2.85, -0.35], 0.12, brass);
    F.sphere(root, [0.16, 0.16, 0.16], [1.1, 2.85, -0.35], brass);
    F.rod(root, [1.1, 2.85, -0.35], [-0.55, 2.85, -0.35], 0.1, brass);
    F.rod(root, [-0.55, 2.85, -0.35], [-0.55, 2.6, 0.15], 0.085, brass);
    F.mesh(
      new T.CylinderGeometry(0.105, 0.08, 0.12, 20),
      brass,
      root,
      [-0.55, 2.59, 0.15],
    );
    this.lever = new T.Group();
    this.lever.position.set(1.1, 2.8, -0.35);
    F.rod(this.lever, [0, 0, 0], [0, 0.52, 0], 0.035, brass);
    F.cube(this.lever, [0.18, 0.49, 0.15], [0, 0.6, 0], 0x20362e, true);
    F.cube(this.lever, [0.11, 0.18, 0.015], [0, 0.63, 0.083], 0xd7c18c, true);
    root.add(this.lever);
    this.glass = new T.Group();
    this.glass.position.z = 0.15;
    root.add(this.glass);
    const glassMat = new T.MeshPhysicalMaterial({
      color: 0xe6f4f2,
      metalness: 0,
      roughness: 0.06,
      transparent: true,
      opacity: 0.21,
      side: T.DoubleSide,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    });
    const profile = [
      [0.38, 0.04],
      [0.405, 0.09],
      [0.418, 0.24],
      [0.45, 0.72],
      [0.5, 1.3],
      [0.55, 1.77],
      [0.532, 1.79],
      [0.515, 1.32],
      [0.431, 0.72],
      [0.395, 0.22],
      [0.37, 0.1],
    ];
    F.mesh(
      new T.LatheGeometry(
        profile.map(([x, y]) => new T.Vector2(x, y)),
        64,
      ),
      glassMat,
      this.glass,
    );
    const rimMaterial = new T.MeshStandardMaterial({
      color: 0xe1ece3,
      transparent: true,
      opacity: 0.65,
      roughness: 0.08,
      metalness: 0.12,
    });
    for (const [y, r] of [
      [1.78, 0.54],
      [0.055, 0.395],
    ]) {
      const m = F.mesh(
        new T.TorusGeometry(r, 0.018, 10, 64),
        rimMaterial,
        this.glass,
        [0, y, 0],
      );
      m.rotation.x = Math.PI / 2;
    }
    F.mesh(
      new T.CylinderGeometry(0.39, 0.39, 0.06, 48),
      glassMat,
      this.glass,
      [0, 0.065, 0],
    );
    this.beerGeo = vesselGeometry();
    this.foamGeo = vesselGeometry();
    this.beer = F.mesh(
      this.beerGeo,
      new T.MeshStandardMaterial({
        color: 0xe9a313,
        roughness: 0.21,
        metalness: 0.02,
        transparent: true,
        opacity: 0.92,
        side: T.DoubleSide,
      }),
      this.glass,
    );
    this.foam = F.mesh(
      this.foamGeo,
      new T.MeshStandardMaterial({
        color: 0xfff3d5,
        roughness: 0.83,
        side: T.DoubleSide,
      }),
      this.glass,
    );
    this.beer.renderOrder = 1;
    this.foam.renderOrder = 2;
    this.bubbles = new T.InstancedMesh(
      new T.SphereGeometry(1, 8, 6),
      new T.MeshBasicMaterial({
        color: 0xffe9a2,
        transparent: true,
        opacity: 0.72,
      }),
      64,
    );
    this.glass.add(this.bubbles);
    this.bubbles.renderOrder = 3;
    this.stream = F.mesh(
      new T.CylinderGeometry(0.036, 0.025, 1, 12, 24),
      new T.MeshPhysicalMaterial({
        color: 0xfbb52e,
        transparent: true,
        opacity: 0.76,
        roughness: 0.07,
        clearcoat: 1,
      }),
      root,
    );
    this.stream.castShadow = false;
    this.streamBase = this.stream.geometry.attributes.position.array.slice();
    const napkin = F.cube(
      root,
      [0.62, 0.022, 0.7],
      [-1.75, 0.045, 0.45],
      0xe7dfc7,
    );
    napkin.rotation.y = 0.12;
    F.mesh(
      new T.CylinderGeometry(0.12, 0.12, 0.04, 24),
      0xd7b577,
      root,
      [-1.7, 0.08, 0.45],
    );
    this.overflow = new BeerOverflow(root, this.glass);
    this.dummy = new T.Object3D();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    const portrait = this.camera.aspect < 0.8;
    this.camera.position.set(
      portrait ? 2.4 : 3.3,
      portrait ? 2.7 : 3.0,
      portrait ? 6.8 : 5.3,
    );
    this.camera.lookAt(-0.05, portrait ? 1.35 : 1.05, 0);
    this.camera.updateProjectionMatrix();
  }
  render(dt) {
    if (this.dead) return;
    const g = this.game,
      angle = (g.angle * Math.PI) / 180,
      t = g.clock;
    this.glass.rotation.z = angle;
    this.glass.position.set(-0.55 + Math.sin(angle) * 1.77, 0.12, 0.15);
    const lo = 0.085,
      hi = 0.085 + g.liquid * 1.695,
      top = 0.085 + g.total * 1.695;
    this.beer.visible = g.liquid > 0.001;
    this.foam.visible = g.foam > 0.002;
    fillGeometry(this.beerGeo, lo, hi, angle, t);
    fillGeometry(this.foamGeo, hi, top, angle, t, true);
    for (let i = 0; i < 64; i++) {
      const y =
          0.12 +
          ((i * 0.237 + t * (0.11 + (i % 5) * 0.013)) %
            Math.max(0.01, hi - 0.16)),
        r = 0.25 * Math.sqrt(((i * 13) % 61) / 61),
        p = i * 2.399,
        x = Math.cos(p) * r,
        z = Math.sin(p) * r,
        visible = g.liquid > 0.08 && y < hi - Math.tan(angle) * x - 0.03;
      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(visible ? 0.007 + (i % 4) * 0.002 : 0);
      this.dummy.updateMatrix();
      this.bubbles.setMatrixAt(i, this.dummy.matrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    const end = 0.12 + Math.cos(angle) * Math.min(1.77, Math.max(0.1, top)),
      start = new T.Vector3(-0.55, 2.54, 0.15),
      finish = new T.Vector3(-0.55, end, 0.15);
    dir.copy(start).sub(finish);
    this.stream.visible = g.flow > 0.002;
    this.stream.position.copy(start).add(finish).multiplyScalar(0.5);
    this.stream.scale.set(
      0.72 + g.flow * 2.5,
      dir.length(),
      0.72 + g.flow * 2.5,
    );
    this.stream.quaternion.setFromUnitVectors(up, dir.normalize());
    const flowPositions = this.stream.geometry.attributes.position;
    for (let i = 0; i < flowPositions.count; i++) {
      const x=this.streamBase[i*3], y=this.streamBase[i*3+1], z=this.streamBase[i*3+2];
      const pulse=1+.13*Math.sin(y*26-t*19)+.05*Math.sin(y*47-t*27);
      flowPositions.setXYZ(i,x*pulse+Math.sin(y*17-t*12)*.002,y,z*pulse);
    }
    flowPositions.needsUpdate=true;
    this.lever.rotation.x = lerp(
      this.lever.rotation.x,
      g.pouring ? -0.6 : 0,
      1 - Math.exp(-dt * 12),
    );
    this.overflow.render(g, dt);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.phase = g.phase;
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    this.canvas.dataset.spilledMl = String(Math.round(g.spilled * 500));
    this.canvas.dataset.overflowVisible = String(this.overflow.activity > 0.025);
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.observer.disconnect();
    const geometries = new Set(),
      materials = new Set(),
      textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of o.material
        ? Array.isArray(o.material)
          ? o.material
          : [o.material]
        : []) {
        materials.add(m);
        for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      }
    });
    geometries.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    textures.forEach((x) => x.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
