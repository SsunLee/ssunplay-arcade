// SSUN AIR takeoff & landing: pure flight model, scoring and grades (no DOM, no three.js).
// Frame: x along runway 14R (threshold at 0, +x = takeoff/landing direction), h = main gear
// height above the field in metres, z = metres right of the centreline seen from the cockpit.
export const KT = 0.514444, FT = 0.3048, G = 9.81, DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RWY = { id: "14R", recip: "32L", heading: 143, length: 3200, width: 60, aim: 400, tdz: 900, gs: 3, papiX: 400 };
export const V_SPEEDS = { v1: 138, vr: 145, v2: 152 };
export const VAPP = 140;
export const TAIL_LIMIT = 13; // degrees of pitch with the main gear on the runway
export const ROTATE_EARLY = 10; // rotating from VR-10 kt on is fine; the takeoff only fails well below that
export const MAX_CROSS = 8; // knots of crosswind at most, so the approach stays friendly
export const SINK_GRADES = { butter: 180, good: 400, firm: 750, crash: 1200 }; // fpm at touchdown
export const CALLSIGN = "SSUN 123";
const VREF_TO = 178, VREF_LDG = 140, MAX_THRUST = 3.6, CLIMB_DONE = 300 * FT, EYE = 4;
const PITCH_RATE = 3, PITCH_LAG = 5; // deg/s at full deflection; the pitch rate follows the stick with a 0.2 s lag
const ASSIST_BANK = 5, ASSIST_LEVEL = 0.35; // assist: max bank it commands, and how gently it rolls
export const RETARD_FT = 25; // assist: below this height on landing the levers go to idle
// hold-to-accelerate button: drag radius and deadzone in px, thrust ramp while held and the ease back on release (per s)
export const HOLD = { radius: 80, dead: 10, ramp: 0.8, back: 1 };
export const HOLD_LABELS = { up: "기수↑", down: "기수↓", left: "◀ 기울기", right: "기울기 ▶" };
export const PAPI_ANGLES = [2.5, 2.83, 3.17, 3.5]; // left to right as seen on final, nearest the runway last
export const GRADES = {
  butter: "버터 랜딩!",
  good: "좋은 착륙",
  firm: "단단한 착륙",
  hard: "하드 랜딩",
  crash: "크래시!",
  goaround: "고 어라운드",
};
export const FAILURES = {
  tailstrike: "테일스트라이크!",
  early: "너무 일찍 들었어요 · 이륙 실패",
  overrun: "활주로 이탈 · 오버런",
  stall: "실속!",
  sink: "다시 주저앉았어요",
  short: "활주로 전에 착지했어요",
  excursion: "활주로 옆으로 벗어났어요",
  wingstrike: "날개가 땅에 닿았어요",
  nosegear: "앞바퀴부터 쾅!",
  hard: "너무 세게 내렸어요",
};

/**
 * Fictional homage liveries (no real airline names or marks). Colours are "#rrggbb"; null hides that part.
 * body = upper fuselage, belly = lower fuselage, cheat/stripe = the bold and thin side lines, rudder follows the fin,
 * band = the ring on each engine; `tail` picks the fin pattern drawn in runway-view.js.
 */
