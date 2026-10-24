import test from "node:test";
import assert from "node:assert/strict";
import { BeerGame, CurlingGame } from "./engine.js";
const advance = (g, s) => {
  for (let i = 0; i < s * 120; i++) g.update(1 / 120);
};
test("curling sways while waiting and eventually collapses without a release", () => {
  const g = new CurlingGame(42);
  const start = g.points.map((p) => [...p]);
  advance(g, 2);
  assert.equal(g.man.mode, "stand");
  assert.ok(g.points.some((p, i) => Math.abs(p[0] - start[i][0]) > 0.03));
  advance(g, 25);
  assert.equal(g.phase, "result");
  assert.equal(g.result.ok, false);
  assert.equal(g.chair.released, false);
});
test("idle collapse time varies across seeds, pause freezes it", () => {
  const seeds = [1, 2, 99, 520, 2026].map((x) => new CurlingGame(x));
  assert.ok(new Set(seeds.map((g) => g.man.idleCollapseAt)).size > 3);
  const g = seeds[0];
  g.update(0.25);
  g.pause();
  const p = g.points.map((x) => [...x]),
    time = g.time;
  advance(g, 30);
  assert.deepEqual(g.points, p);
  assert.equal(g.time, time);
  g.resume();
  advance(g, 25);
  assert.equal(g.phase, "result");
});
test("tap is closed initially and does not start order timer", () => {
  const g = new BeerGame(42);
  advance(g, 25);
  assert.equal(g.total, 0);
  assert.equal(g.remaining, g.order.time);
  assert.equal(g.serve(), false);
});
test("tilted pour produces less foam than straight pour", () => {
  const make = (angle) => {
    const g = new BeerGame(42);
    g.angle = g.targetAngle = angle;
    g.setPour(true);
    advance(g, 3);
    g.setPour(false);
    return g;
  };
  const tilted = make(45),
    straight = make(0);
  assert.ok(tilted.liquid > straight.liquid);
  assert.ok(tilted.foam < straight.foam * 0.5);
});
test("release closes valve, foam settles, pressure tail ends", () => {
  const g = new BeerGame(42);
  g.setPour(true);
  advance(g, 3);
  g.setPour(false);
  advance(g, 0.5);
  const liquid = g.liquid,
    foam = g.foam;
  advance(g, 2);
  assert.ok(g.flow < 0.00001);
  assert.ok(g.foam < foam);
  assert.ok(g.liquid >= liquid);
});
test("overfill spills; tilt reduces capacity, pause conserves contents", () => {
  const g = new BeerGame(42);
  g.setPour(true);
  advance(g, 14);
  assert.ok(g.spilled > 0.1);
  assert.ok(g.total <= g.capacity + 0.000001);
  g.pause();
  const snapshot = [g.time, g.liquid, g.foam, g.spilled];
  advance(g, 4);
  assert.deepEqual([g.time, g.liquid, g.foam, g.spilled], snapshot);
  g.resume();
  assert.equal(g.pouring, false);
});
test("three served orders produce an average score, single submission only", () => {
  const g = new BeerGame(42);
  const scores = [];
  for (let r = 0; r < 3; r++) {
    g.started = true;
    g.angle = g.targetAngle = 0;
    g.liquid = g.order.liquid - [0, 0.16, 0.32][r];
    g.foam = g.order.foam;
    assert.equal(g.serve(), true);
    scores.push(g.roundResult.score);
    assert.equal(g.serve(), false);
    if (r < 2) {
      assert.equal(g.phase, "tasting");
      assert.ok(g.next());
    }
  }
  assert.equal(g.phase, "result");
  assert.deepEqual(scores, [100, 80, 60]);
  assert.equal(g.result.value, 80);
  assert.equal(g.result.rounds.length, 3);
  assert.equal(g.next(), false);
});
test("order timeout scores current glass and does not run in background", () => {
  const g = new BeerGame(42);
  g.setPour(true);
  advance(g, 0.1);
  g.setPour(false);
  advance(g, 40);
  assert.equal(g.phase, "tasting");
  assert.equal(g.roundResult.timedOut, true);
  assert.ok(Number.isFinite(g.roundResult.score));
});
test("frame-rate independent fixed-step beer volume and overflow", () => {
  const run = (dt) => {
    const g = new BeerGame(42);
    g.setPour(true);
    for (let t = 0; t < 5 - 1e-8; t += dt) g.update(dt);
    return [g.liquid, g.foam, g.spilled];
  };
  const a = run(1 / 60),
    b = run(0.25);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 0.002));
});
