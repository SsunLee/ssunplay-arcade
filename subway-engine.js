import { clamp, rng } from './engine.js';

// 지하철 뛰어타기: 부장님 sprints down a three-lane platform and must slip through
// the train's last open door before it closes. Pure state, no DOM: x is across the
// platform (lanes −1/0/1), z runs from the stairs (0) to the open door (LENGTH).
export const LANES = [-1, 0, 1];
export const LANE_W = 1.5;          // metres between lane centres
export const LENGTH = 150;          // stairs to the open door
export const RUNNER_R = .32;        // 부장님's half width
export const BASE_SPEED = 7;        // m/s at a steady jog
export const COMBO_SPEED = .14;     // every clean dodge in a row adds this…
export const MAX_COMBO_SPEED = 2.1; // …up to this much
export const ACCEL = 5.5;           // m/s² back up to running speed
export const LANE_SPEED = 13;       // m/s sideways while changing lanes
export const JUMP_TIME = .62, JUMP_HEIGHT = .72;
export const STUN = .55, STUN_SPEED = 2;   // a bump knocks the pace down for a moment
export const SLIP = .95;                   // spilled coffee: a longer, sillier stumble
export const MAX_BUMPS = 3;                // the third bump floors him
export const CLOSE_AT = 21;                // seconds after GO the doors are shut
export const DOOR_CLOSE = 2;               // the doors take this long to slide shut
export const PASS_OPEN = .15;              // a door narrower than this squeezes him
export const ANNOUNCE_AT = CLOSE_AT - 6;   // the “doors are closing” chime
export const COUNT_TIME = 2.1;             // 3·2·1
export const OUTRO_TIME = 2.4;             // boarding, squish or departure before the card
export const NEAR_MISS = .6;               // margins under this many seconds are a near miss
const STEP = 1 / 120;

// every obstacle: half width, length along the platform, low ones can be jumped,
// walkers move along z once 부장님 gets close
export const KINDS = {
  phone:    { w:.34, len:.55, low:false, vz:-.9, label:'폰만 보는 직장인' },
  ajumma:   { w:.62, len:.75, low:false, vz:.55, sway:.18, label:'장바구니 아주머니' },
  pillar:   { w:.48, len:.9,  low:false, vz:0, label:'기둥' },
  crowd:    { w:.4,  len:.6,  low:false, vz:-.35, label:'계단 인파' },
  coffee:   { w:.6,  len:1.3, low:true,  vz:0, label:'쏟아진 커피' },
  suitcase: { w:.3,  len:.55, low:true,  vz:0, label:'캐리어' },
};
const WAKE = 24; // walkers start moving when 부장님 is this close

export const laneX = lane => lane * LANE_W;

// Rows of obstacles; every row leaves a free lane or can be jumped, and rows are far
// enough apart to change lanes in between.
export function makeCourse(seed = 1) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], out = [], rows = [];
  let z = 16, id = 0;
  const add = (kind, lane, dz = 0) => { const o = { id:id++, kind, lane, x:laneX(lane), z:z + dz, z0:z + dz, phase:r() * 6.28, hit:false, passed:false, ...KINDS[kind] }; out.push(o); return o; };
  while (z < LENGTH - 14) {
    const level = z / LENGTH, roll = r(), lanes = [...LANES], row = { z, lanes:[], jump:false };
    // Fisher–Yates is deterministic across browsers, unlike a random sort comparator.
    for (let i = lanes.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [lanes[i], lanes[j]] = [lanes[j], lanes[i]]; }
    if (roll < .26) { add(pick(['phone', 'phone', 'ajumma', 'pillar']), lanes[0]); row.lanes.push(lanes[0]); }
    else if (roll < .58) {
      // two of three lanes blocked: find the gap
      for (const l of lanes.slice(0, 2)) { add(pick(['phone', 'ajumma', 'pillar', 'crowd']), l, (r() - .5) * .6); row.lanes.push(l); }
    } else if (roll < .74) {
      // a low hazard across the platform: jump it, or use the clear lane if there is one
      const all = level > .35 && r() < .5, ls = all ? LANES : lanes.slice(0, 2);
      for (const l of ls) { add(all ? 'coffee' : pick(['coffee', 'suitcase']), l); row.lanes.push(l); }
      row.jump = all;
    } else if (roll < .88) {
      // the stairs crowd: a wall of commuters with one gap
      for (const l of lanes.slice(0, 2)) { add('crowd', l, (r() - .5) * .4); row.lanes.push(l); }
    } else {
      // a walker and a low bag together: dodge then hop
      add('ajumma', lanes[0]); add('suitcase', lanes[1], 3.2); row.lanes.push(lanes[0]);
    }
    rows.push(row);
    z += 9.2 - level * 2 + r() * 2.6;
  }
  return { obstacles:out, rows };
}

