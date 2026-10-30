import { RunwayGame, RWY, V_SPEEDS, VAPP, TAIL_LIMIT, ROTATE_EARLY, GRADES, FAILURES, HOLD, formatWind, clamp, holdStick, holdLabel, LIVERIES, LIVERY_KEY, getLivery } from "./runway-engine.js";
import { RunwayView } from "./runway-view.js";

const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>';
const HINT = {
  throttle: "추력을 끝까지 올리세요 (Shift · THR + · 가속 버튼)",
  wait: "속도가 붙고 있어요… VR까지 기다리세요",
  rotate: "로테이트! 기수를 드세요 (S · ↓ · 핸들을 아래로)",
  climb: "기수 15° 유지, 300피트까지 상승",
  tail: "기수를 너무 들면 꼬리가 닿아요!",
  path: "PAPI 흰색 2개 · 빨간색 2개를 유지하세요",
  line: "기울여서 중심선에 맞추세요",
  slow: "속도가 느려요 · 추력을 올리세요 (Shift · THR +)",
  fast: "속도가 빨라요 · 추력을 줄이세요 (Ctrl · THR −)",
  flare: "추력을 줄이고 살짝 기수를 드세요 · 플레어!",
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
/** A side-view mini plane in the livery's colours for the select cards. */
function liveryPreview(lv) {
  const k = lv.colors, id = "rwl-" + lv.id, fin = "M17 32 4 6h7l20 26Z", body = "M9 26h91q16 0 17 7-1 7-17 7H15Q6 40 3 30Z";
  const spiral = Array.from({ length: 33 }, (_, i) => { const t = i / 32, a = t * Math.PI * 3.4, r = 0.4 + t * 3; return `${(14 + Math.cos(a) * r).toFixed(2)} ${(19 - Math.sin(a) * r).toFixed(2)}`; }).join(" ");
  const waves = (y) => `M0 ${y}q4-2 8 0t8 0 8 0 8 0`;
  const tail = {
    swirl: `<circle cx="14" cy="19" r="4.6" fill="none" stroke="${k.accent2}" stroke-width="1.2"/><path d="M${spiral}" fill="none" stroke="${k.accent}" stroke-width="1.3" stroke-linecap="round"/>`,
    stripes: [k.accent, k.accent2, k.accent3, k.accent4, k.accent5].map((c, i) => `<rect x="0" y="${5 + i * 3.4}" width="32" height="2.5" fill="${c}"/>`).join(""),
    sweep: `<rect width="32" height="34" fill="url(#${id}-g)"/><path d="M27 32Q19 21 9 6" fill="none" stroke="${k.accent2}" stroke-width=".9"/>`,
    slant: `<path d="M0 32h32L0 21Z" fill="${k.accent}"/><circle cx="15" cy="16" r="1.8" fill="${k.accent2}"/>`,
    wing: `<path d="M24 30C20 23 12 14 6 7c6 3 16 12 18 23Z" fill="${k.accent}"/><path d="M24 30C22 23 17 14 13 6c4 4 11 14 11 24Z" fill="${k.accent2}"/>`,
    band: `<path d="M26 33h-3L4 5h3Z" fill="${k.accent}"/>`,
    waves: `<path d="${waves(26)}V33H0Z" fill="${k.accent}"/><path d="${waves(29)}V33H0Z" fill="${k.accent2}"/><path d="${waves(21)}" fill="none" stroke="#fff" stroke-width=".8"/>`,
    sun: `<circle cx="14" cy="17" r="4.6" fill="${k.accent}"/><text x="14" y="19.6" font-size="7.5" font-weight="900" text-anchor="middle" fill="${k.tail}">S</text>`,
  }[lv.tail] ?? "";
  const windows = Array.from({ length: 15 }, (_, i) => `<circle cx="${26 + i * 4.6}" cy="30" r=".85"/>`).join("");
  return `<svg viewBox="0 0 120 48" aria-hidden="true"><defs><clipPath id="${id}-f"><path d="${fin}"/></clipPath><clipPath id="${id}-b"><path d="${body}"/></clipPath><linearGradient id="${id}-g" x1="0" y1="1" x2=".6" y2="0"><stop offset="0" stop-color="${k.tail}"/><stop offset=".55" stop-color="${k.accent}"/><stop offset="1" stop-color="${k.tail}"/></linearGradient></defs>
<g clip-path="url(#${id}-f)"><rect width="32" height="34" fill="${k.tail}"/>${tail}</g><path d="${fin}" fill="none" stroke="#0b162030" stroke-width=".5"/>
<path d="M1 28 14 29v2H1Z" fill="#b9c3c9"/>
<g clip-path="url(#${id}-b)"><rect width="120" height="48" fill="${k.body}"/><rect y="34.6" width="120" height="8" fill="${k.belly}"/>${k.cheat ? `<rect x="4" y="32.6" width="112" height="1.8" fill="${k.cheat}"/>` : ""}${k.stripe ? `<rect x="4" y="34.6" width="108" height=".7" fill="${k.stripe}"/>` : ""}</g>
<path d="${body}" fill="none" stroke="#0b162040" stroke-width=".6"/><g fill="#263540">${windows}</g><path d="M106 28.4h5.4l2.6 2.8h-8Z" fill="#263540"/>
<path d="M44 36.5h26l-8 2Z" fill="#9aa6ad"/><rect x="50" y="38.5" width="17" height="6.4" rx="3.2" fill="${k.engine}" stroke="#0b162040" stroke-width=".5"/><rect x="59" y="38.5" width="3" height="6.4" fill="${k.band}"/>
</svg>`;
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
    this.hold = { pitch: 0, roll: 0, throttle: 0 };
    this.drag = null;
    this.yoke = null; // the on-screen yoke being dragged
    this.yokeShown = { pitch: 0, roll: 0 };
    this.boost = null; // the hold-to-accelerate button being held: { id, x, y, stick }
    this.tilt = null;
    this.sound = new Sound(sound);
    this.livery = getLivery(storedLivery());
    this.picking = false;
    app.innerHTML = header + `<main id="main" class="game-shell runway" data-stage="takeoff" data-phase="ready">
<canvas id="game" tabindex="0" aria-label="활주로 3D 화면: 위아래로 끌면 기수, 좌우로 끌면 기울기"></canvas>
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
<div id="rw-stick" class="rw-stick" hidden aria-hidden="true"><i></i></div>
<div id="rw-intro" class="rw-intro"></div>
<div id="rw-livery" class="rw-livery" hidden></div>
<div class="rw-pad" aria-label="조종 버튼"><div class="rw-thr"><button data-hold="throttle:1" aria-label="추력 올리기">THR +</button><button data-hold="throttle:-1" aria-label="추력 줄이기">THR −</button></div>
<div id="rw-boost" class="rw-boost" role="button" aria-label="누르고 있으면 가속 · 끌어서 조종 (아래로 끌면 기수 들기)"><span class="rw-boost-ring"><i id="rw-boost-knob" class="rw-boost-knob"></i><b id="rw-boost-arrow" class="rw-boost-arrow"></b></span><span class="rw-boost-text">누르고 가속</span><small id="rw-boost-dir" class="rw-boost-dir" aria-hidden="true"></small></div>
<div class="rw-yoke"><button data-hold="pitch:-1" class="up" aria-label="기수 내리기">▲</button><button data-hold="roll:-1" class="left" aria-label="왼쪽으로 기울이기">◀</button><div id="rw-wheel" class="rw-wheel" role="img" aria-label="조종 핸들: 위아래로 끌면 기수, 좌우로 끌면 기울기">${YOKE_SVG}</div><button data-hold="roll:1" class="right" aria-label="오른쪽으로 기울이기">▶</button><button data-hold="pitch:1" class="down" aria-label="기수 들기">▼</button></div></div>
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
    // hold-to-accelerate: thrust ramps up while pressed; dragging while held flies like the yoke (down = nose up)
    const boost = this.$("rw-boost");
    boost.addEventListener("pointerdown", (e) => {
      if (this.boost || (e.pointerType === "mouse" && e.button !== 0)) return;
      e.preventDefault();
      this.sound.ensure();
      boost.setPointerCapture(e.pointerId);
      this.boost = { id: e.pointerId, x: e.clientX, y: e.clientY, stick: holdStick(0, 0) };
      boost.classList.add("on");
      if (g.phase === "ready") this.start();
      g.holdThrust(true);
      this.drawBoost();
    }, opt);
    boost.addEventListener("pointermove", (e) => {
      if (this.boost?.id !== e.pointerId) return;
      e.preventDefault();
      this.boost.stick = holdStick(e.clientX - this.boost.x, e.clientY - this.boost.y);
      this.drawBoost();
    }, opt);
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) boost.addEventListener(t, (e) => { if (this.boost?.id === e.pointerId) this.endBoost(); }, opt);
    boost.addEventListener("contextmenu", (e) => e.preventDefault(), opt);
    // iOS Safari can still scroll or zoom the page from a touch unless touchmove is cancelled
    boost.addEventListener("touchmove", (e) => e.preventDefault(), { ...opt, passive: false });
    const KEYS = {
      KeyW: "pd", ArrowUp: "pd", KeyS: "pu", ArrowDown: "pu", KeyA: "rl", ArrowLeft: "rl", KeyD: "rr", ArrowRight: "rr",
      ShiftLeft: "tu", ShiftRight: "tu", Equal: "tu", NumpadAdd: "tu", PageUp: "tu", ControlLeft: "td", ControlRight: "td", Minus: "td", NumpadSubtract: "td", PageDown: "td",
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
      this.yoke = null;
      wheel.classList.remove("on");
      stick.hidden = true;
      this.endBoost();
    }, opt);
  }
  endBoost() {
    if (!this.boost) return;
    this.boost = null;
    this.g.holdThrust(false);
    this.$("rw-boost").classList.remove("on");
    this.drawBoost();
  }
  /** Knob offset, a direction arrow and a short label (기수↑ …) for the hold-button drag. */
  drawBoost() {
    const s = this.boost?.stick, el = this.$("rw-boost"), travel = el.clientWidth * 0.32 / HOLD.radius;
    this.$("rw-boost-knob").style.transform = s ? `translate(calc(-50% + ${(s.x * travel).toFixed(1)}px), calc(-50% + ${(s.y * travel).toFixed(1)}px))` : "";
    const arrow = this.$("rw-boost-arrow"), mag = s ? Math.max(Math.abs(s.pitch), Math.abs(s.roll)) : 0;
    arrow.style.opacity = s?.active ? (0.35 + mag * 0.65).toFixed(2) : "0";
    if (s?.active) arrow.style.transform = `rotate(${(s.angle * 180 / Math.PI).toFixed(1)}deg)`;
    const label = s ? holdLabel(s) : "";
    this.set("rw-boost-dir", "text", label);
    el.classList.toggle("dragging", !!label);
  }
  applyInput() {
    const k = this.keys, h = this.hold, d = this.drag, y = this.yoke, t = this.tilt?.on ? this.tilt : null, b = this.boost?.stick;
    const pitch = (k.has("pu") ? 1 : 0) - (k.has("pd") ? 1 : 0) + h.pitch + (d ? d.dy : 0) + (y ? y.dy : 0) + (b ? b.pitch : 0) + (t ? t.pitch : 0),
      roll = (k.has("rr") ? 1 : 0) - (k.has("rl") ? 1 : 0) + h.roll + (d ? d.dx : 0) + (y ? y.dx : 0) + (b ? b.roll : 0) + (t ? t.roll : 0),
      thr = (k.has("tu") ? 1 : 0) - (k.has("td") ? 1 : 0) + h.throttle;
    this.g.setInput(pitch, roll, thr);
  }
  /** The yoke mirrors every input source (keys, buttons, drag, hold button, tilt) and eases back to centre. */
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
      ? `<span class="rw-eyebrow" translate="no">STAGE 1 · TAKEOFF · RWY ${RWY.id}</span><h1>김포 14R, 이륙 준비</h1><p>추력을 끝까지 올려 속도를 내고, VR에서 기수를 드세요. 너무 일찍 들거나 너무 많이 들면 꼬리가 활주로에 닿아요.</p><dl translate="no"><div><dt>V1</dt><dd>${V_SPEEDS.v1}</dd></div><div><dt>VR</dt><dd>${V_SPEEDS.vr}</dd></div><div><dt>V2</dt><dd>${V_SPEEDS.v2}</dd></div><div><dt>WIND</dt><dd>${formatWind(w.dir, w.speed)}</dd></div></dl><button class="primary" data-rw="start">이륙 시작 <kbd translate="no">SPACE</kbd></button><button class="rw-skip" data-rw="landing">착륙만 연습하기 →</button>${this.liveryButton()}`
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
    if (g.phase !== "fly" && g.phase !== "roll") return "";
    if (g.stage === "takeoff") {
      if (a.ground) {
        if (a.pitch > TAIL_LIMIT - 2.5) return HINT.tail;
        if (g.ias >= V_SPEEDS.vr - ROTATE_EARLY / 2) return HINT.rotate;
        return g.throttle < 0.9 ? HINT.throttle : HINT.wait;
      }
      return HINT.climb;
    }
    if (g.phase === "roll") return HINT.roll;
    if (g.altFt < 60) return HINT.flare;
    if (Math.abs(g.locDots) > 0.6) return HINT.line;
    if (g.assistInfo.thr) return g.assistInfo.thr > 0 ? HINT.slow : HINT.fast;
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
