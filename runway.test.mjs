import test from "node:test";
import assert from "node:assert/strict";
import {
  RunwayGame, RWY, V_SPEEDS, VAPP, TAIL_LIMIT, KT, FT, GRADES, FAILURES,
  landingGrade, scoreLanding, scoreTakeoff, totalScore, papiLights, windComponents, formatWind, glideslopeDots, localizerDots,
} from "./runway-engine.js";

const step = (g, fn, seconds = 120) => {
  for (let i = 0; i < seconds * 120 && ["fly", "roll"].includes(g.phase); i++) {
    fn?.(g);
    g.update(1 / 120);
  }
  return g;
};
/** Full thrust, then rotate toward `target` pitch once IAS reaches `rotateKt`. */
const takeoff = (g, rotateKt = V_SPEEDS.vr, target = 15) => {
  g.start();
  g.setThrottle(1);
  return step(g, (x) => x.setInput(x.ias >= rotateKt && x.ac.pitch < target ? 1 : 0, 0, 0));
};
/** A competent pilot: track the glideslope and centreline, then flare progressively below 50 ft. */
const land = (g, { flare = true } = {}) => {
  g.start();
  return step(g, (x) => {
    const a = x.ac, ft = x.altFt;
    const wantVs = ft > 50 || !flare ? -a.v * Math.tan(3 * Math.PI / 180) - x.gsDots * 1.5 : -Math.max(0.4, ft * FT * 0.25);
    const pitch = Math.max(-1, Math.min(1, (wantVs - a.vy) * 0.8)),
      thr = ft > 50 ? Math.max(-1, Math.min(1, -(x.ias - VAPP) * 0.3)) : -1,
      wantPsi = -a.z * 0.004 + Math.asin((x.windLDG.cross * KT) / a.v),
      wantBank = Math.max(-15, Math.min(15, (wantPsi - a.psi) * 300));
    x.setInput(pitch, Math.max(-1, Math.min(1, (wantBank - a.bank) / 10)), thr);
  });
};

test("landing grades follow the sink-rate bands", () => {
  assert.equal(landingGrade(60), "butter");
  assert.equal(landingGrade(119), "butter");
  assert.equal(landingGrade(120), "good");
  assert.equal(landingGrade(299), "good");
  assert.equal(landingGrade(300), "firm");
  assert.equal(landingGrade(600), "firm");
  assert.equal(landingGrade(601), "hard");
  assert.equal(landingGrade(999), "hard");
  assert.equal(landingGrade(1000), "crash");
  assert.equal(landingGrade(80, true), "crash");
  assert.equal(GRADES.butter, "버터 랜딩!");
  assert.equal(GRADES.hard, "하드 랜딩");
});

test("landing score rewards a soft, centred touchdown at the aiming point", () => {
  const perfect = scoreLanding({ fpm: 90, centerline: 0.4, distance: 20 });
  assert.equal(perfect.value, 100);
  assert.equal(perfect.grade, "butter");
  const firm = scoreLanding({ fpm: 420, centerline: 6, distance: 250 });
  assert.ok(firm.value < perfect.value && firm.value > 0);
  assert.ok(scoreLanding({ fpm: 200, centerline: 0, distance: 0 }).sink > scoreLanding({ fpm: 500, centerline: 0, distance: 0 }).sink);
  assert.ok(scoreLanding({ fpm: 100, centerline: 2, distance: 0 }).line > scoreLanding({ fpm: 100, centerline: -10, distance: 0 }).line);
  assert.ok(scoreLanding({ fpm: 100, centerline: 0, distance: 100 }).zone > scoreLanding({ fpm: 100, centerline: 0, distance: -400 }).zone);
  assert.equal(scoreLanding({ fpm: 1200, centerline: 0, distance: 0 }).value, 0);
  assert.equal(scoreLanding({ fpm: 100, centerline: 0, distance: 0, crashed: true }).grade, "crash");
  assert.equal(scoreLanding({ fpm: 0, centerline: 0, distance: 0, goAround: true }).value, 0);
});

test("takeoff score peaks at VR with a 15° climb", () => {
  assert.equal(scoreTakeoff({ rotateKt: V_SPEEDS.vr, climbPitch: 15, endKt: V_SPEEDS.v2 + 10 }).value, 100);
  const late = scoreTakeoff({ rotateKt: V_SPEEDS.vr + 12, climbPitch: 15, endKt: V_SPEEDS.v2 + 10 });
  assert.ok(late.rotation < 15);
  assert.ok(scoreTakeoff({ rotateKt: V_SPEEDS.vr, climbPitch: 22, endKt: 162 }).pitch < 15);
  assert.equal(scoreTakeoff({ failed: "tailstrike" }).value, 0);
  assert.equal(totalScore(100, 100), 100);
  assert.equal(totalScore(50, 100), 80);
});

test("PAPI shows two white and two red on the 3° glidepath", () => {
  const show = (a) => papiLights(a).map((w) => (w ? "W" : "R")).join("");
  assert.equal(show(3.0), "WWRR");
  assert.equal(show(3.3), "WWWR");
  assert.equal(show(4), "WWWW");
  assert.equal(show(2.7), "WRRR");
  assert.equal(show(2), "RRRR");
  assert.ok(Math.abs(glideslopeDots(RWY.aim - 2000, 2000 * Math.tan((3 * Math.PI) / 180))) < 0.01);
  assert.ok(glideslopeDots(RWY.aim - 2000, 150) > 0.5);
  assert.ok(localizerDots(-1000, 40) > 0 && localizerDots(-1000, -40) < 0);
});

