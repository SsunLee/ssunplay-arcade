import * as T from 'three';
import { Factory } from './models.js';
import { Sfx, canvasTexture } from './pasta-view.js';
import { LENGTH, CLOSE_AT, laneX } from './subway-engine.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
// rotation about x that swings arm i (0 = left, 1 = right) away from the body
const out = (i, a) => (i ? -1 : 1) * a;
const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = k => 1 - Math.pow(1 - clamp01(k), 3);
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ s >>> 15, 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }
// engine (x across, z along the platform) → three.js, where the run heads down −Z
const W = (x, y, z, v = new T.Vector3()) => v.set(x, y, -z);

// ── platform layout (metres) ──
const WALL_X = -2.9, PSD_X = 2.75, CEIL = 3.4, TRAIN_SIDE = 2.95, TRAIN_W = 2.9;
const CAR = 7.5, DOORS = 6, DOOR_HALF = .78;     // the train's doors line up with the screen doors
const TRAIN_BACK = LENGTH - 4.5, TRAIN_END = LENGTH + DOORS * CAR + 6;
const START = -11, END = TRAIN_END;
const SHIRT = 0xf7f6f0, PANTS = 0x2e3546, SKIN = 0xe2b393, HAIR = 0x2b2622, FRAME = 0x1d1f22;

class SubwaySfx extends Sfx {
  step(k = 1) { this.burst({ freq:700 + Math.random() * 400, type:'lowpass', q:.8, vol:.1 * k, dur:.045 }); this.tone(120, .05, { to:70, vol:.05 * k }); }
  // a generic three-tone platform chime
  chime() { [784, 659, 523, 659, 784].forEach((f, i) => this.tone(f, .42, { type:'sine', vol:.1, delay:i * .26 })); }
  hiss() { this.burst({ freq:3200, sweep:800, type:'highpass', q:.4, vol:.22, dur:.8 }); }
  slam() { this.tone(95, .22, { to:48, vol:.35 }); this.burst({ freq:650, type:'lowpass', q:.6, vol:.35, dur:.16 }); }
  bump() { this.tone(160, .16, { to:62, vol:.4 }); this.burst({ freq:520, type:'lowpass', vol:.3, dur:.12 }); this.tone(440, .12, { type:'triangle', vol:.06, to:250, delay:.05 }); }
  slip() { this.tone(1100, .4, { type:'triangle', vol:.09, to:200 }); this.burst({ freq:1500, sweep:380, type:'bandpass', q:1, vol:.22, dur:.32 }); }
  jump() { this.tone(300, .18, { type:'triangle', vol:.07, to:640 }); }
  swish() { this.burst({ freq:700, sweep:2800, type:'bandpass', q:.9, vol:.2, dur:.16 }); }
  count(go) { this.tone(go ? 988 : 660, go ? .32 : .12, { type:'square', vol:.06 }); }
  depart() { this.burst({ freq:160, sweep:900, type:'lowpass', q:.7, vol:.5, dur:2.4 }); this.tone(70, 2.2, { to:150, vol:.12, type:'sawtooth' }); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i === 3 ? .5 : .13, { type:'triangle', vol:.12, delay:i * .09 })); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, .22, { type:'triangle', vol:.1, delay:i * .15 })); }
}

