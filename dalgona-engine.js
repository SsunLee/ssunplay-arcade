import { clamp, rng } from './engine.js';

// A street-stall honeycomb toffee: melt the sugar, puff it with soda, press it flat,
// then trace the stamped outline with a needle without letting a crack run inside.
export const SHAPES = [
  { id:'heart', name:'하트', level:1, time:75, safe:.62 },
  { id:'flower', name:'꽃', level:2, time:80, safe:.56 },
  { id:'bear', name:'곰돌이', level:3, time:85, safe:.52 },
  { id:'star', name:'별', level:4, time:85, safe:.47 },
];
export const MAKE_STEPS = ['melt', 'soda', 'press'];
export const MELT_GOLD = [.78, .95];
export const PUFF_GOLD = [.62, .86];
export const PRESS_GOLD = [.6, .8];
export const TOL = .055;          // how close the needle must pass to scratch the groove
export const SAFE_SPEED = .55;    // candy units per second a typical toffee tolerates; each shape sets its own
export const SECTORS = 12;
export const MAX_CHIPS = 3;
const N = 180;

const TAU = Math.PI * 2;
function polygonRadial(pts) {
  return a => {
    const dx = Math.cos(a), dy = Math.sin(a); let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], ex = q[0] - p[0], ey = q[1] - p[1];
      const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
      const t = (p[0] * ey - p[1] * ex) / den, u = (p[0] * dy - p[1] * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t);
    }
    return best;
  };
}
const heartPts = Array.from({ length:240 }, (_, i) => { const t = i / 240 * TAU, s = .62 / 17; return [16 * Math.sin(t) ** 3 * s, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.6) * s]; });
const starPts = Array.from({ length:10 }, (_, i) => { const a = Math.PI / 2 + i / 10 * TAU, r = i % 2 ? .29 : .64; return [Math.cos(a) * r, Math.sin(a) * r]; });
const circles = [[0, -.06, .43], [-.34, .3, .17], [.34, .3, .17]];
const RADIAL = {
  heart:polygonRadial(heartPts),
  flower:a => .5 + .14 * Math.cos(5 * (a - Math.PI / 2)),
  star:polygonRadial(starPts),
  bear:a => {
    const dx = Math.cos(a), dy = Math.sin(a); let best = 0;
    for (const [cx, cy, r] of circles) { const b = dx * cx + dy * cy, c = cx * cx + cy * cy - r * r, d = b * b - c; if (d >= 0) best = Math.max(best, b + Math.sqrt(d)); }
    return best;
  },
};
// The outline, resampled evenly along its length; every sample remembers its angle.
export function outline(id) {
  const r = RADIAL[id], dense = [];
  for (let i = 0; i < 1440; i++) { const a = i / 1440 * TAU, rr = r(a); dense.push({ x:Math.cos(a) * rr, y:Math.sin(a) * rr, a }); }
  const len = [0]; for (let i = 1; i <= dense.length; i++) { const p = dense[i - 1], q = dense[i % dense.length]; len.push(len[i - 1] + Math.hypot(q.x - p.x, q.y - p.y)); }
  const total = len.at(-1), out = []; let j = 0;
  for (let k = 0; k < N; k++) { const s = k / N * total; while (len[j + 1] < s) j++; const p = dense[j], q = dense[(j + 1) % dense.length], f = (s - len[j]) / (len[j + 1] - len[j] || 1); out.push({ x:p.x + (q.x - p.x) * f, y:p.y + (q.y - p.y) * f, a:Math.atan2(p.y + (q.y - p.y) * f, p.x + (q.x - p.x) * f) }); }
  return { points:out, radial:r, length:total };
}
export const sectorOf = a => Math.floor(((a % TAU) + TAU) % TAU / TAU * SECTORS) % SECTORS;
const inGold = (v, [lo, hi]) => v >= lo && v <= hi;
const gradeOf = (v, [lo, hi], slack) => inGold(v, [lo, hi]) ? 'perfect' : v >= lo - slack && v <= hi + slack ? 'good' : 'bad';

