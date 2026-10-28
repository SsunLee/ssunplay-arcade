import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { INGREDIENTS, SAUCES, TOSS_HEIGHT, TOSS_G, flightTime, sauteZone } from './pasta-engine.js';

const TAU = Math.PI * 2, M = 32;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = k => 1 - Math.pow(1 - clamp01(k), 3);
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ s >>> 15, 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }

// ── world layout ──
const BOARD_TOP = .16, KNIFE_X = .35;
const PAN = new T.Vector3(6.1, .22, .3), PAN_FLOOR = PAN.y + .06;
const POT = new T.Vector3(8.2, .22, -.3), WATER = POT.y + .86;
const PLATE = new T.Vector3(-6.6, 0, .1);
const STATIONS = {
  plate:{ target:[-6.6,.3,.15], w:3.5, h:3.1, tilt:.8, yaw:-.2 },
  result:{ target:[-6.6,.3,.15], w:3.6, h:3.4, tilt:.78, yaw:-.2, shift:.24 },
  chop:{ target:[-.35,.15,.05], w:4.6, h:3.2, tilt:.78, yaw:-.55 },
  // both burners in one shot: pan on the left, pot on the right
  stove:{ target:[7.2,.55,0], w:4.7, h:3.1, tilt:1.0 },
  toss:{ target:[6.1,1.35,.3], w:3.4, h:4.3, tilt:.82 },
};
const HEAPS = [[-2.05,-.82],[-2.05,0],[-2.05,.82]];

// ── procedural textures ──
export function canvasTexture(w, h, draw, { repeat, color = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  if (color) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function grain(x, w, h, r, base, lines, dark, rows = 1) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let p = 0; p < rows; p++) {
    const y0 = p * h / rows; x.fillStyle = `hsla(28,45%,${38 + r() * 18}%,${.12 + r() * .12})`; x.fillRect(0, y0, w, h / rows);
    if (rows > 1) { x.fillStyle = 'rgba(60,30,10,.35)'; x.fillRect(0, y0, w, 2); }
  }
  for (let i = 0; i < lines; i++) {
    const y = r() * h, amp = 2 + r() * 6, f = .004 + r() * .01, ph = r() * 9;
    x.strokeStyle = `rgba(${dark},${.05 + r() * .14})`; x.lineWidth = .6 + r() * 1.6; x.beginPath();
    for (let px = 0; px <= w; px += 8) x.lineTo(px, y + Math.sin(px * f + ph) * amp + Math.sin(px * f * 3.1) * amp * .3);
    x.stroke();
  }
}
function crossTexture(kind) {
  return canvasTexture(256, 256, (x, w) => {
    const r = seeded(kind.length * 977), c = w / 2;
    const disc = (rad, fill) => { x.fillStyle = fill; x.beginPath(); x.arc(c, c, rad, 0, TAU); x.fill(); };
    if (kind === 'tomato') {
      x.fillStyle = '#c8261a'; x.fillRect(0, 0, w, w);
      disc(c * .97, '#e34a2c'); disc(c * .86, '#f2633f');
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + .4; x.save(); x.translate(c + Math.cos(a) * c * .45, c + Math.sin(a) * c * .45); x.rotate(a);
        x.fillStyle = '#f79a6c'; x.beginPath(); x.ellipse(0, 0, c * .3, c * .2, 0, 0, TAU); x.fill();
        x.fillStyle = 'rgba(255,210,150,.55)'; x.beginPath(); x.ellipse(0, 0, c * .22, c * .13, 0, 0, TAU); x.fill();
        for (let s = 0; s < 9; s++) { x.fillStyle = '#f6dc8c'; x.beginPath(); x.ellipse((r() - .5) * c * .36, (r() - .5) * c * .2, 5, 3, r() * 3, 0, TAU); x.fill(); }
        x.restore();
      }
      disc(c * .17, '#f59a78');
    } else if (kind === 'onion') {
      x.fillStyle = '#7e2a62'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 9; i++) { const rad = c * (.97 - i * .105); disc(rad, i === 0 ? '#9c4a85' : i % 2 ? '#f8eef5' : '#eedcea'); x.strokeStyle = 'rgba(150,80,130,.35)'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, rad, 0, TAU); x.stroke(); }
    } else if (kind === 'garlic') {
      x.fillStyle = '#e6d6ad'; x.fillRect(0, 0, w, w); disc(c * .9, '#f5ecd2'); disc(c * .45, '#fcf7e6');
    } else if (kind === 'mushroom') {
      const g = x.createLinearGradient(0, w, 0, 0); g.addColorStop(0, '#efe3cc'); g.addColorStop(.55, '#f3e8d4'); g.addColorStop(.62, '#dcc5a3'); g.addColorStop(1, '#f1e4cd');
      x.fillStyle = g; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 120; i++) { x.fillStyle = `rgba(150,110,70,${r() * .08})`; x.fillRect(r() * w, r() * w, 3, 3); }
    } else if (kind === 'bacon') {
      const bands = ['#f4dccb', '#c9504c', '#e98a7a', '#f6e1d2', '#b8403f', '#f1d3c2'];
      bands.forEach((b, i) => { x.fillStyle = b; x.beginPath(); x.moveTo(0, i * w / 6); for (let px = 0; px <= w; px += 16) x.lineTo(px, i * w / 6 + Math.sin(px * .05 + i) * 6); x.lineTo(w, w); x.lineTo(0, w); x.fill(); });
    } else if (kind === 'basil') {
      x.fillStyle = '#2f7a2b'; x.fillRect(0, 0, w, w); x.lineWidth = 9;
      for (let k = 0; k < 2; k++) { x.strokeStyle = k ? '#6eb04e' : '#225f21'; x.beginPath(); for (let a = 0; a < TAU * 3.2; a += .1) { const rad = c * a / (TAU * 3.4); x.lineTo(c + Math.cos(a + k * .5) * rad, c + Math.sin(a + k * .5) * rad); } x.stroke(); x.lineWidth = 4; }
    }
  });
}
function skinTexture(kind) {
  return canvasTexture(256, 256, (x, w, h) => {
    const r = seeded(kind.length * 131 + 7);
    const fill = c => { x.fillStyle = c; x.fillRect(0, 0, w, h); };
    if (kind === 'tomato') { fill('#d12d1a'); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,${120 + r() * 60},60,${r() * .12})`; x.fillRect(r() * w, r() * h, 2, 2); } }
    if (kind === 'onion') { fill('#8f3470'); for (let i = 0; i < 30; i++) { x.fillStyle = `rgba(${200 + r() * 50},150,190,${.1 + r() * .2})`; x.fillRect(0, r() * h, w, 1 + r() * 3); } }
    if (kind === 'garlic') { fill('#f1e8d2'); for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(170,120,150,${.08 + r() * .12})`; x.fillRect(0, r() * h, w, 1 + r() * 2); } }
    if (kind === 'mushroom') { fill('#efe2c8'); const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(.1, '#efe2c8'); g.addColorStop(.13, '#7f5638'); g.addColorStop(.5, '#a0714b'); g.addColorStop(.87, '#7f5638'); g.addColorStop(.9, '#efe2c8'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    if (kind === 'bacon') { for (let i = 0; i < 12; i++) { x.fillStyle = i % 3 === 1 ? '#f5dccb' : i % 3 ? '#cf5a52' : '#b8423e'; x.fillRect(0, i * h / 12, w, h / 12 + 1); } }
    if (kind === 'basil') { fill('#2d7529'); x.strokeStyle = 'rgba(140,200,110,.5)'; x.lineWidth = 2; for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(i * w / 10, 0); x.lineTo(i * w / 10 + 30, h); x.stroke(); } }
  });
}

// ── sliceable ingredient bodies: a cross-section in (z, y) for every position u along the knife axis ──
function section(kind, u) {
  const L = INGREDIENTS[kind].length, pts = [];
  const ellipse = (rz, ry, cy) => { for (let i = 0; i < M; i++) { const a = i / M * TAU; pts.push([Math.cos(a) * rz, cy + Math.sin(a) * ry]); } return { pts, cz:0, cy, sz:rz, sy:ry }; };
  const sphere = R => R * Math.sqrt(Math.max(1e-4, 1 - ((u - R) / R) ** 2));
  if (kind === 'tomato') { const R = L / 2, p = sphere(R); return ellipse(p, p * .88, R * .88); }
  if (kind === 'onion') { const R = L / 2, p = sphere(R); return ellipse(p, p * .93, R * .93); }
  if (kind === 'garlic') { const p = .2 * Math.pow(Math.max(.02, Math.sin(Math.PI * u / L)), .55); return ellipse(p, p * .82, .17); }
  if (kind === 'basil') { const p = .17 * Math.min(1, Math.sqrt(Math.max(.03, u / .07)), Math.sqrt(Math.max(.03, (L - u) / .07))); return ellipse(p, p * .9, .16); }
  if (kind === 'bacon') {
    for (let i = 0; i < M; i++) { const a = i / M * TAU, c = Math.cos(a), s = Math.sin(a); pts.push([.34 * Math.sign(c) * Math.abs(c) ** (1 / 3), .065 + .02 * Math.sin(u * 9) * (s > 0) + .065 * Math.sign(s) * Math.abs(s) ** (1 / 3)]); }
    return { pts, cz:0, cy:.065, sz:.34, sy:.075 };
  }
  // mushroom: cap dome over a stem, so slices come out as the classic T
  const Rc = L / 2, pc = sphere(Rc), stemR = .15, cb = .22, hd = .5 * pc + .03, du = Math.abs(u - Rc);
  const sw = du < stemR ? Math.sqrt(stemR * stemR - du * du) : 0;
  pts.push([sw, 0], [sw, cb], [pc, cb]);
  for (let i = 1; i < M - 5; i++) { const a = i / (M - 5) * Math.PI; pts.push([Math.cos(a) * pc, cb + Math.sin(a) * hd]); }
  pts.push([-pc, cb], [-sw, cb], [-sw, 0]);
  return { pts, cz:0, cy:cb * .92, sz:pc, sy:cb + hd, mushroom:true };
}
function segmentGeometry(kind, u0, u1) {
  const n = Math.max(2, Math.ceil((u1 - u0) / .05) + 1), L = INGREDIENTS[kind].length;
  const pos = [], uv = [], idx = [], rings = [];
  for (let k = 0; k < n; k++) {
    const u = u0 + (u1 - u0) * k / (n - 1), s = section(kind, u); rings.push(s);
    for (let i = 0; i <= M; i++) { const [z, y] = s.pts[i % M]; pos.push(u, y, z); uv.push(u / L * 2, i / M); }
  }
  for (let k = 0; k < n - 1; k++) for (let i = 0; i < M; i++) {
    const a = k * (M + 1) + i, b = a + M + 1, c = a + 1, d = b + 1;
    idx.push(a, b, c, c, b, d);
  }
  const sideCount = idx.length;
  const cap = (s, u, sign) => {
    const base = pos.length / 3, mapUV = (z, y) => s.mushroom ? [z / (2 * s.sz) + .5, y / s.sy] : [(z - s.cz) / s.sz * .5 + .5, (y - s.cy) / s.sy * .5 + .5];
    pos.push(u, s.cy, s.cz); uv.push(...mapUV(s.cz, s.cy));
    for (const [z, y] of s.pts) { pos.push(u, y, z); uv.push(...mapUV(z, y)); }
    for (let i = 0; i < M; i++) { const p = base + 1 + i, q = base + 1 + (i + 1) % M; if (sign > 0) idx.push(base, q, p); else idx.push(base, p, q); }
  };
  cap(rings[0], u0, -1); cap(rings[n - 1], u1, 1);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.addGroup(0, sideCount, 0); g.addGroup(sideCount, idx.length - sideCount, 1);
  g.computeVertexNormals();
  // Caps are flat; overwrite the averaged normals so the cut faces light evenly.
  const nrm = g.attributes.normal, capStart = n * (M + 1);
  for (let v = capStart; v < nrm.count; v++) nrm.setXYZ(v, v < capStart + M + 1 ? -1 : 1, 0, 0);
  g.computeBoundingBox();
  return g;
}