// ── characters, built facing +x with feet at the origin ──
function limb(F, parent, at, len1, len2, r, color) {
  const top = new T.Group(); top.position.set(...at); parent.add(top);
  F.rod(top, [0, 0, 0], [0, -len1, 0], r, color);
  const mid = new T.Group(); mid.position.set(0, -len1, 0); top.add(mid);
  F.rod(mid, [0, 0, 0], [0, -len2, 0], r * .85, color);
  return { top, mid };
}
function person(F, { top = 0x5a6b7d, bottom = 0x2f3440, skin = 0xe5b896, hair = 0x241f1c, shoe = 0x1d1d1f, height = 1, belly = 0 } = {}) {
  const g = new T.Group(), body = new T.Group(); g.add(body);
  const legs = [-1, 1].map(s => { const l = limb(F, body, [0, .86, s * .1], .42, .4, .08, bottom); F.cube(l.mid, [.25, .09, .12], [.06, -.43, 0], shoe, true); return l; });
  const torso = new T.Group(); torso.position.set(0, .86, 0); body.add(torso);
  F.sphere(torso, [.16, .12, .18], [0, .03, 0], bottom);
  F.sphere(torso, [.19, .3, .22], [0, .3, 0], top);
  if (belly) F.sphere(torso, [.17 + belly * .04, .17, .19], [.06 + belly * .03, .17, 0], top);
  F.rod(torso, [0, .52, 0], [.01, .64, 0], .055, skin);
  const head = new T.Group(); head.position.set(.02, .74, 0); torso.add(head);
  F.sphere(head, [.12, .14, .12], [0, 0, 0], skin);
  const arms = [-1, 1].map(s => { const a = limb(F, torso, [0, .5, s * .23], .28, .25, .058, top); F.sphere(a.mid, [.045, .05, .045], [0, -.28, 0], skin); return a; });
  g.scale.setScalar(height);
  return { g, body, torso, head, legs, arms, hair };
}
function bujang(F) {
  const p = person(F, { top:SHIRT, bottom:PANTS, skin:SKIN, belly:1 }), { head, torso } = p;
  // 부장님, the same face as in the Tico: comb-over, glasses, moustache, red tie
  F.sphere(head, [.118, .085, .137], [-.035, -.012, 0], HAIR);
  for (const [x, r] of [[-.05, .128], [-.012, .137], [.026, .133], [.06, .12]]) {
    const arc = new T.TorusGeometry(r, .007, 4, 14, 2.1); arc.rotateZ(.55); arc.rotateY(Math.PI / 2);
    F.mesh(arc, HAIR, head, [x, 0, 0], [1, 1.12, 1]);
  }
  for (const s of [-1, 1]) {
    F.sphere(head, [.026, .04, .024], [0, -.01, s * .128], SKIN);
    F.sphere(head, [.011, .012, .011], [.122, .015, s * .048], 0x15181b);
    const brow = F.cube(head, [.012, .016, .05], [.123, .062, s * .05], HAIR); brow.rotation.x = s * -.25;
    const lens = new T.TorusGeometry(.034, .0065, 6, 16); lens.rotateY(Math.PI / 2);
    F.mesh(lens, FRAME, head, [.135, .015, s * .05]);
    F.rod(head, [.13, .02, s * .084], [0, .02, s * .128], .005, FRAME);
    F.sphere(head, [.02, .014, .02], [.108, -.035, s * .075], 0xeb9c8e);
    const tash = F.sphere(head, [.02, .016, .042], [.128, -.06, s * .03], HAIR); tash.rotation.x = s * .35;
  }
  F.cube(head, [.008, .008, .038], [.138, .015, 0], FRAME);
  F.sphere(head, [.028, .034, .03], [.14, -.022, 0], 0xd99a7e);
  const mouth = F.cube(head, [.01, .012, .045], [.124, -.09, 0], 0x7a3a33);
  p.sweat = F.sphere(head, [.016, .026, .016], [.07, .07, .12], F.mat(0x9fd3f2, .15, .1));
  // tie on a pivot so it flaps over the shoulder at full sprint
  const tie = new T.Group(); tie.position.set(.2, .5, 0); torso.add(tie);
  F.cube(tie, [.025, .3, .07], [0, -.15, 0], 0xc3272f); F.cube(torso, [.035, .05, .07], [.19, .5, 0], 0xa81f27);
  for (const s of [-1, 1]) { const c = F.cube(torso, [.02, .05, .07], [.17, .52, s * .045], SHIRT); c.rotation.x = s * .6; }
  F.cube(torso, [.3, .04, .39], [0, .05, 0], 0x1a1a1c);
  // the briefcase swings from his right hand
  const hand = p.arms[1].mid, bag = new T.Group(); bag.position.set(0, -.3, .02); hand.add(bag);
  F.cube(bag, [.36, .27, .09], [0, -.17, 0], 0x6b3f22, true);
  F.cube(bag, [.1, .025, .02], [0, -.02, 0], 0x2a1a10);
  F.cube(bag, [.04, .03, .095], [.1, -.06, 0], 0xc9a64a); F.cube(bag, [.04, .03, .095], [-.1, -.06, 0], 0xc9a64a);
  Object.assign(p, { tie, bag, mouth });
  return p;
}
function phoneZombie(F, r) {
  const tops = [0x6d7f95, 0x8b9a6a, 0x4a4f5a, 0xb05a4a, 0x3d5a80], p = person(F, { top:tops[Math.floor(r() * tops.length)], bottom:r() < .5 ? 0x2c3e66 : 0x3a3a3f, hair:r() < .3 ? 0x7a4a2a : 0x1c1a19, height:.97 + r() * .08 });
  F.sphere(p.head, [.125, .1, .13], [-.02, .05, 0], p.hair);
  p.head.rotation.z = -.55; // eyes glued to the screen
  for (const a of p.arms) { a.top.rotation.z = .5; a.mid.rotation.z = 1.5; }
  const phone = new T.Group(); phone.position.set(.3, .3, 0); p.torso.add(phone);
  F.cube(phone, [.03, .15, .08], [0, 0, 0], 0x15161a);
  F.mesh(F.box, F.track(new T.MeshBasicMaterial({ color:0xbfe6ff })), phone, [.017, 0, 0], [.004, .13, .07]);
  for (const s of [-1, 1]) F.sphere(p.head, [.018, .018, .018], [0, -.01, s * .125], 0xffffff);
  phone.rotation.z = .9;
  return p;
}
function ajumma(F, r) {
  const p = person(F, { top:0xe8679a, bottom:0x6b4f7a, skin:0xe0b08c, hair:0x2a1d18, height:.9, belly:.6 });
  // permed curls, a sun visor and two bulging market bags, one with a green onion
  for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, y = .03 + (i % 2) * .05; F.sphere(p.head, [.05, .05, .05], [Math.cos(a) * .08 - .02, y, Math.sin(a) * .09], 0x2a1d18); }
  F.sphere(p.head, [.09, .07, .09], [-.02, .1, 0], 0x2a1d18);
  const visor = F.mesh(F.tube, 0x8a4fd1, p.head, [.1, .07, 0], [.11, .012, .13]); visor.rotation.z = -.15;
  F.cube(p.torso, [.05, .38, .4], [.15, .3, 0], 0xf3d3e1);
  for (const [i, s] of [[0, -1], [1, 1]]) {
    const bag = new T.Group(); bag.position.set(0, -.3, s * .1); p.arms[i].mid.add(bag);
    F.cube(bag, [.36, .4, .2], [0, -.26, s * .06], i ? 0xd8423a : 0x3f8f5a, true);
    F.cube(bag, [.37, .06, .21], [0, -.12, s * .06], 0xf4f1e8);
    if (i) { F.rod(bag, [.05, -.1, s * .06], [.12, .38, s * .1], .022, 0x3c9a3e); F.sphere(bag, [.035, .05, .035], [.05, -.1, s * .06], 0xf4f1e8); }
    p.arms[i].top.rotation.x = -s * .25;
  }
  p.arms.forEach(a => a.mid.rotation.z = .2);
  return p;
}
function suit(F, r) {
  const tops = [0x2c2f3a, 0x3b3f4b, 0x4a4138, 0x23324a], p = person(F, { top:tops[Math.floor(r() * tops.length)], bottom:0x25272e, hair:0x18171a, height:.98 + r() * .1 });
  F.sphere(p.head, [.125, .09, .13], [-.02, .06, 0], p.hair);
  F.cube(p.torso, [.18, .4, .32], [-.24, .3, 0], r() < .5 ? 0x1f2b2a : 0x5a3a2a, true); // backpack
  F.cube(p.torso, [.02, .26, .05], [.2, .32, 0], [0x3c6ed0, 0x7a2b2b, 0x2b6b4a][Math.floor(r() * 3)]);
  p.arms.forEach(a => a.mid.rotation.z = .4);
  return p;
}

