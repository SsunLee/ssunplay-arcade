import test from "node:test";
import assert from "node:assert/strict";
import { BeerGame } from "./engine.js";
const advance = (g, s) => {
  for (let i = 0; i < s * 120; i++) g.update(1 / 120);
};
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

test("upright overpour spills, stopping ends runoff, and score keeps the spill penalty", () => {
  const g = new BeerGame(42);
  g.setAngle(0);
  advance(g, 1);
  g.setPour(true);
  advance(g, 12);
  assert.ok(g.spilled > 0.1);
  assert.ok(g.spillFlash > 0.9);
  g.setPour(false);
  advance(g, 2);
  assert.equal(g.spillFlash, 0);
  const spilled = g.spilled;
  advance(g, 1);
  assert.equal(g.spilled, spilled);
  const clean = new BeerGame(42);
  clean.started = true;
  clean.liquid = g.liquid;
  clean.foam = g.foam;
  clean.serve();
  g.serve();
  assert.ok(g.roundResult.score < clean.roundResult.score);
  assert.ok(g.roundResult.spillPenalty > 0);
  g.next();
  assert.equal(g.spilled, 0);
  assert.equal(g.spillFlash, 0);
});

test("tilting a nearly full upright glass spills even with the tap closed", () => {
  const g = new BeerGame(42);
  g.angle = g.targetAngle = 0;
  g.liquid = 0.8;
  g.foam = 0.1;
  g.started = true;
  g.setAngle(55);
  advance(g, 1);
  assert.ok(g.spilled > 0.1);
  assert.ok(g.total <= g.capacity + 1e-6);
  assert.equal(g.pouring, false);
});

test("spill penalty keeps growing past 30 and 100 while final score stays nonnegative", () => {
  const g = new BeerGame(42);
  for (const [ml, penalty] of [[0,0],[50,10],[150,30],[300,60],[668,133.6],[1000,200]]) {
    g.spilled = ml / 500;
    assert.ok(Math.abs(g.spillPenalty - penalty) < 1e-8);
  }
  g.started = true;
  g.liquid = g.order.liquid;
  g.foam = g.order.foam;
  assert.equal(g.serve(),true);
  assert.equal(g.roundResult.score,0);
  assert.equal(g.roundResult.spillPenalty,200);
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