export class DalgonaGame {
  constructor(seed = Date.now()) {
    this.random = rng(seed);
    this.shape = SHAPES[0];
    this.phase = 'pick'; this.state = 'intro'; this.stateTime = 0; this.clock = 0;
    this.events = []; this.result = null;
    this.reset();
  }
  reset() {
    this.make = { melt:0, lumps:0, onFire:false, stir:0, soda:false, puff:0, still:0, press:0, pressing:false, burnt:false, grades:{} };
    const o = outline(this.shape.id);
    this.path = o.points; this.radial = o.radial; this.sectors = o.points.map(p => sectorOf(p.a));
    this.carve = { progress:new Float32Array(N), popped:new Array(SECTORS).fill(false), needle:null, down:false, tension:0, chips:0, scratch:0, cracks:[], licks:3, wet:0, t:0, brittle:1, rate:1, moved:0 };
  }
  choose(id) { if (this.phase !== 'pick') return false; this.shape = SHAPES.find(s => s.id === id) || SHAPES[0]; this.reset(); return true; }
  start() { if (this.phase !== 'pick') return false; this.reset(); this.enter('melt'); return true; }
  enter(phase) { this.held = false; this.phase = phase; this.state = 'intro'; this.stateTime = 0; this.events.push({ type:'phase', phase }); }
  begin() {
    if (this.state !== 'intro' || this.stateTime < .45 || !['melt', 'soda', 'press', 'carve'].includes(this.phase)) return false;
    this.state = 'play'; this.stateTime = 0; this.events.push({ type:'begin', phase:this.phase });
    return true;
  }
  complete(delay = 1) { this.state = 'done'; this.stateTime = 0; this.doneDelay = delay; }

  // ── making: one press-and-stir gesture drives every step ──
  press(on) {
    const m = this.make; this.held = !!on;
    if (on && this.state === 'intro') { this.begin(); if (this.state !== 'play') return; }
    if (this.state !== 'play') return;
    if (this.phase === 'melt') {
      m.onFire = !!on;
      if (!on && m.melt >= .55) this.finishMelt();
    }
    if (this.phase === 'soda' && on && !m.soda) { m.soda = true; this.events.push({ type:'soda' }); }
    if (this.phase === 'press') { m.pressing = !!on; if (!on && m.press >= .3) this.finishPress(); }
  }
  // distance the finger travelled while stirring (candy units)
  stir(distance) { if (this.state === 'play' && (this.phase === 'melt' || this.phase === 'soda')) this.make.stir += Math.max(0, distance); }
  pressTo(v) { if (this.phase === 'press' && this.state === 'play' && this.make.pressing) this.make.press = clamp(Math.max(this.make.press, v), 0, 1); }
  finishMelt() {
    const m = this.make; m.onFire = false; m.grades.melt = m.burnt ? 'bad' : gradeOf(m.melt, MELT_GOLD, .1);
    this.events.push({ type:'step', step:'melt', grade:m.grades.melt }); this.complete(.9);
  }
  finishSoda() {
    const m = this.make; m.grades.soda = gradeOf(m.puff, PUFF_GOLD, .12);
    this.events.push({ type:'step', step:'soda', grade:m.grades.soda }); this.complete(.9);
  }
  finishPress() {
    const m = this.make; m.pressing = false; m.grades.press = gradeOf(m.press, PRESS_GOLD, .1);
    this.events.push({ type:'step', step:'press', grade:m.grades.press }); this.events.push({ type:'stamp' }); this.complete(1.5);
  }
  // How the candy came out decides how brittle it is and how fast it scratches.
  quality() {
    const m = this.make;
    const off = (v, [lo, hi]) => v < lo ? lo - v : v > hi ? v - hi : 0;
    const brittle = 1 + off(m.melt, MELT_GOLD) * 3.2 + (m.burnt ? .7 : 0) + Math.min(.5, m.lumps * .35) + off(m.puff, PUFF_GOLD) * 2.4 + Math.max(0, m.press - PRESS_GOLD[1]) * 4;
    const rate = 1 - Math.max(0, PRESS_GOLD[0] - m.press) * 1.3;
    const grades = Object.values(m.grades), score = Math.round(grades.reduce((a, g) => a + (g === 'perfect' ? 100 : g === 'good' ? 70 : 30), 0) / Math.max(1, grades.length));
    return { brittle, rate:clamp(rate, .5, 1), score };
  }

