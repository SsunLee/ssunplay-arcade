import test from "node:test";
import assert from "node:assert/strict";
import {
  RunwayGame, RWY, V_SPEEDS, VAPP, TAIL_LIMIT, ROTATE_EARLY, MAX_CROSS, SINK_GRADES, KT, FT, GRADES, FAILURES,
  HOLD, HOLD_LABELS, RETARD_FT, holdStick, holdLabel, releaseThrottle, LIVERIES, DEFAULT_LIVERY, LIVERY_KEY, getLivery,
  landingGrade, scoreLanding, scoreTakeoff, totalScore, papiLights, windComponents, formatWind, glideslopeDots, localizerDots,
} from "./runway-engine.js";

const step = (g, fn, seconds = 120) => {
  for (let i = 0; i < seconds * 120 && ["fly", "roll"].includes(g.phase); i++) {
    fn?.(g);
    g.update(1 / 120);
  }
  return g;
};
/** Advance `seconds` of flight in small steps (update() caps a single frame at 0.25 s). */
const run = (g, seconds) => { for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120); return g; };
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
  assert.deepEqual(SINK_GRADES, { butter: 180, good: 400, firm: 750, crash: 1200 });
  assert.equal(landingGrade(60), "butter");
  assert.equal(landingGrade(179), "butter");
  assert.equal(landingGrade(180), "good");
  assert.equal(landingGrade(399), "good");
  assert.equal(landingGrade(400), "firm");
  assert.equal(landingGrade(749), "firm");
  assert.equal(landingGrade(750), "hard");
  assert.equal(landingGrade(1000), "hard");
  assert.equal(landingGrade(1199), "hard");
  assert.equal(landingGrade(1200), "crash");
  assert.equal(landingGrade(80, true), "crash");
  assert.equal(GRADES.butter, "버터 랜딩!");
  assert.equal(GRADES.hard, "하드 랜딩");
});

test("landing score rewards a soft, centred touchdown at the aiming point", () => {
  const perfect = scoreLanding({ fpm: 170, centerline: 0.4, distance: 20 });
  assert.equal(perfect.value, 100);
  assert.equal(perfect.grade, "butter");
  const firm = scoreLanding({ fpm: 520, centerline: 6, distance: 250 });
  assert.equal(firm.grade, "firm");
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
  assert.ok(late.rotation < 20);
  // rotating a little early is forgiven more than rotating late
  assert.equal(scoreTakeoff({ rotateKt: V_SPEEDS.vr - 5, climbPitch: 15, endKt: V_SPEEDS.v2 + 10 }).rotation, 50);
  const early = scoreTakeoff({ rotateKt: V_SPEEDS.vr - ROTATE_EARLY, climbPitch: 15, endKt: V_SPEEDS.v2 + 10 });
  assert.ok(early.rotation >= 40 && early.rotation > scoreTakeoff({ rotateKt: V_SPEEDS.vr + 10, climbPitch: 15, endKt: V_SPEEDS.v2 + 10 }).rotation);
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
  assert.equal(MAX_CROSS, 8);
  for (let s = 1; s < 200; s++) {
    const g = new RunwayGame(s);
    assert.ok(g.windLDG.head > 0, "landing wind is never a tailwind");
    assert.ok(g.windLDG.speed >= 4 && g.windLDG.speed <= 14, `seed ${s}: ${g.windLDG.speed}`);
    assert.ok(Math.abs(g.windLDG.cross) <= MAX_CROSS + 1e-9, `seed ${s}: crosswind ${g.windLDG.cross}`);
    assert.ok(Math.abs(g.windTO.cross) <= 6 + 1e-9);
  }
});

test("rotating at VR to 15° makes a clean takeoff", () => {
  const g = takeoff(new RunwayGame(1));
  assert.equal(g.phase, "clear");
  assert.equal(g.takeoff.ok, true);
  assert.ok(g.takeoff.value >= 90, `score ${g.takeoff.value}`);
  assert.ok(g.takeoff.maxGroundPitch < TAIL_LIMIT);
  assert.ok(TAIL_LIMIT >= 13);
  assert.ok(g.events.some((e) => e.type === "callout" && e.text === "V1"));
  assert.ok(g.events.some((e) => e.type === "callout" && e.text === "ROTATE"));
  assert.ok(g.events.some((e) => e.type === "atc" && /cleared for takeoff/.test(e.en)));
});

