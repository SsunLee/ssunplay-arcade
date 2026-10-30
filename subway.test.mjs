import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SubwayGame, makeCourse, laneX, LANES, LENGTH, CLOSE_AT, DOOR_CLOSE, PASS_OPEN, MAX_BUMPS, NEAR_MISS, COUNT_TIME, OUTRO_TIME, KINDS, RUNNER_R,
  scoreRun, rankTitle, subwayShareText,
} from './subway-engine.js';

const step = (g, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) g.update(dt); };
const go = g => { g.start(); step(g, COUNT_TIME + .05); assert.equal(g.phase, 'run'); };
const empty = g => { g.obstacles = []; return g; };
const drain = g => g.events.splice(0);
// an attentive commuter: takes the clearest lane ahead, hops what can only be jumped
function autopilot(g) {
  const ahead = g.obstacles.filter(o => !o.passed && !o.hit && o.z + o.len / 2 > g.z - RUNNER_R && o.z - g.z < 7);
  const near = (o, l) => Math.abs(o.x - laneX(l)) < o.w + (o.sway || 0) + RUNNER_R + .1;
  const cost = (l, reach = 7) => ahead.reduce((c, o) => c + (near(o, l) && o.z - g.z < reach ? (o.low ? 1 : 10) : 0), 0) + Math.abs(l - g.lane) * .1;
  // crossing two lanes means running through the middle one: fine while its obstacle is still a few steps away
  const path = l => cost(l) + (Math.abs(l - g.lane) === 2 ? cost(0, 2.2) : 0);
  const best = [...LANES].sort((a, b) => path(a) - path(b))[0];
  if (best !== g.lane) g.move(Math.sign(best - g.lane));
  const low = ahead.find(o => o.low && Math.min(Math.abs(o.x - g.x), Math.abs(o.x - laneX(g.lane))) < o.w + RUNNER_R && o.z - o.len / 2 - g.z < 1.1 + g.speed * .06 && o.z - o.len / 2 > g.z);
  if (low) g.jump();
}
function play(g, bot = autopilot) {
  go(g);
  for (let i = 0; i < 60 * 40 && g.phase === 'run'; i++) { bot(g); g.update(1 / 60); }
  step(g, OUTRO_TIME + .1);
  return g.result;
}

test('lanes: one step per input, clamped to the three lanes', () => {
  const g = empty(new SubwayGame(1)); go(g);
  assert.equal(g.lane, 0);
  assert.ok(g.move(-1)); assert.equal(g.lane, -1);
  assert.equal(g.move(-1), false); assert.equal(g.lane, -1);
  assert.ok(drain(g).some(e => e.type === 'wall'));
  step(g, .3); assert.equal(g.x, laneX(-1));
  g.move(1); g.move(1); assert.equal(g.lane, 1);
  g.update(1 / 60); assert.ok(g.x > laneX(-1) && g.x < laneX(1), 'slides between lanes, does not teleport');
  step(g, .4); assert.equal(g.x, laneX(1));
});

test('input before the run: lanes may be picked during 3·2·1, jumping waits for GO', () => {
  const g = empty(new SubwayGame(2));
  assert.equal(g.move(1), false, 'nothing moves on the title screen');
  g.start(); assert.equal(g.phase, 'count');
  assert.ok(g.move(1)); assert.equal(g.jump(), false);
  step(g, COUNT_TIME + .05); assert.equal(g.phase, 'run'); assert.equal(g.t < .1, true, 'the clock starts at GO');
  assert.ok(g.jump());
});

test('collision: a pillar in your lane bumps, the next lane over does not', () => {
  const g = empty(new SubwayGame(3));
  g.obstacles = [{ id:0, kind:'pillar', lane:0, x:0, z:8, z0:8, phase:0, hit:false, passed:false, ...KINDS.pillar },
    { id:1, kind:'pillar', lane:1, x:laneX(1), z:16, z0:16, phase:0, hit:false, passed:false, ...KINDS.pillar }];
  go(g); step(g, 4);
  assert.equal(g.bumps, 1); assert.ok(g.obstacles[0].hit); assert.equal(g.obstacles[1].hit, false);
  assert.equal(g.dodges, 1);
  const ev = drain(g); assert.ok(ev.some(e => e.type === 'bump' && e.kind === 'pillar'));
});