export const LIVERIES = [
  { id: "skyblue", name: "스카이블루 에어", title: "SKY BLUE AIR", tagline: "하늘색 동체, 은빛 배, 소용돌이 꼬리", tail: "swirl",
    colors: { body: "#a8d3ee", belly: "#c4c9cd", cheat: null, stripe: "#f4f6f8", tail: "#f6f7f4", accent: "#d8323c", accent2: "#1f4e9c", rudder: "#f6f7f4", engine: "#a8d3ee", band: "#7db6dc", winglet: "#a8d3ee", title: "#1f4e9c" } },
  { id: "midnight", name: "미드나잇 메탈릭", title: "MIDNIGHT AIR", tagline: "흰 동체에 짙은 메탈릭 네이비", tail: "sweep", metal: true,
    colors: { body: "#f6f7f4", belly: "#eceff1", cheat: "#1c2a4c", stripe: null, tail: "#1c2a4c", accent: "#6f83a8", accent2: "#c9d2e0", rudder: "#1c2a4c", engine: "#1c2a4c", band: "#9eabc2", winglet: "#1c2a4c", title: "#1c2a4c" } },
  { id: "saekdong", name: "색동 스트라이프", title: "SAEKDONG AIR", tagline: "회색·흰색 동체, 무지개 색동 꼬리", tail: "stripes",
    colors: { body: "#eef0f1", belly: "#b8bec3", cheat: null, stripe: "#9aa2a8", tail: "#eef0f1", accent: "#d93a3a", accent2: "#2f5fb3", accent3: "#f2c230", accent4: "#3d9a5a", accent5: "#9aa2a8", rudder: "#eef0f1", engine: "#c6cbcf", band: "#2f5fb3", winglet: "#2f5fb3", title: "#5b6670" } },
  { id: "tangerine", name: "탠저린 제트", title: "TANGERINE JET", tagline: "선명한 주황 꼬리와 엔진", tail: "slant",
    colors: { body: "#f6f7f4", belly: "#ff7a1a", cheat: null, stripe: "#ff7a1a", tail: "#ff7a1a", accent: "#ffa253", accent2: "#f6f7f4", rudder: "#ff7a1a", engine: "#ff7a1a", band: "#f6f7f4", winglet: "#ff7a1a", title: "#ff7a1a" } },
  { id: "butterfly", name: "버터플라이 옐로", title: "BUTTERFLY AIR", tagline: "노란 꼬리에 청록 날개 무늬", tail: "wing",
    colors: { body: "#f6f7f4", belly: "#eef1f2", cheat: null, stripe: null, tail: "#ffd21f", accent: "#14897e", accent2: "#5cbf6a", rudder: "#ffd21f", engine: "#ffd21f", band: "#14897e", winglet: "#ffd21f", title: "#14897e" } },
  { id: "crimson", name: "크림슨 웨이", title: "CRIMSON WAY", tagline: "빨간 꼬리를 가로지르는 흰 줄", tail: "band",
    colors: { body: "#f6f7f4", belly: "#e9ecef", cheat: null, stripe: "#c8102e", tail: "#c8102e", accent: "#f6f7f4", rudder: "#c8102e", engine: "#c8102e", band: "#f6f7f4", winglet: "#c8102e", title: "#c8102e" } },
  { id: "ocean", name: "오션 브리즈", title: "OCEAN BREEZE", tagline: "하늘빛 물결 꼬리, 청록 엔진", tail: "waves",
    colors: { body: "#f6f7f4", belly: "#e6eef2", cheat: null, stripe: "#3bb8e0", tail: "#7ed6ee", accent: "#3bb8e0", accent2: "#1f86b8", rudder: "#7ed6ee", engine: "#1e8a9a", band: "#3bb8e0", winglet: "#3bb8e0", title: "#1f86b8" } },
  { id: "ssun", name: "쑨에어 클래식", title: "SSUN AIR", tagline: "초록과 금빛, 해와 S 꼬리", tail: "sun",
    colors: { body: "#f6f7f4", belly: "#f6f7f4", cheat: "#2f6b52", stripe: "#f6d24a", tail: "#2f6b52", accent: "#f6d24a", accent2: "#e8b828", rudder: "#f2b632", engine: "#f6f7f4", band: "#2f6b52", winglet: "#2f6b52", title: "#2f6b52" } },
];
export const DEFAULT_LIVERY = "ssun";
export const LIVERY_KEY = "ssunplay.runway.livery";
/** The livery for a stored id, falling back to the classic Ssun Air scheme for anything unknown. */
export const getLivery = (id) => LIVERIES.find((l) => l.id === id) ?? LIVERIES.find((l) => l.id === DEFAULT_LIVERY);

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Headwind and crosswind (positive = from the right) in knots. */
export function windComponents(dir, speed, heading = RWY.heading) {
  const a = (dir - heading) * DEG;
  return { head: speed * Math.cos(a), cross: speed * Math.sin(a) };
}
export const formatWind = (dir, speed) => `${String(Math.round(dir) % 360 || 360).padStart(3, "0")}/${String(Math.round(speed)).padStart(2, "0")}KT`;
/** A random wind that blows from ahead of the runway, so it is a headwind plus a crosswind of at most `maxCross` kt. */
export function makeWind(rand, min = 6, max = 16, maxCross = MAX_CROSS) {
  const side = rand() < 0.5 ? -1 : 1,
    dir = Math.round((RWY.heading + side * (25 + rand() * 60) + 360) % 360 / 10) * 10 || 360,
    sin = Math.abs(Math.sin((dir - RWY.heading) * DEG)),
    speed = Math.min(Math.round(min + rand() * (max - min)), Math.floor(maxCross / Math.max(sin, 0.01)));
  return { dir, speed, ...windComponents(dir, speed) };
}
/** PAPI: true = white. Two white and two red means on the 3° path. */
export const papiLights = (angle) => PAPI_ANGLES.map((a) => angle > a);
export function glideslopeDots(x, h) {
  const d = RWY.aim - x;
  if (d < 30) return 0;
  return clamp((Math.atan2(h, d) / DEG - RWY.gs) / 0.35, -2.5, 2.5);
}
export function localizerDots(x, z) {
  return clamp(Math.atan2(z, RWY.length + 300 - x) / DEG / 0.86, -2.5, 2.5);
}
export function landingGrade(fpm, crashed = false) {
  if (crashed || fpm >= SINK_GRADES.crash) return "crash";
  if (fpm < SINK_GRADES.butter) return "butter";
  if (fpm < SINK_GRADES.good) return "good";
  if (fpm < SINK_GRADES.firm) return "firm";
  return "hard";
}
const part = (max, err, free, span) => Math.round(max * clamp(1 - Math.max(0, err - free) / span, 0, 1));
/** Takeoff out of 100: rotation timing 50, climb pitch 30, speed at 300 ft 20. */
export function scoreTakeoff({ rotateKt, climbPitch, endKt, failed = null }) {
  if (failed) return { value: 0, rotation: 0, pitch: 0, speed: 0 };
  // an early rotation (down to VR-10) costs half as much as a late one
  const early = rotateKt < V_SPEEDS.vr, rotErr = early ? (V_SPEEDS.vr - rotateKt) / 2 : rotateKt - V_SPEEDS.vr,
    rotation = part(50, rotErr, 3, 13),
    pitch = part(30, Math.abs(climbPitch - 15), 1.5, 8),
    speed = part(20, Math.abs(endKt - (V_SPEEDS.v2 + 10)), 5, 20);
  return { value: rotation + pitch + speed, rotation, pitch, speed };
}
/** Landing out of 100: sink rate 45, centreline 30, distance from the aiming point 25. */
export function scoreLanding({ fpm, centerline, distance, crashed = false, goAround = false }) {
  const grade = goAround ? "goaround" : landingGrade(fpm, crashed);
  if (grade === "crash" || grade === "goaround") return { value: 0, grade, sink: 0, line: 0, zone: 0 };
  const sink = part(45, fpm, SINK_GRADES.butter, 800),
    line = part(30, Math.abs(centerline), 1, 14),
    zone = part(25, Math.abs(distance), 60, 540);
  return { value: sink + line + zone, grade, sink, line, zone };
}
/** Hold-button drag (px, +y = down) to stick: drag down = pull back (nose up), sideways = roll.
 * Each axis has its own deadzone and is proportional out to the radius; the knob is clamped to a circle. */