export class SubwayGame {
  constructor(seed = Date.now() % 100000) {
    this.seed = seed; this.events = [];
    this.reset();
  }
  reset() {
    const c = makeCourse(this.seed);
    this.obstacles = c.obstacles; this.rows = c.rows;
    this.events.length = 0;
    this.phase = 'ready'; this.previousPhase = null;
    this.t = 0;            // seconds since GO
    this.clock = 0;        // seconds in the current phase
    this.acc = 0;
    this.lane = 0; this.x = 0; this.z = 0; this.speed = 0;
    this.jumpT = -1; this.y = 0; this.stun = 0; this.slip = 0;
    this.bumps = 0; this.dodges = 0; this.combo = 0; this.bestCombo = 0; this.nearDodges = 0;
    this.lastShift = -9; this.announced = false; this.closing = false;
    this.arrival = null; this.result = null; this.reason = null; this.count = 3;
  }
  // ── input ──
  start() {
    if (this.phase !== 'ready') return false;
    this.phase = 'count'; this.clock = 0; this.count = 3; this.events.push({ type:'count', n:3 });
    return true;
  }
  move(dir) {
    if (!['run', 'count'].includes(this.phase) || this.stun > 0 && this.slip > 0) return false;
    const next = clamp(this.lane + Math.sign(dir), -1, 1);
    if (next === this.lane) { this.events.push({ type:'wall', dir:Math.sign(dir) }); return false; }
    this.lane = next; this.lastShift = this.t; this.events.push({ type:'lane', lane:next });
    return true;
  }
  jump() {
    if (this.phase !== 'run' || this.jumpT >= 0 || this.slip > 0) return false;
    this.jumpT = 0; this.events.push({ type:'jump' });
    return true;
  }
  pause() { if (['paused', 'ready', 'result'].includes(this.phase)) return; this.previousPhase = this.phase; this.phase = 'paused'; }
  resume() { if (this.phase === 'paused') this.phase = this.previousPhase; }

  // ── queries ──
  get remaining() { return Math.max(0, CLOSE_AT - this.t); }
  get airborne() { return this.jumpT >= 0; }
  get progress() { return clamp(this.z / LENGTH, 0, 1); }
  // 1 = wide open, 0 = shut
  doorOpen(t = this.t) { return clamp(1 - (t - (CLOSE_AT - DOOR_CLOSE)) / DOOR_CLOSE, 0, 1); }
  speedCap() { return BASE_SPEED + Math.min(MAX_COMBO_SPEED, this.combo * COMBO_SPEED); }

