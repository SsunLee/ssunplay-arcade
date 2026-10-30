import { RunwayGame, RWY, V_SPEEDS, VAPP, TAIL_LIMIT, GRADES, FAILURES, formatWind, clamp } from "./runway-engine.js";
import { RunwayView } from "./runway-view.js";

const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>';
const HINT = {
  throttle: "추력을 끝까지 올리세요 (Shift · THR +)",
  wait: "속도가 붙고 있어요… VR까지 기다리세요",
  rotate: "로테이트! 기수를 드세요 (S · ↓ · 아래로 드래그)",
  climb: "기수 15° 유지, 300피트까지 상승",
  tail: "기수를 너무 들면 꼬리가 닿아요!",
  path: "PAPI 흰색 2개 · 빨간색 2개를 유지하세요",
  line: "기울여서 중심선에 맞추세요",
  flare: "추력을 줄이고 살짝 기수를 드세요 · 플레어!",
  roll: "착륙! 감속 중…",
  paused: "일시 정지",
};
const TIPS = {
  tailstrike: "VR에서 천천히 들어 올리고, 바퀴가 뜰 때까지 11°를 넘기지 마세요.",
  early: "VR(145kt)이 될 때까지 기다렸다가 기수를 드세요.",
  overrun: "VR에서 바로 기수를 들어야 활주로 끝 전에 떠요.",
  stall: "기수를 너무 높이 들면 속도가 떨어져 실속해요.",
  sink: "이륙 직후에는 기수를 유지하고 상승하세요.",
  short: "PAPI가 빨간색 3~4개면 너무 낮아요. 기수를 살짝 드세요.",
  excursion: "측풍 쪽으로 살짝 기울여 중심선을 지키세요.",
  wingstrike: "접지 직전에는 날개를 수평으로 맞추세요.",
  nosegear: "접지 직전에 기수를 살짝 들어 뒷바퀴부터 닿게 하세요.",
  hard: "50피트 아래에서 추력을 줄이고 기수를 살짝 들어 강하율을 줄이세요.",
  goaround: "400피트 아래에서는 안정된 접근이 필요해요. 활공각과 속도를 지키세요.",
};
const pad = (n, w = 3) => String(Math.round(Math.abs(n))).padStart(w, "0");
const signed = (n, digits = 0) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(digits);