export function holdStick(dx, dy, radius = HOLD.radius, dead = HOLD.dead) {
  const axis = (v) => Math.sign(v) * clamp((Math.abs(v) - dead) / (radius - dead), 0, 1),
    len = Math.hypot(dx, dy), k = len > radius ? radius / len : 1;
  return { pitch: axis(dy), roll: axis(dx), x: dx * k, y: dy * k, angle: Math.atan2(dy, dx), active: len > dead };
}
/** The little label beside the knob, e.g. "기수↑ · 기울기 ▶". */
export function holdLabel({ pitch, roll }, min = 0.15) {
  const parts = [];
  if (pitch > min) parts.push(HOLD_LABELS.up);
  if (pitch < -min) parts.push(HOLD_LABELS.down);
  if (roll < -min) parts.push(HOLD_LABELS.left);
  if (roll > min) parts.push(HOLD_LABELS.right);
  return parts.join(" · ");
}
/** Where the thrust goes when the hold button is let go: idle on the ground before liftoff, else the setting from before. */
/** Climb-out keeps at least climb thrust so letting go after liftoff never stalls the jet. */
export const releaseThrottle = ({ grounded, prev, climb = false }) => (grounded ? 0 : clamp(climb ? Math.max(prev, 0.85) : prev, 0, 1));
export const totalScore = (takeoff, landing) => Math.round((takeoff || 0) * 0.4 + (landing || 0) * 0.6);
/** Load factor from the lift curve; flaps set the reference speed. */
const liftFactor = (v, alpha, vref) => (v / (vref * KT)) ** 2 * (0.45 + 0.1 * alpha);
const dragOf = (v, alpha) => 0.00025 * v * v + 0.06 * Math.max(0, alpha);

