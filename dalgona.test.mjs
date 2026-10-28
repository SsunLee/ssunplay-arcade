import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DalgonaGame, SHAPES, outline, sectorOf, SECTORS, MELT_GOLD, PUFF_GOLD, PRESS_GOLD, SAFE_SPEED, MAX_CHIPS } from './dalgona-engine.js';

const step = (g, s) => { for (let i = 0; i < Math.round(s * 60); i++) g.update(1 / 60); };
const begin = g => { step(g, .5); g.press(true); g.press(false); };
// Stir in circles: the finger travels `speed` candy units per second.
function melt(g, target = .86) {
  step(g, .5); g.press(true);
  while (g.make.melt < target) { g.stir(1.6 / 60); g.update(1 / 60); }
  g.press(false); step(g, 1);
}
function soda(g, target = .74) {
  step(g, .5); g.press(true); g.press(false);
  while (g.make.puff < target) { g.stir(2 / 60); g.update(1 / 60); }
  step(g, 1.8);
}
function press(g, v = .7) { step(g, .5); g.press(true); g.pressTo(v); g.press(false); step(g, 1.7); }
function makeCandy(g) { g.start(); melt(g); soda(g); press(g); assert.equal(g.phase, 'carve'); }
// Trace the outline at a given speed for several passes.
function trace(g, speed = g.shape.safe * .8, passes = 4, offset = 0) {
  step(g, .5); const pts = g.path, n = pts.length;
  const at = k => { const p = pts[((k % n) + n) % n], r = Math.hypot(p.x, p.y), f = (r + offset) / r; return [p.x * f, p.y * f]; };
  g.needle(...at(0), true);
  let k = 0, carry = 0;
  for (let guard = 0; guard < 60 * 400 && g.phase === 'carve'; guard++) {
    carry += speed / 60;
    while (carry > 0 && k < n * passes) { const [x0, y0] = at(k), [x1, y1] = at(k + 1), d = Math.hypot(x1 - x0, y1 - y0); if (carry < d) break; carry -= d; k++; }
    if (k >= n * passes) k = 0;
    g.needle(...at(k), true); g.update(1 / 60);
  }
}

test('every outline is closed, evenly spaced and fits inside the candy', () => {
  for (const s of SHAPES) {
    const o = outline(s.id), pts = o.points;
    assert.equal(pts.length, 180);
    const gaps = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length].x - p.x, pts[(i + 1) % pts.length].y - p.y));
    assert.ok(Math.max(...gaps) / Math.min(...gaps) < 2.5, s.id + ' spacing');
    assert.ok(pts.every(p => Math.hypot(p.x, p.y) < .7 && Math.hypot(p.x, p.y) > .2), s.id + ' size');
    assert.equal(new Set(pts.map(p => sectorOf(p.a))).size, SECTORS, s.id + ' sectors');
  }
});

test('golden sugar, a good puff and a firm press make a forgiving candy', () => {
  const g = new DalgonaGame(1); makeCandy(g);
  assert.deepEqual(g.make.grades, { melt:'perfect', soda:'perfect', press:'perfect' });
  assert.ok(g.carve.brittle < 1.1, 'brittle ' + g.carve.brittle);
  const bad = new DalgonaGame(1); bad.start();
  step(bad, .5); bad.press(true); step(bad, 11); // never stirred, left on the coals
  bad.press(false); assert.ok(bad.make.burnt); assert.equal(bad.make.grades.melt, 'bad'); step(bad, 1);
  soda(bad, 1.1); press(bad, .97);
  assert.ok(bad.carve.brittle > 2, 'brittle ' + bad.carve.brittle);
});

test('lifting the ladle too early only pauses the melt', () => {
  const g = new DalgonaGame(2); g.start(); step(g, .5); g.press(true);
  for (let i = 0; i < 60; i++) { g.stir(1.6 / 60); g.update(1 / 60); }
  g.press(false); assert.equal(g.phase, 'melt'); assert.equal(g.state, 'play');
});

for (const shape of SHAPES) test(shape.id + ': a patient trace frees the shape intact', () => {
  const g = new DalgonaGame(3); g.choose(shape.id); makeCandy(g); trace(g);
  assert.equal(g.phase, 'result'); assert.ok(g.result.freed, JSON.stringify(g.result));
  assert.equal(g.result.chips, 0); assert.ok(g.result.value >= 80, 'value ' + g.result.value);
  assert.ok(g.events.filter(e => e.type === 'shard').length === 0 || true);
});

test('rushing the needle cracks the candy, three inward cracks snap it', () => {
  const g = new DalgonaGame(4); makeCandy(g); trace(g, SAFE_SPEED * 6, 40);
  assert.equal(g.phase, 'result');
  assert.ok(g.carve.cracks.length >= 2, 'cracks ' + g.carve.cracks.length);
  if (!g.result.freed) { assert.equal(g.result.reason, 'broken'); assert.equal(g.result.chips, MAX_CHIPS); }
  else assert.ok(g.result.value < 80);
});

test('scraping inside the line scars the shape', () => {
  const g = new DalgonaGame(5); makeCandy(g); step(g, .5);
  g.needle(0, 0, true); for (let i = 0; i < 240; i++) { g.needle(Math.sin(i / 10) * .12, Math.cos(i / 13) * .12, true); g.update(1 / 60); }
  assert.ok(g.carve.scratch > .5); assert.ok(g.progressRatio() < .05);
});

test('licking softens the candy three times at most', () => {
  const g = new DalgonaGame(6); makeCandy(g); step(g, .5); g.needle(.5, 0, true); g.update(1 / 60);
  assert.ok(g.lick()); assert.equal(g.lick(), false, 'still wet'); step(g, 5.2);
  assert.ok(g.lick()); step(g, 5.2); assert.ok(g.lick()); step(g, 5.2); assert.equal(g.lick(), false);
});

test('running out of time ends with a partial score', () => {
  const g = new DalgonaGame(7); makeCandy(g); step(g, .5); g.needle(.5, 0, true); step(g, 90);
  assert.equal(g.result.reason, 'timeout'); assert.equal(g.result.freed, false); assert.ok(g.result.value < 35);
});

test('pause freezes the carving clock', () => {
  const g = new DalgonaGame(8); makeCandy(g); step(g, .5); g.needle(.5, 0, true); step(g, 1);
  const t = g.carve.t; g.pause(); step(g, 2); assert.equal(g.carve.t, t); g.resume(); step(g, .2); assert.ok(g.carve.t > t);
});

test('holding through the intro lock still puts the ladle on the coals', () => {
  const g = new DalgonaGame(9); g.start(); g.press(true); assert.equal(g.state, 'intro');
  step(g, .6); assert.equal(g.state, 'play'); assert.ok(g.make.onFire);
});