test('collision: a bump costs pace and resets the combo; jumping clears low hazards only', () => {
  const mk = (kind, z) => ({ id:z, kind, lane:0, x:0, z, z0:z, phase:0, hit:false, passed:false, ...KINDS[kind] });
  const g = empty(new SubwayGame(4)); g.obstacles = [mk('suitcase', 20)]; go(g);
  while (g.z < 20 - .55 / 2 - 1.2) g.update(1 / 120);
  assert.ok(g.jump()); step(g, 1);
  assert.equal(g.bumps, 0, 'hopped the suitcase'); assert.equal(g.dodges, 1); assert.equal(g.combo, 1);
  const h = empty(new SubwayGame(4)); h.obstacles = [mk('phone', 20)]; h.obstacles[0].vz = 0; go(h);
  while (h.z < 20 - 1.2) h.update(1 / 120);
  h.jump(); const before = h.speed; step(h, .5);
  assert.equal(h.bumps, 1, 'you cannot jump over a person'); assert.ok(h.speed < before);
  const c = empty(new SubwayGame(5)); c.obstacles = [mk('coffee', 15)]; go(c); step(c, 3);
  assert.equal(c.bumps, 1); assert.ok(drain(c).some(e => e.type === 'bump' && e.slip), 'coffee is a slip');
});

test('three bumps put 부장님 on the floor', () => {
  const g = empty(new SubwayGame(6));
  g.obstacles = [10, 22, 34].map((z, i) => ({ id:i, kind:'pillar', lane:0, x:0, z, z0:z, phase:0, hit:false, passed:false, ...KINDS.pillar }));
  go(g); step(g, 8);
  assert.equal(g.bumps, MAX_BUMPS); assert.equal(g.reason, 'bumped'); assert.equal(g.result.cleared, false);
  step(g, OUTRO_TIME); assert.equal(g.phase, 'result'); assert.equal(g.result.title, '죄송합니다 전문가');
});

test('door: open until the closing starts, then shuts over DOOR_CLOSE seconds', () => {
  const g = new SubwayGame(7);
  assert.equal(g.doorOpen(0), 1); assert.equal(g.doorOpen(CLOSE_AT - DOOR_CLOSE), 1);
  assert.ok(Math.abs(g.doorOpen(CLOSE_AT - DOOR_CLOSE / 2) - .5) < 1e-9);
  assert.equal(g.doorOpen(CLOSE_AT), 0);
});

// Put 부장님 just short of the door at a chosen moment and let him run in.
function arriveAt(t) {
  const g = empty(new SubwayGame(8)); go(g);
  g.t = t - .5; g.z = LENGTH - g.speedCap() * .5; g.speed = g.speedCap(); g.announced = true;
  drain(g); step(g, 1, 1 / 120);
  return g;
}

test('near miss: boarding a split second before the doors shut is scored and titled', () => {
  const late = CLOSE_AT - DOOR_CLOSE * PASS_OPEN - .05;
  const g = arriveAt(late);
  assert.equal(g.reason, 'boarded'); assert.equal(g.result.cleared, true);
  assert.ok(g.result.margin < NEAR_MISS && g.result.margin > .3, 'margin ' + g.result.margin);
  assert.equal(g.result.near, true); assert.equal(g.result.title, '문틈의 마술사');
  const early = arriveAt(CLOSE_AT - 3);
  assert.equal(early.result.near, false); assert.ok(Math.abs(early.result.margin - 3) < .05);
  // the near-miss bonus outweighs a second and a half of spare time
  assert.ok(g.result.value > early.result.value - 300);
  assert.match(subwayShareText(g.result), /문 닫히기 0\.\d초 전!/);
});

test('door catch: arriving as the gap narrows squeezes him in the doors', () => {
  const g = arriveAt(CLOSE_AT - DOOR_CLOSE * PASS_OPEN * .4);
  assert.equal(g.reason, 'door'); assert.equal(g.phase, 'squish'); assert.equal(g.result.cleared, false);
  assert.equal(g.result.title, '문에 낀 부장님');
  step(g, OUTRO_TIME); assert.equal(g.phase, 'result');
  assert.match(subwayShareText(g.result), /다음 열차를 이용해 주세요/);
});