// ── spaghetti ──
function strandGeometry(points, radius, segments) { return new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, 5, false); }
function twirlGeometry(seed, R = .95, top = .62) {
  const r = seeded(seed), list = [];
  for (let s = 0; s < 30; s++) {
    const a0 = r() * TAU, turns = 1.7 + r() * .9, lift = r() * .05, pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = a0 + t * turns * TAU, rr = R * (.06 + .94 * t) * (.93 + .07 * Math.sin(a * 3 + s)); pts.push(new T.Vector3(Math.cos(a) * rr, .035 + lift * (1 - t) + top * (1 - Math.pow(t, 1.5)) * (.92 + .08 * Math.sin(a * 2 + s)), Math.sin(a) * rr)); }
    list.push(strandGeometry(pts, .021, 90));
  }
  return mergeGeometries(list);
}
function tangleGeometry(seed, R, h, count = 26) {
  const r = seeded(seed), list = [];
  for (let s = 0; s < count; s++) {
    const a0 = r() * TAU, ph = r() * TAU, pts = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, a = a0 + t * 2.4 * TAU, rr = R * (.2 + .8 * Math.abs(Math.sin(t * 3.3 + ph))); pts.push(new T.Vector3(Math.cos(a) * rr, h * (.5 + .5 * Math.sin(t * 7 + ph)), Math.sin(a) * rr)); }
    list.push(strandGeometry(pts, .022, 70));
  }
  return mergeGeometries(list);
}
const NOODLE = { raw:0xe0b45a, firm:0xe8c470, aldente:0xf0d185, soft:0xf3dca3, mushy:0xf5e5bd };

// ── synthesized kitchen sounds ──
export class Sfx {
  constructor(enabled) { this.enabled = enabled; this.ctx = null; this.loops = {}; }
  ensure() {
    if (!this.enabled()) { this.silence(); return null; }
    if (!this.ctx) {
      try {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
        this.ctx = new A(); this.master = this.ctx.createGain(); this.master.gain.value = .55; this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 1.5, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      } catch { this.ctx = null; return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  env(node, t, peak, attack, decay) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + attack); node.gain.exponentialRampToValueAtTime(.0001, t + attack + decay); }
  burst({ freq = 2000, q = 1, type = 'bandpass', vol = .3, dur = .08, sweep, delay = 0 }) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur); f.Q.value = q;
    this.env(g, t, vol, .004, dur); s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  tone(freq, dur, { type = 'sine', vol = .2, to, delay = 0 } = {}) {
    const c = this.ensure(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    this.env(g, t, vol, .005, dur); o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + .05);
  }
  chop(heavy = 1) { this.tone(170, .09, { to:55, vol:.45 * heavy }); this.burst({ freq:2600, q:1.4, vol:.22, dur:.045 }); }
  perfect(combo) { const f = 660 * Math.pow(1.06, Math.min(combo, 10)); this.tone(f, .14, { type:'triangle', vol:.13 }); this.tone(f * 1.5, .18, { type:'triangle', vol:.09, delay:.05 }); }
  miss() { this.tone(220, .18, { type:'square', vol:.05, to:150 }); }
  whoosh() { this.burst({ freq:500, sweep:2200, q:.8, vol:.35, dur:.32 }); }
  splash() { this.burst({ freq:1400, sweep:400, type:'lowpass', q:.5, vol:.4, dur:.45 }); }
  land() { this.burst({ freq:3500, type:'highpass', q:.4, vol:.28, dur:.35 }); this.tone(120, .1, { to:70, vol:.2 }); }
  pop() { this.tone(500 + Math.random() * 500, .05, { to:1300, vol:.035 }); }
  fever() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .16, { type:'triangle', vol:.11, delay:i * .06 })); }
  flambe() { this.burst({ freq:300, sweep:1800, type:'lowpass', q:.6, vol:.55, dur:.9 }); this.tone(90, .5, { to:45, vol:.3 }); }
  fizzle() { this.burst({ freq:2200, sweep:700, type:'highpass', q:.5, vol:.2, dur:.4 }); }
  fanfare() { [523, 659, 784, 659, 1047].forEach((f, i) => this.tone(f, i === 4 ? .5 : .14, { type:'triangle', vol:.12, delay:i * .1 })); }
  loop(name, type, freq, q) {
    const c = this.ensure(); if (!c) return null;
    if (!this.loops[name]) {
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
      s.connect(f).connect(g).connect(this.master); s.start(); this.loops[name] = { s, g };
    }
    return this.loops[name];
  }
  level(name, v, type, freq, q) {
    if (!this.ctx && v <= .001) return;
    const l = v > .001 ? this.loop(name, type, freq, q) : this.loops[name];
    if (l) l.g.gain.setTargetAtTime(this.enabled() ? v : 0, this.ctx.currentTime, .08);
  }
  silence() { for (const l of Object.values(this.loops)) l.g.gain.value = 0; }
  destroy() { for (const l of Object.values(this.loops)) try { l.s.stop(); } catch {} this.loops = {}; this.ctx?.close().catch(() => {}); }
}

export class PastaView {
  constructor(canvas, game, { preview = false, sound = () => true } = {}) {
    this.canvas = canvas; this.game = game; this.preview = preview; this.dead = false;
    this.time = 0; this.phaseShown = ''; this.disposables = []; this.geoCache = new Map();
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sfx = new Sfx(() => !preview && sound());
    this.renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preview ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.02;
    canvas.dataset.renderer = 'webgl';
    this.scene = new T.Scene(); this.scene.background = new T.Color('#2a2420');
    this.scene.fog = new T.Fog('#2a2420', 24, 46);
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
    this.scene.environment = this.envMap; this.scene.environmentIntensity = .55;
    this.camera = new T.PerspectiveCamera(32, 1, .1, 80);
    this.camTarget = new T.Vector3(...STATIONS.plate.target); this.camDist = 12; this.camTilt = .92; this.camYaw = 0;
    this.lights();
    this.materials();
    this.buildKitchen(); this.buildBoard(); this.buildStove(); this.buildPlateStation();
    this.particles = []; this.sprites = []; this.slices = []; this.panPieces = []; this.decals = [];
    this.dishKey = '';
    this.syncPhase(true);
    this.snapCamera();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }

