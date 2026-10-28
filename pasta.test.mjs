import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PastaGame, SAUCES, INGREDIENTS, ALDENTE, doneness, sauteZone, grade } from './pasta-engine.js';

const step = (g, s) => { for (let i = 0; i < Math.round(s * 60); i++) g.update(1 / 60); };
const begin = g => { step(g, .5); g.begin(); };
// A cook that taps exactly when the guide reaches the knife.
function chopPerfectly(g) {
  begin(g);
  for (let guard = 0; g.phase === 'chop' && g.state === 'play' && guard < 4000; guard++) {
    const c = g.chop, ing = g.ingredient;
    if (c.wait <= 0 && c.feed - c.lastCut >= ing.width - 1e-3) g.cut();
    g.update(1 / 120);
  }
}
function sauteWell(g) {
  begin(g);
  while (g.phase === 'saute' && g.state === 'play') { const z = sauteZone(g.saute.t + .9); g.hold(g.saute.temp < z.center); g.update(1 / 60); }
}
function boilTo(g, target) {
  begin(g);
  while (g.boil.done < target) { if (g.boil.foam > .7) g.stir(); g.update(1 / 60); }
  g.drain();
}
function tossPerfect(g) {
  begin(g);
  for (let i = 0; i < 3; i++) { const [lo, hi] = g.toss.bands[i]; g.charge((lo + hi) / 2); g.release(); step(g, 1.2); }
}
const toResult = g => { while (g.phase !== 'result') { if (g.state === 'intro') begin(g); g.update(1 / 60); } };

test('slice grades reward the ideal width', () => {
  assert.equal(grade(.3, .3).grade, 'perfect');
  assert.equal(grade(.38, .3).grade, 'good');
  assert.equal(grade(.6, .3).grade, 'thick');
  assert.equal(grade(.1, .3).grade, 'thin');
});

test('intro cards wait for the player and ignore carried-over taps', () => {
  const g = new PastaGame(1); g.start();
  assert.equal(g.phase, 'chop'); assert.equal(g.state, 'intro');
  assert.equal(g.cut(), null); assert.equal(g.state, 'intro');
  step(g, 2); assert.equal(g.chop.feed, 0);
  step(g, .5); g.cut(); assert.equal(g.state, 'play');
});

test('rhythmic chopping produces perfect slices and conserves each ingredient', () => {
  const g = new PastaGame(2); g.start(); chopPerfectly(g);
  const s = g.chop.slices;
  assert.ok(s.length >= 12, 'slices ' + s.length);
  assert.ok(s.every(x => x.grade === 'perfect'), s.map(x => x.grade).join());
  assert.ok(g.chopScore() >= 99);
  for (const kind of g.recipe.ingredients) {
    const mine = s.filter(x => x.kind === kind);
    assert.ok(Math.abs(mine[0].u0) < 1e-9);
    for (let i = 1; i < mine.length; i++) assert.ok(Math.abs(mine[i].u0 - mine[i - 1].u1) < 1e-9);
    assert.ok(mine.at(-1).u1 <= INGREDIENTS[kind].length + 1e-9);
  }
  step(g, 1.2); assert.equal(g.phase, 'saute');
});

test('ignoring the knife lets slices pass as misses instead of stalling', () => {
  const g = new PastaGame(3); g.start(); begin(g);
  step(g, 30);
  assert.equal(g.phase, 'saute');
  assert.ok(g.chop.slices.every(x => x.grade === 'miss'));
  assert.equal(g.chopScore(), 0);
});

test('mashing the knife yields thin slices', () => {
  const g = new PastaGame(4); g.start(); begin(g);
  for (let i = 0; i < 40 && g.phase === 'chop'; i++) { step(g, .1); g.cut(); }
  assert.ok(g.chop.slices.some(x => x.grade === 'thin'));
});

test('holding through the intro lock still lights the burner', () => {
  const g = new PastaGame(10); g.start(); g.enter('saute');
  g.hold(true); assert.equal(g.state, 'intro');
  step(g, .6); assert.equal(g.state, 'play'); assert.ok(g.saute.holding); assert.ok(g.saute.flame > 0);
});

test('anticipating the zone keeps the pan in heat, holding forever burns', () => {
  const good = new PastaGame(5); good.start(); good.enter('saute'); sauteWell(good);
  assert.ok(good.heatScore() >= 80, 'score ' + good.heatScore());
  assert.ok(good.saute.sauce);
  const bad = new PastaGame(5); bad.start(); bad.enter('saute'); begin(bad);
  bad.hold(true); step(bad, 14);
  assert.ok(bad.saute.burn > 2); assert.ok(bad.heatScore() < 30);
  const cold = new PastaGame(5); cold.start(); cold.enter('saute'); begin(cold); cold.hold(false); step(cold, 14);
  assert.ok(cold.heatScore() < 25);
});

test('al dente window is reachable and overflowing foam costs points', () => {
  const t = (ALDENTE[0] + ALDENTE[1]) / 2;
  const g = new PastaGame(6); g.start(); g.enter('boil'); boilTo(g, t);
  assert.equal(g.noodleState(), 'aldente'); assert.equal(g.boil.overflow, 0); assert.equal(g.noodleScore(), 100);
  const lazy = new PastaGame(6); lazy.start(); lazy.enter('boil'); begin(lazy);
  while (lazy.boil.done < t) lazy.update(1 / 60);
  assert.ok(lazy.boil.overflow >= 1); lazy.drain(); assert.ok(lazy.noodleScore() <= 85);
  const late = new PastaGame(6); late.start(); late.enter('boil'); begin(late); step(late, 13);
  assert.equal(late.state, 'done'); assert.ok(late.noodleScore() < 10);
  assert.ok(doneness(8) > ALDENTE[0] && doneness(8) < ALDENTE[1]);
});

test('toss height must meet each band', () => {
  const g = new PastaGame(7); g.start(); g.enter('toss'); begin(g);
  g.charge(1.1); const high = g.release(); assert.equal(high.grade, 'high'); assert.ok(high.score < 100);
  assert.equal(g.release(), null);
  step(g, 1.2); const [lo, hi] = g.toss.bands[1]; g.charge((lo + hi) / 2); assert.equal(g.release().grade, 'perfect');
  // a flick released while the pasta is still airborne fires on landing
  step(g, .3); const [lo2, hi2] = g.toss.bands[2]; g.charge((lo2 + hi2) / 2); assert.equal(g.release(), null);
  step(g, 1); assert.equal(g.toss.results.length, 3); assert.equal(g.toss.results[2].grade, 'perfect');
});

test('pause freezes every station', () => {
  const g = new PastaGame(8); g.start(); begin(g); step(g, .3);
  const feed = g.chop.feed; g.pause(); step(g, 1); assert.equal(g.chop.feed, feed); g.resume(); step(g, .1); assert.ok(g.chop.feed > feed);
});

for (const sauce of SAUCES) test(sauce.id + ' cooks a complete, top-scoring plate', () => {
  const g = new PastaGame(9); g.choose(sauce.id); g.start();
  chopPerfectly(g); step(g, 1.2);
  sauteWell(g); step(g, 1);
  boilTo(g, .76); step(g, 1.2);
  tossPerfect(g); toResult(g);
  assert.equal(g.result.recipe, sauce.id);
  assert.deepEqual([...new Set(g.chop.slices.map(s => s.kind))].sort(), [...sauce.ingredients].sort());
  assert.ok(g.result.value >= 95, JSON.stringify(g.result));
});
