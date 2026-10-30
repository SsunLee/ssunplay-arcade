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
    color: 0xf4f4f0,
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
export const BEER_ORDERS = [
  {
    name: "퇴근 후 첫 잔",
    request: "시원하게 가득, 거품은 두 손가락!",
    liquid: 0.74,
    foam: 0.17,
    time: 32,
  },
  {
    name: "깔끔한 한 잔",
    request: "거품은 얇게, 맥주는 넉넉하게 부탁해요.",
    liquid: 0.82,
    foam: 0.1,
    time: 30,
  },
  {
    name: "부드러운 마무리",
    request: "크리미한 거품을 조금 더 올려주세요.",
    liquid: 0.69,
    foam: 0.23,
    time: 30,
  },
];
export class BeerGame {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.random = rng(seed);
    this.round = 0;
    this.scores = [];
    this.reset();
  }
  reset() {
    this.order = BEER_ORDERS[this.round];
    this.phase = "ready";
    this.liquid = 0;
    this.foam = 0;
    this.spilled = 0;
    this.angle = 35;
    this.targetAngle = 35;
    this.pouring = false;
    this.flow = 0;
    this.pressure = 0.125 + this.random() * 0.018;
    this.time = 0;
    this.clock = 0;
    this.started = false;
    this.accumulator = 0;
    this.roundResult = null;
    this.result = null;
    this.spillFlash = 0;
  }
  setAngle(deg) {
    if (!["ready", "pour", "settle"].includes(this.phase)) return;
    this.targetAngle = clamp(deg, 0, 55);
  }
  setPour(on) {
    if (!["ready", "pour", "settle"].includes(this.phase)) return false;
    this.pouring = on;
    if (on) {
      this.started = true;
      this.phase = "pour";
    } else if (this.started) this.phase = "settle";
    return true;
  }
  get capacity() {
    // Same rim radius and fill height as BeerView: the downhill rim spills first.
    return 1 - (0.54 / 1.695) * Math.tan((this.angle * Math.PI) / 180);
  }
  get spillPenalty() {
    // A 500mL glass: each 5mL wasted costs one point, with no penalty cap.
    return this.spilled * 100;
  }
  get total() {
    return this.liquid + this.foam;
  }
  get remaining() {
    return Math.max(0, this.order.time - this.time);
  }
  pause() {
    if (!["result", "tasting", "paused"].includes(this.phase)) {
      this.previousPhase = this.started ? "settle" : "ready";
      this.pouring = false;
      this.flow = 0;
      this.phase = "paused";
    }
  }
  resume() {
    if (this.phase === "paused") this.phase = this.previousPhase;
  }
  step(h) {
    this.clock += h;
    if (this.started) this.time += h;
    this.angle = lerp(this.angle, this.targetAngle, 1 - Math.exp(-h * 7));
    this.flow = lerp(
      this.flow,
      this.pouring ? this.pressure : 0,
      1 - Math.exp(-h * (this.pouring ? 7 : 22)),
    );
    if (this.flow > 0.0001) {
      const tilt = this.angle / 55,
        foamRate =
          0.05 + 0.3 * (1 - tilt) ** 2 + 0.12 * Math.max(0, this.total - 0.78);
      const amount = this.flow * h;
      this.liquid += amount * (1 - foamRate);
      this.foam += amount * foamRate * 3.5;
    }
    const decay = this.foam * (0.042 + this.angle * 0.00035) * h;
    this.foam -= decay;
    this.liquid += decay / 3.5;
    const overflow = Math.max(0, this.total - this.capacity);
    if (overflow > 0) {
      // Fresh foam remains at the surface while the tap is running; excess
      // drains over the rim as foam and beer instead of erasing the head entirely.
      const surfaceHead = this.flow > 0.005 ? 0.035 : 0;
      const foamLoss = Math.min(Math.max(0, this.foam - surfaceHead), overflow);
      this.foam -= foamLoss;
      this.liquid -= overflow - foamLoss;
      this.spilled += foamLoss / 3.5 + (overflow - foamLoss);
      this.spillFlash = 1;
    }
    this.spillFlash = Math.max(0, this.spillFlash - h * 2);
    this.liquid = Math.max(0, this.liquid);
    if (this.started && this.remaining <= 0) this.serve(true);
  }
  update(dt) {
    if (["paused", "tasting", "result"].includes(this.phase)) return;
    this.accumulator += clamp(dt, 0, 0.25);
    while (
      this.accumulator >= 1 / 120 &&
      !["tasting", "result"].includes(this.phase)
    ) {
      this.step(1 / 120);
      this.accumulator -= 1 / 120;
    }
  }
  serve(timedOut = false) {
    if (
      !["ready", "pour", "settle"].includes(this.phase) ||
      !this.started ||
      (this.total < 0.04 && !timedOut)
    )
      return false;
    this.pouring = false;
    this.flow = 0;
    this.targetAngle = 0;
    const liquidError = Math.abs(this.liquid - this.order.liquid),
      foamError = Math.abs(this.foam - this.order.foam),
      spillPenalty = this.spillPenalty,
      score = Math.round(
        clamp(100 - liquidError * 125 - foamError * 160 - spillPenalty, 0, 100),
      );
    const feedback = timedOut
      ? "주문 시간이 끝났어요."
      : this.spilled > 0.07
        ? "넘친 맥주가 아쉬워요."
        : this.foam > this.order.foam + 0.1
          ? "거품이 많아요. 잔을 더 기울여 보세요."
          : this.foam < this.order.foam - 0.07
            ? "거품이 적어요. 마지막엔 잔을 세워보세요."
            : this.liquid < this.order.liquid - 0.12
              ? "맥주를 조금 더 채워주세요."
              : score >= 90
                ? "완벽한 한 잔! 손님이 만족했어요."
                : "좋아요! 다음 잔은 더 섬세하게.";
    this.roundResult = {
      round: this.round,
      score,
      liquid: this.liquid,
      foam: this.foam,
      spilled: this.spilled,
      spillPenalty,
      timedOut,
      feedback,
    };
    this.scores.push(this.roundResult);
    if (this.round === BEER_ORDERS.length - 1) {
      this.phase = "result";
      const value = Math.round(
        this.scores.reduce((s, r) => s + r.score, 0) / this.scores.length,
      );
      this.result = {
        game: "beer",
        value,
        metric: value,
        rounds: this.scores.map((r) => ({ ...r })),
      };
    } else this.phase = "tasting";
    return true;
  }
  next() {
    if (this.phase !== "tasting") return false;
    this.round++;
    this.reset();
    return true;
  }
}