test('timeout: standing in the clear lane too long and the train leaves without him', () => {
  const g = empty(new SubwayGame(9)); go(g);
  const ev = [];
  // slow him to a crawl: he will not make it
  for (let i = 0; i < 60 * (CLOSE_AT + 1) && g.phase === 'run'; i++) { g.speed = 1; g.stun = .1; g.update(1 / 60); ev.push(...drain(g)); }
  assert.equal(g.reason, 'missed'); assert.ok(g.t >= CLOSE_AT); assert.ok(g.z < LENGTH);
  assert.ok(ev.some(e => e.type === 'announce') && ev.some(e => e.type === 'closing') && ev.some(e => e.type === 'missed'));
  step(g, OUTRO_TIME + .1); assert.equal(g.phase, 'result'); assert.equal(g.result.title, '다음 열차 탑승객');
});

test('the course: deterministic per seed, always a way through, nothing near the door', () => {
  assert.deepEqual(makeCourse(42), makeCourse(42));
  assert.notDeepEqual(makeCourse(42).obstacles.map(o => o.z), makeCourse(43).obstacles.map(o => o.z));
  for (let s = 1; s < 200; s++) {
    const c = makeCourse(s);
    assert.ok(c.rows.length >= 10, 'enough to dodge');
    for (const row of c.rows) assert.ok(row.lanes.length < 3 || row.jump, 'a free lane or a jump');
    assert.ok(c.obstacles.every(o => o.z < LENGTH - 10));
  }
});

test('a steady autopilot boards with time to spare; running straight does not', () => {
  const margins = [];
  for (let s = 1; s <= 40; s++) {
    const r = play(new SubwayGame(s));
    if (r.cleared) margins.push(r.margin);
  }
  assert.ok(margins.length >= 36, 'boarded ' + margins.length + ' of 40');
  const avg = margins.reduce((a, b) => a + b) / margins.length;
  assert.ok(avg > .8 && avg < 3.5, 'a clean run is tight but fair: ' + avg.toFixed(2));
  const straight = play(new SubwayGame(11), () => {});
  assert.equal(straight.cleared, false);
});

test('frame rate does not change the outcome', () => {
  const run = dt => { const g = new SubwayGame(21); g.start(); for (let i = 0; i < 40 / dt && g.phase !== 'result'; i++) { if (g.phase === 'run') autopilot(g); g.update(dt); } return g.result; };
  const a = run(1 / 60), b = run(1 / 144);
  assert.equal(a.reason, b.reason); assert.ok(Math.abs(a.margin - b.margin) < .15);
});

test('pause freezes the clock; results and titles', () => {
  const g = empty(new SubwayGame(12)); go(g); step(g, 1);
  const t = g.t; g.pause(); step(g, 3); assert.equal(g.t, t); g.resume(); step(g, .5); assert.ok(g.t > t);
  assert.equal(rankTitle({ cleared:true, value:1800, near:false, bumps:0 }), '출근길의 신');
  assert.equal(rankTitle({ cleared:true, value:1100, near:false, bumps:2 }), '턱걸이 출근');
  const fake = { arrival:CLOSE_AT - 1, z:LENGTH, dodges:10, nearDodges:2, bumps:0, t:CLOSE_AT - 1, bestCombo:10 };
  const r = scoreRun(fake, 'boarded', true);
  assert.equal(r.margin, 1); assert.equal(r.distance, LENGTH); assert.equal(r.value, 1000 + 120 + 200 + 30 + 250);
});

test('a third collision at closing time keeps the bump result', () => {
  const g = empty(new SubwayGame(7)); go(g);
  g.t = CLOSE_AT - .001; g.z = LENGTH - .1; g.bumps = MAX_BUMPS - 1;
  g.obstacles = [{ id:0, kind:'pillar', lane:0, x:0, z:LENGTH, hit:false, passed:false, ...KINDS.pillar }];
  g.update(1 / 60);
  assert.equal(g.reason, 'bumped');
  assert.equal(g.result.reason, 'bumped');
  assert.equal(g.events.filter(e => ['bumped','boarded','door','missed'].includes(e.type)).length, 1);
});

test('reset discards events from the previous run', () => {
  const g = new SubwayGame(8); g.start(); assert.ok(g.events.length);
  g.reset(); assert.deepEqual(g.events, []); assert.equal(g.phase, 'ready');
});