test("over-pitching on the runway is a tailstrike", () => {
  // pull hard and keep pulling without takeoff thrust: the wheels stay down while the nose passes the limit
  const g = new RunwayGame(2);
  g.start();
  g.setThrottle(1);
  step(g, (x) => {
    if (x.ias >= V_SPEEDS.vr - 15) x.setThrottle(0.6);
    x.setInput(x.ias >= V_SPEEDS.vr - ROTATE_EARLY ? 1 : 0, 0, 0);
  });
  assert.equal(g.phase, "result");
  assert.equal(g.takeoff.reason, "tailstrike");
  assert.equal(g.takeoff.value, 0);
  assert.equal(FAILURES.tailstrike, "테일스트라이크!");
});

test("the rotation window is forgiving: from VR-10 kt a full pull still flies", () => {
  for (const kt of [V_SPEEDS.vr - ROTATE_EARLY, V_SPEEDS.vr - 5, V_SPEEDS.vr]) {
    // yank and keep pulling, then let go once the nose is high
    const g = new RunwayGame(2);
    g.start();
    g.setThrottle(1);
    step(g, (x) => x.setInput(x.ias >= kt && x.ac.pitch < 16 ? 1 : 0, 0, 0));
    assert.equal(g.phase, "clear", `rotate at ${kt}: ${g.takeoff?.reason}`);
    assert.ok(g.takeoff.value >= 70, `rotate at ${kt}: ${g.takeoff.value}`);
  }
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

test("pitch damping: the nose answers the stick smoothly, not instantly", () => {
  const g = new RunwayGame(7, { stage: "landing" });
  g.start();
  const p0 = g.ac.pitch;
  g.setInput(1, 0, 0);
  run(g, 0.1);
  assert.ok(g.ac.pitch - p0 < 0.3 * 0.6, `after 0.1 s ${g.ac.pitch - p0}`);
  run(g, 0.9);
  assert.ok(g.ac.pitch - p0 > 2, `after 1 s ${g.ac.pitch - p0}`);
  assert.equal(g.ctl.pitch, 1);
  // let go: the rate decays instead of stopping dead
  g.setInput(0, 0, 0);
  const p1 = g.ac.pitch;
  g.update(1 / 60);
  assert.ok(g.ac.pitch > p1);
});

test("assist: wings level slowly without roll input, and the ailerons show it", () => {
  const g = new RunwayGame(3, { stage: "landing" });
  g.start();
  g.ac.bank = 20;
  g.update(1 / 60);
  assert.ok(g.ctl.roll < 0, "ailerons roll back toward level");
  assert.equal(g.assistInfo.roll, true);
  run(g, 1);
  assert.ok(g.ac.bank > 10, `levels gently, not instantly: ${g.ac.bank}`);
  run(g, 4);
  assert.ok(Math.abs(g.ac.bank) <= 5.5, `bank ${g.ac.bank}`);
  // any roll input takes over at once
  g.setInput(0, 1, 0);
  g.update(1 / 60);
  assert.equal(g.assistInfo.roll, false);
  assert.ok(g.ctl.roll > 0.5);
  const raw = new RunwayGame(3, { stage: "landing", assist: false });
  assert.equal(raw.assist, false);
});

test("assist: hands off, the approach is nudged onto the localizer and glideslope", () => {
  for (const seed of [1, 3, 5]) {
    const fly = (assist) => {
      const g = new RunwayGame(seed, { stage: "landing", assist });
      g.start();
      g.ac.z = 35; // start off the centreline, a little high and slow
      g.ac.pitch += 1.5;
      g.throttle *= 0.6;
      let at200 = null;
      step(g, (x) => { if (!at200 && x.altFt < 200) at200 = { loc: x.locDots, gs: x.gsDots, kt: x.ias }; });
      return { g, at200 };
    };
    const on = fly(true), off = fly(false);
    assert.ok(Math.abs(on.at200.loc) < 0.15, `seed ${seed}: loc ${on.at200.loc}`);
    assert.ok(Math.abs(on.at200.gs) < 0.5, `seed ${seed}: gs ${on.at200.gs}`);
    assert.ok(Math.abs(on.at200.kt - VAPP) < 8, `seed ${seed}: ias ${on.at200.kt}`);
    assert.ok(Math.abs(off.at200.loc) > Math.abs(on.at200.loc) * 3);
    assert.ok(Math.abs(on.g.landing.centerline) < 3, `seed ${seed}: ${on.g.landing.centerline}`);
    // the flare is still the pilot's job: no hands-off butter
    assert.ok(!["butter", "good"].includes(on.g.landing.grade), `seed ${seed}: ${on.g.landing.grade}`);
    assert.ok(on.g.landing.value > off.g.landing.value);
  }
});

test("assist: the auto-throttle holds VAPP and hints when the speed is off", () => {
  const g = new RunwayGame(4, { stage: "landing" });
  g.start();
  g.ac.v = (VAPP - 15) * KT;
  g.update(1 / 60);
  assert.equal(g.assistInfo.thr, 1, "too slow: more thrust");
  const t0 = g.throttle;
  run(g, 2);
  assert.ok(g.throttle > t0);
  g.ac.v = (VAPP + 15) * KT;
  g.update(1 / 60);
  assert.equal(g.assistInfo.thr, -1, "too fast: less thrust");
  // the pilot's own throttle input wins
  const slow = new RunwayGame(4, { stage: "landing" });
  slow.start();
  const s0 = slow.throttle;
  slow.setInput(0, 0, -1);
  run(slow, 1);
  assert.ok(slow.throttle < s0 - 0.3);
});

test("assist: after liftoff the nose eases toward the 15° climb attitude", () => {
  const g = new RunwayGame(6);
  g.start();
  g.setThrottle(1);
  step(g, (x) => x.setInput(x.ac.ground && x.ias >= V_SPEEDS.vr ? 1 : 0, 0, 0));
  assert.equal(g.phase, "clear");
  assert.ok(Math.abs(g.takeoff.climbPitch - 15) < 3, `climb ${g.takeoff.climbPitch}`);
});

test("the two stages combine into one result and pause freezes the flight", () => {
  const g = takeoff(new RunwayGame(5));
  assert.ok(g.nextStage());
  assert.equal(g.stage, "landing");
  assert.equal(g.phase, "ready");
  g.start();
  g.pause();
  const x = g.ac.x;
  run(g, 1);
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

test("hold button drag: down = nose up, sideways = roll, with a deadzone and a clamped radius", () => {
  const still = holdStick(0, 0);
  assert.equal(still.pitch, 0);
  assert.equal(still.roll, 0);
  assert.equal(still.active, false);
  // inside the deadzone nothing moves
  const tiny = holdStick(HOLD.dead - 1, -(HOLD.dead - 1));
  assert.equal(Math.abs(tiny.pitch) + Math.abs(tiny.roll), 0);
  // drag down pulls the nose up (positive pitch, like the S key / ▼ button), drag up pushes it down
  assert.ok(holdStick(0, 40).pitch > 0);
  assert.ok(holdStick(0, -40).pitch < 0);
  assert.ok(holdStick(40, 0).roll > 0 && holdStick(-40, 0).roll < 0);
  // proportional between the deadzone and the radius
  const half = HOLD.dead + (HOLD.radius - HOLD.dead) / 2;
  assert.ok(Math.abs(holdStick(0, half).pitch - 0.5) < 1e-9);
  assert.ok(holdStick(0, 30).pitch < holdStick(0, 60).pitch);
  // full deflection at the radius and beyond; the knob stays on the circle
  assert.equal(holdStick(0, HOLD.radius).pitch, 1);
  const far = holdStick(300, 400);
  assert.equal(far.pitch, 1);
  assert.equal(far.roll, 1);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - HOLD.radius) < 1e-9);
  assert.ok(Math.abs(far.y / far.x - 4 / 3) < 1e-9);
  // a mostly vertical drag does not roll
  assert.equal(holdStick(6, 70).roll, 0);
  assert.equal(HOLD.radius, 80);
});

test("hold button label names the drag direction", () => {
  assert.equal(holdLabel(holdStick(0, 60)), HOLD_LABELS.up);
  assert.equal(HOLD_LABELS.up, "기수↑");
  assert.equal(holdLabel(holdStick(0, -60)), "기수↓");
  assert.equal(holdLabel(holdStick(60, 60)), "기수↑ · 기울기 ▶");
  assert.equal(holdLabel(holdStick(-60, 0)), "◀ 기울기");
  assert.equal(holdLabel(holdStick(3, 3)), "");
});

test("releasing the hold button: idle on the ground before liftoff, the earlier setting in the air", () => {
  assert.equal(releaseThrottle({ grounded: true, prev: 0.7 }), 0);
  assert.equal(releaseThrottle({ grounded: false, prev: 0.42 }), 0.42);
  assert.equal(releaseThrottle({ grounded: false, prev: 2 }), 1);
  assert.equal(releaseThrottle({ grounded: false, prev: 0, climb: true }), 0.85);
});

test("holding the button ramps the thrust to full and returns to idle on the takeoff roll", () => {
  const g = new RunwayGame(7);
  g.start();
  g.holdThrust(true);
  run(g, 0.5);
  const partway = g.throttle;
  assert.ok(partway > 0.2 && partway < 1);
  run(g, 2);
  assert.equal(g.throttle, 1);
  assert.ok(g.ac.ground && g.ias > 0);
  g.holdThrust(false);
  assert.equal(g.thrustBack, 0);
  run(g, 0.3);
  assert.ok(g.throttle < 1 && g.throttle > 0, "eases back rather than snapping");
  run(g, 1.5);
  assert.equal(g.throttle, 0);
  assert.equal(g.thrustBack, null);
});

test("hold button alone flies a takeoff, and in the air it returns to the earlier thrust", () => {
  const g = new RunwayGame(3);
  g.start();
  g.setThrottle(0.6);
  g.holdThrust(true);
  // the drag pitches up at VR while the button stays held
  step(g, (x) => x.setInput(x.ias >= V_SPEEDS.vr && x.ac.pitch < 15 ? holdStick(0, 60).pitch : 0, 0, 0), 60);
  assert.ok(g.takeoff?.ok, "takeoff completes");
  assert.equal(g.throttle, 1);

  const a = new RunwayGame(3);
  a.start();
  a.setThrottle(0.9);
  a.holdThrust(true);
  for (let i = 0; i < 120 * 60 && a.ac.ground && a.phase === "fly"; i++) { a.setInput(a.ias >= V_SPEEDS.vr && a.ac.pitch < 12 ? 1 : 0, 0, 0); a.update(1 / 120); }
  assert.equal(a.ac.ground, false);
  a.holdThrust(false);
  assert.equal(a.thrustBack, 0.9);
  a.setInput(0, 0, 0);
  run(a, 0.5);
  assert.ok(Math.abs(a.throttle - 0.9) < 1e-9);
});

test("on approach the hold button overrides the auto-throttle and hands back the prior setting", () => {
  // assist off so the auto-throttle does not move the levers after the hand-back
  const g = new RunwayGame(5, { stage: "landing", assist: false });
  g.start();
  const before = g.throttle;
  assert.ok(before < 0.9);
  g.holdThrust(true);
  run(g, 1);
  assert.ok(g.throttle > before + 0.5);
  g.holdThrust(false);
  assert.ok(Math.abs(g.thrustBack - before) < 1e-9);
  run(g, 1.2);
  assert.equal(g.throttle, before);
  assert.equal(g.thrustBack, null);
  // THR input takes over from the ease-back
  g.holdThrust(true);
  run(g, 0.3);
  g.holdThrust(false);
  g.setInput(0, 0, -1);
  run(g, 1 / 120);
  assert.equal(g.thrustBack, null);
});

test("assist: below RETARD height the levers go to idle without throttle input, unless the pilot holds them", () => {
  const flare = (hold) => {
    const g = new RunwayGame(5, { stage: "landing" });
    g.start();
    g.ac.h = (RETARD_FT - 5) * FT;
    if (hold) g.holdThrust(true);
    run(g, 0.3);
    return g;
  };
  const g = flare(false);
  assert.ok(g.throttle < 0.2, "retarding");
  for (let i = 0; i < 120 && g.phase === "fly"; i++) g.update(1 / 120);
  assert.equal(g.throttle, 0);
  assert.ok(flare(true).throttle > 0.5, "the held levers win");
  const manual = new RunwayGame(5, { stage: "landing", assist: false });
  manual.start();
  const t0 = manual.throttle;
  manual.ac.h = (RETARD_FT - 5) * FT;
  manual.update(1 / 60);
  assert.ok(Math.abs(manual.throttle - t0) < 0.01, "no retard without the assist");
});

test("liveries: eight fictional schemes with unique ids and valid colours, falling back to the classic", () => {
  assert.equal(LIVERIES.length, 8);
  const ids = LIVERIES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(LIVERIES.map((l) => l.name)).size, ids.length);
  const hex = /^#[0-9a-f]{6}$/i;
  for (const l of LIVERIES) {
    assert.match(l.id, /^[a-z]+$/);
    assert.ok(l.name && l.tagline && l.title, l.id);
    assert.ok(["swirl", "stripes", "sweep", "slant", "wing", "band", "waves", "sun"].includes(l.tail), l.id);
    for (const key of ["body", "belly", "tail", "accent", "rudder", "engine", "band", "winglet", "title"]) assert.match(l.colors[key], hex, `${l.id}.${key}`);
    for (const [key, v] of Object.entries(l.colors)) if (v !== null) assert.match(v, hex, `${l.id}.${key}`);
  }
  // the stripe tail needs all five bands
  const s = getLivery("saekdong");
  for (const key of ["accent", "accent2", "accent3", "accent4", "accent5"]) assert.match(s.colors[key], hex);
  assert.ok(ids.includes(DEFAULT_LIVERY));
  assert.equal(getLivery("skyblue").id, "skyblue");
  for (const bad of [null, undefined, "", "korean-air", "SKYBLUE", "__proto__"]) assert.equal(getLivery(bad).id, DEFAULT_LIVERY);
  assert.equal(typeof LIVERY_KEY, "string");
});

test("liveries carry no real airline names", () => {
  const banned = /korean|asiana|jeju|jin ?air|t'?way|air ?busan|air ?seoul|eastar|대한항공|아시아나|제주항공|진에어|티웨이|에어부산|에어서울|이스타/i;
  for (const l of LIVERIES) for (const text of [l.id, l.name, l.title, l.tagline]) assert.doesNotMatch(text, banned);
});

import { FLAPS, FLAPS_TO, FLAPS_LDG, stallKt } from "./runway-engine.js";
test("flaps: more flap = lower stall speed and more drag; lever moves one notch at a time", () => {
  for (let i = 1; i < FLAPS.length; i++) {
    assert.ok(stallKt(i) < stallKt(i - 1));
    assert.ok(FLAPS[i].drag > FLAPS[i - 1].drag && FLAPS[i].deg > FLAPS[i - 1].deg);
  }
  const g = new RunwayGame(3);
  assert.equal(g.flaps, FLAPS_TO);
  assert.ok(g.setFlaps(-1));
  assert.equal(g.flaps, 0);
  assert.equal(g.setFlaps(-1), false);
  assert.equal(new RunwayGame(3, { stage: "landing" }).flaps, FLAPS_LDG);
});
test("new pilot: throttle lever to the top, pull at VR, then land with the throttle untouched", () => {
  for (const seed of [1, 7, 42, 99]) {
    const g = new RunwayGame(seed);
    g.start();
    g.setThrottle(1);
    step(g, (x) => x.setInput(x.ias >= V_SPEEDS.vr && x.ac.pitch < 14 ? 0.7 : 0, 0, 0), 90);
    assert.equal(g.phase, "clear", `seed ${seed}: ${g.takeoff?.reason}`);
    g.nextStage();
    g.start();
    step(g, (x) => x.setInput(x.altFt < 30 && x.fpm < -300 ? 0.45 : 0, 0, 0), 120);
    assert.ok(g.landing && !["crash", "goaround"].includes(g.landing.grade), `seed ${seed}: ${g.landing?.reason} ${g.landing?.fpm}`);
  }
});
test("manual throttle below 25 ft holds while the lever is held, then auto-idles", () => {
  const g = new RunwayGame(5, { stage: "landing" });
  g.start();
  step(g, (x) => { if (x.altFt < 20) { x.input.held = true; x.setThrottle(0.5); } }, 0);
  for (let i = 0; i < 120 * 200 && g.altFt > 15; i++) g.update(1 / 120);
  g.input.held = true; g.setThrottle(0.5); g.update(0.2);
  assert.ok(g.throttle > 0.49);
  g.input.held = false; g.update(0.2);
  assert.ok(g.throttle < 0.45);
});
