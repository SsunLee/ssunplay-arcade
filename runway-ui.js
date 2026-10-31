import { RunwayGame, RWY, V_SPEEDS, VAPP, TAIL_LIMIT, ROTATE_EARLY, GRADES, FAILURES, FLAPS, FLAPS_TO, FLAPS_LDG, formatWind, clamp, LIVERIES, LIVERY_KEY, getLivery } from "./runway-engine.js";
import { RunwayView, renderLiveryShots } from "./runway-view.js";

const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>';
const HINT = {
  throttle: "스로틀 올려 가속 ▲",
  wait: "가속 중… VR까지 기다리기",
  rotate: "핸들 당겨 이륙 ▼",
  tail: "너무 들었어요 · 핸들 살짝 밀기",
  climb: "기수 15° 유지 · 상승",
  flapsTO: "플랩 1 이상으로 이륙",
  flapsUp: "플랩 올리기 (UP)",
  path: "PAPI 흰2 · 빨2 유지",
  line: "핸들 좌우로 중심선 맞추기",
  flapsDn: "플랩 내리고 감속",
  slow: "스로틀 올려 가속 ▲",
  fast: "스로틀 내려 감속 ▼",
  flare: "핸들 살짝 당기기 · 플레어",
  roll: "착륙! 감속 중…",
  paused: "일시 정지",
};
const TIPS = {
  tailstrike: "VR에서 천천히 들어 올리고, 바퀴가 뜰 때까지 13°를 넘기지 마세요.",
  early: "135kt(VR−10)가 넘으면 기수를 드세요. VR(145kt)이 가장 좋아요.",
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
// Throttle: a vertical thrust lever slot, IDLE at the bottom and TOGA at the top; the handle is a T-grip.
const THR_DETENTS = [["TOGA", 1], ["CL", 0.6], ["IDLE", 0]];
const THR_HTML = `<div id="rw-thr-lever" class="rw-thr" role="slider" aria-orientation="vertical" aria-label="스로틀: 위로 가속, 아래로 감속" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="-1">
<span class="rw-thr-up">▲가속</span><div class="rw-thr-track">${THR_DETENTS.map(([l, t]) => `<i class="rw-thr-det" style="bottom:${t * 100}%"><em>${l}</em></i>`).join("")}<span id="rw-thr-fill" class="rw-thr-fill"></span><b id="rw-thr-grip" class="rw-thr-grip"><span id="rw-thr-pct">0%</span></b></div><span class="rw-thr-dn">▼감속</span><small>THRUST</small></div>`;
const FLAP_HTML = `<div class="rw-flaps" aria-label="플랩"><small>플랩</small><button data-rw="flapup" aria-label="플랩 올리기 (F)">▲ UP</button><div id="rw-flap-ind" class="rw-flap-ind" aria-hidden="true">${FLAPS.map((f, i) => `<i data-i="${i}">${f.label}</i>`).join("")}</div><button data-rw="flapdn" aria-label="플랩 내리기 (V)">▼ DN</button></div>`;
// Control yoke drawn in code: the wheel turns with roll, slides with pitch; the dot plots both.
const YOKE_SVG = `<svg viewBox="-60 -48 120 96" aria-hidden="true">
<path class="rw-yk-grid" d="M-52 0H52M0-40V40"/>
<rect class="rw-yk-col" x="-7" y="30" width="14" height="20" rx="3"/>
<g id="rw-yk-move"><rect class="rw-yk-shaft" x="-4" y="4" width="8" height="44" rx="2"/>
<g id="rw-yk-wheel"><path class="rw-yk-horn" d="M-31-22-32-6Q-32 8-18 8H18Q32 8 32-6L31-22"/>
<rect class="rw-yk-grip" x="-37" y="-30" width="11" height="22" rx="5"/><rect class="rw-yk-grip" x="26" y="-30" width="11" height="22" rx="5"/>
<circle class="rw-yk-hub" cy="8" r="10"/><path class="rw-yk-mark" d="M0-1V-12"/></g></g>
<g transform="translate(44 30)"><rect class="rw-yk-box" x="-12" y="-12" width="24" height="24" rx="4"/><path class="rw-yk-grid" d="M-12 0H12M0-12V12"/><circle id="rw-yk-dot" class="rw-yk-dot" r="3.4"/></g>
</svg>`;
const storedLivery = () => { try { return localStorage.getItem(LIVERY_KEY); } catch { return null; } };
// Livery thumbnails are rendered once from the 3D airliner itself, so the cards match the aircraft you fly.
let shots = null;
function liveryPreview(lv) {
  if (!shots) {
    try { shots = renderLiveryShots(LIVERIES.map((l) => l.id)); } catch { shots = {}; }
  }
  const src = shots[lv.id];
  return src ? `<img class="rw-lv-shot" src="${src}" alt="" width="480" height="200" draggable="false">` : `<span class="rw-lv-shot" style="--a:${lv.colors.tail};--b:${lv.colors.body}" aria-hidden="true"></span>`;
}
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
    this.thr = null; // the throttle lever being dragged: { id }
    this.yoke = null; // the on-screen yoke being dragged
    this.yokeShown = { pitch: 0, roll: 0 };
    this.leverShown = 0; // eased throttle for the lever quadrant
    this.tilt = null;
    this.sound = new Sound(sound);
    this.livery = getLivery(storedLivery());
    this.picking = false;
    app.innerHTML = header + `<main id="main" class="game-shell runway" data-stage="takeoff" data-phase="ready">
<canvas id="game" tabindex="0" aria-label="활주로 3D 화면"></canvas>
<div class="rw-top"><div class="rw-stage"><span id="rw-stage-label"></span><b id="rw-wind" translate="no"></b></div>
<div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-rw="tilt" class="rw-tilt" aria-pressed="false" aria-label="기울기 조종">📱</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog">${shareIcon}</button></div></div>
<div class="rw-pfd" translate="no"><div><small>IAS</small><b id="rw-ias"></b><i>KT</i></div><div><small>ALT</small><b id="rw-alt"></b><i>FT</i></div><div><small>V/S</small><b id="rw-vs"></b><i>FPM</i></div><div><small>PITCH</small><b id="rw-pitch"></b><i>DEG</i></div><div><small>THR</small><b id="rw-thr"></b><i>%</i></div><div class="rw-crab"><small>CRAB</small><b id="rw-crab"></b><i>DEG</i></div></div>
<div id="rw-speedbar" class="rw-speedbar" translate="no"><span id="rw-speedfill"></span><b class="rw-vrwin" style="left:${((V_SPEEDS.vr - ROTATE_EARLY) / 180) * 100}%;width:${(ROTATE_EARLY / 180) * 100}%"></b><i style="left:${(V_SPEEDS.v1 / 180) * 100}%">V1</i><i style="left:${(V_SPEEDS.vr / 180) * 100}%">VR</i></div>
<p id="rw-hint" class="rw-hint" role="status" aria-live="polite"></p>
<div id="rw-atc" class="rw-atc" hidden><span class="rw-atc-from" translate="no">TWR</span><p id="rw-atc-en" class="rw-atc-en" translate="no"></p><p id="rw-atc-ko" class="rw-atc-ko"></p></div>
<div id="rw-callout" class="rw-callout" translate="no" aria-hidden="true"></div>
<div id="rw-warn" class="rw-warn" translate="no" aria-hidden="true"></div>
<div id="rw-gs" class="rw-gs" aria-hidden="true"><div class="rw-papi" id="rw-papi"><i></i><i></i><i></i><i></i></div><div class="rw-scale v"><span></span><span></span><span class="c"></span><span></span><span></span><b id="rw-gs-dia"></b></div><small translate="no">GS</small></div>
<div id="rw-loc" class="rw-loc" aria-hidden="true"><div class="rw-scale h"><span></span><span></span><span class="c"></span><span></span><span></span><b id="rw-loc-dia"></b></div><small translate="no">LOC</small></div>
<div id="rw-intro" class="rw-intro"></div>
<div id="rw-livery" class="rw-livery" hidden></div>
<div class="rw-pad" aria-label="조종 장치">${THR_HTML}${FLAP_HTML}
<div class="rw-yoke"><span class="rw-yk-lbl up">▲ 밀기 = 하강</span><div id="rw-wheel" class="rw-wheel" role="img" aria-label="조종 핸들: 아래로 당기면 상승, 위로 밀면 하강, 좌우로 기울기">${YOKE_SVG}</div><span class="rw-yk-lbl dn">▼ 당기기 = 상승</span></div></div>
<div id="result" class="result-overlay" hidden></div>
</main>`;
    this.shell = app.querySelector(".runway");
    this.canvas = app.querySelector("#game");
    this.view = new RunwayView(this.canvas, this.g, { livery: this.livery.id });
    this.bind();
    this.showIntro();
    // first visit: pick an aircraft before the first flight
    if (!LIVERIES.some((l) => l.id === storedLivery())) this.openLivery();
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
        this.drawYoke(dt);
        this.drawLevers(dt);
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
      if (a === "livery") this.openLivery();
      if (a === "pick") this.pickLivery(b.dataset.livery);
      if (a === "flapup") this.flap(-1);
      if (a === "flapdn") this.flap(1);
    }, opt);
    c.addEventListener("pointerdown", () => { this.sound.ensure(); c.focus({ preventScroll: true }); }, opt);
    // the on-screen yoke: drag down = pull back (nose up), sideways = roll; it springs back to centre on release
    const wheel = this.$("rw-wheel");
    wheel.addEventListener("pointerdown", (e) => {
      if (this.yoke || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      this.sound.ensure();
      wheel.setPointerCapture(e.pointerId);
      this.yoke = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
      wheel.classList.add("on");
      if (g.phase === "ready") this.start();
    }, opt);
    wheel.addEventListener("pointermove", (e) => {
      if (this.yoke?.id !== e.pointerId) return;
      const range = Math.max(40, wheel.clientWidth * 0.42);
      this.yoke.dx = clamp((e.clientX - this.yoke.x) / range, -1, 1);
      this.yoke.dy = clamp((e.clientY - this.yoke.y) / range, -1, 1);
      e.preventDefault();
    }, opt);
    const yokeEnd = (e) => {
      if (this.yoke?.id !== e.pointerId) return;
      this.yoke = null;
      wheel.classList.remove("on");
    };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) wheel.addEventListener(t, yokeEnd, opt);
    wheel.addEventListener("contextmenu", (e) => e.preventDefault(), opt);
    wheel.addEventListener("touchmove", (e) => e.preventDefault(), { ...opt, passive: false });
    // throttle lever: the handle follows the finger, top = TOGA, bottom = IDLE; it stays where it is let go
    const lever = this.$("rw-thr-lever"), track = lever.querySelector(".rw-thr-track");
    const setLever = (e) => {
      const r = track.getBoundingClientRect();
      g.setThrottle(1 - clamp((e.clientY - r.top) / r.height, 0, 1));
    };
    lever.addEventListener("pointerdown", (e) => {
      if (this.thr || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      this.sound.ensure();
      lever.setPointerCapture(e.pointerId);
      this.thr = { id: e.pointerId };
      lever.classList.add("on");
      if (g.phase === "ready") this.start();
      setLever(e);
    }, opt);
    lever.addEventListener("pointermove", (e) => { if (this.thr?.id === e.pointerId) { e.preventDefault(); setLever(e); } }, opt);
    const thrEnd = (e) => { if (this.thr?.id === e.pointerId) { this.thr = null; lever.classList.remove("on"); } };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) lever.addEventListener(t, thrEnd, opt);
    lever.addEventListener("contextmenu", (e) => e.preventDefault(), opt);
    // iOS Safari can still scroll or zoom the page from a touch unless touchmove is cancelled
    lever.addEventListener("touchmove", (e) => e.preventDefault(), { ...opt, passive: false });
    this.shell.querySelector(".rw-flaps").addEventListener("touchmove", (e) => e.preventDefault(), { ...opt, passive: false });
    const KEYS = {
      ArrowUp: "pd", ArrowDown: "pu", ArrowLeft: "rl", ArrowRight: "rr", KeyA: "rl", KeyD: "rr",
      KeyW: "tu", ShiftLeft: "tu", ShiftRight: "tu", Equal: "tu", NumpadAdd: "tu", PageUp: "tu", KeyS: "td", ControlLeft: "td", ControlRight: "td", Minus: "td", NumpadSubtract: "td", PageDown: "td",
    };
    window.addEventListener("keydown", (e) => {
      if (this.modal.open || e.target.closest?.("input,textarea,select")) return;
      if (this.picking) {
        if (e.code === "Escape" && storedLivery()) { e.preventDefault(); this.closeLivery(); }
        return;
      }
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
      if ((e.code === "KeyF" || e.code === "KeyV") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!e.repeat) this.flap(e.code === "KeyV" ? 1 : -1);
        return;
      }
      const k = KEYS[e.code];
      if (!k) return;
      if (g.phase === "ready" && (k === "tu" || k === "pu")) this.start();
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
      this.yoke = null;
      this.thr = null;
      wheel.classList.remove("on");
      lever.classList.remove("on");
    }, opt);
  }
  flap(step) {
    if (["result", "clear"].includes(this.g.phase) || this.picking) return;
    this.sound.ensure();
    if (this.g.setFlaps(step)) this.sound.chime(step > 0 ? 520 : 760, 0.08);
    this.drawFlaps();
  }
  drawFlaps() {
    const i = this.g.flaps;
    if (this.cache.flaps === i) return;
    this.cache.flaps = i;
    this.$("rw-flap-ind").querySelectorAll("i").forEach((el) => el.classList.toggle("on", +el.dataset.i === i));
    this.shell.querySelector('[data-rw="flapup"]').disabled = i === 0;
    this.shell.querySelector('[data-rw="flapdn"]').disabled = i === FLAPS.length - 1;
  }
  applyInput() {
    const k = this.keys, y = this.yoke, t = this.tilt?.on ? this.tilt : null;
    const pitch = (k.has("pu") ? 1 : 0) - (k.has("pd") ? 1 : 0) + (y ? y.dy : 0) + (t ? t.pitch : 0),
      roll = (k.has("rr") ? 1 : 0) - (k.has("rl") ? 1 : 0) + (y ? y.dx : 0) + (t ? t.roll : 0),
      thr = (k.has("tu") ? 1 : 0) - (k.has("td") ? 1 : 0);
    this.g.setInput(pitch, roll, thr);
    this.g.input.held = !!this.thr;
  }
  /** The throttle handle glides toward the current thrust (IDLE at the bottom, TOGA at the top). */
  drawLevers(dt) {
    this.leverShown += (this.g.throttle - this.leverShown) * (1 - Math.exp(-dt * 18));
    const p = (this.leverShown * 100).toFixed(1);
    this.drawFlaps();
    if (this.cache.levers === p) return;
    this.cache.levers = p;
    this.$("rw-thr-grip").style.bottom = p + "%";
    this.$("rw-thr-fill").style.height = p + "%";
    const pct = Math.round(this.g.throttle * 100);
    this.set("rw-thr-pct", "text", pct === 0 ? "IDLE" : pct + "%");
    this.$("rw-thr-lever").setAttribute("aria-valuenow", String(pct));
  }
  /** The yoke mirrors every input source (keys, drag, thrust levers, tilt) and eases back to centre. */
  drawYoke(dt) {
    const inp = this.g.input, s = this.yokeShown, k = 1 - Math.exp(-dt * 16);
    s.pitch += (inp.pitch - s.pitch) * k;
    s.roll += (inp.roll - s.roll) * k;
    const p = s.pitch.toFixed(3), r = s.roll.toFixed(3);
    if (this.cache.yoke === p + r) return;
    this.cache.yoke = p + r;
    this.$("rw-yk-move").setAttribute("transform", `translate(0 ${(s.pitch * 11).toFixed(2)}) scale(${(1 + s.pitch * 0.07).toFixed(3)})`);
    this.$("rw-yk-wheel").setAttribute("transform", `rotate(${(s.roll * 42).toFixed(2)} 0 8)`);
    this.$("rw-yk-dot").setAttribute("transform", `translate(${(s.roll * 9).toFixed(2)} ${(s.pitch * 9).toFixed(2)})`);
    const w = this.$("rw-wheel").classList;
    w.toggle("pitching", Math.abs(inp.pitch) > 0.05);
    w.toggle("rolling", Math.abs(inp.roll) > 0.05);
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
  openLivery() {
    if (this.g.phase !== "ready") return;
    this.picking = true;
    const el = this.$("rw-livery");
    el.innerHTML = `<section class="rw-lv-panel" role="dialog" aria-modal="true" aria-labelledby="rw-lv-title"><span class="rw-eyebrow" translate="no">CHOOSE YOUR AIRCRAFT</span><h2 id="rw-lv-title">기체 선택</h2><p>오늘 탈 비행기를 고르세요. 실제 항공사와 관계없는 가상의 도장이에요.</p><div class="rw-lv-grid">${LIVERIES.map((lv) => `<button class="rw-lv-card" data-rw="pick" data-livery="${lv.id}" aria-pressed="${lv.id === this.livery.id}">${liveryPreview(lv)}<b>${lv.name}</b><small>${lv.tagline}</small></button>`).join("")}</div></section>`;
    el.hidden = false;
    this.set("rw-intro", "hidden", true);
    el.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  closeLivery() {
    this.picking = false;
    this.$("rw-livery").hidden = true;
    this.showIntro();
    this.$("rw-intro").querySelector('[data-rw="start"]')?.focus({ preventScroll: true });
  }
  pickLivery(id) {
    this.livery = getLivery(id);
    try { localStorage.setItem(LIVERY_KEY, this.livery.id); } catch {}
    this.view.setLivery(this.livery.id);
    this.closeLivery();
  }
  start() {
    if (this.picking) return;
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
      ? `<span class="rw-eyebrow" translate="no">STAGE 1 · TAKEOFF · RWY ${RWY.id}</span><h1>김포 14R, 이륙 준비</h1><p>왼쪽 스로틀을 끝까지 올려 가속하고, VR에서 오른쪽 핸들을 당기세요. 너무 일찍 들거나 너무 많이 들면 꼬리가 활주로에 닿아요.</p><dl translate="no"><div><dt>V1</dt><dd>${V_SPEEDS.v1}</dd></div><div><dt>VR</dt><dd>${V_SPEEDS.vr}</dd></div><div><dt>V2</dt><dd>${V_SPEEDS.v2}</dd></div><div><dt>WIND</dt><dd>${formatWind(w.dir, w.speed)}</dd></div></dl><button class="primary" data-rw="start">이륙 시작 <kbd translate="no">SPACE</kbd></button><button class="rw-skip" data-rw="landing">착륙만 연습하기 →</button>${this.liveryButton()}`
      : `<span class="rw-eyebrow" translate="no">STAGE 2 · LANDING · ILS ${RWY.id}</span><h1>최종 접근, 활주로 14R</h1><p>PAPI 흰색 2개·빨간색 2개를 유지하세요. 측풍이 불면 기울여 중심선을 지키고, 50피트 아래에서 추력을 줄이며 살짝 플레어!</p><dl translate="no"><div><dt>VAPP</dt><dd>${VAPP}</dd></div><div><dt>GS</dt><dd>${RWY.gs.toFixed(1)}°</dd></div><div><dt>WIND</dt><dd>${formatWind(w.dir, w.speed)}</dd></div><div><dt>X-WIND</dt><dd>${Math.abs(w.cross).toFixed(0)}KT ${w.cross >= 0 ? "R" : "L"}</dd></div></dl><button class="primary" data-rw="start">접근 시작 <kbd translate="no">SPACE</kbd></button>${this.liveryButton()}`;
    this.updateHUD(true);
  }
  liveryButton() {
    const k = this.livery.colors;
    return `<button class="rw-lv-btn" data-rw="livery"><i style="--a:${k.tail};--b:${k.body}" aria-hidden="true"></i><span>${this.livery.name}</span><b>기체 선택</b></button>`;
  }
  liveryTag() {
    return `<span class="rw-lv-tag"><i style="--a:${this.livery.colors.tail};--b:${this.livery.colors.body}" aria-hidden="true"></i><span>${this.livery.name}</span></span>`;
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
    if (g.phase === "ready") return g.stage === "takeoff" ? HINT.throttle : "";
    if (g.phase !== "fly" && g.phase !== "roll") return "";
    if (g.stage === "takeoff") {
      if (a.ground) {
        if (a.pitch > TAIL_LIMIT - 2.5) return HINT.tail;
        if (g.flaps === 0) return HINT.flapsTO;
        if (g.ias >= V_SPEEDS.vr - ROTATE_EARLY / 2) return HINT.rotate;
        return g.throttle < 0.9 ? HINT.throttle : HINT.wait;
      }
      return g.altFt > 150 && g.flaps > 0 ? HINT.flapsUp : HINT.climb;
    }
    if (g.phase === "roll") return HINT.roll;
    if (g.altFt < 60) return g.throttle > 0.05 ? "스로틀 IDLE ▼ · " + HINT.flare : HINT.flare;
    if (g.flaps < FLAPS_LDG) return HINT.flapsDn;
    if (g.assistInfo.thr) return g.assistInfo.thr > 0 ? HINT.slow : HINT.fast;
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
    el.innerHTML = `<section class="result-card rw-result"><span class="eyebrow" translate="no">TAKEOFF COMPLETE · SSUN 123</span><h2>이륙 성공!</h2><div class="result-value">${r.value}<small>점</small></div>${this.liveryTag()}<dl class="rw-stats"><div><dt>로테이트</dt><dd translate="no">${r.rotateKt}<small>KT</small></dd><span translate="no">VR ${V_SPEEDS.vr}</span></div><div><dt>상승 자세</dt><dd translate="no">${r.climbPitch}<small>°</small></dd><span translate="no">TGT 15°</span></div><div><dt>300ft 속도</dt><dd translate="no">${r.endKt}<small>KT</small></dd><span translate="no">V2+10</span></div></dl><p>이제 김포로 다시 돌아와 착륙할 차례예요.</p><div class="result-actions"><button class="primary" data-rw="landing">착륙하러 가기 → <kbd translate="no">SPACE</kbd></button></div></section>`;
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
    el.innerHTML = `<section class="result-card rw-result ${reason && reason !== "goaround" ? "fail" : ""}"><span class="eyebrow" translate="no">${best ? "NEW PERSONAL BEST" : r.complete ? "FLIGHT COMPLETE · SSUN 123" : failedTakeoff ? "TAKEOFF FAILED" : "LANDING"}</span><h2>${title}</h2><div class="result-value">${r.value}<small>점</small></div>${parts}${this.liveryTag()}${stats}${reason ? `<p>${TIPS[reason] ?? ""}</p>` : `<p>${ld?.grade === "butter" ? "승객들이 박수를 쳤어요!" : "김포에 오신 것을 환영합니다."}</p>`}<div class="result-actions"><button class="primary" data-action="retry">다시 도전 ↻</button>${failedTakeoff ? '<button class="secondary" data-rw="landing">착륙 연습하기 →</button>' : ""}<button class="secondary" data-action="share">기록 공유 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
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