test("wind is split into headwind and crosswind and formatted like ATIS", () => {
  const w = windComponents(RWY.heading + 90, 12);
  assert.ok(Math.abs(w.cross - 12) < 1e-9 && Math.abs(w.head) < 1e-9);
  assert.ok(windComponents(RWY.heading, 10).head > 9.99);
  assert.ok(windComponents(RWY.heading - 90, 10).cross < -9.99);
  assert.equal(formatWind(220, 12), "220/12KT");
  assert.equal(formatWind(0, 5), "360/05KT");
  for (let s = 1; s < 30; s++) {
    const g = new RunwayGame(s);
    assert.ok(g.windLDG.head > 0, "landing wind is never a tailwind");
    assert.ok(g.windLDG.speed >= 8 && g.windLDG.speed <= 18);
  }
});

test("rotating at VR to 15° makes a clean takeoff", () => {
  const g = takeoff(new RunwayGame(1));
  assert.equal(g.phase, "clear");
  assert.equal(g.takeoff.ok, true);
  assert.ok(g.takeoff.value >= 90, `score ${g.takeoff.value}`);
  assert.ok(g.takeoff.maxGroundPitch < TAIL_LIMIT);
  assert.ok(g.events.some((e) => e.type === "callout" && e.text === "V1"));
  assert.ok(g.events.some((e) => e.type === "callout" && e.text === "ROTATE"));
  assert.ok(g.events.some((e) => e.type === "atc" && /cleared for takeoff/.test(e.en)));
});

test("over-pitching on the runway is a tailstrike", () => {
  // yank the nose up hard right at VR and keep pulling
  const g = new RunwayGame(2);
  g.start();
  g.setThrottle(1);
  step(g, (x) => x.setInput(x.ias >= V_SPEEDS.vr - 10 ? 1 : 0, 0, 0));
  assert.equal(g.phase, "result");
  assert.equal(g.takeoff.reason, "tailstrike");
  assert.equal(g.takeoff.value, 0);
  assert.equal(FAILURES.tailstrike, "테일스트라이크!");
});

test("rotating far too early fails to lift; never rotating overruns the runway", () => {
  const early = takeoff(new RunwayGame(3), 115, 8);
  assert.equal(early.takeoff.reason, "early");
  const never = takeoff(new RunwayGame(3), 999);
  assert.equal(never.takeoff.reason, "overrun");
  const late = takeoff(new RunwayGame(3), V_SPEEDS.vr + 30);
  assert.equal(late.takeoff.reason, "overrun");
  const slightlyLate = takeoff(new RunwayGame(3), V_SPEEDS.vr + 12);
  assert.equal(slightlyLate.phase, "clear");
  assert.ok(slightlyLate.takeoff.value < takeoff(new RunwayGame(3)).takeoff.value);
});

test("a flared, centred approach lands softly near the aiming point", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = land(new RunwayGame(seed, { stage: "landing" }));
    assert.equal(g.phase, "result");
    const l = g.landing;
    assert.ok(["butter", "good"].includes(l.grade), `seed ${seed}: ${l.grade} ${l.fpm}fpm`);
    assert.ok(Math.abs(l.centerline) < 3, `seed ${seed}: centreline ${l.centerline}`);
    assert.ok(l.distance > 0 && l.distance < 450, `seed ${seed}: distance ${l.distance}`);
    assert.ok(l.value >= 75, `seed ${seed}: ${l.value}`);
    assert.ok(g.events.some((e) => e.type === "atc" && /cleared to land/.test(e.en)));
  }
});

test("no flare or diving at the runway is hard or a crash; wandering off gets a go-around", () => {
  const hands = new RunwayGame(4, { stage: "landing" });
  hands.start();
  step(hands);
  assert.ok(["hard", "firm", "crash"].includes(hands.landing.grade), hands.landing.grade);
  assert.ok(hands.landing.fpm > 500);
  const dive = new RunwayGame(4, { stage: "landing" });
  dive.start();
  step(dive, (x) => x.setInput(-1, 0, 0));
  assert.equal(dive.landing.grade, "crash");
  assert.equal(dive.landing.value, 0);
  const drift = new RunwayGame(4, { stage: "landing" });
  drift.start();
  step(drift, (x) => x.setInput(0, 1, 0));
  assert.ok(["goaround", "crash"].includes(drift.landing.grade));
  const goAround = drift.events.find((e) => e.type === "atc" && /go around/.test(e.en));
  if (drift.landing.grade === "goaround") assert.ok(goAround);
});

test("the two stages combine into one result and pause freezes the flight", () => {
  const g = takeoff(new RunwayGame(5));
  assert.ok(g.nextStage());
  assert.equal(g.stage, "landing");
  assert.equal(g.phase, "ready");
  g.start();
  g.pause();
  const x = g.ac.x;
  g.update(1);
  assert.equal(g.ac.x, x);
  g.resume();
  land(g);
  assert.equal(g.result.complete, true);
  assert.equal(g.result.value, totalScore(g.takeoff.value, g.landing.value));
});

test("frame rate does not change the outcome much", () => {
  const run = (dt) => {
    const g = new RunwayGame(9);
    g.start();
    g.setThrottle(1);
    for (let i = 0; i < 90 / dt && g.phase === "fly"; i++) {
      g.setInput(g.ias >= V_SPEEDS.vr && g.ac.pitch < 15 ? 1 : 0, 0, 0);
      g.update(dt);
    }
    return g.takeoff.value;
  };
  assert.ok(Math.abs(run(1 / 120) - run(1 / 30)) <= 6);
});
