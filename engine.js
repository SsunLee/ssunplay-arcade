export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed = 1234567) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const VEHICLES = {
  sedan: {
    mass: 1200,
    half: 2.15,
    bottom: -0.2,
    top: 0.32,
    radius: 0.34,
    axles: [-1.35, 1.35],
    hub: -0.17,
    power: 1,
    height: 1.3,
    color: 0xe8322c,
  },
  kei: {
    mass: 700,
    half: 1.7,
    bottom: -0.2,
    top: 0.3,
    radius: 0.3,
    axles: [-1.05, 1],
    hub: -0.18,
    power: 1.18,
    height: 1.3,
    color: 0x4a9ad8,
  },
  sports: {
    mass: 1100,
    half: 2.2,
    bottom: -0.12,
    top: 0.22,
    radius: 0.33,
    axles: [-1.3, 1.4],
    hub: -0.1,
    power: 1.4,
    height: 0.95,
    color: 0xffc21a,
  },
  bus: {
    mass: 9000,
    half: 5.2,
    bottom: -0.15,
    top: 2.2,
    radius: 0.5,
    axles: [-2.7, 3.1],
    hub: -0.1,
    power: 0.82,
    height: 2.7,
    color: 0x2f9a6a,
  },
};
export const SURFACES = {
  asphalt: { rolling: 0.3, traction: 6, body: 0.6 },
  wet: { rolling: 0.2, traction: 1.6, body: 0.35 },
  gravel: { rolling: 0.45, traction: 3, body: 0.7 },
  ice: { rolling: 0.07, traction: 0.8, body: 0.12 },
};
export const STAGES = [
  {
    name: "푸른 바다 절벽",
    detail: "기본 직선 도로 · 70m",
    edge: 70,
    vehicle: "sedan",
    surface: "asphalt",
    profile: "flat",
    theme: "coast",
    power: 1,
  },
  {
    name: "붉은 협곡",
    detail: "200m 롱 드라이브",
    edge: 200,
    vehicle: "sedan",
    surface: "asphalt",
    profile: "flat",
    theme: "canyon",
    power: 1.7,
    reach: 1.4,
  },
  {
    name: "비 내리는 야간 부두",
    detail: "관광버스 · 젖은 노면 · 60m",
    edge: 60,
    vehicle: "bus",
    surface: "wet",
    profile: "flat",
    theme: "pier",
    power: 1,
  },
  {
    name: "도심 옥상",
    detail: "스포츠카 · 오르막 · 50m",
    edge: 50,
    vehicle: "sports",
    surface: "asphalt",
    profile: "hill",
    theme: "roof",
    power: 1,
    bumpX: 1,
  },
  {
    name: "얼어붙은 산길",
    detail: "경트럭 · 빙판 · 60m",
    edge: 60,
    vehicle: "kei",
    surface: "ice",
    profile: "flat",
    theme: "snow",
    power: 1,
  },
];
export const CURL_DISTANCES = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 25, 30, 35, 40, 50, 60, 80, 100,
];
export function makeRoad(st) {
  const edge = st.edge,
    bump = 8 + (edge - 18) * (st.bumpX ?? 0.5);
  const height = (x) => {
    if (x <= 0) return 0;
    if (st.profile === "hill") {
      const lo = bump - 6;
      return x < lo
        ? 0
        : x < bump
          ? 0.8 * (1 - Math.cos((Math.PI * (x - lo)) / 6))
          : 1.6;
    }
    if (st.profile === "down") return -Math.min(x, edge) * 0.045;
    return 0;
  };
  const points = [];
  for (let x = -30; x < edge - 1e-6; x += 0.25) points.push([x, height(x)]);
  points.push([edge, height(edge)], [edge, -38]);
  return { edge, height, points, top: height(edge) };
}
export function frontOf(car) {
  const c = Math.cos(car.angle),
    s = Math.sin(car.angle),
    v = car.spec;
  return Math.max(
    ...[-v.half, v.half].flatMap((x) =>
      [v.bottom, v.top].map((y) => car.x + x * c - y * s),
    ),
  );
}
export function makeCar(spec, x = 0) {
  return {
    spec,
    mass: spec.mass,
    inertia: (spec.mass * ((spec.half * 2) ** 2 + 1.44)) / 12,
    x,
    y: spec.radius - spec.hub + 0.002,
    vx: 0,
    vy: 0,
    angle: 0,
    omega: 0,
    stroke: 0,
    driveForce: 0,
    normal: [0, 0],
    ground: [false, false],
    wheelAngle: [0, 0],
    spin: false,
    maxSpeed: 0,
    scrape: 0,
  };
}
export function launchCar(car, p, scale = 1) {
  const energy =
      car.spec.power *
      scale *
      (200 * p * p + 1500 * p ** 16) *
      car.mass *
      9.8 *
      0.3,
    boost = p > 0.93 ? 1 + (p - 0.93) * 20 : 1;
  car.stroke = Math.max(2 + 10 * p, energy / (car.mass * 20)) / boost;
  car.driveForce = energy / car.stroke;
  car.energy = energy;
}
function nearestRoad(road, x, y, r) {
  let nearest = null,
    dist2 = r * r;
  const start = Math.max(1, Math.floor((x - r - 0.5 + 30) / 0.25));
  const check = (a, b) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len2 = dx * dx + dy * dy,
      t = clamp(len2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / len2 : 0, 0, 1),
      px = a[0] + t * dx,
      py = a[1] + t * dy,
      d2 = (x - px) ** 2 + (y - py) ** 2;
    if (d2 < dist2) {
      dist2 = d2;
      nearest = { x: px, y: py, d: Math.sqrt(d2) };
    }
  };
  for (let i = start; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i];
    if (a[0] > x + r + 0.5 && b[0] > x + r + 0.5) break;
    check(a, b);
  }
  check(road.points.at(-2), road.points.at(-1));
  return nearest;
}
export function stepCar(car, road, surface, h, wind = 0) {
  const sp = car.spec,
    c = Math.cos(car.angle),
    s = Math.sin(car.angle),
    world = (x, y) => [car.x + x * c - y * s, car.y + x * s + y * c];
  car.vy -= 9.8 * h;
  car.vx += wind * h;
  const speed = Math.hypot(car.vx, car.vy);
  car.vx *= 1 - 0.0016 * speed * h;
  car.vy *= 1 - 0.0016 * speed * h;
  const contacts = [],
    contact = (x, y, nx, ny, pen, mu, wheel = -1) =>
      contacts.push({ x, y, nx, ny, pen, mu, wheel, n: 0, t: 0 });
  for (let i = 0; i < 2; i++) {
    const [x, y] = world(sp.axles[i], sp.hub),
      p = nearestRoad(road, x, y, sp.radius);
    if (p) {
      const nx = p.d > 1e-6 ? (x - p.x) / p.d : 0,
        ny = p.d > 1e-6 ? (y - p.y) / p.d : 1;
      contact(p.x, p.y, nx, ny, sp.radius - p.d, surface.rolling, i);
    }
  }
  for (const [x0, y0] of [
    [-sp.half, sp.bottom],
    [sp.half, sp.bottom],
    [-sp.half, sp.top],
    [sp.half, sp.top],
    [-sp.half * 0.5, sp.bottom],
    [0, sp.bottom],
    [sp.half * 0.5, sp.bottom],
    [0, sp.top],
  ]) {
    const [x, y] = world(x0, y0);
    if (x >= road.edge || x < -30) continue;
    const ground = road.height(x);
    if (y >= ground) continue;
    const depth = ground - y,
      left = road.edge - x;
    if (left < depth && left < 0.6) contact(x, y, 1, 0, left, surface.body);
    else {
      const slope = (road.height(x + 0.05) - road.height(x - 0.05)) / 0.1,
        norm = Math.hypot(1, slope);
      contact(x, y, -slope / norm, 1 / norm, depth / norm, surface.body);
    }
  }
  const ex = road.edge - car.x,
    ey = road.top - car.y,
    edgeLocalX = ex * c + ey * s,
    edgeLocalY = -ex * s + ey * c;
  if (
    Math.abs(edgeLocalX) < sp.half &&
    edgeLocalY > sp.bottom - 0.02 &&
    edgeLocalY < sp.bottom + 0.35
  )
    contact(
      road.edge,
      road.top,
      -s,
      c,
      edgeLocalY - sp.bottom,
      surface.body,
      -2,
    );
  car.ground = [false, false];
  for (const k of contacts) if (k.wheel >= 0) car.ground[k.wheel] = true;
  let push = 0;
  car.spin = false;
  if (car.stroke > 0) {
    if (car.ground[0]) {
      push = Math.min(car.driveForce, surface.traction * car.normal[0]);
      car.stroke -= Math.max(Math.abs(car.vx * c + car.vy * s), 0.5) * h;
      car.spin = car.driveForce > surface.traction * car.normal[0];
    } else {
      car.stroke -= 14 * h;
      car.spin = true;
    }
    if (car.stroke <= 0) {
      car.stroke = 0;
      car.spin = false;
    }
  }
  const impulse = (k, ix, iy) => {
    car.vx += ix / car.mass;
    car.vy += iy / car.mass;
    car.omega += ((k.x - car.x) * iy - (k.y - car.y) * ix) / car.inertia;
  };
  if (push > 0) {
    const k = contacts.find((v) => v.wheel === 0);
    impulse(k, k.ny * push * h, -k.nx * push * h);
  }
  car.scrape = 0;
  const normals = [0, 0];
  for (let n = 0; n < 10; n++)
    for (const k of contacts) {
      const rx = k.x - car.x,
        ry = k.y - car.y,
        vx = car.vx - car.omega * ry,
        vy = car.vy + car.omega * rx,
        lever = rx * k.ny - ry * k.nx,
        invMass = 1 / car.mass + (lever * lever) / car.inertia,
        bias = (0.25 / h) * Math.max(0, k.pen - 0.003),
        delta = (-vx * k.nx - vy * k.ny + bias) / invMass,
        old = k.n;
      k.n = Math.max(0, old + delta);
      const j = k.n - old;
      impulse(k, k.nx * j, k.ny * j);
      const tx = k.ny,
        ty = -k.nx,
        vt = (car.vx - car.omega * ry) * tx + (car.vy + car.omega * rx) * ty,
        leverT = rx * ty - ry * tx,
        oldT = k.t;
      k.t = clamp(
        oldT - vt / (1 / car.mass + (leverT * leverT) / car.inertia),
        -k.mu * k.n,
        k.mu * k.n,
      );
      impulse(k, tx * (k.t - oldT), ty * (k.t - oldT));
    }
  for (const k of contacts)
    if (k.wheel >= 0) normals[k.wheel] += k.n / h;
    else car.scrape += k.n / h;
  car.normal = normals;
  car.x += car.vx * h;
  car.y += car.vy * h;
  car.angle += car.omega * h;
  const tangentSpeed = car.vx * c + car.vy * s;
  for (let i = 0; i < 2; i++)
    car.wheelAngle[i] +=
      (car.ground[i]
        ? tangentSpeed / sp.radius
        : i === 0 && car.spin
          ? 30
          : 0) *
        h +
      (i === 0 && car.spin && car.ground[i] ? 20 * h : 0);
  car.maxSpeed = Math.max(car.maxSpeed, speed);
}
export class DriveGame {
  constructor(stage = 0) {
    this.stage = stage;
    this.reset();
  }
  reset() {
    this.config = STAGES[this.stage];
    this.road = makeRoad(this.config);
    this.car = makeCar(VEHICLES[this.config.vehicle]);
    this.phase = "ready";
    this.pull = 0;
    this.lastPull = null;
    this.time = 0;
    this.clock = 0;
    this.rest = 0;
    this.judgeTime = 0;
    this.fallTime = 0;
    this.slow = 1;
    this.accumulator = 0;
    this.result = null;
    this.splash = false;
    this.splashAge = 0;
    this.message = "아래로 당겼다가 놓으세요";
  }
  setPull(p) {
    if (!["ready", "aim"].includes(this.phase)) return;
    this.pull = clamp(p, 0, 1);
    this.phase = "aim";
    this.car.x = -4 * this.pull;
    this.car.y =
      this.car.spec.radius -
      this.car.spec.hub +
      this.road.height(this.car.x) +
      0.002;
  }
  launch(p = this.pull) {
    if (!["ready", "aim"].includes(this.phase)) return false;
    if (p < 0.04) {
      this.phase = "ready";
      this.pull = 0;
      this.car.x = 0;
      return false;
    }
    this.lastPull = clamp(p, 0, 1);
    this.pull = this.lastPull;
    launchCar(this.car, this.pull, this.config.power);
    this.phase = "run";
    this.time = 0;
    this.clock = 0;
    this.accumulator = 0;
    return true;
  }
  get gap() {
    return this.road.edge - frontOf(this.car);
  }
  pause() {
    if (!["result", "paused"].includes(this.phase)) {
      this.previousPhase = this.phase === "aim" ? "ready" : this.phase;
      this.phase = "paused";
    }
  }
  resume() {
    if (this.phase === "paused") this.phase = this.previousPhase;
  }
  finish(fell = false) {
    if (this.phase === "result") return;
    this.phase = "result";
    this.result = {
      game: "drive",
      stage: this.stage,
      fell,
      gap: this.gap,
      value: this.gap,
      metric: -this.gap,
      flight: Math.max(0, this.car.x - this.road.edge),
      maxSpeed: this.car.maxSpeed * 3.6,
      pull: this.lastPull,
    };
  }
  update(realDt) {
    if (this.phase === "paused" || this.phase === "result") return;
    const dt = clamp(realDt, 0, 0.25);
    this.clock += dt;
    if (!["run", "judge", "fall"].includes(this.phase)) return;
    this.time += dt;
    const v = Math.hypot(this.car.vx, this.car.vy),
      near =
        this.phase !== "fall" &&
        this.gap < 0.8 &&
        this.gap > -2.5 &&
        v < 4 &&
        v > 0.05;
    this.slow = lerp(this.slow, near ? 0.35 : 1, Math.min(1, dt * 6));
    const scaled = dt * this.slow;
    this.accumulator += scaled;
    while (this.accumulator >= 1 / 120) {
      stepCar(this.car, this.road, SURFACES[this.config.surface], 1 / 120);
      this.accumulator -= 1 / 120;
    }
    if (this.phase !== "fall" && this.car.y < this.road.top - 2.5) {
      this.phase = "fall";
      this.fallTime = 0;
    }
    if (this.phase === "fall") {
      this.fallTime += dt;
      if (this.car.y < -33.7 && !this.splash) {
        this.splash = true;
        this.splashAge = 0;
      }
      if (this.splash) {
        this.splashAge += dt;
        this.car.vx *= Math.exp(-5 * dt);
        this.car.vy = Math.max(-1.5, this.car.vy);
      }
      if (this.splashAge > 1.4 || this.fallTime > 8) this.finish(true);
      return;
    }
    const still =
      Math.hypot(this.car.vx, this.car.vy) < 0.04 &&
      Math.abs(this.car.omega) < 0.04 &&
      this.car.stroke <= 0;
    this.rest = still ? this.rest + scaled : 0;
    if (this.phase === "judge") {
      this.judgeTime += dt;
      if (this.judgeTime > 1.5) this.finish(false);
      return;
    }
    if (this.rest > 0.35 || this.time > 30) {
      if (this.gap < 1.5) {
        this.phase = "judge";
        this.judgeTime = 0;
      } else this.finish(false);
    }
  }
}
const REST = [
  [0, 0, 0],
  [0, 0.2, 0.01],
  [0, 0.4, 0.02],
  [0, 0.55, 0.02],
  [0, 0.7, 0],
  [-0.2, 0.47, 0.03],
  [-0.24, 0.2, 0.05],
  [-0.25, -0.05, 0.03],
  [0.2, 0.47, 0.03],
  [0.24, 0.2, 0.05],
  [0.25, -0.05, 0.03],
  [-0.1, -0.04, 0],
  [-0.1, -0.48, -0.03],
  [-0.11, -0.9, 0],
  [0.1, -0.04, 0],
  [0.1, -0.48, -0.03],
  [0.11, -0.9, 0],
];
const SITTING = [
  [0, 0, 0],
  [0, 0.2, 0.05],
  [0, 0.38, 0.12],
  [0, 0.5, 0.15],
  [0, 0.63, 0.12],
  [-0.2, 0.44, 0.13],
  [-0.28, 0.2, 0.08],
  [-0.3, 0, -0.08],
  [0.2, 0.44, 0.13],
  [0.28, 0.2, 0.08],
  [0.3, 0, -0.08],
  [-0.1, -0.02, 0],
  [-0.12, -0.03, -0.44],
  [-0.14, -0.48, -0.5],
  [0.1, -0.02, 0],
  [0.12, -0.03, -0.44],
  [0.14, -0.48, -0.5],
];
export const BONES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [2, 5],
  [2, 8],
  [5, 8],
  [3, 5],
  [3, 8],
  [5, 6],
  [6, 7],
  [8, 9],
  [9, 10],
  [0, 11],
  [0, 14],
  [11, 14],
  [1, 11],
  [1, 14],
  [11, 12],
  [12, 13],
  [14, 15],
  [15, 16],
];
const lengths = BONES.map(([a, b]) =>
    Math.hypot(...REST[a].map((v, i) => v - REST[b][i])),
  ),
  RADII = [
    0.12, 0.13, 0.15, 0.06, 0.12, 0.07, 0.055, 0.06, 0.07, 0.055, 0.06, 0.08,
    0.065, 0.06, 0.08, 0.065, 0.06,
  ];