/** Engine hum and call-out chimes, created on the first user gesture. */
class Sound {
  constructor(enabled) { this.enabled = enabled; }
  ensure() {
    if (!this.enabled() || this.ctx) return this.ctx?.resume();
    try {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = ctx.createBufferSource();
      this.noise.buffer = buf;
      this.noise.loop = true;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.value = 300;
      this.whine = ctx.createOscillator();
      this.whine.type = "triangle";
      this.whine.frequency.value = 400;
      this.whineGain = ctx.createGain();
      this.whineGain.gain.value = 0;
      this.gain = ctx.createGain();
      this.gain.gain.value = 0;
      this.noise.connect(this.filter).connect(this.gain).connect(ctx.destination);
      this.whine.connect(this.whineGain).connect(ctx.destination);
      this.noise.start();
      this.whine.start();
    } catch { this.ctx = null; }
  }
  engine(throttle, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = this.enabled() && on ? 1 : 0;
    this.gain.gain.setTargetAtTime(k * (0.03 + throttle * 0.09), t, 0.2);
    this.filter.frequency.setTargetAtTime(250 + throttle * 900, t, 0.3);
    this.whine.frequency.setTargetAtTime(380 + throttle * 900, t, 0.4);
    this.whineGain.gain.setTargetAtTime(k * (0.004 + throttle * 0.01), t, 0.3);
  }
  chime(hz = 880, dur = 0.12) {
    if (!this.ctx || !this.enabled()) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.frequency.value = hz;
    o.connect(g).connect(this.ctx.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  destroy() { try { this.ctx?.close(); } catch {} }
}

export class RunwayController {
  constructor({ app, header, modal, sound, onResult, stage = "takeoff" }) {
    this.g = new RunwayGame(undefined, { stage });
    this.modal = modal;
    this.onResult = onResult;
    this.dead = false;
    this.cache = {};
    this.abort = new AbortController();
    this.keys = new Set();
    this.hold = { pitch: 0, roll: 0, throttle: 0 };
    this.drag = null;
    this.tilt = null;
    this.sound = new Sound(sound);
    app.innerHTML = header + `<main id="main" class="game-shell runway" data-stage="takeoff" data-phase="ready">
<canvas id="game" tabindex="0" aria-label="활주로 3D 화면: 위아래로 끌면 기수, 좌우로 끌면 기울기"></canvas>
<div class="rw-top"><div class="rw-stage"><span id="rw-stage-label"></span><b id="rw-wind" translate="no"></b></div>
<div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-rw="tilt" class="rw-tilt" aria-pressed="false" aria-label="기울기 조종">📱</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog">${shareIcon}</button></div></div>
<div class="rw-pfd" translate="no"><div><small>IAS</small><b id="rw-ias"></b><i>KT</i></div><div><small>ALT</small><b id="rw-alt"></b><i>FT</i></div><div><small>V/S</small><b id="rw-vs"></b><i>FPM</i></div><div><small>PITCH</small><b id="rw-pitch"></b><i>DEG</i></div><div><small>THR</small><b id="rw-thr"></b><i>%</i></div><div class="rw-crab"><small>CRAB</small><b id="rw-crab"></b><i>DEG</i></div></div>
<div id="rw-speedbar" class="rw-speedbar" translate="no"><span id="rw-speedfill"></span><i style="left:${(V_SPEEDS.v1 / 180) * 100}%">V1</i><i style="left:${(V_SPEEDS.vr / 180) * 100}%">VR</i></div>
<p id="rw-hint" class="rw-hint" role="status" aria-live="polite"></p>
<div id="rw-atc" class="rw-atc" hidden><span class="rw-atc-from" translate="no">TWR</span><p id="rw-atc-en" class="rw-atc-en" translate="no"></p><p id="rw-atc-ko" class="rw-atc-ko"></p></div>
<div id="rw-callout" class="rw-callout" translate="no" aria-hidden="true"></div>
<div id="rw-warn" class="rw-warn" translate="no" aria-hidden="true"></div>
<div id="rw-gs" class="rw-gs" aria-hidden="true"><div class="rw-papi" id="rw-papi"><i></i><i></i><i></i><i></i></div><div class="rw-scale v"><span></span><span></span><span class="c"></span><span></span><span></span><b id="rw-gs-dia"></b></div><small translate="no">GS</small></div>
<div id="rw-loc" class="rw-loc" aria-hidden="true"><div class="rw-scale h"><span></span><span></span><span class="c"></span><span></span><span></span><b id="rw-loc-dia"></b></div><small translate="no">LOC</small></div>
<div id="rw-stick" class="rw-stick" hidden aria-hidden="true"><i></i></div>
<div id="rw-intro" class="rw-intro"></div>
<div class="rw-pad" aria-label="조종 버튼"><div class="rw-thr"><button data-hold="throttle:1" aria-label="추력 올리기">THR +</button><button data-hold="throttle:-1" aria-label="추력 줄이기">THR −</button></div>
<div class="rw-yoke"><button data-hold="pitch:-1" class="up" aria-label="기수 내리기">▲</button><button data-hold="roll:-1" class="left" aria-label="왼쪽으로 기울이기">◀</button><button data-hold="roll:1" class="right" aria-label="오른쪽으로 기울이기">▶</button><button data-hold="pitch:1" class="down" aria-label="기수 들기">▼</button></div></div>
<div id="result" class="result-overlay" hidden></div>
</main>`;
    this.shell = app.querySelector(".runway");
    this.canvas = app.querySelector("#game");
    this.view = new RunwayView(this.canvas, this.g);
    this.bind();
    this.showIntro();
    let prev = performance.now();
    const frame = (now) => {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      if (!modal.open) {
        this.applyInput();
        this.g.update(dt);
        for (const e of this.g.events.splice(0)) { this.view.handle(e); this.onEvent(e); }
        this.view.render(this.g.phase === "paused" ? 0 : dt);
        this.updateHUD();
      }
      this.sound.engine(this.g.throttle, !modal.open && !["paused", "result"].includes(this.g.phase));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  $(id) { return this.shell.querySelector("#" + id); }
  set(id, prop, value) {
    const k = id + prop;
    if (this.cache[k] === value) return;
    this.cache[k] = value;
    const el = this.$(id);
    if (!el) return;
    if (prop === "text") el.textContent = value;
    else if (prop === "html") el.innerHTML = value;
    else if (prop === "hidden") el.hidden = value;
    else if (prop === "class") el.className = value;
    else el.style[prop] = value;
  }
  bind() {
    const opt = { signal: this.abort.signal }, c = this.canvas, g = this.g;
    this.shell.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rw]");
      if (!b) return;
      this.sound.ensure();
      const a = b.dataset.rw;
      if (a === "start") this.start();
      if (a === "landing") this.toLanding();
      if (a === "tilt") this.toggleTilt();
    }, opt);
    // hold-to-fly buttons: several can be held at once with multitouch
    const held = new Map();
    const release = (e) => {
      const h = held.get(e.pointerId);
      if (!h) return;
      held.delete(e.pointerId);
      h.el.classList.remove("on");
      this.hold[h.axis] = [...held.values()].filter((x) => x.axis === h.axis).reduce((s, x) => s + x.dir, 0);
    };
    this.shell.querySelectorAll("[data-hold]").forEach((el) => {
      const [axis, dir] = el.dataset.hold.split(":");
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.sound.ensure();
        el.setPointerCapture(e.pointerId);
        held.set(e.pointerId, { axis, dir: +dir, el });
        el.classList.add("on");
        this.hold[axis] = [...held.values()].filter((x) => x.axis === axis).reduce((s, x) => s + x.dir, 0);
        if (g.phase === "ready") this.start();
      }, opt);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, release, opt);
      el.addEventListener("contextmenu", (e) => e.preventDefault(), opt);
    });
    // drag anywhere on the scene like a virtual stick: down = pull back (nose up)
    const stick = this.$("rw-stick");
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || this.drag) return;
      this.sound.ensure();
      c.setPointerCapture(e.pointerId);
      c.focus({ preventScroll: true });
      const r = this.shell.getBoundingClientRect();
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      stick.hidden = false;
      stick.style.left = e.clientX - r.left + "px";
      stick.style.top = e.clientY - r.top + "px";
      stick.firstChild.style.transform = "translate(-50%,-50%)";
      e.preventDefault();
    }, opt);
    c.addEventListener("pointermove", (e) => {
      if (this.drag?.id !== e.pointerId) return;
      const range = Math.max(60, Math.min(c.clientWidth, c.clientHeight) * 0.18);
      this.drag.dx = clamp((e.clientX - this.drag.x) / range, -1, 1);
      this.drag.dy = clamp((e.clientY - this.drag.y) / range, -1, 1);
      stick.firstChild.style.transform = `translate(calc(-50% + ${this.drag.dx * 34}px), calc(-50% + ${this.drag.dy * 34}px))`;
      e.preventDefault();
    }, opt);
    const end = (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      stick.hidden = true;
    };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) c.addEventListener(t, end, opt);
    const KEYS = {
      KeyW: "pd", ArrowUp: "pd", KeyS: "pu", ArrowDown: "pu", KeyA: "rl", ArrowLeft: "rl", KeyD: "rr", ArrowRight: "rr",
      ShiftLeft: "tu", ShiftRight: "tu", Equal: "tu", NumpadAdd: "tu", PageUp: "tu", ControlLeft: "td", ControlRight: "td", Minus: "td", NumpadSubtract: "td", PageDown: "td",
    };
    window.addEventListener("keydown", (e) => {
      if (this.modal.open || e.target.closest?.("input,textarea,select")) return;
      const onButton = e.target.closest?.("button,a");
      if ((e.code === "Space" || e.code === "Enter") && !onButton) {
        e.preventDefault();
        if (e.repeat) return;
        this.sound.ensure();
        if (g.phase === "ready") this.start();
        else if (g.phase === "clear") this.toLanding();
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        this.shell.querySelector('[data-action="pause"]').click();
        return;
      }
      if (e.code === "KeyR" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.shell.querySelector('[data-action="retry"]').click();
        return;
      }
      const k = KEYS[e.code];
      if (!k) return;
      if (!e.ctrlKey || k === "td") e.preventDefault();
      this.keys.add(k);
      this.sound.ensure();
    }, opt);
    window.addEventListener("keyup", (e) => {
      const k = KEYS[e.code];
      if (k) this.keys.delete(k);
    }, opt);
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.drag = null;
      stick.hidden = true;
    }, opt);
  }
  applyInput() {
    const k = this.keys, h = this.hold, d = this.drag, t = this.tilt?.on ? this.tilt : null;
    const pitch = (k.has("pu") ? 1 : 0) - (k.has("pd") ? 1 : 0) + h.pitch + (d ? d.dy : 0) + (t ? t.pitch : 0),
      roll = (k.has("rr") ? 1 : 0) - (k.has("rl") ? 1 : 0) + h.roll + (d ? d.dx : 0) + (t ? t.roll : 0),
      thr = (k.has("tu") ? 1 : 0) - (k.has("td") ? 1 : 0) + h.throttle;
    this.g.setInput(pitch, roll, thr);
  }
  async toggleTilt() {
    const btn = this.shell.querySelector('[data-rw="tilt"]');
    if (this.tilt?.on) {
      this.tilt.on = false;
      btn.setAttribute("aria-pressed", "false");
      this.toast("기울기 조종 끔");
      return;
    }
    try {
      const D = window.DeviceOrientationEvent;
      if (!D) throw Error("unsupported");
      if (typeof D.requestPermission === "function" && (await D.requestPermission()) !== "granted") throw Error("denied");
    } catch {
      this.toast("이 기기에서는 기울기 조종을 쓸 수 없어요");
      return;
    }
    if (!this.tilt) {
      this.tilt = { on: true, base: null, pitch: 0, roll: 0 };
      window.addEventListener("deviceorientation", (e) => {
        const t = this.tilt;
        if (!t.on || e.beta == null) return;
        const angle = screen.orientation?.angle ?? window.orientation ?? 0,
          land = Math.abs(angle) === 90,
          fb = land ? e.gamma * (angle === 90 ? -1 : 1) : e.beta,
          lr = land ? e.beta * (angle === 90 ? 1 : -1) : e.gamma;
        if (!t.base) t.base = { fb, lr };
        t.pitch = clamp((fb - t.base.fb) / 18, -1, 1);
        t.roll = clamp((lr - t.base.lr) / 22, -1, 1);
      }, { signal: this.abort.signal });
    }
    this.tilt.on = true;
    this.tilt.base = null;
    btn.setAttribute("aria-pressed", "true");
    this.toast("기울기 조종 켬 · 지금 자세가 중립이에요");
  }
  toast(text) {
    const el = document.querySelector("#toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  start() {
    if (this.g.start()) {
      this.set("rw-intro", "hidden", true);
      this.canvas.focus({ preventScroll: true });
    }
  }
  toLanding() {
    if (!this.g.nextStage()) return;
    this.$("result").hidden = true;
    this.resultShown = false;
    this.view.cameraReady = false;
    this.showIntro();
  }
  showIntro() {
    const g = this.g, w = g.wind, to = g.stage === "takeoff";
    this.set("rw-intro", "hidden", false);
    this.cache["rw-introhidden"] = false;
    this.$("rw-intro").innerHTML = to
      ? `<span class="rw-eyebrow" translate="no">STAGE 1 · TAKEOFF · RWY ${RWY.id}</span><h1>김포 14R, 이륙 준비</h1><p>추력을 끝까지 올려 속도를 내고, VR에서 기수를 드세요. 너무 일찍 들거나 너무 많이 들면 꼬리가 활주로에 닿아요.</p><dl translate="no"><div><dt>V1</dt><dd>${V_SPEEDS.v1}</dd></div><div><dt>VR</dt><dd>${V_SPEEDS.vr}</dd></div><div><dt>V2</dt><dd>${V_SPEEDS.v2}</dd></div><div><dt>WIND</dt><dd>${formatWind(w.dir, w.speed)}</dd></div></dl><button class="primary" data-rw="start">이륙 시작 <kbd translate="no">SPACE</kbd></button><button class="rw-skip" data-rw="landing">착륙만 연습하기 →</button>`
      : `<span class="rw-eyebrow" translate="no">STAGE 2 · LANDING · ILS ${RWY.id}</span><h1>최종 접근, 활주로 14R</h1><p>PAPI 흰색 2개·빨간색 2개를 유지하세요. 측풍이 불면 기울여 중심선을 지키고, 50피트 아래에서 추력을 줄이며 살짝 플레어!</p><dl translate="no"><div><dt>VAPP</dt><dd>${VAPP}</dd></div><div><dt>GS</dt><dd>${RWY.gs.toFixed(1)}°</dd></div><div><dt>WIND</dt><dd>${formatWind(w.dir, w.speed)}</dd></div><div><dt>X-WIND</dt><dd>${Math.abs(w.cross).toFixed(0)}KT ${w.cross >= 0 ? "R" : "L"}</dd></div></dl><button class="primary" data-rw="start">접근 시작 <kbd translate="no">SPACE</kbd></button>`;
    this.updateHUD(true);
  }
  onEvent(e) {
    if (e.type === "atc") this.atc(e.en, e.ko);
    if (e.type === "callout") {
      this.flash("rw-callout", e.text, 1300);
      this.sound.chime(/^\d+$/.test(e.text) ? 660 : 990);
    }
    if (e.type === "warn") this.flash("rw-warn", e.text, 900);
    if (e.type === "touchdown") this.sound.chime(220, 0.25);
    if (e.type === "stage" && e.stage === "takeoff" && e.ok) setTimeout(() => !this.dead && this.showClear(), 1600);
    if ((e.type === "stage" && e.stage === "landing") || e.type === "fail") setTimeout(() => !this.dead && this.showResult(), e.type === "fail" || !e.ok ? 1800 : 600);
  }
  flash(id, text, ms) {
    const el = this.$(id);
    if (el.textContent !== text || !el.classList.contains("show")) {
      el.textContent = text;
      el.classList.remove("show");
      void el.offsetWidth;
      el.classList.add("show");
    }
    clearTimeout(this["timer" + id]);
    this["timer" + id] = setTimeout(() => el.classList.remove("show"), ms);
  }
  atc(en, ko) {
    const box = this.$("rw-atc");
    this.$("rw-atc-en").textContent = en;
    this.$("rw-atc-ko").textContent = ko;
    box.hidden = false;
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    this.sound.chime(1200, 0.06);
    clearTimeout(this.atcTimer);
    this.atcTimer = setTimeout(() => (box.hidden = true), 6500);
  }
  hint() {
    const g = this.g, a = g.ac;
    if (g.phase === "paused") return HINT.paused;
    if (g.phase !== "fly" && g.phase !== "roll") return "";
    if (g.stage === "takeoff") {
      if (a.ground) {
        if (a.pitch > TAIL_LIMIT - 2.5) return HINT.tail;
        if (g.ias >= V_SPEEDS.vr) return HINT.rotate;
        return g.throttle < 0.9 ? HINT.throttle : HINT.wait;
      }
      return HINT.climb;
    }
    if (g.phase === "roll") return HINT.roll;
    if (g.altFt < 60) return HINT.flare;
    if (Math.abs(g.locDots) > 0.6) return HINT.line;
    return HINT.path;
  }
  updateHUD(force = false) {
    const g = this.g, a = g.ac, to = g.stage === "takeoff", d = this.shell.dataset;
    if (force) this.cache = {};
    d.stage = g.stage;
    d.phase = g.phase;
    this.set("rw-stage-label", "text", to ? "1/2 · 이륙" : "2/2 · 착륙");
    this.set("rw-wind", "text", `WIND ${formatWind(g.wind.dir, g.wind.speed)}`);
    this.set("rw-ias", "text", String(Math.round(g.ias)));
    this.set("rw-alt", "text", String(Math.max(0, Math.round(g.altFt / (g.altFt > 100 ? 10 : 1)) * (g.altFt > 100 ? 10 : 1))));
    this.set("rw-vs", "text", signed(Math.round(g.fpm / 10) * 10));
    this.set("rw-pitch", "text", a.pitch.toFixed(1));
    this.set("rw-thr", "text", String(Math.round(g.throttle * 100)));
    this.set("rw-crab", "text", signed(g.crab, 1));
    this.set("rw-speedfill", "width", clamp((g.ias / 180) * 100, 0, 100) + "%");
    this.set("rw-speedfill", "background", g.ias >= V_SPEEDS.vr ? "#8fe0a9" : g.ias >= V_SPEEDS.v1 ? "#f6d24a" : "#ffffffcc");
    this.set("rw-hint", "text", this.hint());
    this.set("rw-gs-dia", "transform", `translate(-50%, calc(-50% + ${(clamp(g.gsDots, -2.2, 2.2) * 20).toFixed(1)}px))`);
    this.set("rw-loc-dia", "transform", `translate(calc(-50% + ${(clamp(-g.locDots, -2.2, 2.2) * 20).toFixed(1)}px), -50%)`);
    const papi = g.papi.map((w) => (w ? "w" : "r")).join("");
    if (this.cache.papi !== papi) {
      this.cache.papi = papi;
      this.$("rw-papi").querySelectorAll("i").forEach((el, i) => (el.className = papi[i]));
    }
    this.set("rw-vs", "color", g.fpm < -1200 ? "#ff8f7a" : "");
    this.set("rw-pitch", "color", to && a.ground && a.pitch > TAIL_LIMIT - 2.5 ? "#ff8f7a" : "");
  }
  showClear() {
    const r = this.g.takeoff;
    if (!r) return;
    const el = this.$("result");
    el.hidden = false;
    el.innerHTML = `<section class="result-card rw-result"><span class="eyebrow" translate="no">TAKEOFF COMPLETE · SSUN 123</span><h2>이륙 성공!</h2><div class="result-value">${r.value}<small>점</small></div><dl class="rw-stats"><div><dt>로테이트</dt><dd translate="no">${r.rotateKt}<small>KT</small></dd><span translate="no">VR ${V_SPEEDS.vr}</span></div><div><dt>상승 자세</dt><dd translate="no">${r.climbPitch}<small>°</small></dd><span translate="no">TGT 15°</span></div><div><dt>300ft 속도</dt><dd translate="no">${r.endKt}<small>KT</small></dd><span translate="no">V2+10</span></div></dl><p>이제 김포로 다시 돌아와 착륙할 차례예요.</p><div class="result-actions"><button class="primary" data-rw="landing">착륙하러 가기 → <kbd translate="no">SPACE</kbd></button></div></section>`;
  }
  showResult() {
    if (this.resultShown || this.g.phase !== "result") return;
    this.resultShown = true;
    const g = this.g, r = g.result, ld = g.landing, to = g.takeoff, el = this.$("result");
    const reason = ld?.reason ?? (to && !to.ok ? to.reason : null);
    const failedTakeoff = !ld && to && !to.ok;
    const title = failedTakeoff ? FAILURES[to.reason] : ld?.reason && ld.reason !== "goaround" ? FAILURES[ld.reason] : GRADES[ld?.grade ?? "crash"];
    const best = this.onResult?.(r);
    const stats = ld && ld.grade !== "goaround" ? `<dl class="rw-stats"><div><dt>접지 강하율</dt><dd translate="no">${ld.fpm}<small>FPM</small></dd><span>${GRADES[ld.grade]}</span></div><div><dt>중심선 오차</dt><dd translate="no">${Math.abs(ld.centerline).toFixed(1)}<small>M</small></dd><span translate="no">${ld.centerline > 0 ? "R" : ld.centerline < 0 ? "L" : "C/L"}</span></div><div><dt>접지 위치</dt><dd translate="no">${signed(ld.distance)}<small>M</small></dd><span translate="no">AIM PT ${RWY.aim}M</span></div></dl>` : "";
    const parts = r.complete ? `<div class="rw-parts"><span>이륙 <b>${to.value}점</b></span><span>착륙 <b>${ld.value}점</b></span></div>` : "";
    el.hidden = false;
    el.innerHTML = `<section class="result-card rw-result ${reason && reason !== "goaround" ? "fail" : ""}"><span class="eyebrow" translate="no">${best ? "NEW PERSONAL BEST" : r.complete ? "FLIGHT COMPLETE · SSUN 123" : failedTakeoff ? "TAKEOFF FAILED" : "LANDING"}</span><h2>${title}</h2><div class="result-value">${r.value}<small>점</small></div>${parts}${stats}${reason ? `<p>${TIPS[reason] ?? ""}</p>` : `<p>${ld?.grade === "butter" ? "승객들이 박수를 쳤어요!" : "김포에 오신 것을 환영합니다."}</p>`}<div class="result-actions"><button class="primary" data-action="retry">다시 도전 ↻</button>${failedTakeoff ? '<button class="secondary" data-rw="landing">착륙 연습하기 →</button>' : ""}<button class="secondary" data-action="share">기록 공유 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
  }
  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.atcTimer);
    this.abort.abort();
    this.sound.destroy();
    this.view.destroy();
  }
}
