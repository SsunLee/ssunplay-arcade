import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PastaGame, SAUCES, CUSTOMERS, INGREDIENTS, ALDENTE, FLAMBE_AT, FEVER_COMBO, doneness, sauteZone, grade, flightTime } from './pasta-engine.js';

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
// Both burners at once: anticipate the pan's heat zone, and let go of it for a moment to tap the pot.
function stoveWell(g, target = .76) {
  begin(g);
  while (g.phase === 'stove' && g.state === 'play' && g.boil.done < target) {
    const z = sauteZone(g.saute.t + .9);
    if (g.boil.foam > .7) { g.hold(false); g.stir(); } else g.hold(g.saute.temp < z.center);
    g.update(1 / 60);
  }
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
  step(g, 1.2); assert.equal(g.phase, 'stove');
});

test('ignoring the knife lets slices pass as misses instead of stalling', () => {
  const g = new PastaGame(3); g.start(); begin(g);
  step(g, 30);
  assert.equal(g.phase, 'stove');
  assert.ok(g.chop.slices.every(x => x.grade === 'miss'));
  assert.equal(g.chopScore(), 0);
});

test('mashing the knife yields thin slices', () => {
  const g = new PastaGame(4); g.start(); begin(g);
  for (let i = 0; i < 40 && g.phase === 'chop'; i++) { step(g, .1); g.cut(); }
  assert.ok(g.chop.slices.some(x => x.grade === 'thin'));
});

test('holding through the intro lock still lights the burner', () => {
  const g = new PastaGame(10); g.start(); g.enter('stove');
  g.hold(true); assert.equal(g.state, 'intro');
  step(g, .6); assert.equal(g.state, 'play'); assert.ok(g.saute.holding); assert.ok(g.saute.flame > 0);
});

test('juggling both burners keeps the pan in heat and the pot from boiling over', () => {
  const good = new PastaGame(5); good.start(); good.enter('stove'); stoveWell(good);
  assert.ok(good.heatScore() >= 80, 'score ' + good.heatScore());
  assert.ok(good.saute.sauce); assert.equal(good.boil.overflow, 0);
  assert.equal(good.noodleState(), 'aldente'); assert.equal(good.noodleScore(), 100);
  const bad = new PastaGame(5); bad.start(); bad.enter('stove'); begin(bad);
  bad.hold(true); step(bad, 12);
  assert.ok(bad.saute.burn > 2); assert.ok(bad.heatScore() < 30);
  assert.ok(bad.boil.overflow >= 1, 'holding the pan alone lets the pot foam over');
  const cold = new PastaGame(5); cold.start(); cold.enter('stove'); begin(cold); cold.hold(false); step(cold, 12);
  assert.ok(cold.heatScore() < 25);
});

test('the pot drains itself once the pasta is mushy, and the window sits late enough to juggle', () => {
  const late = new PastaGame(6); late.start(); late.enter('stove'); begin(late);
  for (let i = 0; i < 60 * 19 && late.state === 'play'; i++) { if (late.boil.foam > .7) late.stir(); late.update(1 / 60); }
  assert.equal(late.state, 'done'); assert.ok(late.noodleScore() < 10);
  assert.ok(doneness(12) > ALDENTE[0] && doneness(12) < ALDENTE[1]);
  assert.ok(doneness(FLAMBE_AT + 1) < ALDENTE[0], 'flambé comes before the pasta is ready');
});

test('toss height must meet each band', () => {
  const g = new PastaGame(7); g.start(); g.enter('toss'); begin(g);
  g.charge(1.1); const high = g.release(); assert.equal(high.grade, 'high'); assert.ok(high.score < 100);
  assert.equal(g.release(), null);
  step(g, flightTime(1.1) + .05); const [lo, hi] = g.toss.bands[1]; g.charge((lo + hi) / 2); assert.equal(g.release().grade, 'perfect');
  // a flick released while the pasta is still airborne fires on landing
  step(g, .3); const [lo2, hi2] = g.toss.bands[2]; g.charge((lo2 + hi2) / 2); assert.equal(g.release(), null);
  step(g, 1); assert.equal(g.toss.results.length, 3); assert.equal(g.toss.results[2].grade, 'perfect');
});