export class CurlingGame {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.stage = 0;
    this.reset();
  }
  reset(stage = 0) {
    this.stage = stage;
    this.distance = CURL_DISTANCES[Math.min(stage, CURL_DISTANCES.length - 1)];
    this.random = rng(this.seed + stage * 1979);
    this.time = 0;
    this.clock = 0;
    this.phase = "ready";
    this.started = false;
    this.accumulator = 0;
    this.feedback = "";
    this.result = null;
    this.bestDistance = this.bestDistance || 0;
    this.chair = {
      x: 0,
      z: 0,
      vx: 0,
      vz: 0,
      yaw: 0,
      omega: 0,
      released: false,
      held: false,
      stopTime: 0,
    };
    const d = this.distance;
    this.man = {
      x: (this.random() - 0.5) * Math.min(1.2, 0.3 + d * 0.04),
      z: -d,
      yaw: (this.random() - 0.5) * 0.2,
      phase: this.random() * 6.28,
      mode: "stand",
      pelvisY: 0.95,
      collapseAt: 3.4 + d * 0.17 + this.random() * 1.4,
      collapseTime: 0,
      seatTime: 0,
      fallTime: 0,
    };
    this.points = REST.map((p) => [p[0] + this.man.x, p[1] + 0.95, p[2] - d]);
    this.old = this.points.map((p) => [...p]);
    this.startPoints = null;
    this.seatedFrom = null;
  }
  grab(x, z) {
    if (!["ready", "aim"].includes(this.phase) || this.chair.released)
      return false;
    this.phase = "aim";
    this.chair.held = true;
    this.moveGrab(x, z);
    return true;
  }
  moveGrab(x, z) {
    if (!this.chair.held) return;
    this.chair.x = clamp(x, -1, 1);
    this.chair.z = clamp(z, -0.9, 0.45);
  }
  release(vx, vz) {
    if (!["ready", "aim"].includes(this.phase)) return false;
    const v = Math.hypot(vx, vz);
    this.chair.held = false;
    if (v < 1.2) {
      this.phase = "ready";
      return false;
    }
    const scale = Math.min(17, v) / v;
    this.chair.vx = vx * scale;
    this.chair.vz = vz * scale;
    this.chair.omega = (this.random() - 0.5) * 0.6 * Math.min(1, v / 4);
    this.chair.released = true;
    this.phase = "roll";
    this.started = true;
    this.time = 0;
    this.man.collapseAt = Math.max(3, this.man.collapseAt);
    return true;
  }
  pause() {
    if (!["paused", "result"].includes(this.phase)) {
      this.previousPhase = this.phase === "aim" ? "ready" : this.phase;
      this.phase = "paused";
      this.chair.held = false;
    }
  }
  resume() {
    if (this.phase === "paused") this.phase = this.previousPhase;
  }
  next() {
    this.bestDistance = Math.max(this.bestDistance, this.distance);
    this.reset(this.stage + 1);
  }
  end(ok, reason) {
    if (this.phase === "result") return;
    this.phase = "result";
    this.feedback = reason;
    this.result = {
      game: "curling",
      stage: this.stage,
      ok,
      value: ok ? this.distance : this.bestDistance,
      distance: this.distance,
      metric: ok ? this.distance : this.bestDistance,
      reason,
    };
  }
  fall(reason, impulse = 0) {
    if (this.man.mode === "fall") return;
    this.man.mode = "fall";
    this.man.fallTime = 0;
    this.feedback = reason;
    this.old = this.points.map((p) => [
      p[0] - (this.chair.vx * impulse) / 120,
      p[1] + 0.01,
      p[2] - (this.chair.vz * impulse) / 120,
    ]);
  }
  pose() {
    const m = this.man,
      c = this.chair,
      t = this.clock,
      seat = m.mode === "sit",
      base = seat ? SITTING : REST,
      yaw = seat ? c.yaw : m.yaw,
      co = Math.cos(yaw),
      si = Math.sin(yaw),
      wx = seat ? c.x : m.x + Math.sin(t * 1.8 + m.phase) * 0.035,
      wz = seat ? c.z : m.z + Math.sin(t * 1.1 + m.phase) * 0.025,
      leanX = seat ? Math.sin(t * 4) * 0.025 : Math.sin(t * 2 + m.phase) * 0.1,
      leanZ = seat
        ? Math.sin(t * 5) * 0.018
        : Math.sin(t * 1.6 + m.phase) * 0.08;
    const target = base.map((p, i) => {
      let x = p[0],
        y = p[1],
        z = p[2];
      if (i < 11) {
        x += y * leanX;
        z += y * leanZ;
      }
      if (i === 7 || i === 10) z += Math.sin(t * 2 + (i === 7 ? 0 : 2)) * 0.035;
      return [wx + x * co + z * si, m.pelvisY + y, wz - x * si + z * co];
    });
    if (seat && m.sitFrom && m.seatTime < 0.35) {
      const blend = Math.min(1, m.seatTime / 0.35);
      for (let i = 0; i < 17; i++)
        for (let j = 0; j < 3; j++)
          target[i][j] = lerp(
            m.sitFrom[i][j],
            target[i][j],
            blend * blend * (3 - 2 * blend),
          );
    }
    this.points = target;
    this.old = target.map((p) => [...p]);
  }
  ragdoll(h) {
    for (let i = 0; i < 17; i++) {
      const p = this.points[i],
        o = this.old[i],
        x = p[0],
        y = p[1],
        z = p[2];
      p[0] += (x - o[0]) * 0.985;
      p[1] += (y - o[1]) * 0.985 - 9.8 * h * h;
      p[2] += (z - o[2]) * 0.985;
      this.old[i] = [x, y, z];
    }
    for (let k = 0; k < 6; k++) {
      for (let j = 0; j < BONES.length; j++) {
        const [a, b] = BONES[j],
          p = this.points[a],
          q = this.points[b],
          dx = q[0] - p[0],
          dy = q[1] - p[1],
          dz = q[2] - p[2],
          len = Math.hypot(dx, dy, dz) || 1,
          e = ((len - lengths[j]) / len) * 0.5;
        for (let n = 0; n < 3; n++) {
          const d = [dx, dy, dz][n] * e;
          p[n] += d;
          q[n] -= d;
        }
      }
      for (let i = 0; i < 17; i++) {
        const p = this.points[i];
        if (p[1] < RADII[i]) {
          p[1] = RADII[i];
          this.old[i][0] = lerp(this.old[i][0], p[0], 0.35);
          this.old[i][2] = lerp(this.old[i][2], p[2], 0.35);
        }
      }
    }
  }
  step(h) {
    const c = this.chair,
      m = this.man;
    if (this.started) this.time += h;
    if (c.released && !c.held) {
      const v = Math.hypot(c.vx, c.vz);
      if (v > 0.0001) {
        const nv = Math.max(0, v - (1.4 + 0.006 * v * v) * h),
          k = nv / v;
        c.vx *= k;
        c.vz *= k;
        c.x += c.vx * h;
        c.z += c.vz * h;
        c.omega += (this.random() - 0.5) * 2.4 * Math.min(1, v / 5) * h;
        c.omega *= Math.exp(-1.2 * h);
        c.yaw += c.omega * h;
        if (Math.abs(c.x) > 2.55) {
          c.x = Math.sign(c.x) * 2.55;
          c.vx *= -0.3;
        }
      } else {
        c.vx = c.vz = 0;
        c.omega *= Math.exp(-4 * h);
        c.yaw += c.omega * h;
      }
      if (Math.hypot(c.vx, c.vz) < 0.03) c.stopTime += h;
    }
    if (m.mode === "fall") {
      m.fallTime += h;
      this.ragdoll(h);
      if (m.fallTime > 1.7) this.end(false, this.feedback);
      return;
    }
    if (m.mode === "sit") {
      m.pelvisY = 0.51;
      m.seatTime += h;
      this.pose();
      if (m.seatTime > 1.2) {
        if (this.stage === CURL_DISTANCES.length - 1) {
          this.end(true, "모든 동료를 구했어요!");
          return;
        }
        this.phase = "success";
        this.feedback = "무사히 착석!";
        this.successTime = (this.successTime || 0) + h;
        if (this.successTime > 0.6) {
          this.bestDistance = Math.max(this.bestDistance, this.distance);
          this.next();
          this.successTime = 0;
        }
      }
      return;
    }
    if (!this.started) {
      this.pose();
      return;
    }
    const speed = Math.hypot(c.vx, c.vz),
      dx = m.x - c.x,
      dz = m.z - c.z,
      co = Math.cos(c.yaw),
      si = Math.sin(c.yaw),
      lateral = dx * co - dz * si,
      along = dx * si + dz * co,
      aligned =
        Math.abs(lateral) < 0.25 &&
        along > -0.2 &&
        along < 0.3 &&
        Math.abs(c.yaw - m.yaw) < 1.35;
    if (m.mode === "stand") {
      if (c.stopTime > 0.35)
        m.collapseAt = Math.min(m.collapseAt, this.time + 0.5);
      if (along < -0.6) m.collapseAt = Math.min(m.collapseAt, this.time + 0.3);
      if (Math.abs(lateral) < 0.36 && Math.abs(along) < 0.48 && speed > 4.4) {
        this.fall("너무 빨라서 동료가 날아갔어요!", 0.7);
        return;
      }
      if (Math.abs(lateral) < 0.39 && along > -0.34 && along < 0.4) {
        const yaw = Math.abs(c.yaw - m.yaw);
        if (yaw > 1.35) {
          this.fall("의자의 방향이 맞지 않았어요.", 0.4);
          return;
        }
        if (Math.abs(lateral) > 0.28) {
          this.fall("의자 가장자리에 걸렸어요.", 0.3);
          return;
        }
        m.mode = "sit";
        m.seatTime = 0;
        m.sitFrom = this.points.map((p) => [...p]);
        m.pelvisY = 0.51;
        c.vx *= 0.62;
        c.vz *= 0.62;
        this.pose();
        return;
      }
      if (this.time >= m.collapseAt) {
        m.mode = "collapse";
        m.collapseTime = 0;
      }
    }
    if (m.mode === "collapse") {
      m.collapseTime += h;
      m.pelvisY = 0.95 - 2.6 * m.collapseTime ** 2;
      this.pose();
      if (m.pelvisY <= 0.58) {
        if (aligned && speed <= 4.4) {
          m.mode = "sit";
          m.pelvisY = 0.51;
          m.seatTime = 0;
          return;
        }
        this.fall(
          c.stopTime > 0.2
            ? "의자가 닿기 전에 주저앉았어요."
            : Math.abs(lateral) > 0.25
              ? "방향이 빗나갔어요."
              : "의자가 너무 멀리 지나갔어요.",
          0.06,
        );
        return;
      }
    } else this.pose();
  }
  update(dt) {
    if (this.phase === "paused" || this.phase === "result") return;
    dt = clamp(dt, 0, 0.25);
    this.clock += dt;
    this.accumulator += dt;
    while (this.accumulator >= 1 / 120 && this.phase !== "result") {
      this.step(1 / 120);
      this.accumulator -= 1 / 120;
    }
  }
}
export function flickVelocity(samples, height, now) {
  const recent = samples.filter((p) => now - p.t <= 90);
  if (recent.length < 2) return null;
  const first = recent[0],
    last = recent.at(-1),
    seconds = (last.t - first.t) / 1000;
  if (seconds <= 0.008 || now - last.t >= 70) return null;
  const screenSpeed =
      (Math.hypot(last.x - first.x, last.y - first.y) / seconds / height) * 2.6,
    dx = last.fx - first.fx,
    dz = last.fz - first.fz,
    n = Math.hypot(dx, dz);
  if (screenSpeed < 1.2 || n < 0.001) return null;
  const v = Math.min(17, screenSpeed);
  return { vx: (dx / n) * v, vz: (dz / n) * v, speed: v };
}