  // ── carving: trace the groove; speed and wandering inside build up tension ──
  needle(x, y, down = true) {
    const c = this.carve;
    if (this.phase !== 'carve') return;
    if (down && this.state === 'intro') this.begin();
    if (this.state !== 'play') { c.needle = null; c.down = false; return; }
    if (!down) { c.down = false; c.needle = null; return; }
    if (c.down && c.needle) c.moved += Math.hypot(x - c.needle.x, y - c.needle.y);
    c.needle = { x, y }; c.down = true;
  }
  lick() {
    const c = this.carve;
    if (this.phase !== 'carve' || this.state !== 'play' || c.licks <= 0 || c.wet > 0) return false;
    c.licks--; c.wet = 5; c.tension = Math.max(0, c.tension - .35); this.events.push({ type:'lick', left:c.licks });
    return true;
  }
  lineInfo(x, y) {
    const a = Math.atan2(y, x), r = Math.hypot(x, y), edge = this.radial(a);
    let best = Infinity; for (const p of this.path) best = Math.min(best, Math.hypot(p.x - x, p.y - y));
    return { a, r, edge, dist:best, inside:r < edge - TOL };
  }
  carveUpdate(dt) {
    const c = this.carve;
    c.t += dt; c.wet = Math.max(0, c.wet - dt);
    const moved = c.moved; c.moved = 0;
    const brittle = c.brittle * (1 + c.t / 50) * (c.wet > 0 ? .4 : 1);
    if (c.down && c.needle) {
      const { x, y } = c.needle, info = this.lineInfo(x, y), speed = moved / Math.max(dt, 1e-3);
      if (info.dist < TOL * 1.6) {
        const gain = moved * 5 * c.rate * (c.wet > 0 ? .8 : 1);
        for (let k = 0; k < this.path.length; k++) { const p = this.path[k], d = Math.hypot(p.x - x, p.y - y); if (d < TOL) c.progress[k] = Math.min(1, c.progress[k] + gain * (1 - d / TOL * .5)); }
        c.tension += Math.max(0, speed - this.shape.safe) * 1.3 * brittle * dt;
        if (moved > 0) this.events.push({ type:'scrape', speed });
      } else if (info.inside) {
        // wandering inside the shape mars it
        c.scratch += dt * Math.min(1, speed * 2 + .2); c.tension += (.35 + speed * .8) * brittle * dt;
        if (moved > 0) this.events.push({ type:'scratch', x, y });
      } else c.tension += Math.max(0, speed - this.shape.safe * 1.5) * .5 * brittle * dt;
      if (c.tension >= 1) this.crack(x, y, info);
    }
    c.tension = Math.max(0, c.tension - dt * .55);
    for (let s = 0; s < SECTORS; s++) {
      if (c.popped[s]) continue;
      let done = true; for (let k = 0; k < this.path.length; k++) if (this.sectors[k] === s && c.progress[k] < 1) { done = false; break; }
      if (done) { c.popped[s] = true; this.events.push({ type:'shard', sector:s }); }
    }
    if (c.popped.every(Boolean)) { this.events.push({ type:'free' }); this.finish(true); return; }
    if (c.chips >= MAX_CHIPS) { this.events.push({ type:'snap' }); this.finish(false, 'broken'); return; }
    if (c.t >= this.shape.time) this.finish(false, 'timeout');
  }
  crack(x, y, info) {
    const c = this.carve; c.tension = .3;
    const inward = this.random() < (info.inside ? .75 : info.r < info.edge ? .5 : .25);
    const dir = info.a + (inward ? Math.PI : 0) + (this.random() - .5) * .9, len = .14 + this.random() * .16;
    const crack = { x, y, dir, len, inward }; c.cracks.push(crack);
    if (inward) c.chips++;
    else for (let k = 0; k < this.path.length; k++) { const p = this.path[k]; if (Math.hypot(p.x - x, p.y - y) < .13) c.progress[k] = Math.min(1, c.progress[k] + .45); }
    this.events.push({ type:'crack', ...crack, chips:c.chips });
  }
  progressRatio() { const p = this.carve.progress; let s = 0; for (const v of p) s += v; return s / p.length; }