  update(dt) {
    if (this.phase === 'paused' || this.phase === 'ready' || this.phase === 'result') return;
    this.acc += Math.min(dt, .25);
    while (this.acc >= STEP) { this.acc -= STEP; this.step(STEP); if (this.phase === 'result') { this.acc = 0; break; } }
  }
  step(dt) {
    this.clock += dt;
    if (this.phase === 'count') {
      const n = 3 - Math.floor(this.clock / (COUNT_TIME / 3));
      if (n !== this.count && n > 0) { this.count = n; this.events.push({ type:'count', n }); }
      if (this.clock >= COUNT_TIME) { this.phase = 'run'; this.clock = 0; this.count = 0; this.events.push({ type:'go' }); }
      this.slide(dt);
      return;
    }
    if (this.phase === 'run') return this.run(dt);
    // outro: boarding, squished, departing or flat on the floor
    if (this.phase === 'board') { this.z += this.speed * dt; this.speed = Math.max(0, this.speed - 14 * dt); }
    if (this.phase === 'down') this.speed = Math.max(0, this.speed - 10 * dt), this.z += this.speed * dt;
    if (this.phase === 'missed') { this.speed = Math.max(0, this.speed - 9 * dt); this.z = Math.min(LENGTH - .6, this.z + this.speed * dt); }
    if (this.clock >= OUTRO_TIME) { this.phase = 'result'; this.events.push({ type:'result', cleared:this.result.cleared }); }
  }
  slide(dt) {
    const target = laneX(this.lane), d = target - this.x, s = LANE_SPEED * dt;
    this.x = Math.abs(d) <= s ? target : this.x + Math.sign(d) * s;
  }
  run(dt) {
    this.t += dt;
    // pace
    if (this.stun > 0) {
      this.stun = Math.max(0, this.stun - dt); if (!this.stun) this.slip = 0;
      this.speed = Math.max(this.slip ? STUN_SPEED * .5 : STUN_SPEED, this.speed - 30 * dt);
    } else this.speed = Math.min(this.speedCap(), this.speed + ACCEL * dt);
    this.z += this.speed * dt;
    this.slide(dt);
    if (this.jumpT >= 0) {
      this.jumpT += dt; const k = this.jumpT / JUMP_TIME; this.y = Math.sin(Math.PI * Math.min(1, k)) * JUMP_HEIGHT;
      if (k >= 1) { this.jumpT = -1; this.y = 0; this.events.push({ type:'land' }); }
    }
    // walkers
    for (const o of this.obstacles) {
      if (!o.vz && !o.sway) continue;
      if (o.z - this.z < WAKE) { o.z += o.vz * dt; if (o.sway) o.x = laneX(o.lane) + Math.sin(this.t * 2.2 + o.phase) * o.sway; }
    }
    this.collide();
    if (this.phase !== 'run') return;
    // the announcement and the doors
    if (!this.announced && this.t >= ANNOUNCE_AT) { this.announced = true; this.events.push({ type:'announce' }); }
    if (!this.closing && this.doorOpen() < 1) { this.closing = true; this.events.push({ type:'closing' }); }
    if (this.z >= LENGTH) return this.arrive();
    if (this.t >= CLOSE_AT) return this.finish('missed', false);
  }
  collide() {
    for (const o of this.obstacles) {
      if (o.hit || o.passed) continue;
      const front = o.z - o.len / 2, back = o.z + o.len / 2;
      if (back < this.z - RUNNER_R) {
        o.passed = true; this.dodges++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
        const close = Math.abs(o.x - this.x) < o.w + RUNNER_R + .45 || o.low;
        const near = close && (this.t - this.lastShift < .55 || o.low && this.airborne);
        if (near) this.nearDodges++;
        this.events.push({ type:'dodge', kind:o.kind, near, combo:this.combo });
        continue;
      }
      if (front > this.z + RUNNER_R) continue;
      if (Math.abs(o.x - this.x) >= o.w + RUNNER_R) continue;
      if (o.low && this.y > .18) continue;
      this.bump(o);
      if (this.phase !== 'run') return;
    }
  }
  bump(o) {
    o.hit = true; this.bumps++; this.combo = 0;
    const slip = o.kind === 'coffee';
    this.stun = slip ? SLIP : STUN; this.slip = slip ? 1 : 0;
    this.jumpT = -1; this.y = 0;
    this.events.push({ type:'bump', kind:o.kind, bumps:this.bumps, slip });
    if (this.bumps >= MAX_BUMPS) this.finish('bumped', false);
  }
  arrive() {
    this.arrival = this.t; this.z = LENGTH;
    const open = this.doorOpen();
    if (open >= PASS_OPEN) this.finish('boarded', true);
    else this.finish('door', false);
  }
  finish(reason, cleared) {
    this.reason = reason;
    this.phase = reason === 'boarded' ? 'board' : reason === 'door' ? 'squish' : reason === 'missed' ? 'missed' : 'down';
    this.clock = 0;
    if (reason === 'door') this.speed = 0;
    this.result = scoreRun(this, reason, cleared);
    this.events.push({ type:reason, cleared });
  }
}

// margin: seconds left before the doors were fully shut when 부장님 got in
export function scoreRun(g, reason, cleared) {
  const margin = cleared ? Math.max(0, CLOSE_AT - g.arrival) : 0;
  const near = cleared && margin < NEAR_MISS;
  const distance = Math.round(Math.min(LENGTH, g.z));
  const value = cleared
    ? Math.max(0, Math.round(1000 + margin * 120 + g.dodges * 20 + g.nearDodges * 15 + (g.bumps ? 0 : 250) - g.bumps * 120 + (near ? 300 : 0)))
    : Math.round(distance * 2 + g.dodges * 10);
  return {
    game:'subway', cleared, reason, value, near,
    margin:Math.round(margin * 100) / 100, time:Math.round(g.t * 100) / 100,
    distance, dodges:g.dodges, bumps:g.bumps, nearDodges:g.nearDodges, combo:g.bestCombo,
    title:rankTitle({ cleared, reason, value, near, bumps:g.bumps }),
  };
}

export function rankTitle({ cleared, reason, value, near, bumps }) {
  if (!cleared) return reason === 'door' ? '문에 낀 부장님' : reason === 'missed' ? '다음 열차 탑승객' : '죄송합니다 전문가';
  if (near) return '문틈의 마술사';
  if (!bumps && value >= 1700) return '출근길의 신';
  if (value >= 1450) return '프로 환승러';
  if (value >= 1250) return '지각 면한 부장님';
  return '턱걸이 출근';
}

// Korean source; the page translates it like every other string
export function subwayShareText(r) {
  if (!r) return '지하철 뛰어타기 🚇 — 쑨플레이에서 한 판 도전해 보세요!';
  const head = r.cleared ? `탑승 성공! 문 닫히기 ${r.margin.toFixed(1)}초 전!` : r.reason === 'door' ? '문에 끼었어요! 다음 열차를 이용해 주세요' : r.reason === 'missed' ? '열차를 놓쳤어요… 다음 열차를 이용해 주세요' : '너무 많이 부딪혔어요';
  return `지하철 뛰어타기 🚇\n${head}\n${r.title} · ${r.value}점\n피한 장애물 ${r.dodges} · 부딪힘 ${r.bumps} · ${r.distance}m`;
}