  // ── setup ──
  track(o) { this.disposables.push(o); return o; }
  std(color, roughness = .6, metalness = 0, extra = {}) { return this.track(new T.MeshStandardMaterial({ color, roughness, metalness, ...extra })); }
  lights() {
    this.scene.add(new T.HemisphereLight(0xfff1dc, 0x4a3426, 1.25));
    const key = this.key = new T.DirectionalLight(0xfff0d8, 2.6);
    key.castShadow = true; key.shadow.mapSize.set(this.preview ? 1024 : 2048, this.preview ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left:-4.5, right:4.5, top:4.5, bottom:-4.5, near:.5, far:30 });
    key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 4;
    this.scene.add(key, key.target);
    const rim = new T.DirectionalLight(0xffd2a8, .7); rim.position.set(6, 5, -8); this.scene.add(rim);
    // flashes when the pan goes up in a flambé
    this.flare = new T.PointLight(0xff8a2a, 0, 9, 1.6); this.flare.position.set(PAN.x, PAN.y + 1.4, PAN.z); this.scene.add(this.flare);
  }
  materials() {
    const m = this.mat = {};
    m.counter = this.std(0xffffff, .55, 0, { map:this.track(canvasTexture(1024, 512, (x, w, h) => grain(x, w, h, seeded(3), '#b98250', 140, '70,38,16', 8), { repeat:[2.2, 2.2] })) });
    m.wall = this.std(0xffffff, .28, 0, { map:this.track(canvasTexture(512, 512, (x, w, h) => {
      const r = seeded(9); x.fillStyle = '#d2c6b3'; x.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) { const ox = row % 2 ? 64 : 0, l = 90 + r() * 5; x.fillStyle = `hsl(38,${30 + r() * 8}%,${l}%)`; x.fillRect(col * 128 + ox + 3, row * 64 + 3, 122, 58); }
    }, { repeat:[6, 2] })) });
    m.board = this.std(0xffffff, .62, 0, { map:this.track(canvasTexture(512, 256, (x, w, h) => grain(x, w, h, seeded(5), '#ddb075', 70, '120,70,30'), { repeat:[.2, .37] })) });
    m.steel = this.std(0xd2d4d6, .34, 1); m.darkSteel = this.std(0x4a4c4f, .35, .9);
    m.blade = this.std(0xe9ecef, .16, 1); m.handle = this.std(0x3b2418, .45); m.rivet = this.std(0xcfd2d4, .2, 1);
    m.stove = this.std(0x1d1f21, .32, .3); m.grate = this.std(0x111213, .6, .4);
    m.ceramic = this.track(new T.MeshPhysicalMaterial({ color:0xfbfaf6, roughness:.2, clearcoat:1, clearcoatRoughness:.08 }));
    m.water = this.track(new T.MeshStandardMaterial({ color:0x9fb9bb, roughness:.04, metalness:.1, transparent:true, opacity:.42 }));
    m.foam = this.std(0xfffcf2, .7, 0, { transparent:true, opacity:.92 });
    m.flame = this.track(new T.MeshBasicMaterial({ color:0x4c8dff, transparent:true, opacity:.85, blending:T.AdditiveBlending, depthWrite:false }));
    m.flameTip = this.track(new T.MeshBasicMaterial({ color:0xff9a3c, transparent:true, opacity:.7, blending:T.AdditiveBlending, depthWrite:false }));
    m.guide = this.track(new T.MeshBasicMaterial({ color:0xfff1b0, transparent:true, opacity:.95, depthWrite:false }));
    m.knifeLine = this.track(new T.MeshBasicMaterial({ color:0xff7650, transparent:true, opacity:.75, depthWrite:false }));
    m.band = this.track(new T.MeshBasicMaterial({ color:0xffd36a, transparent:true, opacity:.16, side:T.DoubleSide, depthWrite:false }));
    m.ring = this.track(new T.MeshBasicMaterial({ color:0xffe08a, transparent:true, opacity:.85 }));
    m.noodle = this.std(NOODLE.aldente, .5, 0);
    m.potNoodle = this.std(NOODLE.raw, .5, 0);
    m.leaf = this.std(0x3f8f35, .5, 0, { side:T.DoubleSide });
    m.cheese = this.std(0xf6eccd, .7);
    m.pepper = this.std(0x2b221c, .8);
    m.char = this.std(0x2a1c14, .9);
    m.linen = this.std(0xffffff, .9, 0, { map:this.track(canvasTexture(256, 256, (x, w) => { x.fillStyle = '#f2eee4'; x.fillRect(0, 0, w, w); x.fillStyle = '#c94b37'; for (let i = 0; i < 4; i++) { x.fillRect(i * 64 + 20, 0, 6, w); x.fillRect(0, i * 64 + 20, w, 6); } })) });
    m.terracotta = this.std(0xb8603e, .8);
    this.kinds = {};
    for (const kind of Object.keys(INGREDIENTS)) {
      const skin = kind === 'tomato'
        ? this.track(new T.MeshPhysicalMaterial({ color:0xffffff, map:this.track(skinTexture(kind)), roughness:.32, clearcoat:.8, clearcoatRoughness:.2 }))
        : this.std(0xffffff, kind === 'onion' ? .45 : .6, 0, { map:this.track(skinTexture(kind)) });
      const inside = this.std(0xffffff, kind === 'tomato' ? .3 : .55, 0, { map:this.track(crossTexture(kind)) });
      this.kinds[kind] = [skin, inside];
    }
  }
  mesh(geo, mat, { cast = true, receive = false, parent = this.scene } = {}) {
    const o = new T.Mesh(this.track(geo), mat); o.castShadow = cast; o.receiveShadow = receive; parent.add(o); return o;
  }
  lathe(profile, segments = 48) { return new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments); }
  buildKitchen() {
    const counter = this.mesh(new T.BoxGeometry(34, 1, 14), this.mat.counter, { cast:false, receive:true }); counter.position.set(.5, -.5, 2);
    const wall = this.mesh(new T.PlaneGeometry(40, 10), this.mat.wall, { cast:false, receive:true }); wall.position.set(.5, 4.8, -5);
    // a few props so every station sits in one kitchen
    const vine = new T.Group(); vine.position.set(2.3, 0, -2.3); this.scene.add(vine);
    for (const [x, z, s] of [[0, 0, .34], [.55, .2, .3], [.25, -.45, .32], [-.4, -.35, .28]]) { const t = this.mesh(new T.SphereGeometry(s, 24, 16), this.kinds.tomato[0], { parent:vine }); t.position.set(x, s * .9, z); t.scale.y = .88; }
    const stem = this.mesh(new T.TorusGeometry(.5, .025, 6, 20, 2.4), this.std(0x4c7a2c, .7), { parent:vine }); stem.rotation.x = -Math.PI / 2; stem.position.set(.1, .62, -.1);
    const bottle = this.mesh(this.lathe([[0, 0], [.32, 0], [.34, .05], [.34, 1.3], [.18, 1.65], [.12, 1.75], [.12, 2.1], [0, 2.1]]), this.track(new T.MeshPhysicalMaterial({ color:0x6f8a2a, roughness:.08, transmission:.0, metalness:0, clearcoat:1, transparent:true, opacity:.88 })));
    bottle.position.set(4.3, 0, -2.4);
    const cork = this.mesh(new T.CylinderGeometry(.13, .12, .22, 16), this.std(0xb88a5a, .8)); cork.position.set(4.3, 2.2, -2.4);
    const label = this.mesh(new T.CylinderGeometry(.345, .345, .5, 32, 1, true), this.std(0xf3e6c4, .7)); label.position.set(4.3, .7, -2.4);
    const mill = this.mesh(this.lathe([[0, 0], [.2, 0], [.22, .1], [.16, .5], [.2, .9], [.12, 1.15], [0, 1.2]]), this.std(0x5a3220, .45)); mill.position.set(9.9, 0, -1.8);
    const pot = this.mesh(this.lathe([[0, 0], [.4, 0], [.48, .55], [.5, .62], [0, .62]], 24), this.mat.terracotta); pot.position.set(-4.3, 0, -2.2);
    for (let i = 0; i < 14; i++) { const leaf = this.mesh(this.leafGeometry(), this.mat.leaf, { parent:pot }); const a = i / 14 * TAU; leaf.position.set(Math.cos(a) * .2, .62 + (i % 3) * .1, Math.sin(a) * .2); leaf.rotation.set(-.7 - (i % 3) * .2, a, 0); leaf.scale.setScalar(1.4); }
  }
  leafGeometry() {
    if (this._leaf) return this._leaf.clone();
    const s = new T.Shape(); s.moveTo(0, 0); s.bezierCurveTo(.12, .08, .12, .28, 0, .38); s.bezierCurveTo(-.12, .28, -.12, .08, 0, 0);
    const g = new T.ShapeGeometry(s, 10); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -Math.abs(p.getX(i)) * .6 + p.getY(i) * p.getY(i) * .4);
    g.rotateX(-Math.PI / 2); g.computeVertexNormals(); this._leaf = this.track(g);
    return g.clone();
  }
  buildBoard() {
    const s = new T.Shape(), w = 2.55, d = 1.4, r = .14;
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d); s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
    const g = new T.ExtrudeGeometry(s, { depth:BOARD_TOP - .03, bevelEnabled:true, bevelThickness:.015, bevelSize:.03, bevelSegments:3 }); g.rotateX(-Math.PI / 2); g.translate(0, .015, 0);
    this.mesh(g, this.mat.board, { receive:true });
    this.guide = this.mesh(new T.PlaneGeometry(.035, 2.5), this.mat.guide, { cast:false }); this.guide.rotation.x = -Math.PI / 2; this.guide.position.y = BOARD_TOP + .004; this.guide.renderOrder = 2;
    const ghost = this.track(canvasTexture(64, 128, (x, w, h) => { const g = x.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,236,150,.95)'); g.addColorStop(1, 'rgba(255,236,150,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
    this.ghostMat = this.track(new T.MeshBasicMaterial({ map:ghost, transparent:true, opacity:.6, blending:T.AdditiveBlending, depthWrite:false, side:T.DoubleSide }));
    this.ghost = this.mesh(new T.PlaneGeometry(1.7, 1.35), this.ghostMat, { cast:false }); this.ghost.rotation.y = Math.PI / 2; this.ghost.position.y = BOARD_TOP + .67; this.ghost.renderOrder = 3;
    this.knifeLine = this.mesh(new T.PlaneGeometry(.05, 2.6), this.mat.knifeLine, { cast:false }); this.knifeLine.rotation.x = -Math.PI / 2; this.knifeLine.position.set(KNIFE_X, BOARD_TOP + .003, 0);
    // chef's knife: blade in the cutting plane, handle toward the cook
    const knife = this.knife = new T.Group(); knife.position.set(KNIFE_X, BOARD_TOP + 1.3, 0); this.scene.add(knife);
    const b = new T.Shape(); b.moveTo(-.85, 0); b.lineTo(.75, 0); b.quadraticCurveTo(1.12, .02, 1.22, .22); b.quadraticCurveTo(.9, .4, .3, .5); b.lineTo(-.85, .52); b.lineTo(-.85, 0);
    const bg = new T.ExtrudeGeometry(b, { depth:.022, bevelEnabled:true, bevelThickness:.004, bevelSize:.006, bevelSegments:1 }); bg.translate(0, 0, -.011); bg.rotateY(Math.PI / 2);
    this.mesh(bg, this.mat.blade, { parent:knife });
    const handle = this.mesh(new T.CapsuleGeometry(.075, .75, 4, 12), this.mat.handle, { parent:knife }); handle.rotation.x = Math.PI / 2; handle.position.set(0, .4, 1.3); handle.scale.x = .6;
    for (const z of [1.05, 1.3, 1.55]) { const rv = this.mesh(new T.CylinderGeometry(.022, .022, .1, 10), this.mat.rivet, { parent:knife }); rv.rotation.z = Math.PI / 2; rv.position.set(0, .4, z); }
    const bolster = this.mesh(new T.BoxGeometry(.06, .2, .1), this.mat.blade, { parent:knife }); bolster.position.set(0, .42, .88);
    this.ingGroup = new T.Group(); this.ingGroup.position.y = BOARD_TOP; this.scene.add(this.ingGroup);
    this.remainKey = '';
  }
  buildStove() {
    const top = this.mesh(new T.BoxGeometry(5.4, .14, 3.4), this.mat.stove, { receive:true }); top.position.set(7.15, .07, -.05);
    for (const c of [PAN, POT]) {
      for (let i = 0; i < 4; i++) { const bar = this.mesh(new T.BoxGeometry(2.1, .06, .06), this.mat.grate, { parent:this.scene }); bar.position.set(c.x, .19, c.z); bar.rotation.y = i * Math.PI / 4; }
      const ring = this.mesh(new T.TorusGeometry(.55, .03, 8, 40), this.mat.darkSteel); ring.rotation.x = Math.PI / 2; ring.position.set(c.x, .16, c.z);
    }
    // flames ring the outside of the vessel so they lick its walls instead of poking through the floor
    const flames = (center, n, radius, tilt) => {
      const g = new T.Group(); g.position.set(center.x, .17, center.z); this.scene.add(g);
      const cone = this.track(new T.ConeGeometry(.045, .26, 8)); cone.translate(0, .13, 0);
      const tip = this.track(new T.ConeGeometry(.025, .14, 6)); tip.translate(0, .2, 0);
      for (let i = 0; i < n; i++) { const a = i / n * TAU; const f = new T.Mesh(cone, this.mat.flame); f.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius); f.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); const t = new T.Mesh(tip, this.mat.flameTip); f.add(t); g.add(f); }
      return g;
    };
    this.panFlame = flames(PAN, 26, 1.12, .35); this.potFlame = flames(POT, 24, 1.02, .2);
    // frying pan
    const pan = this.pan = new T.Group(); pan.position.copy(PAN); this.scene.add(pan);
    this.mesh(this.lathe([[0, 0], [.98, 0], [1.06, .03], [1.2, .26], [1.24, .28], [1.17, .28], [1.04, .07], [.96, .055], [0, .055]]), this.mat.steel, { parent:pan, receive:true });
    const ph = this.mesh(new T.CylinderGeometry(.065, .05, 1.7, 14), this.std(0x1f1a17, .4), { parent:pan }); ph.rotation.set(Math.PI / 2 - .18, 0, 0); ph.position.set(0, .4, 2.0);
    pan.rotation.y = -.45;
    this.panContents = new T.Group(); this.panContents.position.y = .055; pan.add(this.panContents);
    this.sauceMat = this.std(0xc8321d, .32, 0);
    this.sauceDisc = this.mesh(new T.CylinderGeometry(.97, .97, .05, 48), this.sauceMat, { parent:this.panContents, cast:false, receive:true }); this.sauceDisc.position.y = .02; this.sauceDisc.visible = false;
    this.tossGroup = new T.Group(); this.panContents.add(this.tossGroup);
    this.panNest = this.mesh(tangleGeometry(17, .78, .2), this.mat.noodle, { parent:this.tossGroup }); this.panNest.position.y = .03; this.panNest.visible = false;
    this.buildNoodles();
    // toss target band
    this.bandGroup = new T.Group(); this.bandGroup.position.set(PAN.x, 0, PAN.z); this.scene.add(this.bandGroup);
    this.band = this.mesh(new T.CylinderGeometry(1.18, 1.18, 1, 48, 1, true), this.mat.band, { parent:this.bandGroup, cast:false });
    this.bandLo = this.mesh(new T.TorusGeometry(1.18, .022, 6, 64), this.mat.ring, { parent:this.bandGroup, cast:false }); this.bandLo.rotation.x = Math.PI / 2;
    this.bandHi = this.mesh(new T.TorusGeometry(1.18, .022, 6, 64), this.mat.ring, { parent:this.bandGroup, cast:false }); this.bandHi.rotation.x = Math.PI / 2;
    this.bandGroup.visible = false;
    // stock pot
    const pot = this.pot = new T.Group(); pot.position.copy(POT); this.scene.add(pot);
    this.mesh(this.lathe([[0, 0], [.92, 0], [.95, .04], [.95, 1.0], [.99, 1.04], [.92, 1.04], [.9, .06], [0, .06]]), this.mat.steel, { parent:pot });
    for (const s of [-1, 1]) { const h = this.mesh(new T.TorusGeometry(.16, .03, 8, 16, Math.PI), this.mat.steel, { parent:pot }); h.position.set(s * .98, .82, 0); h.rotation.set(0, s > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
    this.water = this.mesh(new T.CylinderGeometry(.9, .9, .03, 48), this.mat.water, { parent:pot, cast:false }); this.water.position.y = WATER - POT.y;
    this.potNest = this.mesh(tangleGeometry(29, .62, .3, 22), this.mat.potNoodle, { parent:pot }); this.potNest.position.y = .36; this.potNest.visible = false;
    const stick = this.track(new T.CylinderGeometry(.014, .014, 2.1, 5)); stick.translate(0, 1.05, 0);
    this.sticks = new T.InstancedMesh(stick, this.mat.potNoodle, 60); this.sticks.castShadow = true; pot.add(this.sticks);
    this.stickSeeds = Array.from({ length:60 }, (_, i) => { const r = seeded(i + 40); return { a:r() * TAU, r:r() * .12, lean:.05 + r() * .12 }; });
    const foamGeo = this.track(new T.SphereGeometry(.16, 10, 8));
    this.foam = new T.InstancedMesh(foamGeo, this.mat.foam, 46); pot.add(this.foam);
    this.foamSeeds = Array.from({ length:46 }, (_, i) => { const r = seeded(i + 90); return { a:r() * TAU, r:Math.sqrt(r()) * .82, s:.6 + r() * .7, p:r() * TAU }; });
    this.bubbles = new T.InstancedMesh(this.track(new T.SphereGeometry(.05, 8, 6)), this.mat.water, 24); pot.add(this.bubbles);
    this.bubbleSeeds = Array.from({ length:24 }, (_, i) => { const r = seeded(i + 300); return { a:r() * TAU, r:Math.sqrt(r()) * .8, p:r(), sp:.8 + r() * 1.2 }; });
  }
  // ── mantecatura: loose strands simulated as ropes in the pan's own frame ──
  buildNoodles() {
    const S = 40, P = 20, R = 6, n = S * P;
    this.rope = { S, P, R, seg:.07, pos:new Float32Array(n * 3), prev:new Float32Array(n * 3), layer:new Float32Array(S), air:false, acc:0, comY:0, comV:0 };
    const geo = new T.BufferGeometry(), idx = [];
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * R * 3), 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(n * R * 3), 3).setUsage(T.DynamicDrawUsage));
    for (let s = 0; s < S; s++) for (let i = 0; i < P - 1; i++) for (let j = 0; j < R; j++) {
      const a = (s * P + i) * R + j, b = (s * P + i) * R + (j + 1) % R; idx.push(a, b, a + R, b, b + R, a + R);
    }
    geo.setIndex(idx);
    this.noodles = this.mesh(geo, this.mat.noodle, { parent:this.panContents }); this.noodles.frustumCulled = false; this.noodles.visible = false;
    this.gLocal = new T.Vector3(); this.qTmp = new T.Quaternion();
  }
  // strands drop from the colander above into the pan in loose curls
  resetNoodles() {
    const R = this.rope, r = Math.random;
    for (let s = 0; s < R.S; s++) {
      const a0 = r() * TAU, rad = .15 + r() * .45, curl = (r() < .5 ? -1 : 1) * (.6 + r() * 1.4), h = 1.4 + r() * 1.1 + s * .03;
      R.layer[s] = r() * .1;
      let x = Math.cos(a0) * rad, z = Math.sin(a0) * rad, dir = r() * TAU;
      for (let i = 0; i < R.P; i++) {
        const k = (s * R.P + i) * 3;
        R.pos[k] = x; R.pos[k + 1] = h + Math.sin(i * .7 + s) * .08; R.pos[k + 2] = z;
        R.prev[k] = x; R.prev[k + 1] = R.pos[k + 1] + .02; R.prev[k + 2] = z;
        dir += curl * R.seg * (1 + (r() - .5) * .6); x += Math.cos(dir) * R.seg; z += Math.sin(dir) * R.seg;
      }
    }
    R.air = true; R.dropping = true; R.acc = 0; R.comY = 2;
    for (const p of this.panPieces) p.phys = { p:p.base.clone().add(new T.Vector3(0, .9 + Math.random() * .6, 0)), v:new T.Vector3(), w:new T.Vector3() };
    this.noodles.visible = true; this.panNest.visible = false;
    this.drawNoodles();
  }
  // the pan flicks: every strand gets the lift for this height plus a spin that curls the nest over
  launch(h) {
    const R = this.rope, r = Math.random, v0 = Math.sqrt(2 * TOSS_G * h * TOSS_HEIGHT) * 1.07, w = -(2.3 + r() * .9) / flightTime(h), dt = 1 / 120;
    let cy = 0, cz = 0; const n = R.S * R.P;
    for (let i = 0; i < n; i++) { cy += R.pos[i * 3 + 1]; cz += R.pos[i * 3 + 2]; } cy /= n; cz /= n;
    for (let s = 0; s < R.S; s++) {
      const ks = 1 + (r() - .5) * .24, sx = (r() - .5) * .5, sz = (r() - .5) * .5;
      for (let i = 0; i < R.P; i++) {
        const k = (s * R.P + i) * 3, kp = 1 + (r() - .5) * .1, y = R.pos[k + 1], z = R.pos[k + 2];
        const vx = sx + (r() - .5) * .2, vy = v0 * ks * kp - w * (z - cz), vz = sz + w * (y - cy);
        R.prev[k] = R.pos[k] - vx * dt; R.prev[k + 1] = y - vy * dt; R.prev[k + 2] = z - vz * dt;
      }
    }
    for (const p of this.panPieces) if (p.phys) { p.phys.v.set((r() - .5) * .6, v0 * (.8 + r() * .35), (r() - .5) * .6); p.phys.w.set((r() - .5) * 14, (r() - .5) * 6, (r() - .5) * 14); }
    R.air = true; R.dropping = false;
  }
  swirl(dx) { this.swirlV = Math.max(-1.5, Math.min(1.5, (this.swirlV || 0) + dx * .02)); }
  updateNoodles(dt) {
    const R = this.rope, h = 1 / 120;
    this.panContents.getWorldQuaternion(this.qTmp).invert();
    this.gLocal.set(0, -TOSS_G, 0).applyQuaternion(this.qTmp);
    const gx = this.gLocal.x * h * h, gy = this.gLocal.y * h * h, gz = this.gLocal.z * h * h, sw = (this.swirlV || 0) * 4 * h * h;
    const floorAt = (x, z) => { const rr = Math.hypot(x, z); return rr < .9 ? 0 : (rr - .9) * .85; };
    R.acc = Math.min(R.acc + dt, 4 / 120);
    const n = R.S * R.P, P = R.pos, Q = R.prev;
    while (R.acc >= h) {
      R.acc -= h;
      for (let i = 0; i < n; i++) {
        const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2], rr = Math.hypot(x, z) || 1;
        const vx = (x - Q[k]) * .995, vy = (y - Q[k + 1]) * .995, vz = (z - Q[k + 2]) * .995;
        Q[k] = x; Q[k + 1] = y; Q[k + 2] = z;
        P[k] = x + vx + gx - z / rr * sw; P[k + 1] = y + vy + gy; P[k + 2] = z + vz + gz + x / rr * sw;
      }
      for (let it = 0; it < 4; it++) for (let s = 0; s < R.S; s++) {
        const base = s * R.P, lift = .022 + R.layer[s];
        for (let i = 0; i < R.P - 1; i++) this.constrain(base + i, base + i + 1, R.seg, 1);
        // a little stiffness keeps strands from folding into sharp kinks
        for (let i = 0; i < R.P - 2; i++) this.constrain(base + i, base + i + 2, R.seg * 1.85, .22, true);
        for (let i = 0; i < R.P; i++) {
          const k = (base + i) * 3, rr = Math.hypot(P[k], P[k + 2]);
          if (rr > 1.1 && P[k + 1] < .34) { P[k] *= 1.1 / rr; P[k + 2] *= 1.1 / rr; }
          const f = floorAt(P[k], P[k + 2]) + lift;
          if (P[k + 1] < f && P[k + 1] > f - .6) { P[k + 1] = f; Q[k + 1] = f; Q[k] = P[k] - (P[k] - Q[k]) * .55; Q[k + 2] = P[k + 2] - (P[k + 2] - Q[k + 2]) * .55; }
        }
      }
    }
    // gentle simmer between tosses so the pile keeps breathing
    if (!R.air && this.game.state === 'play' && !this.reduced) for (let i = 0; i < 2; i++) { const k = Math.floor(Math.random() * n) * 3; Q[k + 1] -= .0012; }
    let cy = 0; for (let i = 0; i < n; i++) cy += P[i * 3 + 1]; cy /= n;
    R.comV = (cy - R.comY) / Math.max(dt, 1e-3); R.comY = cy;
    if (R.air && R.comV < 0 && cy < .16) this.landed();
    for (const p of this.panPieces) {
      const ph = p.phys; if (!ph) continue;
      ph.v.addScaledVector(this.gLocal, dt); ph.p.addScaledVector(ph.v, dt);
      const rr = Math.hypot(ph.p.x, ph.p.z); if (rr > 1.05) { ph.p.x *= 1.05 / rr; ph.p.z *= 1.05 / rr; }
      const f = floorAt(ph.p.x, ph.p.z) + .05;
      if (ph.p.y < f) { ph.p.y = f; ph.v.y = ph.v.y < -1.5 ? -ph.v.y * .25 : 0; ph.v.x *= .6; ph.v.z *= .6; ph.w.multiplyScalar(.4); }
      p.mesh.position.copy(ph.p); p.mesh.rotation.x += ph.w.x * dt; p.mesh.rotation.z += ph.w.z * dt;
    }
    this.drawNoodles();
  }
  constrain(a, b, len, stiff, minOnly = false) {
    const P = this.rope.pos, i = a * 3, j = b * 3, dx = P[j] - P[i], dy = P[j + 1] - P[i + 1], dz = P[j + 2] - P[i + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
    if (minOnly && d >= len) return;
    const k = (d - len) / d * .5 * stiff;
    P[i] += dx * k; P[i + 1] += dy * k; P[i + 2] += dz * k; P[j] -= dx * k; P[j + 1] -= dy * k; P[j + 2] -= dz * k;
  }
  landed() {
    const R = this.rope, g = this.game; R.air = false;
    if (R.dropping) { R.dropping = false; this.sfx.splash(); return; }
    this.sfx.land(); this.landT = 0;
    const c = new T.Vector3(PAN.x, PAN_FLOOR + .3, PAN.z), last = g.toss.results.at(-1), high = last?.grade === 'high';
    this.burst(c, g.recipe.color, high ? 14 : 5, { speed:high ? 2.6 : 1.2, size:.04, spread:1.2, stain:high });
  }
  drawNoodles() {
    const R = this.rope, pa = this.noodles.geometry.attributes.position, na = this.noodles.geometry.attributes.normal, A = pa.array, N = na.array, P = R.pos;
    for (let s = 0; s < R.S; s++) for (let i = 0; i < R.P; i++) {
      const id = s * R.P + i, k = id * 3, a = (s * R.P + Math.max(0, i - 1)) * 3, b = (s * R.P + Math.min(R.P - 1, i + 1)) * 3;
      let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // ring frame around the tangent
      let nx, ny, nz; if (Math.abs(ty) < .9) { nx = -tz; ny = 0; nz = tx; } else { nx = 0; ny = tz; nz = -ty; }
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx, rad = i === 0 || i === R.P - 1 ? .016 : .024;
      for (let j = 0; j < R.R; j++) {
        const an = j / R.R * TAU, c = Math.cos(an), sn = Math.sin(an), dx = nx * c + bx * sn, dy = ny * c + by * sn, dz = nz * c + bz * sn, v = (id * R.R + j) * 3;
        A[v] = P[k] + dx * rad; A[v + 1] = P[k + 1] + dy * rad; A[v + 2] = P[k + 2] + dz * rad; N[v] = dx; N[v + 1] = dy; N[v + 2] = dz;
      }
    }
    pa.needsUpdate = na.needsUpdate = true;
  }
  buildPlateStation() {
    const plate = this.plate = new T.Group(); plate.position.copy(PLATE); this.scene.add(plate);
    this.mesh(this.lathe([[0, .02], [.9, .02], [1.05, .05], [1.55, .16], [1.62, .18], [1.6, .2], [1.5, .19], [1.04, .085], [0, .075]], 64), this.mat.ceramic, { parent:plate, receive:true });
    const foot = this.mesh(new T.CylinderGeometry(.8, .82, .03, 48), this.mat.ceramic, { parent:plate, cast:false }); foot.position.y = .015;
    const napkin = this.mesh(new T.BoxGeometry(1.1, .03, 2.4), this.mat.linen, { receive:true }); napkin.position.set(PLATE.x + 2.3, .015, PLATE.z + .2); napkin.rotation.y = .08;
    const fork = new T.Group(); fork.position.set(PLATE.x + 2.25, .06, PLATE.z + .2); fork.rotation.y = .08; this.scene.add(fork);
    const fh = this.mesh(new T.BoxGeometry(.13, .035, 1.35), this.mat.steel, { parent:fork }); fh.position.z = .5;
    const neck = this.mesh(new T.BoxGeometry(.24, .03, .25), this.mat.steel, { parent:fork }); neck.position.z = -.3;
    for (let i = 0; i < 4; i++) { const tine = this.mesh(new T.BoxGeometry(.035, .03, .5), this.mat.steel, { parent:fork }); tine.position.set(-.09 + i * .06, .01, -.65); }
    const bowl = this.mesh(this.lathe([[0, 0], [.3, 0], [.42, .22], [.4, .24], [.28, .04], [0, .04]], 32), this.mat.ceramic); bowl.position.set(PLATE.x - 2.2, 0, PLATE.z - 1.2);
    const cheese = this.mesh(new T.SphereGeometry(.3, 16, 8, 0, TAU, 0, Math.PI / 2), this.mat.cheese, { parent:bowl }); cheese.scale.y = .35; cheese.position.y = .1;
    this.dish = new T.Group(); this.dish.position.y = .085; plate.add(this.dish);
  }

  // ── geometry caches ──
  segment(kind, u0, u1) {
    const key = kind + ':' + u0.toFixed(4) + ':' + u1.toFixed(4);
    let g = this.geoCache.get(key);
    if (!g) { g = segmentGeometry(kind, u0, u1); this.geoCache.set(key, g); }
    return g;
  }
  idealSlices(recipe) {
    const out = [];
    for (const kind of recipe.ingredients) { const ing = INGREDIENTS[kind]; for (let u = 0; u + ing.width * 1.05 <= ing.length; u += ing.width) out.push({ kind, u0:u, u1:u + ing.width, grade:'perfect' }); }
    return out;
  }

  // ── the finished plate reflects how it was cooked ──
  buildDish(quality) {
    const g = this.game, recipe = quality?.recipe || g.recipe;
    for (const c of [...this.dish.children]) this.dish.remove(c);
    for (const d of this.plateDecals || []) this.plate.remove(d);
    this.plateDecals = [];
    const r = seeded(quality ? 7 + (quality.value || 0) : recipe.id.length * 31);
    const D = this.dishParts ||= (() => {
      const blob = this.track(new T.SphereGeometry(.5, 28, 16)), p = blob.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + .12 * Math.sin(p.getX(i) * 9) * Math.cos(p.getZ(i) * 8); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
      blob.computeVertexNormals(); this.leafGeometry();
      return { twirl:this.track(twirlGeometry(11)), pool:this.track(new T.CylinderGeometry(1.0, 1.05, .04, 40)), blob, leaf:this._leaf,
        shard:this.track(new T.BoxGeometry(.09, .012, .05)), speck:this.track(new T.SphereGeometry(.014, 5, 4)), char:this.track(new T.DodecahedronGeometry(.045)),
        splat:this.track(new T.CircleGeometry(.07, 12)), noodle:this.std(NOODLE.aldente, .48), sauce:this.std(recipe.color, .3) };
    })();
    D.noodle.color.set(NOODLE[quality?.noodle || 'aldente']).lerp(new T.Color(recipe.color), recipe.id === 'cream' ? .15 : .28);
    D.sauce.color.set(recipe.color);
    const add = (geo, mat, x, y, z, shadow = true) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; this.dish.add(m); return m; };
    add(D.twirl, D.noodle, 0, 0, 0);
    add(D.pool, D.sauce, 0, .01, 0, false);
    add(D.blob, D.sauce, 0, .56, 0).scale.set(1, .28, 1);
    // the actual slices from the board go on top
    const all = quality?.slices || this.idealSlices(recipe);
    const slices = all.filter((s, i) => all.length < 14 || i % 2 === 0).slice(0, 14);
    slices.forEach((s, i) => {
      const geo = this.segment(s.kind, s.u0, s.u1), piece = new T.Mesh(geo, this.kinds[s.kind]), holder = new T.Group();
      const a = i / slices.length * TAU + r() * .4, rad = .15 + r() * .45, box = geo.boundingBox;
      piece.castShadow = true; piece.position.x = -(box.min.x + box.max.x) / 2;
      holder.add(piece); holder.scale.setScalar(.42);
      holder.position.set(Math.cos(a) * rad, .6 + (.45 - rad) * .3 + r() * .04, Math.sin(a) * rad);
      holder.rotation.set(0, r() * TAU, Math.PI / 2 + (r() - .5) * .5, 'YXZ');
      this.dish.add(holder);
    });
    for (let i = 0; i < (recipe.id === 'pesto' ? 4 : 2); i++) { const l = add(D.leaf, this.mat.leaf, (r() - .5) * .3, .74, (r() - .5) * .3); l.scale.setScalar(1.5); l.rotation.set(-.3, r() * TAU, 0); }
    for (let i = 0; i < 22; i++) { const a = r() * TAU, rad = r() * .6; add(D.shard, this.mat.cheese, Math.cos(a) * rad, .66 - rad * .35 + r() * .05, Math.sin(a) * rad, false).rotation.set(r(), r() * 3, r()); }
    for (let i = 0; i < 26; i++) { const a = r() * TAU, rad = r() * .9; add(D.speck, this.mat.pepper, Math.cos(a) * rad, .62 - rad * .4, Math.sin(a) * rad, false); }
    const burnt = Math.min(18, Math.round((quality?.burn || 0) * 4));
    for (let i = 0; i < burnt; i++) { const a = r() * TAU, rad = r() * .7; add(D.char, this.mat.char, Math.cos(a) * rad, .62 - rad * .35, Math.sin(a) * rad).scale.setScalar(.7 + r() * .8); }
    for (let i = 0; i < (quality?.high || 0) * 4; i++) { const a = r() * TAU, s = new T.Mesh(D.splat, D.sauce); s.rotation.x = -Math.PI / 2; s.scale.setScalar(.6 + r()); s.position.set(Math.cos(a) * (1.3 + r() * .15), .178 + .002 * i, Math.sin(a) * (1.3 + r() * .15)); this.plate.add(s); this.plateDecals.push(s); }
  }

  // ── phase changes ──
  shownPhase() { const g = this.game; return g.phase === 'paused' ? g.previousPhase : g.phase; }
  syncPhase(force = false) {
    const phase = this.shownPhase(), g = this.game;
    const key = phase === 'recipe' ? 'recipe:' + g.recipe.id : phase;
    if (!force && key === this.phaseShown) return;
    const was = this.phaseShown; this.phaseShown = key;
    if (phase === 'recipe') { this.buildDish(null); this.dishSpin = 0; }
    if (phase === 'chop' && !was.startsWith('chop')) this.resetBoard();
    if (phase === 'stove') { this.fillPan(); this.potNest.visible = false; this.sticksDrop = -1; }
    if (phase === 'toss') { this.panPieces.forEach(p => { p.mesh.visible = p.i % 2 === 0; }); this.sauceDisc.scale.set(.9, 1, .9); this.resetNoodles(); }
    if (phase === 'result') {
      this.buildDish({ ...g.result, recipe:g.recipe, slices:g.chop.slices, burn:g.saute.burn });
      this.sfx.level('sizzle', 0); this.sfx.level('boil', 0);
    }
  }
  resetBoard() {
    for (const s of this.slices) this.scene.remove(s.pivot);
    this.slices = []; this.remainKey = ''; this.knifeT = 1; this.fever = false;
    for (const p of this.panPieces) p.mesh.parent?.remove(p.mesh);
    this.panPieces = []; this.sauceDisc.visible = false; this.panNest.visible = false; this.noodles.visible = false;
  }
  fillPan() {
    const g = this.game, r = seeded(99);
    this.sauceMat.color.set(g.recipe.color); this.sauceDisc.visible = false; this.sauceDisc.scale.set(.01, 1, .01);
    this.panMats = {};
    for (const p of this.panPieces) p.mesh.parent?.remove(p.mesh);
    this.panPieces = [];
    this.slices.forEach((s, i) => {
      if (!this.panMats[s.kind]) this.panMats[s.kind] = this.kinds[s.kind].map(m => this.track(m.clone()));
      const piece = new T.Mesh(s.mesh.geometry, this.panMats[s.kind]); piece.castShadow = true;
      const box = s.mesh.geometry.boundingBox, holder = new T.Group();
      piece.position.x = -(box.min.x + box.max.x) / 2; holder.add(piece);
      const a = r() * TAU, rad = Math.sqrt(r()) * .72;
      holder.position.set(Math.cos(a) * rad, .02 + r() * .03, Math.sin(a) * rad);
      holder.rotation.set(0, r() * TAU, Math.PI / 2, 'YXZ'); holder.scale.setScalar(.62);
      this.tossGroup.add(holder);
      this.panPieces.push({ mesh:holder, base:holder.position.clone(), drop:-.25 - i * .05, i, kind:s.kind });
    });
    this.slices.forEach(s => s.pivot.visible = false);
  }
  syncRemainder() {
    const g = this.game, c = g.chop, kind = g.ingredientKind, phase = this.shownPhase();
    const key = phase === 'chop' && g.state !== 'done' ? kind + ':' + c.lastCut.toFixed(4) : 'none';
    if (key === this.remainKey) return;
    this.remainKey = key;
    if (this.remain) { this.ingGroup.remove(this.remain); this.remain = null; }
    if (key === 'none') return;
    const L = INGREDIENTS[kind].length;
    if (L - c.lastCut < .01) return;
    this.remain = new T.Mesh(segmentGeometry(kind, c.lastCut, L), this.kinds[kind]); this.remain.castShadow = true; this.remain.userData.own = true;
    this.remain.geometry.userData.temp = true; this.ingGroup.add(this.remain);
    if (this.remainGeo) this.remainGeo.dispose(); this.remainGeo = this.remain.geometry;
  }

  // ── events from the game ──
  handle(e) {
    const g = this.game;
    if (e.type === 'begin') this.sfx.ensure();
    if (e.type === 'slice') {
      const s = e.slice, th = s.u1 - s.u0, geo = this.segment(s.kind, s.u0, s.u1);
      const pivot = new T.Group(), mesh = new T.Mesh(geo, this.kinds[s.kind]); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.position.x = -s.u0; pivot.add(mesh);
      const atKnife = s.grade === 'miss' ? KNIFE_X - (e.feed - s.u1) : KNIFE_X;
      pivot.position.set(atKnife - th, BOARD_TOP, 0); this.scene.add(pivot);
      const h = geo.boundingBox.max.y;
      this.slices.push({ pivot, mesh, kind:s.kind, t:0, th, h, ing:e.ing, order:this.slices.filter(x => x.ing === e.ing).length, grade:s.grade, sweep:-1 });
      if (s.grade !== 'miss') { this.knifeT = 0; this.sfx.chop(); if (s.grade === 'perfect') this.sfx.perfect(e.combo); }
      else this.sfx.miss();
      const juice = { tomato:0xe8432a, onion:0xf5e8f2, garlic:0xfff6dd, mushroom:0xe9dcc4, bacon:0xf0b9a8, basil:0x5fa64a }[s.kind];
      this.burst(new T.Vector3(KNIFE_X, BOARD_TOP + Math.min(.5, h * .6), 0), juice, s.kind === 'tomato' ? 12 : 6, { speed:1.6, size:s.kind === 'tomato' ? .035 : .022 });
      if (s.grade === 'perfect' && !this.reduced) this.shake = .08;
    }
    if (e.type === 'whiff') { this.knifeT = 0; this.sfx.chop(.6); }
    if (e.type === 'nub') {
      const geo = this.segment(e.kind, e.u0, e.u1), pivot = new T.Group(), mesh = new T.Mesh(geo, this.kinds[e.kind]); mesh.castShadow = true; mesh.position.x = -e.u0; pivot.add(mesh);
      pivot.position.set(KNIFE_X, BOARD_TOP, 0); this.scene.add(pivot);
      this.slices.push({ pivot, mesh, kind:e.kind, t:0, th:e.u1 - e.u0, h:geo.boundingBox.max.y, ing:e.ing, order:this.slices.filter(x => x.ing === e.ing).length, nub:true, sweep:-1 });
    }
    if (e.type === 'ingredientDone') { for (const s of this.slices) if (s.ing === e.index && s.sweep < 0) s.sweep = 0; }
    if (e.type === 'sauce') { this.sauceDisc.visible = true; this.sauceT = 0; this.sfx.splash(); }
    if (e.type === 'fever') { this.fever = e.on; if (e.on) { this.sfx.fever(); this.burst(new T.Vector3(KNIFE_X, BOARD_TOP + 1, 0), 0xffd36a, 18, { speed:2.2, size:.03, spread:1 }); } }
    if (e.type === 'slice' && e.fever && e.slice.grade === 'perfect') this.burst(new T.Vector3(KNIFE_X, BOARD_TOP + .3, 0), 0xffe08a, 8, { speed:2, size:.022, spread:.8 });
    if (e.type === 'flambeCue') { this.sfx.splash(); this.burst(new T.Vector3(PAN.x - .3, PAN_FLOOR + 1.1, PAN.z), 0x7a1f2b, 16, { speed:.6, size:.035, spread:.3 }); }
    if (e.type === 'flambe') {
      if (e.ok) {
        this.sfx.flambe(); this.flareT = 0; if (!this.reduced) this.shake = .2;
        for (let i = 0; i < 26; i++) this.steam(new T.Vector3(PAN.x + (Math.random() - .5) * 1.2, PAN_FLOOR + .2 + Math.random() * .4, PAN.z + (Math.random() - .5) * 1.2), { color:i % 3 ? 0xff9a3a : 0xffd36a, size:.9 + Math.random() * .8, rise:2.6 + Math.random(), life:.8, opacity:.85 });
        this.burst(new T.Vector3(PAN.x, PAN_FLOOR + .5, PAN.z), 0xffc25a, 24, { speed:3, size:.03, spread:1 });
      } else { this.sfx.fizzle(); this.steam(new T.Vector3(PAN.x, PAN_FLOOR + .3, PAN.z), { size:1, rise:.8, opacity:.3 }); }
    }
    if (e.type === 'toss' && e.bravo) setTimeout(() => { if (this.dead) return; this.sfx.fanfare(); for (const col of [0xffd36a, 0x8fe0a9, 0xff8a57, 0xffffff]) this.burst(new T.Vector3(PAN.x, PAN_FLOOR + 2, PAN.z), col, 14, { speed:3.4, size:.04, spread:1.6 }); }, 650);
    if (e.type === 'stir') { this.stirT = 0; this.sfx.burst({ freq:900, sweep:300, q:.7, vol:.2, dur:.25 }); }
    if (e.type === 'overflow') { this.sfx.splash(); this.burst(new T.Vector3(POT.x, WATER + .2, POT.z), 0xf6fbff, 22, { speed:2.2, size:.05, spread:1 }); if (!this.reduced) this.shake = .15; }
    if (e.type === 'drain') { this.drainT = 0; this.sfx.splash(); }
    if (e.type === 'begin' && e.phase === 'stove') { this.sticksDrop = 0; this.sfx.splash(); }
    if (e.type === 'toss') { this.flick = 0; this.launch(e.height); this.sfx.whoosh(); }
    // the physics usually lands first; this only covers a toss that never came back down
    if (e.type === 'land' && this.rope.air) this.landed();
  }
  burst(at, color, n, { speed = 1.5, size = .03, spread = .6, stain = false } = {}) {
    if (this.preview) return;
    const geo = this._drop || (this._drop = this.track(new T.SphereGeometry(1, 8, 6)));
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(geo, this.dropMaterial(color)); m.scale.setScalar(size * (.6 + Math.random() * .8)); m.position.copy(at); this.scene.add(m);
      const a = Math.random() * TAU;
      this.particles.push({ m, v:new T.Vector3(Math.cos(a) * spread * speed * Math.random(), speed * (.7 + Math.random() * .8), Math.sin(a) * spread * speed * Math.random()), life:1.4, stain, color });
    }
  }
  dropMaterial(color) {
    this.dropMats ||= new Map();
    if (!this.dropMats.has(color)) this.dropMats.set(color, this.std(color, .35));
    return this.dropMats.get(color);
  }
  steam(at, { color = 0xffffff, size = .5, rise = .8, life = 1.6, opacity = .35 } = {}) {
    if (this.preview || this.sprites.length > 60) return;
    if (!this.puff) this.puff = this.track(canvasTexture(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }));
    const s = new T.Sprite(new T.SpriteMaterial({ map:this.puff, color, transparent:true, depthWrite:false, opacity }));
    s.position.copy(at); s.scale.setScalar(size); this.scene.add(s);
    this.sprites.push({ s, life, max:life, rise, size, opacity });
  }

  // ── camera ──
  stationFor(phase) { return phase === 'chop' ? 'chop' : phase === 'stove' ? 'stove' : phase === 'toss' ? 'toss' : phase === 'result' ? 'result' : 'plate'; }
  // where a burner sits on screen, for telling a pan press from a pot tap
  screenOf(which) {
    const c = which === 'pan' ? new T.Vector3(PAN.x, PAN_FLOOR + .1, PAN.z) : new T.Vector3(POT.x, WATER, POT.z), p = c.project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x:r.left + (p.x + 1) / 2 * r.width, y:r.top + (1 - p.y) / 2 * r.height };
  }
  burnerAt(clientX, clientY) {
    const a = this.screenOf('pan'), b = this.screenOf('pot');
    return Math.hypot(clientX - a.x, clientY - a.y) <= Math.hypot(clientX - b.x, clientY - b.y) ? 'pan' : 'pot';
  }
  frame(st) {
    const s = STATIONS[st], a = Math.max(.3, this.aspect || 1), th = Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
    // shift lifts the subject above an overlay at the bottom of the canvas
    // (wide screens move the subject sideways instead, beside the overlay)
    const wide = a > 1.4, shift = wide ? 0 : s.shift || 0, side = wide && s.shift ? .2 : 0;
    return { target:new T.Vector3(...s.target), dist:Math.max(s.h / 2 / th / (1 - shift), s.w / 2 / (th * a * (1 - side * 1.6))) * 1.08, tilt:s.tilt, yaw:s.yaw || 0, shift, side };
  }
  snapCamera() { const f = this.frame(this.stationFor(this.shownPhase())); this.camTarget.copy(f.target); this.camDist = f.dist; this.camTilt = f.tilt; this.camYaw = f.yaw; this.viewShift = f.shift; this.viewSide = f.side; this.placeCamera(); }
  placeCamera() {
    const yaw = this.camYaw, c = this.camTarget, d = this.camDist, t = this.camTilt;
    this.camera.position.set(c.x + Math.sin(yaw) * Math.cos(t) * d, c.y + Math.sin(t) * d, c.z + Math.cos(yaw) * Math.cos(t) * d);
    if (this.shake > 0) this.camera.position.add(new T.Vector3((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake, 0));
    this.camera.lookAt(c);
    const vs = this.viewShift || 0, W = this.size?.[0] || 1, H = this.size?.[1] || 1;
    const vx = this.viewSide || 0;
    if (vs > .002 || vx > .002) this.camera.setViewOffset(W, H, W * vx, H * vs, W, H); else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.key.position.set(c.x - 3, c.y + 9, c.z + 4); this.key.target.position.copy(c);
  }
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.aspect = w / h; this.size = [w, h]; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
    if (this.preview) { this.snapCamera(); this.renderer.render(this.scene, this.camera); }
  }

  // ── per-frame ──
  render(dt) {
    if (this.dead) return;
    const g = this.game, phase = this.shownPhase();
    this.time += dt;
    this.syncPhase();
    const f = this.frame(this.stationFor(phase));
    const k = this.preview ? 1 : 1 - Math.exp(-dt * 3.2);
    this.camTarget.lerp(f.target, k); this.camDist = lerp(this.camDist, f.dist, k); this.camTilt = lerp(this.camTilt, f.tilt, k); this.viewShift = lerp(this.viewShift || 0, f.shift, k); this.viewSide = lerp(this.viewSide || 0, f.side, k);
    const yawTarget = f.yaw + (phase === 'result' ? Math.sin(this.time * .25) * .45 : 0);
    this.camYaw = lerp(this.camYaw, yawTarget, k);
    this.shake = Math.max(0, (this.shake || 0) - dt * .8);
    this.mat.blade.emissive.setHex(0xffb437); this.mat.blade.emissiveIntensity = lerp(this.mat.blade.emissiveIntensity, this.fever && phase === 'chop' ? .55 + Math.sin(this.time * 14) * .15 : 0, 1 - Math.exp(-dt * 8));
    if (this.flareT != null) { this.flareT += dt; this.flare.intensity = Math.max(0, 1 - this.flareT / 1.1) * 60; if (this.flareT > 1.1) this.flareT = null; }
    if (phase === 'recipe' || phase === 'result') this.dish.rotation.y += dt * (phase === 'recipe' ? .25 : .08);
    this.updateBoard(dt, phase);
    this.updateStove(dt, phase);
    this.updateParticles(dt);
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }
  updateBoard(dt, phase) {
    const g = this.game, c = g.chop;
    this.syncRemainder();
    const ing = phase === 'chop' ? g.ingredient : null;
    if (ing) {
      const enter = c.wait > 0 ? ease(1 - c.wait / .75) : 1;
      this.ingGroup.position.x = KNIFE_X - c.feed + (1 - enter) * 3.4;
    }
    this.knifeT = (this.knifeT ?? 1) + dt;
    const kt = this.knifeT, rest = 1.3 + Math.sin(this.time * 2.2) * .03;
    const y = kt < .05 ? lerp(rest, 0, kt / .05) : kt < .08 ? 0 : lerp(0, rest, ease((kt - .08) / .18));
    this.knife.position.y = BOARD_TOP + y;
    this.knife.rotation.x = kt < .26 ? -.06 * Math.sin(kt / .26 * Math.PI) : 0;
    const showGuide = phase === 'chop' && g.state !== 'done' && c.wait <= 0;
    this.guide.visible = showGuide;
    if (showGuide) {
      const gx = KNIFE_X - c.feed + c.lastCut + ing.width, near = clamp01(1 - Math.abs(gx - KNIFE_X) / .5);
      this.guide.position.x = gx; this.mat.guide.opacity = .45 + near * .55; this.guide.scale.x = 1 + near * 1.6;
      this.mat.knifeLine.opacity = .4 + near * .5;
      this.ghost.position.x = gx; this.ghostMat.opacity = .25 + near * .55;
    }
    this.ghost.visible = showGuide;
    this.knifeLine.visible = phase === 'chop';
    // slices topple, shingle against the knife, then get swept into prep heaps
    const groups = {};
    for (const s of this.slices) if (!s.nub) (groups[s.ing + s.kind] ||= []).push(s);
    for (const s of this.slices) {
      s.t += dt;
      const p = s.pivot;
      if (s.sweep >= 0) {
        s.sweep += dt;
        if (s.sweep > .4) {
          if (!s.from) { s.from = { p:p.position.clone(), rz:p.rotation.z, s:p.scale.x }; const r = seeded(s.order * 13 + s.ing * 7 + 3), [hx, hz] = HEAPS[s.ing % 3]; s.to = new T.Vector3(hx + (r() - .5) * .35, BOARD_TOP + .02 + Math.max(0, s.order) * .025, hz + (r() - .5) * .35); s.ry = r() * TAU; }
          const k = ease((s.sweep - .4) / .5);
          p.position.lerpVectors(s.from.p, s.to, k); p.position.y += Math.sin(k * Math.PI) * .35;
          p.rotation.set(0, s.ry * k, lerp(s.from.rz, Math.PI / 2, k), 'YXZ'); p.scale.setScalar(lerp(s.from.s, .5, k));
        }
        continue;
      }
      if (s.nub) { const k = ease(s.t / .4); p.rotation.z = -k * .5; p.position.x = KNIFE_X + k * .15; continue; }
      const list = groups[s.ing + s.kind], idx = list.indexOf(s), n = list.length;
      const fall = Math.min(1, Math.pow(s.t / .3, 2));
      const lean = idx === 0 ? Math.PI / 2 : Math.PI / 2 - .34;
      p.rotation.z = fall * lean + (fall >= 1 ? Math.sin(Math.min(1, (s.t - .3) / .2) * Math.PI) * .05 : 0);
      const spacing = INGREDIENTS[s.kind].width * .95;
      const tx = KNIFE_X - .1 - (n - 1 - idx) * spacing;
      p.position.x = lerp(p.position.x, tx, 1 - Math.exp(-dt * 10));
      p.position.y = BOARD_TOP + (idx > 0 ? .02 : 0);
    }
    if (this.remain) this.remain.visible = phase === 'chop';
    this.ingGroup.visible = phase === 'chop';
  }
  updateStove(dt, phase) {
    const g = this.game, s = g.saute, b = g.boil, playing = g.phase !== 'paused';
    // pan flame & contents
    const flame = phase === 'stove' ? s.flame : phase === 'toss' ? .55 : 0;
    this.panFlame.visible = flame > .02;
    this.panFlame.children.forEach((f, i) => { const fl = .35 + flame * 1.1 + Math.sin(this.time * 30 + i * 2) * .08; f.scale.set(1 + flame * .4, fl * 1.1, 1 + flame * .4); });
    const boiling = phase === 'stove';
    this.potFlame.visible = boiling;
    if (boiling) this.potFlame.children.forEach((f, i) => f.scale.set(1, .9 + Math.sin(this.time * 28 + i) * .1, 1));
    if (phase === 'stove') {
      const z = sauteZone(s.t), hot = s.temp > z.center + z.half, inZone = Math.abs(s.temp - z.center) <= z.half;
      const cook = clamp01(s.cook / 13 * .55), burn = clamp01(s.burn / 3);
      for (const kind in this.panMats) for (const m of this.panMats[kind]) m.color.setRGB(1, 1, 1).lerp(new T.Color(0x9b6a3c), cook).lerp(new T.Color(0x2a1a10), burn);
      for (const p of this.panPieces) {
        if (p.drop < 1) { p.drop += dt * 1.6; const k = clamp01(p.drop); p.mesh.position.set(p.base.x, p.base.y + (1 - ease(k)) * 2.2, p.base.z); p.mesh.visible = p.drop > 0; }
        else { const j = s.temp * .02; p.mesh.position.set(p.base.x + (Math.random() - .5) * j, p.base.y + Math.abs(Math.sin(this.time * 18 + p.i)) * j, p.base.z + (Math.random() - .5) * j); }
      }
      if (this.sauceDisc.visible) { this.sauceT = (this.sauceT || 0) + dt; const k = ease(this.sauceT / .7); this.sauceDisc.scale.set(k, 1, k); }
      if (playing && hot && Math.random() < dt * 14) this.steam(new T.Vector3(PAN.x + (Math.random() - .5) * 1.4, PAN_FLOOR + .2, PAN.z + (Math.random() - .5) * 1.2), { color:0x58504a, size:.7, rise:1.2, opacity:.45 });
      else if (playing && inZone && Math.random() < dt * 5) this.steam(new T.Vector3(PAN.x + (Math.random() - .5) * 1.2, PAN_FLOOR + .2, PAN.z + (Math.random() - .5) * 1), { size:.5, opacity:.25 });
      this.sfx.level('sizzle', playing && g.state === 'play' ? .05 + s.temp * .35 : 0, 'highpass', 3200, .4);
    } else if (phase !== 'toss') this.sfx.level('sizzle', 0);
    // pot
    const water = phase === 'stove' || phase === 'toss' ? 1 : .4;
    this.water.material.opacity = .32 + water * .1;
    this.sticks.visible = phase === 'stove' && this.sticksDrop !== undefined;
    if (this.sticks.visible) {
      const tDrop = this.sticksDrop < 0 ? 0 : (this.sticksDrop += dt);
      const soften = this.sticksDrop < 0 ? 0 : clamp01(tDrop / 2.4), sink = this.sticksDrop < 0 ? -1 : ease(tDrop / .35);
      const mtx = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      this.stickSeeds.forEach((sd, i) => {
        // softening strands sink into the water and rest against the rim instead of poking through the wall
        const len = 1 - soften * .62, reach = (.84 - sd.r) / (2.1 * len);
        const lean = Math.min(sd.lean + soften * (1.15 + sd.lean * 2), reach < 1 ? Math.asin(reach) : 1.5), baseY = sink < 0 ? 1.4 + Math.sin(this.time * 2) * .03 : lerp(1.4, .12, sink);
        e.set(Math.sin(sd.a) * lean, 0, -Math.cos(sd.a) * lean); q.setFromEuler(e);
        mtx.compose(new T.Vector3(Math.cos(sd.a) * sd.r, baseY, Math.sin(sd.a) * sd.r), q, new T.Vector3(1, len, 1));
        this.sticks.setMatrixAt(i, mtx);
      });
      this.sticks.instanceMatrix.needsUpdate = true;
      if (soften >= 1) this.sticks.visible = false;
      this.potNest.visible = soften > .6;
    }
    if (phase === 'stove') {
      const d = b.done, col = new T.Color(d < .45 ? NOODLE.raw : d < .7 ? NOODLE.firm : d <= .82 ? NOODLE.aldente : d < 1 ? NOODLE.soft : NOODLE.mushy);
      this.mat.potNoodle.color.lerp(col, 1 - Math.exp(-dt * 3));
      this.potNest.rotation.y += dt * .3;
      if (g.state === 'done' && this.drainT !== undefined) { this.drainT += dt; this.potNest.position.y = .36 + ease(this.drainT / .7) * 1.6; if (Math.random() < dt * 30) this.burst(new T.Vector3(POT.x + (Math.random() - .5) * .8, POT.y + this.potNest.position.y, POT.z + (Math.random() - .5) * .8), 0xdfeeee, 1, { speed:.3, size:.025 }); }
      else this.potNest.position.y = .36;
      if (playing && Math.random() < dt * 6) this.steam(new T.Vector3(POT.x + (Math.random() - .5) * 1.1, WATER + .3, POT.z + (Math.random() - .5) * .9), { size:.8, rise:1, opacity:.3 });
      this.sfx.level('boil', playing && g.state === 'play' ? .12 + b.foam * .2 : 0, 'lowpass', 520, .8);
      if (playing && g.state === 'play' && Math.random() < dt * 9) this.sfx.pop();
    } else { this.sfx.level('boil', 0); this.drainT = undefined; this.potNest.visible = false; }
    const foam = phase === 'stove' ? b.foam : 0, bubbling = phase === 'stove' || phase === 'toss';
    this.stirT = (this.stirT ?? 9) + dt;
    const mtx = new T.Matrix4();
    this.foamSeeds.forEach((sd, i) => {
      const vis = clamp01((foam - .15) * 2.2 - sd.r * .6), sc = vis * sd.s * (.85 + .15 * Math.sin(this.time * 4 + sd.p));
      const over = Math.max(0, foam - .75) * 1.6, rr = sd.r * (1 + over * .25);
      const a = sd.a + (this.stirT < .6 ? (1 - this.stirT / .6) * 2 : 0);
      mtx.compose(new T.Vector3(Math.cos(a) * Math.min(.95, rr), WATER - POT.y + .02 + foam * .2 + (1 - sd.r) * foam * .08, Math.sin(a) * Math.min(.95, rr)), new T.Quaternion(), new T.Vector3(sc, sc * .55, sc));
      this.foam.setMatrixAt(i, mtx);
    });
    this.foam.instanceMatrix.needsUpdate = true; this.foam.visible = foam > .15;
    this.bubbleSeeds.forEach((sd, i) => {
      const t = (this.time * sd.sp + sd.p) % 1, sc = bubbling ? Math.sin(t * Math.PI) * (.6 + b.done * .6) : 0;
      mtx.compose(new T.Vector3(Math.cos(sd.a) * sd.r, WATER - POT.y + .01, Math.sin(sd.a) * sd.r), new T.Quaternion(), new T.Vector3(sc, sc * .6, sc));
      this.bubbles.setMatrixAt(i, mtx);
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
    // toss
    const t = g.toss;
    this.bandGroup.visible = phase === 'toss' && t.results.length < 3 && g.state !== 'done';
    if (this.bandGroup.visible) {
      const [lo, hi] = t.bands[t.results.length];
      const y0 = PAN_FLOOR + lo * TOSS_HEIGHT, y1 = PAN_FLOOR + hi * TOSS_HEIGHT;
      this.bandLo.position.y = y0; this.bandHi.position.y = y1; this.band.position.y = (y0 + y1) / 2; this.band.scale.y = y1 - y0;
      this.mat.band.opacity = .14 + Math.sin(this.time * 4) * .04;
    }
    if (phase === 'toss') {
      const coat = clamp01(.3 + t.results.length * .2);
      this.mat.noodle.color.set(NOODLE[g.noodleState()]).lerp(new T.Color(g.recipe.color), coat * (g.recipe.id === 'cream' ? .4 : .55));
      // charging tips the pan back so the strands slide to the far lip; the flick snaps it forward
      let tilt = t.charging ? t.power * .22 : 0;
      if (this.flick != null) { this.flick += dt; tilt = -.35 * Math.sin(Math.min(1, this.flick / .2) * Math.PI); if (this.flick > .2) this.flick = null; }
      this.landT = (this.landT ?? 9) + dt;
      this.swirlV = (this.swirlV || 0) * Math.exp(-dt * 3);
      this.pan.rotation.set(tilt, -.45 + this.swirlV * .08, 0); this.pan.position.y = PAN.y + Math.max(0, -tilt) * .25 - (this.landT < .2 ? Math.sin(this.landT / .2 * Math.PI) * .03 : 0);
      this.pan.updateMatrixWorld(true);
      if (g.phase !== 'paused') this.updateNoodles(dt);
      this.sauceDisc.visible = true; this.sauceDisc.scale.set(.85, 1, .85);
      this.sfx.level('sizzle', g.phase !== 'paused' && g.state === 'play' ? .1 : 0, 'highpass', 3200, .4);
    } else { this.pan.rotation.set(0, -.45, 0); this.pan.position.y = PAN.y; this.panNest.visible = false; this.noodles.visible = false; }
    this.panContents.visible = phase === 'stove' || phase === 'toss';
  }
  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt; p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < .02 && p.v.y < 0) {
        if (p.stain && !p.landed && this.decals.length < 40) { const d = new T.Mesh(this._stain || (this._stain = this.track(new T.CircleGeometry(1, 14))), p.m.material); d.rotation.x = -Math.PI / 2; d.scale.setScalar(p.m.scale.x * 2.2); d.position.set(p.m.position.x, .006, p.m.position.z); this.scene.add(d); this.decals.push(d); }
        p.landed = true; p.life = Math.min(p.life, .05);
      }
      const onBoard = Math.abs(p.m.position.x) < 2.55 && Math.abs(p.m.position.z) < 1.4;
      if (onBoard && p.m.position.y < BOARD_TOP && p.v.y < 0) { p.v.set(0, 0, 0); p.m.position.y = BOARD_TOP; p.life = Math.min(p.life, .5); }
    }
    this.particles = this.particles.filter(p => { if (p.life > 0) return true; this.scene.remove(p.m); return false; });
    for (const s of this.sprites) { s.life -= dt; const k = 1 - s.life / s.max; s.s.position.y += s.rise * dt; s.s.scale.setScalar(s.size * (1 + k * 1.5)); s.s.material.opacity = s.opacity * Math.sin(Math.min(1, k * 1.3) * Math.PI); }
    this.sprites = this.sprites.filter(s => { if (s.life > 0) return true; this.scene.remove(s.s); s.s.material.dispose(); return false; });
  }
  destroy() {
    this.dead = true; this.observer?.disconnect(); this.sfx.destroy();
    for (const s of this.sprites) s.s.material.dispose();
    this.geoCache.forEach(g => g.dispose()); this.remainGeo?.dispose();
    for (const d of this.disposables) d.dispose?.();
    this.envMap.dispose(); this.renderer.dispose();
  }
}
