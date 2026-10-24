import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DriveGame,
  CurlingGame,
  STAGES,
  VEHICLES,
  SURFACES,
  CURL_DISTANCES,
  makeCar,
  makeRoad,
  launchCar,
  stepCar,
  frontOf,
  flickVelocity,
} from "./engine.js";
const advance = (g, seconds) => {
  for (let i = 0; i < seconds * 120 && g.phase !== "result"; i++)
    g.update(1 / 120);
};
test("all five vehicles and road surfaces reach a stable result", () => {
  for (let s = 0; s < 5; s++) {
    const g = new DriveGame(s);
    g.setPull(0.2);
    assert.ok(g.launch());
    advance(g, 35);
    assert.equal(g.phase, "result");
    assert.equal(g.result.fell, false);
    assert.ok(Number.isFinite(g.result.gap));
  }
});
test("long pull tips the car over the edge and produces a fall result", () => {
  const g = new DriveGame(0);
  g.setPull(0.8);
  g.launch();
  advance(g, 40);
  assert.equal(g.phase, "result");
  assert.equal(g.result.fell, true);
  assert.ok(g.splash);
});
test("input threshold, locked pull during driving and pause/resume", () => {
  const g = new DriveGame();
  assert.equal(g.launch(0.02), false);
  g.setPull(0.55);
  assert.ok(g.launch());
  g.setPull(0.1);
  assert.equal(g.pull, 0.55);
  g.update(0.1);
  g.pause();
  const x = g.car.x;
  advance(g, 3);
  assert.equal(g.car.x, x);
  g.resume();
  assert.equal(g.phase, "run");
  advance(g, 2);
  assert.ok(g.car.x > x);
});
test("rigidbody can overhang without a false fall result", () => {
  let found = false;
  for (let p = 0.61; p < 0.64; p += 0.001) {
    const g = new DriveGame();
    g.launch(p);
    advance(g, 35);
    if (!g.result.fell && g.result.gap < 0) {
      found = true;
      break;
    }
  }
  assert.ok(found);
});
test("curling brief preparation, slow release rejection and pause", () => {
  const g = new CurlingGame(42);
  advance(g, 1);
  assert.equal(g.man.mode, "stand");
  assert.equal(g.release(0, -0.4), false);
  assert.equal(g.phase, "ready");
  g.release(0, -3.4);
  g.pause();
  const z = g.chair.z;
  advance(g, 2);
  assert.equal(g.chair.z, z);
  g.resume();
  assert.equal(g.phase, "roll");
});
test("a controlled knee catch seats the person and advances to 3m", () => {
  const g = new CurlingGame(42);
  g.man.x = 0;
  g.man.yaw = 0;
  g.release(0, -3.4);
  let sat = false;
  for (let i = 0; i < 1200 && g.stage === 0; i++) {
    g.update(1 / 120);
    sat ||= g.man.mode === "sit";
  }
  assert.ok(sat);
  assert.equal(g.stage, 1);
  assert.equal(g.distance, 3);
  assert.equal(g.bestDistance, 2);
});
test("overspeed impact and a short miss both end as ragdoll failures", () => {
  for (const v of [1.4, 10]) {
    const g = new CurlingGame(42);
    g.man.x = 0;
    g.man.yaw = 0;
    g.release(0, -v);
    advance(g, 20);
    assert.equal(g.phase, "result");
    assert.equal(g.result.ok, false);
    assert.ok(g.points.every((p) => p.every(Number.isFinite)));
    assert.ok(g.points.every((p) => p[1] >= 0.05));
  }
});
test("recent flick uses speed, direction and stale release rejection", () => {
  const a = [
    { t: 0, x: 100, y: 300, fx: 0, fz: 0 },
    { t: 50, x: 100, y: 250, fx: 0, fz: -0.5 },
  ];
  assert.ok(
    Math.abs(flickVelocity(a, 700, 51).speed - (50 / 0.05 / 700) * 2.6) < 1e-10,
  );
  assert.equal(flickVelocity(a, 700, 121), null);
  assert.equal(flickVelocity([a[0]], 700, 1), null);
});
test("chair wall bounces and there is no invented 20-person progression cap", () => {
  const g = new CurlingGame(42);
  g.chair.x = 2.54;
  g.release(5, -1);
  g.update(0.1);
  assert.ok(g.chair.vx < 0);
  assert.ok(CURL_DISTANCES.includes(100));
  assert.equal(CURL_DISTANCES[10], 21);
});
if (fs.existsSync("drive-reference-cases.json")) {
  const refs = JSON.parse(fs.readFileSync("drive-reference-cases.json"));
  test("differential: 50 original-source reference cases", () => {
    assert.equal(refs.length, 50);
    for (const r of refs) {
      const st = STAGES[r.stage],
        road = makeRoad(st),
        c = makeCar(VEHICLES[st.vehicle], -4 * r.p);
      launchCar(c, r.p, st.power);
      let rest = 0,
        fell = false;
      for (let t = 0; t < 30; t += 1 / 120) {
        stepCar(c, road, SURFACES[st.surface], 1 / 120);
        if (c.y < road.top - 2.5) {
          fell = true;
          break;
        }
        rest =
          Math.hypot(c.vx, c.vy) < 0.04 &&
          Math.abs(c.omega) < 0.04 &&
          c.stroke <= 0
            ? rest + 1 / 120
            : 0;
        if (rest > 0.4) break;
      }
      assert.equal(fell, r.fell, `stage ${r.stage} p=${r.p}`);
      if (!fell)
        assert.ok(
          Math.abs(road.edge - frontOf(c) - r.remaining) < 1e-8,
          `stage ${r.stage} p=${r.p}`,
        );
    }
  });
}