export class RunwayGame {
  constructor(seed = (Math.random() * 1e9) | 0, { stage = "takeoff", assist = true } = {}) {
    this.seed = seed;
    this.rand = rng(seed);
    this.windTO = makeWind(this.rand, 4, 10, 6);
    this.windLDG = makeWind(this.rand, 6, 14);
    this.gustPhase = this.rand() * 10;
    this.assist = assist;
    this.input = { pitch: 0, roll: 0, throttle: 0 };
    this.boost = null; // hold-to-accelerate: { prev } while held
    this.thrustBack = null; // thrust the throttle eases back to after the hold is released
    // what the control surfaces are doing (-1..1), including the assist; drives the 3D ailerons and elevator
    this.ctl = { pitch: 0, roll: 0 };
    // assist state for the HUD: which axes it is flying, and +1/-1 when the speed wants more or less thrust
    this.assistInfo = { pitch: false, roll: false, thr: 0 };
    this.events = [];
    this.takeoff = null;
    this.landing = null;
    this.result = null;
    this.clock = 0;
    if (stage === "landing") this.setupLanding();
    else this.setupTakeoff();
  }
  get wind() { return this.stage === "landing" ? this.windLDG : this.windTO; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  setupTakeoff() {
    this.boost = null;
    this.thrustBack = null;
    this.stage = "takeoff";
    this.phase = "ready";
    this.t = 0;
    this.throttle = 0;
    this.ac = { x: 1150, h: 0, z: 0, v: 0, vy: 0, pitch: 0, bank: 0, psi: 0, ground: true, gear: true };
    this.pitchRate = 0;
    this.track = { rotateKt: null, liftoffKt: null, pitchSum: 0, pitchT: 0, maxGroundPitch: 0, early: 0 };
    this.said = new Set();
  }
  setupLanding() {
    this.boost = null;
    this.thrustBack = null;
    this.stage = "landing";
    this.phase = "ready";
    this.t = 0;
    const w = this.windLDG, d = 2800, v = (VAPP + 5) * KT,
      alpha = ((VREF_LDG * KT / v) ** 2 - 0.45) / 0.1,
      gamma = -RWY.gs * DEG,
      thrust = dragOf(v, alpha) + G * Math.sin(gamma);
    this.throttle = clamp(thrust / MAX_THRUST, 0, 1);
    this.ac = {
      x: RWY.aim - d, h: d * Math.tan(gamma * -1), z: (this.rand() - 0.5) * 40,
      v, vy: v * Math.sin(gamma), pitch: alpha + gamma / DEG, bank: 0,
      psi: Math.asin(clamp((w.cross * KT) / v, -0.5, 0.5)), ground: false, gear: true,
    };
    this.pitchRate = 0;
    this.track = { unstable: 0, h0: this.ac.h, touchdown: null, roll: 0 };
    this.said = new Set();
  }
  /** ready → flying; in the takeoff the tower clears you and you push the thrust levers. */
  start() {
    if (this.phase !== "ready") return false;
    this.phase = "fly";
    const w = this.wind, wind = `wind ${String(w.dir).padStart(3, "0")} at ${w.speed}`;
    if (this.stage === "takeoff")
      this.emit("atc", { en: `${CALLSIGN}, Gimpo Tower, ${wind}, runway ${RWY.id} cleared for takeoff.`, ko: "김포타워: 활주로 14R 이륙 허가" });
    else
      this.emit("atc", { en: `${CALLSIGN}, Gimpo Tower, ${wind}, runway ${RWY.id} cleared to land.`, ko: "김포타워: 활주로 14R 착륙 허가" });
    return true;
  }
  /** Move on to the approach after a takeoff (or skip the takeoff from the start). */
  nextStage() {
    if (this.stage !== "takeoff" || !["ready", "clear", "result"].includes(this.phase)) return false;
    this.result = null;
    this.setupLanding();
    return true;
  }
  pause() {
    if (["paused", "result"].includes(this.phase)) return;
    this.previousPhase = this.phase;
    this.phase = "paused";
  }
  resume() {
    if (this.phase === "paused") this.phase = this.previousPhase || "fly";
  }
  setInput(pitch = 0, roll = 0, throttle = 0) {
    this.input.pitch = clamp(pitch, -1, 1);
    this.input.roll = clamp(roll, -1, 1);
    this.input.throttle = clamp(throttle, -1, 1);
  }
  setThrottle(v) { this.throttle = clamp(v, 0, 1); }
  /** Hold-to-accelerate: while held the thrust ramps to full; on release it returns to idle (on the ground before
   * liftoff) or to the setting from before the hold (in the air). */
  holdThrust(on) {
    if (on) {
      if (!this.boost) this.boost = { prev: this.thrustBack ?? this.throttle };
      this.thrustBack = null;
      return;
    }
    if (!this.boost) return;
    const grounded = this.stage === "takeoff" && this.ac.ground && this.track.liftoffKt == null;
    this.thrustBack = releaseThrottle({ grounded, prev: this.boost.prev, climb: this.stage === "takeoff" && !grounded });
    this.boost = null;
  }
  /** Throttle levers: `rate` from the THR inputs, plus the hold button ramp or the ease back after it. */
  driveThrottle(rate, dt) {
    let v = this.throttle + rate * dt;
    if (this.boost) v += HOLD.ramp * dt;
    else if (this.thrustBack != null) {
      if (this.input.throttle) this.thrustBack = null; // the levers take over
      else {
        const gap = this.thrustBack - this.throttle;
        if (Math.abs(gap) <= HOLD.back * dt) { v = this.thrustBack; this.thrustBack = null; }
        else v = this.throttle + Math.sign(gap) * HOLD.back * dt;
      }
    }
    this.throttle = clamp(v, 0, 1);
  }
  get ias() { return this.ac.v / KT; }
  get altFt() { return this.ac.h / FT; }
  get fpm() { return (this.ac.vy / FT) * 60; }
  get gsDots() { return glideslopeDots(this.ac.x, this.ac.h + EYE); }
  get locDots() { return localizerDots(this.ac.x, this.ac.z); }
  get papiAngle() { return Math.atan2(this.ac.h + EYE, Math.max(1, RWY.papiX - this.ac.x)) / DEG; }
  get papi() { return papiLights(this.papiAngle); }
  get crab() { return this.ac.psi / DEG; }
  callout(id, text = id) {
    if (this.said.has(id)) return;
    this.said.add(id);
    this.emit("callout", { id, text });
  }
  update(dt) {
    if (["clear", "result"].includes(this.phase)) return this.afterglow(Math.min(dt, 0.1));
    if (this.phase !== "fly" && this.phase !== "roll") return;
    let left = Math.min(dt, 0.25);
    while (left > 1e-9 && (this.phase === "fly" || this.phase === "roll")) {
      const h = Math.min(1 / 120, left);
      left -= h;
      this.clock += h;
      this.t += h;
      if (this.stage === "takeoff") this.stepTakeoff(h);
      else this.stepLanding(h);
    }
  }
  /** Scenery-only motion once the outcome is decided: climb away, or roll to a stop. */
  afterglow(dt) {
    const a = this.ac, why = this.landing?.reason ?? this.takeoff?.reason;
    this.clock += dt;
    this.ctl.pitch *= Math.exp(-dt * 3);
    this.ctl.roll *= Math.exp(-dt * 3);
    if (this.phase === "clear" || why === "goaround") {
      this.throttle = 1;
      a.pitch += clamp(15 - a.pitch, -3 * dt, 3 * dt);
      a.bank *= Math.exp(-dt * 2);
      a.gear = this.phase === "clear" ? false : a.gear;
      a.vy += clamp(a.v * Math.sin((a.pitch - 7) * DEG) - a.vy, -3 * dt, 3 * dt);
      a.h += a.vy * dt;
      a.x += a.v * dt;
      return;
    }
    a.vy = a.h > 0 ? a.vy - G * dt : 0;
    a.h = Math.max(0, a.h + a.vy * dt);
    a.v = Math.max(0, a.v - (why ? 9 : 2.6) * dt);
    a.x += a.v * dt;
    if (a.h === 0) a.pitch = Math.max(0, a.pitch - 3 * dt);
  }
  /** Pitch rate follows the command with a short lag (pitch damping), so taps don't jerk the nose. */
  pitchControl(dt, authority = 1, assist = null) {
    const a = this.ac, manual = Math.abs(this.input.pitch) > 0.02 || assist == null;
    const cmd = manual ? this.input.pitch : clamp(assist, -1, 1);
    this.assistInfo.pitch = !manual;
    this.ctl.pitch = cmd;
    this.pitchRate += (cmd * PITCH_RATE * authority - this.pitchRate) * (1 - Math.exp(-dt * PITCH_LAG));
    a.pitch = clamp(a.pitch + this.pitchRate * dt, -10, 30);
  }
  /** Assist: the pitch command that gently steers the climb rate onto `wantVs` (m/s). */
  vsAssist(wantVs) { return this.assist ? clamp((wantVs - this.ac.vy) * 0.14, -0.3, 0.3) : null; }
  fly(dt, vref) {
    // shared airborne dynamics; returns the angle of attack
    const a = this.ac, w = this.wind,
      gamma = Math.atan2(a.vy, a.v), alpha = a.pitch - gamma / DEG;
    let n = liftFactor(a.v, Math.min(alpha, 15), vref);
    if (alpha > 15) n *= Math.max(0.3, 1 - (alpha - 15) * 0.15);
    if (a.h < 6) n *= 1 + 0.01 * (1 - a.h / 6); // a hint of ground effect
    const gust = (Math.sin(this.clock * 1.3 + this.gustPhase) + Math.sin(this.clock * 3.1 + this.gustPhase * 2) * 0.5) * w.speed * 0.012;
    a.vy += (G * (n * Math.cos(a.bank * DEG) - 1) + gust) * dt;
    a.v += (this.throttle * MAX_THRUST - dragOf(a.v, alpha) - G * Math.sin(gamma)) * dt;
    a.v = Math.max(20, a.v);
    a.h += a.vy * dt;
    a.x += (a.v * Math.cos(gamma) * Math.cos(a.psi) - w.head * KT) * dt;
    return alpha;
  }
  stepTakeoff(dt) {
    const a = this.ac, tr = this.track, kt = a.v / KT;
    this.driveThrottle(this.input.throttle * 0.55, dt);
    if (this.throttle > 0.9) this.callout("thrust", "THRUST SET");
    this.ctl.roll = this.input.roll;
    if (a.ground) {
      this.pitchControl(dt, clamp((kt / 110) ** 2, 0, 1));
      if (this.input.pitch <= 0) a.pitch -= 1.2 * dt;
      if (a.pitch <= 0) this.pitchRate = Math.max(0, this.pitchRate); // the nose wheel stops a push
      a.pitch = Math.max(0, a.pitch);
      const n = liftFactor(a.v, a.pitch, VREF_TO);
      a.v = Math.max(0, a.v + (this.throttle * MAX_THRUST - dragOf(a.v, a.pitch) - (a.v > 0.5 ? 0.15 : 0)) * dt);
      a.x += a.v * dt;
      tr.maxGroundPitch = Math.max(tr.maxGroundPitch, a.pitch);
      if (kt >= 80) this.callout("80", "80 KNOTS");
      if (kt >= V_SPEEDS.v1) this.callout("v1", "V1");
      if (kt >= V_SPEEDS.vr) this.callout("vr", "ROTATE");
      if (tr.rotateKt == null && a.pitch > 1) tr.rotateKt = kt;
      if (a.pitch >= 4 && tr.rotateKt < V_SPEEDS.vr - ROTATE_EARLY - 8) {
        tr.early += dt;
        if (tr.early > 0.2) this.emit("warn", { id: "early", text: "TOO EARLY" });
        if (tr.early > 1.2) return this.failTakeoff("early");
      } else tr.early = Math.max(0, tr.early - dt);
      if (a.pitch > TAIL_LIMIT) return this.failTakeoff("tailstrike");
      if (a.x > RWY.length) return this.failTakeoff("overrun");
      if (n > 1) {
        a.ground = false;
        tr.liftoffKt = kt;
        a.vy = 0.2;
        this.emit("liftoff");
      }
      return;
    }
    // assist: ease the nose toward the 15° climb attitude when the stick is let go
    this.pitchControl(dt, 1, this.assist ? clamp((15 - a.pitch) / 6, -0.35, 0.35) : null);
    const alpha = this.fly(dt, VREF_TO);
    if (a.h < 3 && a.pitch > TAIL_LIMIT + Math.atan2(Math.max(0, a.h), 18) / DEG) return this.failTakeoff("tailstrike");
    if (alpha > 19) return this.failTakeoff("stall");
    tr.pitchSum += a.pitch * dt;
    tr.pitchT += dt;
    if (a.vy > 1.5 && a.h > 10) this.callout("positive", "POSITIVE RATE");
    if (a.h > 25 && a.gear) { a.gear = false; this.callout("gear", "GEAR UP"); }
    if (a.h <= 0) {
      if (a.vy < -2) return this.failTakeoff("sink");
      a.h = 0; a.vy = 0; a.ground = true;
    }
    if (a.x > RWY.length && a.h < 35 * FT) return this.failTakeoff("overrun"); // the 35 ft screen height at the runway end
    if (a.h >= CLIMB_DONE) {
      const climbPitch = tr.pitchT ? tr.pitchSum / tr.pitchT : a.pitch;
      this.takeoff = { ok: true, rotateKt: Math.round(tr.rotateKt ?? kt), liftoffKt: Math.round(tr.liftoffKt ?? kt), climbPitch: +climbPitch.toFixed(1), endKt: Math.round(kt), maxGroundPitch: +tr.maxGroundPitch.toFixed(1), ...scoreTakeoff({ rotateKt: tr.rotateKt ?? kt, climbPitch, endKt: kt }) };
      this.phase = "clear";
      this.emit("atc", { en: `${CALLSIGN}, contact Seoul Departure. Good day.`, ko: "서울 출발관제와 교신하세요" });
      this.emit("stage", { stage: "takeoff", ok: true });
    }
  }
  failTakeoff(reason) {
    const a = this.ac;
    this.takeoff = { ok: false, reason, rotateKt: Math.round(this.track.rotateKt ?? a.v / KT), endKt: Math.round(a.v / KT), maxGroundPitch: +this.track.maxGroundPitch.toFixed(1), ...scoreTakeoff({ failed: reason }) };
    a.v *= reason === "overrun" ? 0.5 : 0.85;
    this.phase = "result";
    this.result = this.makeResult();
    this.emit("fail", { stage: "takeoff", reason });
    this.emit("atc", { en: `${CALLSIGN}, stop immediately. Emergency vehicles rolling.`, ko: "즉시 정지하세요. 소방차 출동" });
  }
  stepLanding(dt) {
    const a = this.ac, tr = this.track;
    if (this.phase === "roll") return this.rollout(dt);
    const w = this.windLDG, ft0 = a.h / FT, kt0 = a.v / KT;
    this.driveThrottle(this.input.throttle * 0.4, dt);
    // assist: a gentle auto-throttle toward VAPP above 50 ft, and a hint when the speed is off
    this.assistInfo.thr = ft0 > 50 && Math.abs(kt0 - VAPP) > 6 ? Math.sign(VAPP - kt0) : 0;
    if (this.assist && !this.input.throttle && !this.boost && this.thrustBack == null && ft0 > 50) this.throttle = clamp(this.throttle + clamp((VAPP - kt0) * 0.01, -0.06, 0.06) * dt, 0, 1);
    // assist: RETARD below 25 ft, so the levers reach idle in the flare without a keyboard
    if (this.assist && !this.input.throttle && !this.boost && ft0 < RETARD_FT) {
      this.thrustBack = null;
      this.throttle = Math.max(0, this.throttle - HOLD.back * dt);
    }
    // assist: above 60 ft, nudge the descent onto the glideslope; the flare is left to the pilot
    this.pitchControl(dt, 1, ft0 > 60 ? this.vsAssist(-a.v * Math.tan(RWY.gs * DEG) - this.gsDots * 1.2) : null);
    const bank0 = a.bank, manualRoll = Math.abs(this.input.roll) > 0.02 || !this.assist;
    let target = this.input.roll * 25, rate = this.input.roll ? 1 : 0.7;
    if (!manualRoll) {
      // assist: slowly level the wings, holding a small bank that crabs into the wind and drifts back to the centreline
      const crab = Math.asin(clamp((w.cross * KT) / a.v, -0.5, 0.5)), wantPsi = crab + clamp(-a.z * 0.0025, -0.05, 0.05);
      target = ft0 > 30 ? clamp((wantPsi - a.psi) * 150, -ASSIST_BANK, ASSIST_BANK) : 0;
      rate = ASSIST_LEVEL;
    }
    this.assistInfo.roll = !manualRoll;
    a.bank += clamp(target - a.bank, -15 * dt, 15 * dt) * rate;
    a.bank = clamp(a.bank, -30, 30);
    this.ctl.roll = clamp((a.bank - bank0) / (15 * dt) + (target - a.bank) / 40, -1, 1);
    a.psi = clamp(a.psi + (G * Math.tan(a.bank * DEG)) / a.v * dt, -0.6, 0.6);
    const sway = Math.sin(this.clock * 0.7 + this.gustPhase) * w.speed * 0.02;
    a.z += (a.v * Math.sin(a.psi) - (w.cross + sway) * KT) * dt;
    const alpha = this.fly(dt, VREF_LDG);
    const ft = a.h / FT, kt = a.v / KT;
    for (const c of [400, 300, 200, 100, 50, 40, 30, 20, 10]) if (ft <= c && ft > c - 30) this.callout("r" + c, String(c));
    if (ft < RETARD_FT && this.throttle > 0.05) this.callout("retard", "RETARD");
    if (ft < 1000 && this.fpm < -1300 && ft > 30) this.emit("warn", { id: "sink", text: "SINK RATE" });
    if (ft > 50 && ft < 1000 && this.gsDots < -1.3) this.emit("warn", { id: "gs", text: "GLIDESLOPE" });
    if (alpha > 17) return this.endLanding({ crashed: true, reason: "stall" });
    // a stabilised approach is required below 400 ft or the tower sends you around
    const unstable = ft < 400 && ft > 60 && (Math.abs(this.gsDots) > 1.8 || Math.abs(this.locDots) > 1.8 || kt < VAPP - 18 || kt > VAPP + 28 || this.fpm < -1600);
    tr.unstable = unstable ? tr.unstable + dt : Math.max(0, tr.unstable - dt * 0.5);
    if (tr.unstable > 0.6) this.emit("warn", { id: "unstable", text: "UNSTABLE" });
    if ((tr.unstable > 4.5 && this.fpm > -2500) || a.h > tr.h0 + 120 || (a.x > RWY.length - 500 && a.h > 3)) return this.goAround();
    if (a.h <= 0) this.touchdown();
  }
  touchdown() {
    const a = this.ac, fpm = Math.max(0, -this.fpm), line = a.z, distance = a.x - RWY.aim;
    let reason = null;
    if (a.x < 0) reason = "short";
    else if (Math.abs(a.z) > RWY.width / 2) reason = "excursion";
    else if (Math.abs(a.bank) > 8) reason = "wingstrike";
    else if (a.pitch > TAIL_LIMIT) reason = "tailstrike";
    else if (a.pitch < -1) reason = "nosegear";
    else if (fpm >= SINK_GRADES.crash) reason = "hard";
    a.h = 0;
    this.track.touchdown = { fpm: Math.round(fpm), centerline: +line.toFixed(1), distance: Math.round(distance), x: Math.round(a.x), ias: Math.round(a.v / KT), pitch: +a.pitch.toFixed(1), bank: +a.bank.toFixed(1), crab: +(a.psi / DEG).toFixed(1) };
    if (reason) return this.endLanding({ crashed: true, reason });
    a.vy = 0;
    a.ground = true;
    this.phase = "roll";
    this.track.roll = 0;
    this.emit("touchdown", { fpm: Math.round(fpm) });
  }
  rollout(dt) {
    const a = this.ac;
    this.throttle = 0;
    this.ctl.pitch = this.input.pitch;
    this.ctl.roll = this.input.roll;
    a.v = Math.max(8, a.v - 2.6 * dt);
    a.x += a.v * dt;
    a.psi *= Math.exp(-dt * 3);
    a.bank *= Math.exp(-dt * 5);
    a.pitch = Math.max(0, a.pitch - 2.2 * dt);
    a.z += a.v * Math.sin(a.psi) * dt;
    this.track.roll += dt;
    if (this.track.roll > 3.2 || a.x > RWY.length - 50) this.endLanding({});
  }
  goAround() {
    this.emit("atc", { en: `${CALLSIGN}, go around, I say again, go around.`, ko: "복행하세요! 다시 한 번, 복행" });
    this.endLanding({ goAround: true, reason: "goaround" });
  }
  endLanding({ crashed = false, goAround = false, reason = null }) {
    const td = this.track.touchdown || { fpm: Math.round(Math.max(0, -this.fpm)), centerline: +this.ac.z.toFixed(1), distance: Math.round(this.ac.x - RWY.aim), x: Math.round(this.ac.x) };
    this.landing = { ...td, reason, ...scoreLanding({ fpm: td.fpm, centerline: td.centerline, distance: td.distance, crashed, goAround }) };
    this.phase = "result";
    if (crashed) { this.ac.v *= 0.4; this.ac.h = Math.max(0, this.ac.h); }
    this.result = this.makeResult();
    if (crashed) this.emit("atc", { en: `${CALLSIGN}... Gimpo Tower, crash alarm, crash alarm!`, ko: "비상! 소방차 출동" });
    else if (!goAround) this.emit("atc", { en: `${CALLSIGN}, welcome to Gimpo. Vacate right when able.`, ko: "김포에 오신 것을 환영합니다" });
    this.emit("stage", { stage: "landing", ok: !crashed && !goAround });
  }
  makeResult() {
    const to = this.takeoff?.value ?? null, ld = this.landing?.value ?? null;
    const both = this.takeoff && this.landing;
    return {
      kind: "runway",
      takeoff: this.takeoff,
      landing: this.landing,
      value: both ? totalScore(to, ld) : this.landing ? ld : to ?? 0,
      complete: !!both,
    };
  }
}