test('pause freezes every station', () => {
  const g = new PastaGame(8); g.start(); begin(g); step(g, .3);
  const feed = g.chop.feed; g.pause(); step(g, 1); assert.equal(g.chop.feed, feed); g.resume(); step(g, .1); assert.ok(g.chop.feed > feed);
});

for (const sauce of SAUCES) test(sauce.id + ' cooks a complete, top-scoring plate', () => {
  const g = new PastaGame(9); g.customer = CUSTOMERS.find(c => c.sauce === sauce.id); g.choose(sauce.id); g.start();
  chopPerfectly(g); step(g, 1.2);
  stoveWell(g); step(g, 1.2);
  tossPerfect(g); toResult(g);
  assert.equal(g.result.recipe, sauce.id);
  assert.deepEqual([...new Set(g.chop.slices.map(s => s.kind))].sort(), [...sauce.ingredients].sort());
  assert.ok(g.result.value >= 95, JSON.stringify(g.result));
});

test('each customer arrives with their sauce already chosen', () => {
  for (let seed = 1; seed < 40; seed++) { const g = new PastaGame(seed); assert.equal(g.recipe.id, g.customer.sauce); }
  assert.equal(new Set(Array.from({ length:40 }, (_, i) => new PastaGame(i + 1).customer.id)).size, CUSTOMERS.length);
});

test('a perfect streak starts the fever and a miss ends it', () => {
  const g = new PastaGame(2); g.start(); begin(g);
  let feverOn = false;
  for (let guard = 0; guard < 4000 && g.chop.perfects < FEVER_COMBO; guard++) {
    const c = g.chop; if (c.wait <= 0 && c.feed - c.lastCut >= g.ingredient.width - 1e-3) g.cut(); g.update(1 / 120);
  }
  feverOn = g.events.some(e => e.type === 'fever' && e.on); assert.ok(feverOn); assert.ok(g.chop.fever);
  step(g, 3); assert.equal(g.chop.fever, false);
});

test('flambé catches only on a hot, held pan and adds to the heat score', () => {
  const hot = new PastaGame(5); hot.start(); hot.enter('stove'); begin(hot);
  while (hot.saute.t < FLAMBE_AT + .1) { const z = sauteZone(hot.saute.t + .9); hot.hold(hot.saute.t > FLAMBE_AT - 1.4 || hot.saute.temp < z.center); hot.update(1 / 60); }
  assert.equal(hot.saute.flambe, true);
  const cold = new PastaGame(5); cold.start(); cold.enter('stove'); begin(cold); cold.hold(false);
  step(cold, FLAMBE_AT + .2); assert.equal(cold.saute.flambe, false);
  assert.ok(cold.events.some(e => e.type === 'flambe' && !e.ok));
});

test('meeting the wish earns a bonus and a tip, the wrong sauce costs both', () => {
  const cook = sauce => {
    const g = new PastaGame(9); g.customer = CUSTOMERS.find(c => c.want === 'even'); g.choose(sauce); g.start();
    chopPerfectly(g); step(g, 1.2); stoveWell(g); step(g, 1.2); tossPerfect(g); toResult(g);
    return g.result;
  };
  const right = cook('cream'), wrong = cook('tomato');
  assert.ok(right.ordered && right.wish); assert.ok(right.tip >= 3000);
  assert.equal(wrong.ordered, false); assert.equal(wrong.tip, 0);
  assert.ok(right.value > wrong.value, JSON.stringify([right, wrong]));
});

test('a higher toss stays in the air longer', () => {
  assert.ok(flightTime(.8) > flightTime(.4));
  const g = new PastaGame(12); g.start(); g.enter('toss'); begin(g);
  g.charge(.4); g.release(); const low = g.toss.flight; step(g, 2);
  g.charge(.8); g.release(); assert.ok(g.toss.flight > low);
});
