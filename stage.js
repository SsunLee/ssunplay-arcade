import * as T from "three";
import { Factory, carModel, noiseTexture } from "./models.js";
import { STAGES, lerp, clamp, rng } from "./engine.js";
const V = new T.Vector3(),
  LOOK = new T.Vector3();
export class GameView {
  constructor(kind, canvas, game, { preview = false } = {}) {
    this.kind = kind;
    this.canvas = canvas;
    this.game = game;
    this.preview = preview;
    this.F = new Factory();
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(55, 1, 0.06, 1200);
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.5),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.root = new T.Group();
    this.scene.add(this.root);
    this.dead = false;
    this.clock = 0;
    this.makeLights();
    this.road();
    this.resize();
    this.cameraReady = false;
    this.render(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.dataset.renderer = "WebGL 3D";
  }
  makeLights() {
    this.hemisphere = new T.HemisphereLight(0xddeaff, 0x838271, 2.2);
    this.scene.add(this.hemisphere);
    this.sun = new T.DirectionalLight(0xfff5de, 2.1);
    this.sun.position.set(8, 15, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
  }
  road() {
    const F = this.F,
      g = this.game,
      st = STAGES[g.stage],
      root = this.root,
      night = st.theme === "pier",
      snow = st.theme === "snow",
      canyon = st.theme === "canyon",
      roof = st.theme === "roof",
      random = rng(1909 + g.stage);
    const sky = night
      ? 0x17243d
      : snow
        ? 0xb1d4e8
        : canyon
          ? 0xa6cee7
          : 0x78a8d8;
    this.scene.background = new T.Color(sky);
    this.scene.fog = new T.Fog(sky, 120, 500);
    this.hemisphere.color.setHex(night ? 0x91a4d4 : 0xd7e7ff);
    this.hemisphere.groundColor.setHex(
      night ? 0x303044 : snow ? 0xb4ceda : 0x738b46,
    );
    this.hemisphere.intensity = night ? 1.25 : 2.25;
    this.sun.intensity = night ? 0.55 : 2.4;
    this.sun.color.setHex(canyon ? 0xffe2bd : 0xffffff);
    const groundTexture = noiseTexture(
      snow
        ? ["#f3f5f1", "#d9e4e9", "#eef4f7"]
        : canyon
          ? ["#b9804c", "#c99153", "#d5a268"]
          : roof || night
            ? ["#69737a", "#7d858b", "#5f6872"]
            : ["#9bc852", "#a4ce59", "#83b147"],
      128,
      32,
    );
    groundTexture.repeat.set(1.5, 1.5);
    const groundMat = F.mat(roof ? 0xcbd1d4 : 0xffffff);
    groundMat.map = groundTexture;
    const asphalt = noiseTexture(
      snow
        ? ["#c8e3e8", "#d9eef2", "#b7d2de"]
        : ["#6b7073", "#858a8d", "#555e64", "#7c8184"],
      128,
      18,
    );
    asphalt.repeat.set(1, 1);
    const roadMat = new T.MeshStandardMaterial({
      color: snow ? 0xe9f8ff : night ? 0x667687 : 0xe0e4e7,
      map: asphalt,
      roughness: night ? 0.22 : snow ? 0.2 : 0.91,
      metalness: night ? 0.15 : 0,
    });
    const strip = (z1, z2, material, offset = 0) => {
      const positions = [],
        uv = [],
        indices = [],
        start = -70,
        end = st.edge,
        n = Math.ceil(end - start);
      for (let i = 0; i <= n; i++) {
        const x = lerp(start, end, i / n),
          y = g.road.height(x) + offset;
        positions.push(x, y, z1, x, y, z2);
        uv.push(x / 4, z1 / 3, x / 4, z2 / 3);
        if (i < n) {
          const k = i * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = F.mesh(geo, material, root);
      mesh.castShadow = false;
      return mesh;
    };
    strip(-100, -2.7, groundMat);
    strip(2.7, 100, groundMat);
    strip(-2.7, 2.7, roadMat, 0.012);
    const cliffMat = F.mat(
      canyon ? 0x9f5d3b : roof || night ? 0x707b88 : snow ? 0xaccbd5 : 0xaaa18a,
    );
    cliffMat.map = noiseTexture(
      canyon
        ? ["#a56b44", "#b47b51", "#895537"]
        : ["#9e9a87", "#b0aa93", "#c0baa5"],
      128,
      51,
    );
    cliffMat.map.repeat.set(22, 8);
    F.cube(root, [2, 35, 200], [st.edge + 1, g.road.top - 17.5, 0], cliffMat);
    const waterMat = new T.MeshStandardMaterial({
      color: night ? 0x19364c : snow ? 0x8fbfd2 : 0x6fb9d7,
      roughness: 0.38,
      metalness: 0.14,
    });
    const water = F.mesh(new T.PlaneGeometry(2000, 2000), waterMat, root, [
      st.edge + 600,
      -34,
      0,
    ]);
    water.rotation.x = -Math.PI / 2;
    water.castShadow = false;
    this.water = water;
    const lane = [],
      edge = [],
      rail = [],
      posts = [];
    for (let x = -65; x < st.edge; x += 7) {
      lane.push({
        p: [Math.min(st.edge - 0.1, x + 1.4), g.road.height(x) + 0.026, 0],
        s: [Math.min(2.8, st.edge - x - 0.1), 0.018, 0.105],
      });
    }
    for (let x = -68; x < st.edge - 1; x += 5)
      for (const s of [-1, 1]) {
        const y = g.road.height(x);
        edge.push({
          p: [x + 2.4, y + 0.026, s * 2.52],
          s: [4.8, 0.018, 0.085],
        });
        posts.push({ p: [x, y + 0.35, s * 2.98], s: [0.07, 0.7, 0.07] });
        rail.push({
          p: [x + 2.4, y + 0.61, s * 2.98],
          s: [4.85, 0.075, 0.065],
        });
      }
    F.batch(root, lane, night ? 0xceba64 : 0xc7ad55);
    F.batch(root, edge, snow ? 0x8daec0 : 0xe9e8dc);
    F.batch(root, posts, 0xe4e9e7);
    F.batch(root, rail, 0xd8e1df);
    const signs = [];
    for (let x = 5; x < st.edge; x += 10) {
      const p = new T.Group();
      p.position.set(x, g.road.height(x), 4.3);
      F.rod(p, [0, 0, 0], [0, 1.0, 0], 0.025, 0xdfe6e3);
      F.cube(p, [0.03, 0.38, 0.72], [0, 0.98, 0], 0x3569a3, true);
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#2e64a1";
      ctx.fillRect(0, 0, 128, 64);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.strokeRect(3, 3, 122, 58);
      ctx.font = "bold 35px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.fillText(x + "m", 64, 44);
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      const sign = F.mesh(
        new T.PlaneGeometry(0.68, 0.34),
        new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
        p,
        [-0.025, 0.98, 0],
      );
      sign.rotation.y = -Math.PI / 2;
      root.add(p);
      signs.push(p);
    }
    if (canyon || snow) {
      const mtn = [];
      for (let i = 0; i < 35; i++) {
        const x = -20 + random() * (st.edge + 50),
          side = random() < 0.5 ? -1 : 1,
          z = side * (25 + random() * 80),
          h = 8 + random() * 30;
        mtn.push({
          p: [x, h * 0.42, z],
          s: [10 + random() * 15, h, 10 + random() * 12],
        });
      }
      const geo = new T.ConeGeometry(1, 1, 5);
      F.batch(root, mtn, snow ? 0xd9e8ed : 0xbd8455, geo);
    }
    if (roof) {
      const buildings = [],
        lit = [];
      for (let i = 0; i < 65; i++) {
        const x = -70 + random() * 200,
          z = (random() < 0.5 ? -1 : 1) * (18 + random() * 120),
          h = 8 + random() * 70,
          w = 7 + random() * 15;
        buildings.push({ p: [x, -35 + h * 0.5, z], s: [w, h, w] });
        for (let j = 0; j < 10; j++)
          lit.push({
            p: [
              x - w * 0.51,
              -30 + random() * h,
              z - w * 0.3 + random() * w * 0.6,
            ],
            s: [0.05, 0.8, 0.7],
          });
      }
      F.batch(root, buildings, 0x82929f);
      const windows = F.mat(0xece2b4);
      windows.emissive = new T.Color(0xece2b4);
      windows.emissiveIntensity = 0.4;
      F.batch(root, lit, windows);
    }
    if (night) {
      const lamps = [];
      for (let x = -30; x < st.edge; x += 12) {
        lamps.push(
          { p: [x, 2.4, -3.7], s: [0.12, 4.8, 0.12] },
          { p: [x, 4.8, -3.1], s: [0.14, 0.12, 1.2] },
        );
        const bulb = F.mat(0xffe8ad);
        bulb.emissive = new T.Color(0xffd977);
        bulb.emissiveIntensity = 1.8;
        F.cube(root, [0.36, 0.12, 0.62], [x, 4.72, -2.6], bulb);
        if (x >= 0 && x < 40) {
          const light = new T.PointLight(0xffdb99, 28, 16, 2);
          light.position.set(x, 4.4, -2.6);
          root.add(light);
        }
      }
      F.batch(root, lamps, 0x566272);
      const a = new Float32Array(600 * 3);
      for (let i = 0; i < 600; i++) {
        a[i * 3] = random() * 75 - 25;
        a[i * 3 + 1] = random() * 20;
        a[i * 3 + 2] = random() * 40 - 20;
      }
      const geom = new T.BufferGeometry();
      geom.setAttribute("position", new T.BufferAttribute(a, 3));
      this.rain = new T.Points(
        geom,
        new T.PointsMaterial({
          color: 0xb9d0e8,
          size: 0.055,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      root.add(this.rain);
    }
    this.car = carModel(F, g.car.spec, st.vehicle);
    root.add(this.car);
    this.particles = [];
    const geom = new T.BufferGeometry();
    geom.setAttribute(
      "position",
      new T.BufferAttribute(new Float32Array(220 * 3), 3),
    );
    this.dust = new T.Points(
      geom,
      new T.PointsMaterial({
        color: 0xf3f0e7,
        size: 0.12,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    root.add(this.dust);
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }
  updateRoad(dt) {
    const g = this.game,
      c = g.car;
    this.car.position.set(c.x, c.y, 0);
    this.car.rotation.z = c.angle;
    for (const w of this.car.userData.wheels)
      w.mesh.rotation.z = c.wheelAngle[w.axle];
    this.car.userData.driver.userData.animate(
      g.clock,
      g.phase === "fall" ? 1 : g.gap < 2 ? 0.5 : g.pull > 0.85 ? 0.4 : 0,
    );
    const falling = g.phase === "fall" || g.result?.fell,
      ready = ["ready", "aim"].includes(g.phase),
      speed = Math.hypot(c.vx, c.vy),
      carScale =
        g.config.vehicle === "bus" ? 2 : g.config.vehicle === "kei" ? 0.9 : 1,
      scale =
        (this.camera.aspect < 1
          ? Math.min(1.5, 0.8 / this.camera.aspect)
          : 1.35) * carScale;
    let sideTarget =
      g.phase === "judge" || (g.phase === "result" && !g.result?.fell)
        ? 1
        : g.phase === "run" && g.gap < 9 && speed < 6
          ? 1
          : 0;
    this.sideK = lerp(
      this.sideK || 0,
      sideTarget,
      Math.min(1, dt * (sideTarget ? 1.6 : 3)),
    );
    if (ready) {
      V.set(c.x - 9 * scale, 4.4 * scale + 0.6, 2.4 * scale);
      LOOK.set(c.x + 16 + 4 * carScale, g.road.height(c.x + 12) - 1.5, 0);
    } else if (falling) {
      V.set(
        Math.max(g.road.edge + 10, c.x - 4),
        Math.max(c.y + 4, -22),
        11 * scale,
      );
      LOOK.set(c.x, c.y, 0);
    } else {
      V.set(c.x - 6.5 * scale, c.y + 2.6 * scale + 0.4, 1.6 * scale);
      LOOK.set(c.x + Math.min(10, 2 + speed * 0.6) + 6, c.y - 0.3, 0);
      const near = Math.abs(g.gap) < 1.5 ? 1 : 0;
      V.lerp(
        new T.Vector3(
          g.road.edge + (2.4 - near * 0.4) * scale,
          g.road.top + (4.6 - near * 0.6) * scale,
          (7.4 - near * 1.2) * scale,
        ),
        this.sideK,
      );
      LOOK.lerp(
        new T.Vector3(
          Math.min(c.x + c.spec.half * 0.3, g.road.edge - 0.3),
          g.road.top - scale + (g.config.vehicle === "bus" ? 1.2 : 0),
          0,
        ),
        this.sideK,
      );
    }
    if (!this.cameraReady) {
      this.camera.position.copy(V);
      this.look = LOOK.clone();
      this.cameraReady = true;
    } else {
      const smooth = 1 - Math.exp(-dt * (g.phase === "run" ? 5 : 3));
      this.camera.position.lerp(V, smooth);
      this.look.lerp(LOOK, smooth);
    }
    this.camera.lookAt(this.look);
    this.sun.position.set(c.x - 10, 18, 12);
    this.sun.target.position.set(c.x + 5, 0, 0);
    if (this.rain) {
      const a = this.rain.geometry.attributes.position.array;
      this.rain.position.x = c.x;
      for (let i = 0; i < a.length; i += 3) {
        a[i + 1] -= dt * 13;
        if (a[i + 1] < -1) a[i + 1] = 20;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.dust) {
      if (g.phase === "run" && c.spin && Math.random() < 0.6)
        this.particles.push({
          x: c.x - 1.3,
          y: c.y - 0.2,
          z: (Math.random() - 0.5) * 1.5,
          vx: -1,
          vy: 0.7 + Math.random(),
          vz: Math.random() - 0.5,
          life: 1,
        });
      if (g.splash && !this.splashed) {
        this.splashed = true;
        for (let i = 0; i < 140; i++)
          this.particles.push({
            x: c.x,
            y: -33.7,
            z: 0,
            vx: (Math.random() - 0.5) * 12,
            vy: 5 + Math.random() * 16,
            vz: (Math.random() - 0.5) * 13,
            life: 1.5,
          });
      }
      if (!g.splash) this.splashed = false;
      const a = this.dust.geometry.attributes.position.array;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= dt * 5;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
      this.particles = this.particles.slice(-220);
      for (let i = 0; i < 220; i++) {
        const p = this.particles[i];
        a[i * 3] = p?.x || 0;
        a[i * 3 + 1] = p?.y ?? -999;
        a[i * 3 + 2] = p?.z || 0;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
    }
  }
  render(dt) {
    if (this.dead) return;
    this.clock += dt;
    this.updateRoad(dt);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
    this.canvas.dataset.phase = this.game.phase;
  }
  destroy() {
    this.dead = true;
    this.observer?.disconnect();
    const geos = new Set(),
      mats = new Set(),
      textures = new Set();
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