  pause() { if (['paused', 'pick', 'result'].includes(this.phase)) return; this.previousPhase = this.phase; this.phase = 'paused'; this.held = false; this.make.onFire = this.make.pressing = false; this.carve.down = false; this.carve.needle = null; }
  resume() { if (this.phase === 'paused') this.phase = this.previousPhase; }
  update(dt) {
    if (['paused', 'pick', 'result'].includes(this.phase)) return;
    dt = clamp(dt, 0, .05); this.clock += dt; this.stateTime += dt;
    if (this.state === 'done') {
      if (this.stateTime >= this.doneDelay) {
        const i = MAKE_STEPS.indexOf(this.phase);
        if (i >= 0 && i < MAKE_STEPS.length - 1) this.enter(MAKE_STEPS[i + 1]);
        else if (this.phase === 'press') { const q = this.quality(); this.carve.brittle = q.brittle; this.carve.rate = q.rate; this.enter('carve'); }
      }
      return;
    }
    // a press held through the intro lock still starts the step
    if (this.state === 'intro' && this.held && this.phase !== 'carve' && this.stateTime >= .45) this.press(true);
    if (this.state !== 'play') return;
    // touch events and frames don't line up, so the stirring speed is smoothed
    const m = this.make; m.stirSpeed = (m.stirSpeed || 0) + (m.stir / Math.max(dt, 1e-3) - (m.stirSpeed || 0)) * Math.min(1, dt * 10); m.stir = 0;
    const stirSpeed = m.stirSpeed;
    if (this.phase === 'melt') {
      if (m.onFire) {
        const stirring = stirSpeed > .6;
        m.melt += dt * (stirring ? .2 : .11);
        if (!stirring && m.melt > .3) m.lumps += dt * .5;
        if (m.melt > 1.05 && !m.burnt) { m.burnt = true; this.events.push({ type:'burnt' }); }
      }
      if (m.melt >= 1.3) this.finishMelt();
    }
    if (this.phase === 'soda' && m.soda) {
      if (stirSpeed > .6) { m.puff += dt * Math.min(4, stirSpeed) * .16; m.still = 0; } else if (m.puff > .15) m.still += dt;
      if (m.puff >= 1.15 || m.still > .7) this.finishSoda();
    }
    if (this.phase === 'press' && this.stateTime > 12 && !m.pressing) { m.press = Math.max(m.press, .3); this.finishPress(); }
    if (this.phase === 'carve') this.carveUpdate(dt);
  }
  finish(freed, reason = 'free') {
    const c = this.carve, q = this.quality();
    const integrity = Math.round(clamp(100 - c.chips * 25 - c.scratch * 6, 0, 100)), left = Math.max(0, this.shape.time - c.t);
    const value = freed ? Math.round(integrity * .75 + left / this.shape.time * 25) : Math.round(this.progressRatio() * 35);
    this.result = { game:'dalgona', shape:this.shape.id, freed, reason, value, metric:value, integrity, chips:c.chips, cracks:c.cracks.length, time:Math.round(c.t), left:Math.round(left), licks:3 - c.licks, make:q.score, grades:{ ...this.make.grades }, bonus:freed && value >= 80 };
    this.phase = 'result'; this.state = 'done'; this.events.push({ type:'finish', freed });
  }
}