export class SubwayView {
  constructor(canvas, game, { preview = false, sound = () => true } = {}) {
    this.canvas = canvas; this.game = game; this.preview = preview; this.dead = false;
    this.time = 0; this.disposables = []; this.particles = []; this.outroT = 0; this.departAt = null; this.depart = 0; this.shake = 0; this.stride = 0; this.endT = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sfx = new SubwaySfx(() => !preview && sound());
    this.renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preview ? 1.5 : 1.75));
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    canvas.dataset.renderer = 'webgl';
    this.scene = new T.Scene(); this.scene.background = new T.Color('#1d2328'); this.scene.fog = new T.Fog('#1d2328', 26, 74);
    this.camera = new T.PerspectiveCamera(56, 1, .05, 120);
    this.camPos = new T.Vector3(); this.camLook = new T.Vector3(); this.tmp = new T.Vector3(); this.tmp2 = new T.Vector3();
    const F = this.F = new Factory();
    F.track = o => this.track(o);
    this.lights(); this.buildPlatform(); this.buildDoors(); this.buildTrain(); this.buildRunner(); this.buildObstacles();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
    this.snap = true;
  }
  track(o) { this.disposables.push(o); return o; }
  basic(color, extra = {}) { return this.track(new T.MeshBasicMaterial({ color, ...extra })); }
  std(color, roughness = .7, metalness = 0, extra = {}) { return this.track(new T.MeshStandardMaterial({ color, roughness, metalness, ...extra })); }
  box(size, pos, mat, parent = this.scene) { const m = new T.Mesh(this.F.box, mat); m.scale.set(...size); m.position.copy(W(...pos)); parent.add(m); return m; }

  lights() {
    this.scene.add(new T.HemisphereLight(0xf4f7ff, 0x5a5550, 1.25));
    const key = new T.DirectionalLight(0xffffff, 1.1); key.position.set(-2, 8, 4); this.scene.add(key);
    this.scene.add(new T.AmbientLight(0xffffff, .25));
  }

  buildPlatform() {
    const len = END - START, mid = (END + START) / 2, width = PSD_X - WALL_X, s = this.scene, r = seeded(7);
    // granite floor tiles
    const floorTex = this.track(canvasTexture(512, 512, (x, w, h) => {
      x.fillStyle = '#c3c0b8'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${r() < .5 ? '70,70,75' : '255,255,250'},${.05 + r() * .12})`; x.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
      x.strokeStyle = '#9d9a93'; x.lineWidth = 3; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
    }, { repeat:[width / 4, len / 4] }));
    const floor = new T.Mesh(this.track(new T.PlaneGeometry(width, len)), this.std(0xffffff, .55, 0, { map:floorTex }));
    floor.rotation.x = -Math.PI / 2; floor.position.copy(W((WALL_X + PSD_X) / 2, 0, mid)); s.add(floor);
    // tactile warning strip along the screen doors
    const dots = this.track(canvasTexture(64, 64, (x, w, h) => { x.fillStyle = '#f0c419'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8a90e'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(8 + i * 16, 8 + j * 16, 5, 0, TAU); x.fill(); } }, { repeat:[1, len / .4] }));
    const strip = new T.Mesh(this.track(new T.PlaneGeometry(.4, len)), this.std(0xffffff, .6, 0, { map:dots }));
    strip.rotation.x = -Math.PI / 2; strip.position.copy(W(PSD_X - .35, .004, mid)); s.add(strip);
    // painted lane guides so the three lanes read at a glance
    for (const lx of [-.75, .75]) { const line = new T.Mesh(this.track(new T.PlaneGeometry(.05, len)), this.basic(0xa8a59c, { transparent:true, opacity:.55 })); line.rotation.x = -Math.PI / 2; line.position.copy(W(lx, .003, mid)); s.add(line); }
    // the left wall: tiles, with code-drawn posters and benches
    const tiles = this.track(canvasTexture(256, 256, (x, w, h) => {
      x.fillStyle = '#e9e3d4'; x.fillRect(0, 0, w, h); x.strokeStyle = '#cfc7b4'; x.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 0); x.lineTo(i * w / 4, h); x.moveTo(0, i * h / 4); x.lineTo(w, i * h / 4); x.stroke(); }
      x.fillStyle = '#2f8f5b'; x.fillRect(0, h * .72, w, h * .06);
    }, { repeat:[len / 2, CEIL / 2] }));
    const wall = new T.Mesh(this.track(new T.PlaneGeometry(len, CEIL)), this.std(0xffffff, .5, 0, { map:tiles }));
    wall.rotation.y = Math.PI / 2; wall.position.copy(W(WALL_X, CEIL / 2, mid)); s.add(wall);
    const posters = [
      (x, w, h) => { x.fillStyle = '#ffcf3d'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, h * .45, w * .3, 0, TAU); x.fill(); x.fillStyle = '#2b2b2b'; x.beginPath(); x.arc(w * .4, h * .41, 8, 0, TAU); x.arc(w * .6, h * .41, 8, 0, TAU); x.fill(); x.strokeStyle = '#2b2b2b'; x.lineWidth = 7; x.beginPath(); x.arc(w / 2, h * .48, w * .14, .2, Math.PI - .2); x.stroke(); x.fillStyle = '#2b2b2b'; x.fillRect(w * .15, h * .82, w * .7, 12); },
      (x, w, h) => { const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5ec2f2'); gr.addColorStop(1, '#1e5aa8'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#e9f6ff'; x.beginPath(); x.moveTo(0, h * .75); x.lineTo(w * .35, h * .35); x.lineTo(w * .6, h * .6); x.lineTo(w * .8, h * .42); x.lineTo(w, h * .7); x.lineTo(w, h); x.lineTo(0, h); x.fill(); x.fillStyle = '#fff3b0'; x.beginPath(); x.arc(w * .75, h * .18, 22, 0, TAU); x.fill(); },
      (x, w, h) => { x.fillStyle = '#f6efe3'; x.fillRect(0, 0, w, h); x.fillStyle = '#d63c2f'; x.beginPath(); x.ellipse(w / 2, h * .5, w * .32, h * .14, 0, 0, TAU); x.fill(); x.fillStyle = '#f2a33a'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(w * (.3 + i * .08), h * .46, 9, 0, TAU); x.fill(); } x.fillStyle = '#3a3a3a'; x.fillRect(w * .15, h * .12, w * .7, 14); x.fillRect(w * .25, h * .82, w * .5, 10); },
      (x, w, h) => { x.fillStyle = '#20343f'; x.fillRect(0, 0, w, h); x.fillStyle = '#7fe0b0'; x.fillRect(w * .18, h * .25, w * .64, h * .36); x.fillStyle = '#20343f'; x.fillRect(w * .26, h * .33, w * .48, h * .2); x.fillStyle = '#7fe0b0'; x.beginPath(); x.arc(w / 2, h * .78, 18, 0, TAU); x.fill(); },
    ].map(d => this.track(canvasTexture(256, 360, d)));
    for (let z = 4, i = 0; z < LENGTH + 8; z += 11, i++) {
      const p = new T.Mesh(this.track(new T.PlaneGeometry(1.25, 1.75)), this.std(0xffffff, .35, 0, { map:posters[i % posters.length] }));
      p.rotation.y = Math.PI / 2; p.position.copy(W(WALL_X + .02, 1.55, z)); s.add(p);
      this.box([.06, 1.85, 1.35], [WALL_X + .01, 1.55, z], this.std(0x9aa1a8, .3, .6));
      if (i % 2) { this.box([.42, .06, 1.6], [WALL_X + .3, .45, z + 5.5], this.std(0x8f98a2, .35, .5)); for (const dz of [-.65, .65]) this.box([.05, .45, .05], [WALL_X + .3, .22, z + 5.5 + dz], this.std(0x6d747b, .4, .6)); }
    }
    // the ceiling and its light strips
    const ceil = new T.Mesh(this.track(new T.PlaneGeometry(width + 4, len)), this.std(0x3b4248, .9));
    ceil.rotation.x = Math.PI / 2; ceil.position.copy(W(0, CEIL, mid)); s.add(ceil);
    const lamps = [];
    for (let z = START + 1; z < END; z += 3.2) for (const x of [-1.15, 1.15]) lamps.push(W(x, CEIL - .03, z, new T.Vector3()));
    const lampMesh = new T.InstancedMesh(this.F.box, this.basic(0xfdfcf4), lamps.length), d = new T.Object3D();
    lamps.forEach((p, i) => { d.position.copy(p); d.scale.set(.2, .05, 1.5); d.updateMatrix(); lampMesh.setMatrixAt(i, d.matrix); });
    s.add(lampMesh);
    // hanging direction signs
    const sign = this.track(canvasTexture(512, 112, (x, w, h) => {
      x.fillStyle = '#1f2a36'; x.fillRect(0, 0, w, h); x.fillStyle = '#3cb44b'; x.beginPath(); x.arc(56, h / 2, 34, 0, TAU); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.moveTo(w - 140, h / 2 - 30); x.lineTo(w - 60, h / 2); x.lineTo(w - 140, h / 2 + 30); x.fill(); x.fillRect(w - 260, h / 2 - 11, 130, 22);
      x.fillStyle = '#c9d3dc'; for (let i = 0; i < 3; i++) x.fillRect(120, 30 + i * 22, 180 - i * 40, 10);
    }));
    this.signs = [];
    for (let z = 22; z < LENGTH; z += 32) {
      const m = new T.Mesh(this.track(new T.PlaneGeometry(2.3, .5)), this.basic(0xffffff, { map:sign })); m.position.copy(W(-.2, 3.2, z)); m.rotation.y = 0; s.add(m);
      const back = this.box([2.34, .54, .04], [-.2, 3.2, z + .03], this.std(0x161d24, .6)); back.renderOrder = -1; this.signs.push(m, back);
      for (const x of [-1, .6]) this.box([.02, .06, .02], [x, 3.47, z], this.std(0x6d747b, .4, .6));
    }
    // stairs up behind the start, where 부장님 came down
    for (let i = 0; i < 12; i++) this.box([2.8, .18, .32], [0, .09 + i * .18, -1.5 - i * .32], this.std(i % 2 ? 0xb9b5ab : 0xc6c2b8, .7));
    this.box([2.8, 2.2, 4], [0, 1.1 + 2.16 - 1.1, -1.5 - 3.84 - 2], this.std(0xb9b5ab, .7));
    for (const x of [-1.45, 1.45]) this.box([.08, 1.2, 4.2], [x, 1.4, -3.3], this.std(0x9aa1a8, .3, .7)).rotation.x = -.51;
    // end of the platform past the train door
    this.box([width, CEIL, .2], [(WALL_X + PSD_X) / 2, CEIL / 2, END], this.std(0xd9d3c4, .6));
    // beyond the glass: track bed, rails and the tunnel wall
    const bedLen = TRAIN_END - START + 40;
    this.box([5, .2, bedLen], [5.2, -1.25, (START + TRAIN_END + 40) / 2], this.std(0x2b2a29, .95));
    for (const x of [3.7, 5.1]) this.box([.1, .14, bedLen], [x, -1.08, (START + TRAIN_END + 40) / 2], this.std(0x8a8d90, .3, .8));
    this.box([.2, 6, bedLen], [7.6, 1.5, (START + TRAIN_END + 40) / 2], this.std(0x4a4d4f, .95));
    for (let z = START; z < TRAIN_END + 30; z += 9) this.box([.05, .1, 1.4], [7.45, 1.8, z], this.basic(0xffe6b0));
    for (let z = START; z < TRAIN_END + 30; z += 6) this.box([.12, .08, 6], [7.45, .9 + (z % 12 ? 0 : .2), z], this.std(0x222324, .8));
  }

  // screen doors along the platform edge; the train's doors line up with them
  buildDoors() {
    const s = this.scene, glass = this.std(0xbfe3f0, .05, .1, { transparent:true, opacity:.18, depthWrite:false }), steel = this.std(0xaeb6bd, .28, .75), dark = this.std(0x1e2327, .7);
    this.doorZ = Array.from({ length:DOORS }, (_, i) => LENGTH + i * CAR);
    const cuts = [START, ...this.doorZ.flatMap(z => [z - DOOR_HALF - .02, z + DOOR_HALF + .02]), END];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1]; if (b <= a) continue;
      this.box([.04, 2.1, b - a], [PSD_X, 1.1, (a + b) / 2], glass);
    }
    const posts = [];
    for (let z = START; z < END; z += 2) if (!this.doorZ.some(d => Math.abs(z - d) < DOOR_HALF + .2)) posts.push(z);
    for (const d of this.doorZ) posts.push(d - DOOR_HALF - .06, d + DOOR_HALF + .06);
    const postMesh = new T.InstancedMesh(this.F.box, steel, posts.length), o = new T.Object3D();
    posts.forEach((z, i) => { o.position.copy(W(PSD_X, 1.1, z)); o.scale.set(.1, 2.2, .1); o.updateMatrix(); postMesh.setMatrixAt(i, o.matrix); });
    s.add(postMesh);
    this.box([.22, .38, END - START], [PSD_X, 2.4, (START + END) / 2], steel);
    this.box([.05, .05, END - START], [PSD_X - .12, 2.3, (START + END) / 2], this.basic(0x46d27e));
    this.box([.05, .82, END - START], [PSD_X + .05, 3.0, (START + END) / 2], dark);
    // sliding leaves: glass with a steel frame; the first door is the one to catch
    this.psd = this.doorZ.map(z => [-1, 1].map(side => {
      const leaf = new T.Group(); s.add(leaf);
      this.box([.05, 2.05, DOOR_HALF - .02], [0, 1.08, 0], glass, leaf);
      for (const y of [.06, 2.08]) this.box([.07, .06, DOOR_HALF], [0, y, 0], steel, leaf);
      this.box([.07, 2.08, .05], [0, 1.08, side * (DOOR_HALF / 2 - .03)], steel, leaf);
      this.box([.075, .5, .05], [0, 1.25, -side * (DOOR_HALF / 2 - .02)], this.std(0x2c3136, .5), leaf);
      return { leaf, side, z };
    }));
    // a bobbing marker over the door to catch, and a glowing landing pad in front of it
    const glow = this.basic(0xffd84a, { fog:false });
    this.marker = new T.Group(); s.add(this.marker);
    const cone = new T.Mesh(this.track(new T.ConeGeometry(.22, .4, 4)), glow); cone.rotation.x = Math.PI; this.marker.add(cone);
    this.marker.position.copy(W(PSD_X - .3, 2.85, LENGTH));
    this.pad = new T.Mesh(this.track(new T.PlaneGeometry(1, 1.6)), this.basic(0xffd84a, { transparent:true, opacity:.45, depthWrite:false, fog:false }));
    this.pad.rotation.x = -Math.PI / 2; this.pad.position.copy(W(PSD_X - .8, .006, LENGTH)); s.add(this.pad);
    for (const z of this.doorZ.slice(1)) for (const dz of [-.95, .95]) { const m = new T.Mesh(this.track(new T.PlaneGeometry(.5, .14)), this.basic(0xf0c419)); m.rotation.x = -Math.PI / 2; m.position.copy(W(PSD_X - .85, .005, z + dz)); s.add(m); }
  }

  buildTrain() {
    const g = this.train = new T.Group(); this.scene.add(g);
    const silver = this.std(0xd7dce1, .32, .55), stripe = this.std(0x2fa84f, .45), win = this.std(0x203646, .15, .3), inside = this.std(0xeef2ee, .8), seat = this.std(0x4a7fc0, .7), pole = this.std(0xd9dde2, .25, .8);
    const cx = TRAIN_SIDE + TRAIN_W / 2, len = TRAIN_END - TRAIN_BACK, mid = (TRAIN_BACK + TRAIN_END) / 2;
    // side wall pieces between the door openings
    const cuts = [TRAIN_BACK, ...this.doorZ.flatMap(z => [z - DOOR_HALF, z + DOOR_HALF]), TRAIN_END];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1], m = (a + b) / 2, l = b - a;
      this.box([.1, 3.8, l], [TRAIN_SIDE + .05, 1.3, m], silver, g);
      this.box([.03, .14, l], [TRAIN_SIDE - .01, 2.05, m], stripe, g);
      this.box([.03, .1, l], [TRAIN_SIDE - .01, .05, m], stripe, g);
      for (let wz = a + .5; wz + 1.3 < b; wz += 1.75) this.box([.03, .85, 1.3], [TRAIN_SIDE - .01, 1.45, wz + .65], win, g);
    }
    for (const z of this.doorZ) this.box([.1, 1.2, DOOR_HALF * 2], [TRAIN_SIDE + .05, 2.6, z], silver, g);
    // the far wall, floor and roof seen through an open door: bench seats, poles and windows
    this.box([.1, 3.2, len], [TRAIN_SIDE + TRAIN_W, 1.1, mid], silver, g);
    this.box([TRAIN_W, .05, len], [cx, -.02, mid], this.std(0x9aa3a0, .8), g);
    this.box([TRAIN_W, .06, len], [cx, 2.4, mid], inside, g);
    this.box([.02, .7, len], [TRAIN_SIDE + TRAIN_W - .06, 1.5, mid], win, g);
    this.box([.45, .42, len], [TRAIN_SIDE + TRAIN_W - .3, .25, mid], seat, g);
    this.box([.12, .5, len], [TRAIN_SIDE + TRAIN_W - .1, .65, mid], seat, g);
    for (const z of this.doorZ) for (const dz of [-1.1, 1.1]) { const p = this.box([.05, 2.4, .05], [cx - .3, 1.2, z + dz], pole, g); p.userData.pole = true; }
    for (let z = TRAIN_BACK + 1; z < TRAIN_END; z += 2.4) this.box([.3, .03, 1.6], [cx, 2.36, z], this.basic(0xffffff), g);
    // the rear cab end, tail lights on
    this.box([TRAIN_W + .1, 3.1, .12], [cx, .95, TRAIN_BACK], silver, g);
    this.box([TRAIN_W - .6, .9, .03], [cx, 1.6, TRAIN_BACK - .07], win, g);
    for (const x of [TRAIN_SIDE + .35, TRAIN_SIDE + TRAIN_W - .35]) this.box([.28, .12, .03], [x, .55, TRAIN_BACK - .07], this.basic(0xff3030), g);
    this.box([TRAIN_W + .1, .16, .03], [cx, 2.05, TRAIN_BACK - .07], stripe, g);
    // train door leaves
    this.trainDoors = this.doorZ.map(z => [-1, 1].map(side => {
      const leaf = new T.Group(); g.add(leaf);
      this.box([.06, 2.0, DOOR_HALF], [0, 1.0, 0], silver, leaf);
      this.box([.065, .8, DOOR_HALF - .2], [0, 1.4, 0], win, leaf);
      this.box([.066, .1, DOOR_HALF], [0, 1.96, 0], stripe, leaf);
      return { leaf, side, z };
    }));
  }

  buildRunner() {
    const r = this.runner = bujang(this.F);
    r.g.rotation.y = Math.PI / 2; this.scene.add(r.g);
    this.shadowTex = this.track(canvasTexture(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); }));
    this.shadowMat = this.basic(0xffffff, { map:this.shadowTex, transparent:true, depthWrite:false });
    this.shadowGeo = this.track(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.runnerShadow = new T.Mesh(this.shadowGeo, this.shadowMat); this.runnerShadow.scale.set(.8, 1, .8); this.scene.add(this.runnerShadow);
  }
  buildObstacles() {
    const F = this.F;
    this.obs = this.game.obstacles.map(o => {
      const r = seeded(o.id * 97 + 13), g = new T.Group(); let p = null;
      if (o.kind === 'phone') { p = phoneZombie(F, r); p.g.rotation.y = -Math.PI / 2; g.add(p.g); }
      else if (o.kind === 'ajumma') { p = ajumma(F, r); p.g.rotation.y = Math.PI / 2; g.add(p.g); }
      else if (o.kind === 'crowd') { p = suit(F, r); p.g.rotation.y = -Math.PI / 2 + (r() - .5) * .5; g.add(p.g); }
      else if (o.kind === 'pillar') {
        const tile = this.pillarMat ??= this.std(0xe6dfcf, .45);
        F.mesh(F.box, tile, g, [0, CEIL / 2, 0], [.95, CEIL, .9]);
        F.mesh(F.box, this.yellowBand ??= this.std(0xf0c419, .5), g, [0, 1.25, 0], [.97, .12, .92]);
        F.mesh(F.box, this.steelMat ??= this.std(0xa7aeb5, .3, .7), g, [0, .06, 0], [1, .12, .95]);
        F.mesh(F.box, this.std(0xd8382c, .5), g, [0, .55, -.48], [.22, .4, .06]);
      } else if (o.kind === 'coffee') {
        const puddle = this.coffeeMat ??= this.std(0x5a3418, .12, .1);
        F.mesh(F.tube, puddle, g, [0, .008, 0], [o.w, .012, o.len * .45]);
        for (let i = 0; i < 5; i++) F.mesh(F.tube, puddle, g, [(r() - .5) * o.w * 1.6, .008, (r() - .5) * o.len], [.06 + r() * .08, .012, .06 + r() * .08]);
        const cup = new T.Group(); cup.position.set(.2, .05, -.3); cup.rotation.z = Math.PI / 2; cup.rotation.y = r() * TAU; g.add(cup);
        F.mesh(F.tube, 0xffffff, cup, [0, 0, 0], [.05, .15, .05]); F.mesh(F.tube, 0x9a6a3a, cup, [0, -.01, 0], [.053, .06, .053]); F.mesh(F.tube, 0x2a2a2a, cup, [0, .08, 0], [.054, .02, .054]);
      } else if (o.kind === 'suitcase') {
        const color = [0x3b6fd1, 0xe04e4e, 0xf0b532, 0x6a5acd][Math.floor(r() * 4)];
        F.cube(g, [.5, .58, .28], [0, .36, 0], color, true);
        for (const s of [-1, 1]) { F.cube(g, [.02, .56, .02], [s * .12, .36, .145], 0x333333); for (const d of [-1, 1]) F.sphere(g, [.035, .035, .035], [s * .2, .04, d * .1], 0x1a1a1a); }
        for (const s of [-.1, .1]) F.rod(g, [s, .64, .08], [s, .9, .08], .012, 0x8a9096);
        F.cube(g, [.24, .03, .03], [0, .9, .08], 0x1a1a1a);
      }
      const shadow = new T.Mesh(this.shadowGeo, this.shadowMat); shadow.scale.set(o.w * 2.2, 1, o.len * 1.6); shadow.position.y = .006; g.add(shadow);
      g.position.copy(W(o.x, 0, o.z)); this.scene.add(g);
      return { o, g, p, react:0, walk:r() * TAU };
    });
  }

  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.aspect = w / h; this.camera.aspect = this.aspect;
    // keep the three lanes in view on a tall phone: widen the vertical angle as the screen narrows
    this.baseFov = Math.max(50, Math.min(80, 2 * Math.atan(Math.tan(33 * Math.PI / 180) / this.aspect) * 180 / Math.PI));
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    if (this.preview) { this.snap = true; this.render(0); }
  }

  // events from the engine: sounds, bursts and camera shake
  handle(e) {
    const s = this.sfx;
    if (e.type === 'count') s.count(false);
    if (e.type === 'go') s.count(true);
    if (e.type === 'lane') s.swish();
    if (e.type === 'jump') s.jump();
    if (e.type === 'land') s.step(1.6);
    if (e.type === 'bump') {
      e.slip ? s.slip() : s.bump(); this.shake = e.slip ? .25 : .4;
      const o = this.obs.find(v => v.o.hit && !v.react); if (o) o.react = .001;
      const at = W(this.game.x, 1.2, this.game.z + .3, new T.Vector3());
      this.burst(at, e.slip ? 0x5a3418 : 0x9fd3f2, e.slip ? 14 : 8, e.slip ? .03 : .02);
    }
    if (e.type === 'announce') s.chime();
    if (e.type === 'closing') s.hiss();
    if (e.type === 'boarded') s.win();
    if (e.type === 'door') { s.slam(); this.shake = .5; }
    if (e.type === 'missed') { s.slam(); }
    if (e.type === 'bumped') { s.bump(); this.papers(); }
    if (e.type === 'result' && !e.cleared) s.lose();
  }
  burst(at, color, n, size) {
    if (this.preview || this.reduced && n > 6) return;
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(this.F.ball, this.F.mat(color, .3)); m.scale.setScalar(size * (.6 + Math.random())); m.position.copy(at); this.scene.add(m);
      this.particles.push({ m, v:new T.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2.5, (Math.random() - .5) * 3), life:.6 + Math.random() * .4, spin:0 });
    }
  }
  papers() {
    if (this.preview) return;
    const g = this.game, at = W(g.x, .9, g.z + .6, new T.Vector3()), mat = this.F.mat(0xfbfbf6, .9);
    for (let i = 0; i < 16; i++) {
      const m = new T.Mesh(this.F.box, mat); m.scale.set(.21, .004, .29); m.position.copy(at); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.scene.add(m);
      this.particles.push({ m, v:new T.Vector3((Math.random() - .5) * 3.5, 2 + Math.random() * 2.5, -(Math.random() * 2.5)), life:3 + Math.random(), spin:4 + Math.random() * 4, paper:true });
    }
  }
  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      if (p.paper) { p.v.y = Math.max(-.6, p.v.y - 5 * dt); p.v.x *= 1 - dt; p.v.z *= 1 - dt; if (p.m.position.y > .01) { p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * .7 * dt; } }
      else p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < .01) { p.m.position.y = .01; p.v.set(0, 0, 0); if (p.paper) p.m.rotation.set(0, p.m.rotation.y, 0); }
    }
    this.particles = this.particles.filter(p => { if (p.life > 0) return true; this.scene.remove(p.m); return false; });
  }

  shownPhase() { const g = this.game; return g.phase === 'paused' ? g.previousPhase : g.phase; }
  // how the doors look, including the squeeze on 부장님 and the doors shutting behind him
  doorShown(phase) {
    const g = this.game, t = this.outroT;
    if (phase === 'ready' || phase === 'count') return 1;
    if (phase === 'run') return g.doorOpen();
    const reason = g.reason, base = g.doorOpen(this.endT + t);
    if (reason === 'boarded') return Math.min(base, 1 - ease((t - .55) / .7));
    if (reason === 'door') {
      if (t < 1.3) return .24 + Math.sin(t * 40) * .02 * (1 - t / 1.3);
      if (t < 1.75) return .24 + Math.sin((t - 1.3) / .45 * Math.PI) * .35;
      return Math.max(0, .24 - (t - 1.75) * 1.2);
    }
    return base;
  }

  render(dt) {
    if (this.dead) return;
    const g = this.game, phase = this.shownPhase(), live = g.phase !== 'paused';
    if (!live) dt = 0;
    this.time += dt;
    const outro = ['board', 'squish', 'missed', 'down', 'result'].includes(phase);
    if (outro) { if (!this.outroT) this.endT = g.t; this.outroT += dt; } else { this.outroT = 0; this.departAt = null; this.depart = 0; this.endT = g.t; }
    const open = this.doorShown(phase);
    // the other doors shut on time even while the first one is stuck on 부장님
    const others = outro && g.reason === 'door' ? g.doorOpen(this.endT + this.outroT) : open;
    for (const [list, x] of [[this.psd, PSD_X - .07], [this.trainDoors, TRAIN_SIDE - .05]])
      for (const pair of list) for (const d of pair) {
        const o = d.z === LENGTH ? open : others;
        d.leaf.position.copy(W(x, 0, d.z + d.side * (DOOR_HALF / 2 + o * (DOOR_HALF - .04))));
      }
    // the train pulls away once its doors are shut
    if (outro && open <= 0 && this.departAt == null) this.departAt = this.outroT + .45;
    if (this.departAt != null && this.outroT > this.departAt) {
      if (!this.departed) { this.departed = true; this.sfx.depart(); }
      const k = this.outroT - this.departAt; this.depart = .7 * k * k;
    } else this.departed = false;
    this.train.position.z = -this.depart;
    this.sfx.level('rumble', this.depart > 0 ? Math.min(.35, .1 + this.depart * .01) * Math.max(0, 1 - this.depart / 120) : 0, 'lowpass', 140, .7);
    this.marker.visible = !outro; this.pad.visible = !outro;
    this.marker.position.y = 2.85 + Math.sin(this.time * 4) * .08; this.marker.rotation.y += dt * 2;
    this.pad.material.opacity = .25 + Math.sin(this.time * 5) * .15 + (open < 1 && phase === 'run' ? .25 : 0);
    this.poseRunner(dt, phase);
    this.poseObstacles(dt, phase);
    this.updateParticles(dt);
    this.updateCamera(dt, phase);
    this.renderer.render(this.scene, this.camera);
  }

  poseRunner(dt, phase) {
    const g = this.game, r = this.runner, t = this.time, L = r.legs, A = r.arms;
    let x = g.x, z = g.z, y = g.y, yaw = Math.PI / 2, pitch = 0, roll = 0, squash = 1;
    if (phase === 'run' || g.reason === 'boarded' && this.outroT < .55) this.stride += dt * (2.2 + g.speed * 1.05);
    const s = this.stride;
    // a full stride per 2π: legs and arms swing opposite, knees fold on the back swing
    const pose = (amp, lean) => {
      for (let i = 0; i < 2; i++) {
        const ph = s + i * Math.PI, sw = Math.sin(ph);
        L[i].top.rotation.z = sw * amp; L[i].mid.rotation.z = -Math.max(0, Math.sin(ph + 1.3)) * 1.5 * amp;
        A[i].top.rotation.z = -sw * amp * .85; A[i].mid.rotation.z = .9 + amp * .4; A[i].top.rotation.x = out(i, .12);
      }
      r.body.rotation.z = -lean; r.body.position.y = Math.abs(Math.cos(s)) * .07 * amp;
      r.tie.rotation.z = .6 + Math.sin(s * 2) * .3 * amp;
    };
    const stand = () => { for (let i = 0; i < 2; i++) { L[i].top.rotation.z = 0; L[i].mid.rotation.z = 0; A[i].top.rotation.set(0, 0, 0); A[i].mid.rotation.z = .25; } r.body.rotation.set(0, 0, 0); r.body.position.y = 0; r.tie.rotation.z = 0; };
    r.head.rotation.set(0, 0, 0); r.sweat.visible = false; r.torso.rotation.set(0, 0, 0); r.bag.rotation.set(0, 0, 0);
    if (phase === 'ready') {
      // checking his watch at the foot of the stairs
      stand(); A[0].top.rotation.z = 1.25; A[0].top.rotation.x = out(0, -.55); A[0].mid.rotation.z = 1.5; r.head.rotation.z = -.35; r.head.rotation.y = -.25;
      r.body.rotation.z = Math.sin(t * 1.5) * .02;
      if (Math.sin(t * 1.3) > .6) { r.head.rotation.z = 0; r.head.rotation.y = Math.sin(t * 9) * .3; }
    } else if (phase === 'count') {
      stand(); for (let i = 0; i < 2; i++) { L[i].top.rotation.z = i ? .5 : -.35; L[i].mid.rotation.z = i ? -.9 : -.2; A[i].top.rotation.z = i ? -.6 : .6; A[i].mid.rotation.z = 1.4; }
      r.body.rotation.z = -.35; r.body.position.y = -.08; r.sweat.visible = true;
    } else if (phase === 'run') {
      if (g.stun > 0 && g.slip) {
        // legs out from under him on the coffee
        stand(); const k = Math.sin(Math.min(1, (1 - g.stun / .95)) * Math.PI);
        for (let i = 0; i < 2; i++) { L[i].top.rotation.z = 1.2 * k + Math.sin(t * 30 + i) * .3; A[i].top.rotation.z = 2.4 * k; A[i].top.rotation.x = out(i, 1.2 * k); A[i].mid.rotation.z = .3; }
        r.body.rotation.z = 1.0 * k; y = .25 * k; r.sweat.visible = true;
      } else if (g.stun > 0) {
        pose(.5, -.15); r.head.rotation.y = Math.sin(t * 22) * .4; r.head.rotation.z = .25; r.sweat.visible = true;
        for (let i = 0; i < 2; i++) { A[i].top.rotation.z = 1.6 + Math.sin(t * 25 + i * 2) * .6; A[i].top.rotation.x = out(i, .6); }
      } else if (g.airborne) {
        pose(.25, .2); for (let i = 0; i < 2; i++) { L[i].top.rotation.z = i ? .9 : -.2; L[i].mid.rotation.z = i ? -1.6 : -1.1; A[i].top.rotation.z = 2.2; A[i].top.rotation.x = out(i, .5); }
      } else {
        pose(.95, .22 + Math.min(.12, g.combo * .01)); r.sweat.visible = g.remaining < 6;
      }
      // a quick lean into lane changes
      roll = (g.x - laneX(g.lane)) * .18;
      if (L[0].top.rotation.z * this.lastLeg < 0 && !this.preview) this.sfx.step(.9);
      this.lastLeg = L[0].top.rotation.z;
    } else {
      const k = this.outroT, reason = g.reason;
      if (reason === 'boarded') {
        // a hop through the door, then a smug sweat-wipe inside
        const e = ease(k / .55); x = lerp(g.x, TRAIN_SIDE + 1.1, e); z = LENGTH; y = Math.sin(Math.min(1, k / .55) * Math.PI) * .3; yaw = lerp(Math.PI / 2, -.4, e);
        if (k < .55) pose(.9, .3); else { stand(); A[0].top.rotation.z = 2.5; A[0].top.rotation.x = out(0, .4); A[0].mid.rotation.z = 1.6; r.head.rotation.z = .15 + Math.sin(t * 3) * .05; r.sweat.visible = true; r.body.rotation.z = Math.sin(t * 9) * .03; }
      } else if (reason === 'door') {
        // squeezed between the leaves, briefcase stuck outside on the platform, then spat back out
        const inDoor = k < 1.45, e = ease(k / .3);
        x = inDoor ? lerp(g.x, PSD_X + .05, e) : lerp(PSD_X + .05, PSD_X - 1.15, ease((k - 1.45) / .35)); z = LENGTH; yaw = 0;
        stand();
        if (inDoor) {
          squash = .62; r.head.rotation.x = Math.sin(t * 18) * .15; r.sweat.visible = true;
          A[1].top.rotation.z = -1.2; A[1].top.rotation.x = out(1, .3); A[1].mid.rotation.z = -.2; r.bag.rotation.z = Math.sin(t * 6) * .3;
          A[0].top.rotation.z = 2.6 + Math.sin(t * 20) * .3; A[0].top.rotation.x = out(0, .8);
          L[0].top.rotation.z = Math.sin(t * 16) * .5; L[1].top.rotation.z = -.4;
        } else { pitch = 0; r.body.rotation.z = .9 * ease((k - 1.45) / .4); y = 0; L[0].top.rotation.z = L[1].top.rotation.z = 1.3; L[0].mid.rotation.z = L[1].mid.rotation.z = -1.3; r.body.position.y = -.42 * ease((k - 1.45) / .4); r.head.rotation.y = Math.sin(t * 7) * .5; }
      } else if (reason === 'missed') {
        // hands on knees, panting at the closed doors
        yaw = lerp(Math.PI / 2, .5, ease(k / .6)); stand();
        r.body.rotation.z = -.75 * ease(k / .6); for (let i = 0; i < 2; i++) { A[i].top.rotation.z = .9; A[i].mid.rotation.z = .2; L[i].mid.rotation.z = -.2; }
        r.body.position.y = -.05 + Math.abs(Math.sin(t * 7)) * .025; r.head.rotation.z = .5; r.sweat.visible = true;
        if (Math.random() < dt * 2.5 && !this.preview) this.burst(W(x, 1.5, z + .2, this.tmp.clone()), 0x9fd3f2, 1, .02);
      } else {
        // flat on his face, papers everywhere
        stand(); r.body.rotation.z = -1.45 * ease(k / .35); r.body.position.y = .12 * ease(k / .35); for (let i = 0; i < 2; i++) { A[i].top.rotation.z = 2.8; A[i].top.rotation.x = out(i, .5); }
        L[0].top.rotation.z = -.2 + Math.sin(t * 12) * .25 * Math.max(0, 1 - k / 2); L[1].mid.rotation.z = -1.4;
      }
    }
    r.g.position.copy(W(x, y, z)); r.g.rotation.set(pitch, yaw, roll);
    r.g.scale.set(1, 1, squash);
    this.runnerShadow.position.copy(W(x, .007, z)); const sh = 1 - Math.min(.6, y); this.runnerShadow.scale.set(.85 * sh, 1, .85 * sh);
    r.sweat.position.y = .07 - ((t * .6) % .12);
  }

  poseObstacles(dt, phase) {
    const g = this.game, near = g.z - 6, far = g.z + 70, t = this.time;
    for (const v of this.obs) {
      const { o, g:grp, p } = v;
      grp.visible = o.z > near && o.z < far;
      if (!grp.visible) continue;
      grp.position.copy(W(o.x, 0, o.z));
      if (v.react) v.react += dt;
      if (p) {
        const walking = Math.abs(o.vz) > 0 && (o.z !== o.z0 || o.sway && o.x !== laneX(o.lane));
        const s = (v.walk += dt * (walking ? 6.5 : 0));
        for (let i = 0; i < 2; i++) { const sw = walking ? Math.sin(s + i * Math.PI) * .35 : 0; p.legs[i].top.rotation.z = sw; p.legs[i].mid.rotation.z = -Math.max(0, Math.sin(s + i * Math.PI + 1.3)) * .4 * (walking ? 1 : 0); }
        p.body.position.y = walking ? Math.abs(Math.cos(s)) * .025 : 0;
        // bumped: a stagger and a look back
        if (v.react) { const k = Math.min(1, v.react / .25), f = Math.max(0, 1 - (v.react - .25) / 1.2); p.body.rotation.x = Math.sin(v.react * 14) * .2 * f; p.body.rotation.z = .25 * k * f; p.head.rotation.y = .6 * f; }
        if (o.kind === 'crowd' && !walking) p.head.rotation.y = Math.sin(t * .8 + v.walk) * .3;
      } else if (v.react && o.kind === 'suitcase') { grp.rotation.x = -Math.min(Math.PI / 2, v.react * 8) * .95; }
    }
  }

  updateCamera(dt, phase) {
    const g = this.game, cam = this.camera, tall = this.aspect < .8, k = this.preview || this.snap ? 1 : 1 - Math.exp(-dt * (phase === 'run' ? 6 : 2.6));
    this.snap = false;
    const pos = this.tmp, look = this.tmp2;
    let fov = this.baseFov;
    if (phase === 'ready') { W(-1.3, 1.55, 3.2, pos); W(.15, 1.15, 0, look); fov = this.baseFov * .9; }
    else if (phase === 'count' || phase === 'run') {
      const back = tall ? 5.4 : 4.4, up = tall ? 3.05 : 2.55;
      W(g.x * .5, up, g.z - back, pos); W(g.x * .4, tall ? .9 : 1.05, g.z + (tall ? 6.5 : 6), look);
      fov += Math.min(7, g.combo * .5) + (g.stun > 0 ? -2 : 0);
    } else if (g.reason === 'bumped') { W(g.x - 1.3, 1.5, g.z + 2.8, pos); W(g.x, .3, g.z, look); }
    else if (g.reason === 'missed' && this.outroT > 1.4) { W(-.8, 1.9, LENGTH - 5.5, pos); W(3.2, 1.2, LENGTH + 4 + this.depart * .5, look); }
    else { W(-.9, 1.85, LENGTH - (tall ? 5.6 : 4.2), pos); W(PSD_X - .2, 1.05, LENGTH + .2, look); }
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    // hide hanging signs the camera is about to pass through
    for (const m of this.signs || []) m.visible = !(cam.position.y > 2.5 && Math.abs(m.position.z - cam.position.z) < 1.6);
    if (this.shake > 0 && !this.reduced) { cam.position.x += (Math.random() - .5) * this.shake * .25; cam.position.y += (Math.random() - .5) * this.shake * .2; this.shake = Math.max(0, this.shake - dt * 1.6); }
    if (Math.abs(cam.fov - fov) > .05) { cam.fov = lerp(cam.fov, fov, k); cam.updateProjectionMatrix(); }
  }

  destroy() {
    this.dead = true; this.observer?.disconnect(); this.sfx.destroy();
    for (const p of this.particles) this.scene.remove(p.m);
    for (const d of this.disposables) d.dispose?.();
    for (const m of this.F.materials.values()) m.dispose();
    for (const geo of [this.F.box, this.F.ball, this.F.tube, this.F.round]) geo.dispose();
    this.renderer.dispose();
  }
}
