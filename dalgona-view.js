import * as T from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SHAPES, SECTORS, outline } from './dalgona-engine.js';
import { Sfx, canvasTexture } from './pasta-view.js';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.max(0, Math.min(1, v)), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = k => 1 - Math.pow(1 - clamp01(k), 3);
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ s >>> 15, 2246822507) + 0x9e3779b9 >>> 0) / 4294967296); }

// ── stall layout ──
const TRAY_TOP = .07;
const BRAZIER = new T.Vector3(-2.7, 0, -.5), COAL_TOP = 1.02;
const LADLE_FIRE = new T.Vector3(BRAZIER.x, COAL_TOP + .34, BRAZIER.z);
const TEX = 1024, SPAN = 2.2;  // the candy texture covers candy units [-1.1, 1.1]
const STATIONS = {
  pick:{ target:[-.9, .35, -.1], w:5.6, h:3.8, tilt:.6, yaw:.22 },
  melt:{ target:[BRAZIER.x, 1.3, BRAZIER.z], w:1.9, h:2.1, tilt:.95, yaw:.12 },
  press:{ target:[0, .15, 0], w:2.9, h:2.7, tilt:.9, yaw:.1 },
  carve:{ target:[0, .1, .02], w:2.35, h:2.35, tilt:1.36, yaw:0 },
  result:{ target:[0, .45, 0], w:2.6, h:2.6, tilt:1.0, yaw:0, shift:.26 },
};
// sugar colour from white grains to burnt
const MELT_RAMP = [[0, 0xfbf7ee], [.45, 0xf2d58a], [.86, 0xd98f2a], [1.05, 0x8d4a16], [1.3, 0x2c170b]];
function meltColor(v, out = new T.Color()) {
  for (let i = 1; i < MELT_RAMP.length; i++) if (v <= MELT_RAMP[i][0] || i === MELT_RAMP.length - 1) {
    const [a, ca] = MELT_RAMP[i - 1], [b, cb] = MELT_RAMP[i]; return out.set(ca).lerp(new T.Color(cb), clamp01((v - a) / (b - a)));
  }
  return out;
}

class CandySfx extends Sfx {
  crack() { this.burst({ freq:4200, q:2, vol:.45, dur:.05 }); this.tone(1800, .04, { type:'square', vol:.06, to:600 }); }
  snap() { this.burst({ freq:2600, q:.8, vol:.6, dur:.18 }); this.tone(320, .25, { type:'sawtooth', vol:.08, to:90 }); }
  chip() { this.tone(900 + Math.random() * 600, .06, { type:'triangle', vol:.12, to:2400 }); this.burst({ freq:5200, q:3, vol:.18, dur:.04 }); }
  clank() { this.tone(820, .3, { type:'square', vol:.07, to:610 }); this.tone(1240, .22, { type:'triangle', vol:.06 }); this.burst({ freq:3000, q:1.2, vol:.25, dur:.06 }); }
  thunk() { this.tone(140, .14, { to:60, vol:.35 }); this.burst({ freq:900, type:'lowpass', vol:.2, dur:.1 }); }
  lick() { this.burst({ freq:700, sweep:1600, type:'lowpass', q:3, vol:.25, dur:.22 }); }
  whoosh() { this.burst({ freq:500, sweep:2400, type:'bandpass', q:.8, vol:.4, dur:.22 }); this.tone(260, .16, { type:'triangle', vol:.05, to:110 }); }
  tick(on) { this.burst({ freq:on ? 5200 : 2400, q:3, vol:on ? .22 : .12, dur:.025 }); }
  sprinkle() { for (let i = 0; i < 6; i++) this.burst({ freq:6000, type:'highpass', q:.6, vol:.06, dur:.03, delay:i * .04 }); }
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, i === 4 ? .6 : .14, { type:'triangle', vol:.12, delay:i * .09 })); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, .22, { type:'triangle', vol:.1, delay:i * .14 })); }
}

export class DalgonaView {
  constructor(canvas, game, { preview = false, sound = () => true } = {}) {
    this.canvas = canvas; this.game = game; this.preview = preview; this.dead = false;
    this.time = 0; this.disposables = []; this.particles = []; this.sprites = []; this.flying = [];
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.sfx = new CandySfx(() => !preview && sound());
    this.renderer = new T.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preview ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    canvas.dataset.renderer = 'webgl';
    this.scene = new T.Scene(); this.scene.background = new T.Color('#1b1a24'); this.scene.fog = new T.Fog('#1b1a24', 11, 24);
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose();
    this.scene.environment = this.envMap; this.scene.environmentIntensity = .35;
    this.camera = new T.PerspectiveCamera(34, 1, .05, 60);
    this.camTarget = new T.Vector3(); this.camDist = 8; this.camTilt = .7; this.camYaw = 0;
    this.lights(); this.buildStall(); this.buildBrazier(); this.buildLadle(); this.buildTools(); this.buildCandy();
    this.shownShape = ''; this.syncShape(true);
    this.snapCamera();
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  track(o) { this.disposables.push(o); return o; }
  std(color, roughness = .6, metalness = 0, extra = {}) { return this.track(new T.MeshStandardMaterial({ color, roughness, metalness, ...extra })); }
  mesh(geo, mat, { cast = true, receive = false, parent = this.scene } = {}) { const m = new T.Mesh(this.track(geo), mat); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m; }
  lathe(profile, segments = 48) { return new T.LatheGeometry(profile.map(([x, y]) => new T.Vector2(x, y)), segments); }

  lights() {
    this.scene.add(new T.HemisphereLight(0xffe2c0, 0x2a2238, .9));
    const key = this.key = new T.DirectionalLight(0xffe6c8, 1.6); key.position.set(-1.5, 7, 3.5);
    key.castShadow = true; key.shadow.mapSize.set(this.preview ? 1024 : 2048, this.preview ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left:-4.5, right:4.5, top:4.5, bottom:-4.5, near:.5, far:20 }); key.shadow.bias = -.0005; key.shadow.normalBias = .02;
    this.scene.add(key, key.target);
    // the stall's bare bulb
    this.bulb = new T.PointLight(0xffc27a, 9, 9, 1.4); this.bulb.position.set(.4, 3.1, .6); this.scene.add(this.bulb);
    this.coalLight = new T.PointLight(0xff6a1f, 3, 4, 1.6); this.coalLight.position.set(BRAZIER.x, COAL_TOP + .25, BRAZIER.z); this.scene.add(this.coalLight);
  }
  buildStall() {
    const r = seeded(7);
    const wood = this.track(canvasTexture(512, 512, (x, w, h) => {
      x.fillStyle = '#7a5134'; x.fillRect(0, 0, w, h);
      for (let p = 0; p < 6; p++) { x.fillStyle = `hsla(26,40%,${26 + r() * 14}%,.5)`; x.fillRect(0, p * h / 6, w, h / 6); x.fillStyle = 'rgba(30,15,5,.6)'; x.fillRect(0, p * h / 6, w, 3); }
      for (let i = 0; i < 160; i++) { x.strokeStyle = `rgba(40,20,8,${.05 + r() * .15})`; x.lineWidth = .5 + r() * 1.5; x.beginPath(); const y = r() * h; x.moveTo(0, y); for (let s = 0; s <= w; s += 16) x.lineTo(s, y + Math.sin(s * .02 + i) * 3); x.stroke(); }
    }, { repeat:[2, 1.2] }));
    this.mesh(new T.BoxGeometry(9, .3, 5), this.std(0xffffff, .7, 0, { map:wood }), { receive:true }).position.y = -.15;
    // back wall: an old street at night, with lit windows
    const wall = this.track(canvasTexture(1024, 512, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#15131f'); g.addColorStop(1, '#2b2430'); x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { const bx = i * 120 + r() * 30, bw = 90 + r() * 40, bh = 200 + r() * 200; x.fillStyle = `hsl(250,12%,${11 + r() * 6}%)`; x.fillRect(bx, h - bh, bw, bh);
        for (let k = 0; k < 6; k++) if (r() > .45) { x.fillStyle = r() > .5 ? '#ffcf7a' : '#ffe9b8'; x.globalAlpha = .55 + r() * .4; x.fillRect(bx + 10 + (k % 3) * 26, h - bh + 20 + Math.floor(k / 3) * 40, 14, 20); x.globalAlpha = 1; } }
    }));
    const back = this.mesh(new T.PlaneGeometry(22, 9), new T.MeshBasicMaterial({ map:wall, fog:false }), { cast:false }); back.position.set(0, 3.2, -7);
    // striped awning above the stall
    const stripes = this.track(canvasTexture(256, 64, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f4ead6' : '#c7432f'; x.fillRect(i * w / 8, 0, w / 8, h); } x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, h - 8, w, 8); }, { repeat:[3, 1] }));
    const awning = this.mesh(new T.PlaneGeometry(9, 1.3), this.std(0xffffff, .9, 0, { map:stripes, side:T.DoubleSide }), { cast:false }); awning.position.set(0, 4.3, -1.9); awning.rotation.x = .6;
    // bulb on its cord
    // (hidden once the camera looks straight down, where it would hang over the candy)
    this.bulbParts = [this.mesh(new T.CylinderGeometry(.008, .008, 1.2, 6), this.std(0x111111, .8), { cast:false }), this.mesh(new T.SphereGeometry(.09, 16, 12), new T.MeshBasicMaterial({ color:0xfff0c8 }), { cast:false })];
    this.bulbParts[0].position.set(.4, 3.85, .6); this.bulbParts[1].position.set(.4, 3.2, .6);
    // prize board: finished candies on display
    const board = this.mesh(new T.BoxGeometry(2.6, 1.2, .06), this.std(0x5b3a24, .8), { receive:true }); board.position.set(1.4, .75, -2); board.rotation.x = -.18;
    SHAPES.forEach((s, i) => {
      const tex = this.track(this.prizeTexture(s.id)), disc = this.mesh(new T.CylinderGeometry(.26, .26, .03, 40), [this.std(0xc9832e, .55), this.std(0xffffff, .5, 0, { map:tex }), this.std(0xc9832e, .55)], { parent:board });
      disc.rotation.x = Math.PI / 2; disc.position.set(-.93 + i * .62, .05, .05);
    });
    const label = this.track(canvasTexture(512, 96, (x, w, h) => { x.fillStyle = '#f6e7c8'; x.fillRect(0, 0, w, h); x.fillStyle = '#7a2a1c'; x.font = '900 52px "Noto Sans KR",system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('SSUN DALGONA', w / 2, h / 2 + 3); }));
    const sign = this.mesh(new T.PlaneGeometry(1.6, .3), this.std(0xffffff, .8, 0, { map:label }), { parent:board, cast:false }); sign.position.set(0, .46, .035);
    // sugar box and soda tin
    const box = this.mesh(new T.BoxGeometry(.6, .32, .45), this.std(0xe9dfcb, .85), { receive:true }); box.position.set(-1.35, .16, -1.35); box.rotation.y = .3;
    const sugar = this.mesh(new T.BoxGeometry(.5, .04, .36), this.std(0xffffff, .95), { cast:false }); sugar.position.set(-1.35, .33, -1.35); sugar.rotation.y = .3;
    this.mesh(new T.CylinderGeometry(.16, .16, .34, 24), this.std(0xd7c27a, .4, .6), {}).position.set(-1.95, .17, -.95);
    const tinTop = this.mesh(new T.CylinderGeometry(.165, .165, .02, 24), this.std(0x2f6aa8, .5, .3), {}); tinTop.position.set(-1.95, .35, -.95);
  }
  prizeTexture(id) {
    const pts = outline(id).points;
    return canvasTexture(256, 256, (x, w) => {
      this.paintCandy(x, w, 0x86 + id.length * 9, 0xd18a2e);
      x.strokeStyle = 'rgba(90,40,10,.75)'; x.lineWidth = 4; x.beginPath();
      pts.forEach((p, i) => { const cx = (p.x / 1.05 * .5 + .5) * w, cy = (1 - (p.y / 1.05 * .5 + .5)) * w; i ? x.lineTo(cx, cy) : x.moveTo(cx, cy); }); x.closePath(); x.stroke();
    });
  }
  // honeycomb toffee: a warm gradient full of little bubbles
  paintCandy(x, w, seed, color) {
    const r = seeded(seed), c = new T.Color(color), hsl = {}; c.getHSL(hsl);
    const col = (dl, a = 1) => `hsla(${hsl.h * 360},${hsl.s * 100}%,${Math.max(5, Math.min(95, hsl.l * 100 + dl))}%,${a})`;
    const g = x.createRadialGradient(w * .45, w * .42, w * .05, w / 2, w / 2, w * .52); g.addColorStop(0, col(10)); g.addColorStop(.75, col(0)); g.addColorStop(1, col(-14));
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    for (let i = 0; i < w * .9; i++) {
      const bx = r() * w, by = r() * w, br = (1 + r() * r() * 7) * w / 1024 * 2.4;
      x.fillStyle = col(-12 - r() * 10, .55); x.beginPath(); x.arc(bx, by, br, 0, TAU); x.fill();
      x.fillStyle = col(16, .35); x.beginPath(); x.arc(bx - br * .3, by - br * .3, br * .45, 0, TAU); x.fill();
    }
    for (let i = 0; i < 40; i++) { x.strokeStyle = col(14, .12); x.lineWidth = 1 + r() * 3; x.beginPath(); x.arc(w / 2, w / 2, r() * w * .5, r() * TAU, r() * TAU); x.stroke(); }
  }
  buildBrazier() {
    const B = BRAZIER, g = this.brazier = new T.Group(); g.position.copy(B); this.scene.add(g);
    const iron = this.std(0x2c2a2a, .65, .55);
    this.mesh(this.lathe([[0, 0], [.6, 0], [.66, .06], [.62, .9], [.68, .96], [.64, .99], [.56, .94], [0, .94]]), iron, { parent:g, receive:true });
    for (let i = 0; i < 3; i++) { const leg = this.mesh(new T.CylinderGeometry(.03, .03, .2, 8), iron, { parent:g }); leg.position.set(Math.cos(i * TAU / 3) * .5, -.02, Math.sin(i * TAU / 3) * .5); }
    // the briquette with its glowing holes
    const r = seeded(3);
    const holes = this.track(canvasTexture(256, 256, (x, w) => {
      x.fillStyle = '#272524'; x.fillRect(0, 0, w, w);
      for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${90 + r() * 60},${80 + r() * 40},${70 + r() * 30},.25)`; x.fillRect(r() * w, r() * w, 2, 2); }
      const spots = [[0, 0]]; for (let k = 0; k < 6; k++) spots.push([Math.cos(k * TAU / 6) * .3, Math.sin(k * TAU / 6) * .3]); for (let k = 0; k < 12; k++) spots.push([Math.cos(k * TAU / 12 + .26) * .62, Math.sin(k * TAU / 12 + .26) * .62]);
      for (const [px, py] of spots) { const cx = (px * .5 + .5) * w, cy = (py * .5 + .5) * w; x.fillStyle = '#0e0b0a'; x.beginPath(); x.arc(cx, cy, w * .045, 0, TAU); x.fill(); }
    }));
    const glow = this.track(canvasTexture(256, 256, (x, w) => {
      x.fillStyle = '#000'; x.fillRect(0, 0, w, w);
      const spots = [[0, 0]]; for (let k = 0; k < 6; k++) spots.push([Math.cos(k * TAU / 6) * .3, Math.sin(k * TAU / 6) * .3]); for (let k = 0; k < 12; k++) spots.push([Math.cos(k * TAU / 12 + .26) * .62, Math.sin(k * TAU / 12 + .26) * .62]);
      for (const [px, py] of spots) { const cx = (px * .5 + .5) * w, cy = (py * .5 + .5) * w, gr = x.createRadialGradient(cx, cy, 0, cx, cy, w * .07); gr.addColorStop(0, '#ffd27a'); gr.addColorStop(.5, '#ff6a1a'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(cx - w * .08, cy - w * .08, w * .16, w * .16); }
      const rim = x.createRadialGradient(w / 2, w / 2, w * .4, w / 2, w / 2, w * .5); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(255,90,20,.6)'); x.fillStyle = rim; x.fillRect(0, 0, w, w);
    }));
    this.coalMat = this.std(0xffffff, .95, 0, { map:holes, emissive:0xffffff, emissiveMap:glow, emissiveIntensity:1.4 });
    const side = this.std(0x2a2726, .95, 0, { emissive:0x5a1a04, emissiveIntensity:.5 });
    const coal = this.mesh(new T.CylinderGeometry(.5, .5, .32, 40), [side, this.coalMat, side], { parent:g, receive:true }); coal.position.y = COAL_TOP - .16 - B.y;
  }
  buildLadle() {
    const g = this.ladle = new T.Group(); g.position.copy(LADLE_FIRE); this.scene.add(g);
    const steel = this.std(0xc9ccd0, .28, .9);
    this.mesh(this.lathe([[0, -.16], [.2, -.15], [.33, -.09], [.4, .02], [.415, .05], [.4, .05], [.385, .02], [.32, -.08], [.2, -.135], [0, -.145]], 40), steel, { parent:g });
    const handle = this.mesh(new T.CylinderGeometry(.022, .026, 1.5, 10), steel, { parent:g }); handle.rotation.z = Math.PI / 2 - .25; handle.position.set(1.1, .2, 0);
    const grip = this.mesh(new T.CylinderGeometry(.04, .04, .45, 12), this.std(0x3b2418, .6), { parent:g }); grip.rotation.z = Math.PI / 2 - .25; grip.position.set(1.75, .37, 0);
    // sugar grains, the melt and the puffing toffee
    this.grains = new T.InstancedMesh(this.track(new T.BoxGeometry(.03, .03, .03)), this.std(0xffffff, .3), 70); g.add(this.grains);
    const r = seeded(11), m = new T.Matrix4(), q = new T.Quaternion();
    this.grainSeeds = Array.from({ length:70 }, () => { const a = r() * TAU, rr = Math.sqrt(r()) * .26; return { p:new T.Vector3(Math.cos(a) * rr, -.12 + r() * .05, Math.sin(a) * rr), q:q.setFromEuler(new T.Euler(r() * 3, r() * 3, r() * 3)).clone() }; });
    this.grainSeeds.forEach((s, i) => { m.compose(s.p, s.q, new T.Vector3(1, 1, 1)); this.grains.setMatrixAt(i, m); });
    this.meltMat = this.track(new T.MeshPhysicalMaterial({ color:0xfbf7ee, roughness:.15, clearcoat:1, transparent:true, opacity:.95 }));
    this.melt = this.mesh(new T.CylinderGeometry(.3, .2, .05, 36), this.meltMat, { parent:g, cast:false }); this.melt.position.y = -.12;
    const bubbles = this.track(canvasTexture(256, 256, (x, w) => this.paintCandy(x, w, 5, 0xe0a650)));
    this.puffMat = this.std(0xffffff, .7, 0, { map:bubbles });
    const dome = new T.SphereGeometry(.34, 36, 16, 0, TAU, 0, Math.PI / 2);
    this.puff = this.mesh(dome, this.puffMat, { parent:g }); this.puff.position.y = -.12; this.puff.visible = false;
    this.stick = this.mesh(new T.CylinderGeometry(.014, .018, 1.1, 8), this.std(0xe8cf9c, .7), { parent:g }); this.stick.geometry.translate(0, .55, 0);
  }
  buildTools() {
    // round steel tray where the candy is poured and carved
    const steel = this.std(0xb9bec4, .32, .85);
    this.tray = this.mesh(this.lathe([[0, 0], [1.4, 0], [1.48, .05], [1.5, .07], [1.44, .07], [1.38, .04], [0, .04]], 64), steel, { receive:true });
    // press: a flat steel disc with a wooden knob
    const p = this.pressTool = new T.Group(); p.position.set(3, .02, .75); this.scene.add(p);
    this.mesh(new T.CylinderGeometry(.95, .95, .05, 48), steel, { parent:p });
    const stem = this.mesh(new T.CylinderGeometry(.04, .04, .45, 10), steel, { parent:p }); stem.position.y = .24;
    const knob = this.mesh(new T.SphereGeometry(.12, 16, 12), this.std(0x4a2a18, .5), { parent:p }); knob.position.y = .5;
    // shape cutters laid out on the counter; the chosen one stamps the candy
    this.cutters = {};
    SHAPES.forEach((s, i) => {
      const pts = outline(s.id).points, ring = new T.Shape(pts.map(q => new T.Vector2(q.x * 1.04, q.y * 1.04))), hole = new T.Path(pts.map(q => new T.Vector2(q.x * .985, q.y * .985)).reverse());
      ring.holes.push(hole);
      const geo = new T.ExtrudeGeometry(ring, { depth:.22, bevelEnabled:false, curveSegments:1 });
      const c = this.mesh(geo, this.std(0xd9dde2, .25, .95)); c.rotation.x = -Math.PI / 2; c.scale.setScalar(.5);
      c.userData.home = new T.Vector3(2.15 + (i % 2) * .62, 0, -1.05 + Math.floor(i / 2) * .62); c.position.copy(c.userData.home);
      this.cutters[s.id] = c;
    });
    // the needle
    const n = this.needle = new T.Group(); this.scene.add(n);
    const shaft = this.mesh(new T.CylinderGeometry(.014, .002, .8, 10), this.std(0xe3e6ea, .18, 1), { parent:n }); shaft.geometry.translate(0, .4, 0);
    const head = this.mesh(new T.SphereGeometry(.05, 16, 10), this.std(0xd94b3a, .35), { parent:n }); head.position.y = .8;
    n.rotation.set(.32, 0, -.28); n.visible = false;
    // the spot the tip touches: gold on the groove, red inside the shape
    const tipMat = this.tipMat = this.track(new T.MeshBasicMaterial({ color:0xffd36a, transparent:true, opacity:.9, depthWrite:false }));
    this.tip = new T.Group(); this.scene.add(this.tip);
    const ring = this.mesh(new T.TorusGeometry(.075, .011, 6, 32), tipMat, { parent:this.tip, cast:false }); ring.rotation.x = Math.PI / 2;
    const dot = this.mesh(new T.CircleGeometry(.03, 16), tipMat, { parent:this.tip, cast:false }); dot.rotation.x = -Math.PI / 2;
    this.tip.visible = false; this.tip.renderOrder = 3;
    this.ripples = [];
  }
  // a glowing ribbon over the stamped groove shows where to scratch
  buildGuide() {
    if (this.guide) { this.scene.remove(this.guide); this.guide.geometry.dispose(); }
    const pts = this.game.path.map(p => new T.Vector3(p.x, 0, -p.y));
    this.guideMat ||= this.track(new T.MeshBasicMaterial({ color:0xfff1b8, transparent:true, opacity:0, depthWrite:false }));
    this.guide = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, true), 240, .016, 5, true), this.guideMat); this.guide.renderOrder = 2;
    this.scene.add(this.guide);
  }
  ripple(x, y, color) {
    if (this.preview) return;
    const m = new T.Mesh(this._ring ||= this.track(new T.RingGeometry(.8, 1, 40)), new T.MeshBasicMaterial({ color, transparent:true, opacity:.8, depthWrite:false, side:T.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.copy(this.candyPoint(x, y)).add(new T.Vector3(0, .01, 0)); this.scene.add(m); this.ripples.push({ m, t:0 });
  }
  // The candy is built from the stamped shape plus twelve shards around it.
  buildCandy() {
    this.candy = new T.Group(); this.candy.rotation.x = -Math.PI / 2; this.candy.position.y = TRAY_TOP; this.scene.add(this.candy);
    this.topCanvas = document.createElement('canvas'); this.topCanvas.width = this.topCanvas.height = this.preview ? 512 : TEX;
    this.baseCanvas = document.createElement('canvas'); this.baseCanvas.width = this.baseCanvas.height = this.topCanvas.width;
    this.topTex = this.track(new T.CanvasTexture(this.topCanvas)); this.topTex.colorSpace = T.SRGBColorSpace; this.topTex.anisotropy = 4;
    this.topTex.repeat.set(1 / SPAN, 1 / SPAN); this.topTex.offset.set(.5, .5);
    this.topMat = this.track(new T.MeshPhysicalMaterial({ map:this.topTex, roughness:.5, clearcoat:.25, clearcoatRoughness:.4 }));
    this.sideMat = this.std(0xb8742a, .55);
  }
  syncShape(force) {
    const g = this.game;
    if (!force && this.shownShape === g.shape.id) return;
    this.shownShape = g.shape.id;
    for (const c of [...this.candy.children]) { this.candy.remove(c); c.geometry.dispose(); }
    for (const f of this.flying) { this.scene.remove(f.m); f.m.geometry.dispose(); } this.flying = [];
    const radial = g.radial, inner = [];
    for (let i = 0; i < 240; i++) { const a = i / 240 * TAU, r = radial(a); inner.push(new T.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
    const opts = { depth:1, bevelEnabled:false, curveSegments:1 };
    this.inner = new T.Mesh(new T.ExtrudeGeometry(new T.Shape(inner), opts), [this.topMat, this.sideMat]); this.inner.castShadow = this.inner.receiveShadow = true; this.candy.add(this.inner);
    const r = seeded(g.shape.level * 13);
    this.shards = [];
    for (let s = 0; s < SECTORS; s++) {
      const a0 = s / SECTORS * TAU, a1 = (s + 1) / SECTORS * TAU, pts = [];
      for (let k = 0; k <= 16; k++) { const a = lerp(a0, a1, k / 16), rr = radial(a) + .003; pts.push(new T.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
      for (let k = 16; k >= 0; k--) { const a = lerp(a0, a1, k / 16), rr = 1 - (k % 4 === 2 ? r() * .025 : 0); pts.push(new T.Vector2(Math.cos(a) * rr, Math.sin(a) * rr)); }
      const m = new T.Mesh(new T.ExtrudeGeometry(new T.Shape(pts), opts), [this.topMat, this.sideMat]); m.castShadow = m.receiveShadow = true; m.userData.mid = (a0 + a1) / 2;
      this.candy.add(m); this.shards.push(m);
    }
    this.scratches = []; this.stamped = false; this.freeT = null; this.snapT = null; this.hot = new Float32Array(g.path.length);
    this.buildGuide(); this.paintBase(); this.dirty = true;
  }
  paintBase() {
    const x = this.baseCanvas.getContext('2d'), w = this.baseCanvas.width, m = this.game.make;
    const col = meltColor(Math.max(.72, Math.min(1.25, m.melt || .8))).lerp(new T.Color(0xf3cf86), .25 + clamp01((m.puff - .6) * 1.2) * .3);
    this.paintCandy(x, w, 17 + this.game.shape.level, col.getHex());
    this.sideMat.color.copy(col).multiplyScalar(.82);
  }
  toPx(x, y) { const w = this.topCanvas.width; return [(x / SPAN + .5) * w, (1 - (y / SPAN + .5)) * w]; }
  drawTop() {
    const x = this.topCanvas.getContext('2d'), w = this.topCanvas.width, g = this.game, c = g.carve, px = w / 1024;
    x.drawImage(this.baseCanvas, 0, 0);
    if (this.stamped) {
      // the stamped groove, then the scratched line on top of it
      x.lineJoin = x.lineCap = 'round';
      x.strokeStyle = 'rgba(86,36,8,.7)'; x.lineWidth = 15 * px; x.beginPath(); g.path.forEach((p, i) => { const [u, v] = this.toPx(p.x, p.y); i ? x.lineTo(u, v) : x.moveTo(u, v); }); x.closePath(); x.stroke();
      x.strokeStyle = 'rgba(255,240,205,.4)'; x.lineWidth = 4 * px; x.stroke();
      for (let k = 0; k < g.path.length; k++) {
        const v = c.progress[k]; if (v <= .02) continue;
        const p = g.path[k], q = g.path[(k + 1) % g.path.length], [u0, v0] = this.toPx(p.x, p.y), [u1, v1] = this.toPx(q.x, q.y);
        // the groove deepens as it is scratched, and a cut-through line shows dark with a pale rim
        x.strokeStyle = `rgba(255,238,200,${.35 + v * .5})`; x.lineWidth = (14 + v * 10) * px; x.beginPath(); x.moveTo(u0, v0); x.lineTo(u1, v1); x.stroke();
        x.strokeStyle = v >= 1 ? 'rgba(28,10,2,.98)' : `rgba(70,28,6,${.3 + v * .6})`; x.lineWidth = (5 + v * 7) * px; x.stroke();
      }
      // fresh scratches glow for a moment so every stroke shows at once
      x.strokeStyle = 'rgba(255,214,110,.95)';
      for (let k = 0; k < g.path.length; k++) {
        const h = this.hot?.[k]; if (!(h > .05)) continue;
        const p = g.path[k], q = g.path[(k + 1) % g.path.length], [u0, v0] = this.toPx(p.x, p.y), [u1, v1] = this.toPx(q.x, q.y);
        x.globalAlpha = Math.min(1, h); x.lineWidth = (8 + h * 10) * px; x.beginPath(); x.moveTo(u0, v0); x.lineTo(u1, v1); x.stroke();
      }
      x.globalAlpha = 1;
    }
    x.strokeStyle = 'rgba(255,230,190,.55)'; x.lineWidth = 4 * px;
    for (const s of this.scratches) { const [u, v] = this.toPx(s.x, s.y); x.beginPath(); x.moveTo(u - s.dx * 22 * px, v + s.dy * 22 * px); x.lineTo(u + s.dx * 22 * px, v - s.dy * 22 * px); x.stroke(); }
    for (const k of c.cracks) {
      const r = seeded(Math.round(k.x * 1e4 + k.y * 1e3) + 99), [u, v] = this.toPx(k.x, k.y);
      x.strokeStyle = k.inward ? 'rgba(48,14,4,.95)' : 'rgba(60,24,6,.8)'; x.lineWidth = 6 * px; x.beginPath(); x.moveTo(u, v);
      let cx = k.x, cy = k.y; for (let i = 1; i <= 7; i++) { const d = k.dir + (r() - .5) * .9; cx += Math.cos(d) * k.len / 7; cy += Math.sin(d) * k.len / 7; const [a, b] = this.toPx(cx, cy); x.lineTo(a, b); }
      x.stroke(); x.strokeStyle = 'rgba(255,240,210,.4)'; x.lineWidth = 2 * px; x.stroke();
    }
    if (this.snapT != null) { x.strokeStyle = 'rgba(30,8,2,.95)'; x.lineWidth = 11 * px; x.beginPath(); const r = seeded(5); let [u, v] = this.toPx(-.7, .1); x.moveTo(u, v); for (let i = 1; i <= 10; i++) { [u, v] = this.toPx(-.7 + i * .14, .1 + (r() - .5) * .14); x.lineTo(u, v); } x.stroke(); }
    this.topTex.needsUpdate = true; this.dirty = false;
  }

  handle(e) {
    const g = this.game;
    if (e.type === 'begin') this.sfx.ensure();
    if (e.type === 'phase' && e.phase === 'melt') this.syncShape(true);
    if (e.type === 'phase' && e.phase === 'press') { this.pourT = 0; this.paintBase(); this.dirty = true; }
    if (e.type === 'soda') { this.sfx.sprinkle(); this.burst(new T.Vector3(LADLE_FIRE.x + .1, LADLE_FIRE.y + .7, LADLE_FIRE.z), 0xffffff, 18, { speed:.4, size:.012, spread:.4 }); }
    if (e.type === 'burnt') for (let i = 0; i < 6; i++) this.steam(new T.Vector3(LADLE_FIRE.x, LADLE_FIRE.y, LADLE_FIRE.z), { color:0x3a3330, size:.6, rise:.9, opacity:.5 });
    if (e.type === 'step') { this.sfx.tone(e.grade === 'perfect' ? 880 : e.grade === 'good' ? 660 : 330, .16, { type:'triangle', vol:.1 }); }
    if (e.type === 'stamp') { this.stampT = 0; }
    // quick mode: a fresh candy is poured and stamped right before the needle comes out
    if (e.type === 'phase' && e.phase === 'carve' && g.mode === 'quick') { this.syncShape(true); this.stampT = 0; }
    if (e.type === 'touch') { this.sfx.tick(e.where === 'line'); this.ripple(e.x, e.y, e.where === 'line' ? 0xffd36a : e.where === 'inside' ? 0xff6a4a : 0xffffff); }
    if (e.type === 'scrape') {
      this.dirty = true; this.scrapeLevel = Math.min(1, .35 + e.speed * .6);
      const P = g.path; for (let k = 0; k < P.length; k++) { const d = Math.hypot(P[k].x - e.x, P[k].y - e.y); if (d < .09) this.hot[k] = Math.max(this.hot[k], 1.2 - d * 6); }
      if (Math.random() < .6) this.dust();
    }
    if (e.type === 'scratch') { if (this.scratches.length < 120 && Math.random() < .3) { const a = Math.random() * TAU; this.scratches.push({ x:e.x, y:e.y, dx:Math.cos(a), dy:Math.sin(a) }); this.dirty = true; } this.scrapeLevel = .4; }
    if (e.type === 'crack') { this.dirty = true; this.sfx.crack(); if (e.inward) this.sfx.chip(); if (!this.reduced) this.shake = e.inward ? .05 : .025; this.burst(this.candyPoint(e.x, e.y), 0xd9922b, e.inward ? 10 : 5, { speed:.9, size:.014, spread:.7 }); }
    if (e.type === 'shard') this.popShard(e.sector, e.vx, e.vy, e.how);
    if (e.type === 'loose') { const m = this.shards[e.sector]; if (m) { m.userData.loose = true; m.userData.wob = .5; } this.sfx.chip(); this.burst(this.candyPoint(Math.cos(m?.userData.mid || 0) * .75, Math.sin(m?.userData.mid || 0) * .75), 0xe0a040, 4, { speed:.6, size:.012, spread:.6 }); }
    if (e.type === 'stuck') { const m = this.shards[e.sector]; if (m) m.userData.wob = .35; this.sfx.thunk(); }
    if (e.type === 'lick') { this.sfx.lick(); }
    if (e.type === 'free') { this.freeT = 0; this.sfx.win(); for (const col of [0xffd36a, 0xffffff, 0xff8a57]) this.burst(this.candyPoint(0, 0).add(new T.Vector3(0, .3, 0)), col, 14, { speed:2.2, size:.02, spread:1.2 }); }
    if (e.type === 'snap') { this.snapT = 0; this.dirty = true; this.sfx.snap(); setTimeout(() => !this.dead && this.sfx.lose(), 400); if (!this.reduced) this.shake = .1; }
    if (e.type === 'finish' && !e.freed && g.result?.reason === 'timeout') this.sfx.lose();
  }
  candyPoint(x, y) { const R = this.candyR || 1, th = this.candyTh || .08; return new T.Vector3(x * R, TRAY_TOP + th, -y * R); }
  // a flicked piece flies off the way the finger went; a dropped one just tips off the edge
  popShard(s, vx = 0, vy = 0, how = 'drop') {
    const m = this.shards[s]; if (!m || m.parent !== this.candy) return;
    this.scene.attach(m); const a = m.userData.mid, sp = Math.hypot(vx, vy);
    if (sp > .3) {
      const dx = vx / sp, dz = -vy / sp, out = clamp(2.6 + sp * 1.1, 3, 7.5);
      this.flying.push({ m, v:new T.Vector3(dx * out + Math.cos(a) * .4, 1.4 + Math.random() * .8, dz * out - Math.sin(a) * .4), w:new T.Vector3((Math.random() - .5) * 22, (Math.random() - .5) * 14, (Math.random() - .5) * 22), rest:false, flung:true });
      this.sfx.whoosh(); if (!this.reduced) this.shake = Math.max(this.shake || 0, .015);
    } else this.flying.push({ m, v:new T.Vector3(Math.cos(a) * (.7 + Math.random() * .4), 1.3 + Math.random() * .5, -Math.sin(a) * (.7 + Math.random() * .4)), w:new T.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 4, (Math.random() - .5) * 8), rest:false });
    if (how === 'snap' || how === 'chip') this.sfx.crack();
    this.sfx.tone(700 + s * 40, .08, { type:'triangle', vol:.12, to:1400 }); this.sfx.burst({ freq:3800, q:2, vol:.2, dur:.04 });
    this.burst(this.candyPoint(Math.cos(a) * .7, Math.sin(a) * .7), 0xe0a040, 6, { speed:1, size:.015, spread:.8 });
  }
  dust() { const n = this.game.carve.needle; if (n) this.burst(this.candyPoint(n.x, n.y), Math.random() < .5 ? 0xf2d39a : 0xc98a3a, 3, { speed:.7, size:.011, spread:1 }); }
  burst(at, color, n, { speed = 1.5, size = .03, spread = .6 } = {}) {
    if (this.preview) return;
    const geo = this._drop || (this._drop = this.track(new T.SphereGeometry(1, 6, 5)));
    this.dropMats ||= new Map(); if (!this.dropMats.has(color)) this.dropMats.set(color, this.std(color, .4));
    for (let i = 0; i < n && this.particles.length < 160; i++) {
      const m = new T.Mesh(geo, this.dropMats.get(color)); m.scale.setScalar(size * (.6 + Math.random() * .8)); m.position.copy(at); this.scene.add(m);
      const a = Math.random() * TAU; this.particles.push({ m, v:new T.Vector3(Math.cos(a) * spread * speed * Math.random(), speed * (.5 + Math.random() * .8), Math.sin(a) * spread * speed * Math.random()), life:1.3 });
    }
  }
  steam(at, { color = 0xffffff, size = .5, rise = .8, life = 1.6, opacity = .35 } = {}) {
    if (this.preview || this.sprites.length > 50) return;
    if (!this.puffTex) this.puffTex = this.track(canvasTexture(64, 64, (x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }));
    const s = new T.Sprite(new T.SpriteMaterial({ map:this.puffTex, color, transparent:true, depthWrite:false, opacity })); s.position.copy(at); s.scale.setScalar(size); this.scene.add(s);
    this.sprites.push({ s, life, max:life, rise, size, opacity });
  }

  // ── camera ──
  shownPhase() { const g = this.game; return g.phase === 'paused' ? g.previousPhase : g.phase; }
  stationFor(p) { return p === 'melt' || p === 'soda' ? 'melt' : p === 'press' ? 'press' : p === 'carve' ? 'carve' : p === 'result' ? 'result' : 'pick'; }
  frame(st) {
    const s = STATIONS[st], a = Math.max(.3, this.aspect || 1), th = Math.tan(T.MathUtils.degToRad(this.camera.fov / 2));
    const wide = a > 1.4, shift = wide ? 0 : s.shift || 0, side = wide && s.shift ? .2 : 0;
    return { target:new T.Vector3(...s.target), dist:Math.max(s.h / 2 / th / (1 - shift), s.w / 2 / (th * a * (1 - side * 1.6))) * 1.06, tilt:s.tilt, yaw:s.yaw || 0, shift, side };
  }
  snapCamera() { const f = this.frame(this.stationFor(this.shownPhase())); this.camTarget.copy(f.target); this.camDist = f.dist; this.camTilt = f.tilt; this.camYaw = f.yaw; this.viewShift = f.shift; this.viewSide = f.side; this.placeCamera(); }
  placeCamera() {
    const yaw = this.camYaw, c = this.camTarget, d = this.camDist, t = this.camTilt;
    this.camera.position.set(c.x + Math.sin(yaw) * Math.cos(t) * d, c.y + Math.sin(t) * d, c.z + Math.cos(yaw) * Math.cos(t) * d);
    if (this.shake > 0) this.camera.position.add(new T.Vector3((Math.random() - .5) * this.shake, 0, (Math.random() - .5) * this.shake));
    this.camera.lookAt(c);
    const vs = this.viewShift || 0, vx = this.viewSide || 0, W = this.size?.[0] || 1, H = this.size?.[1] || 1;
    if (vs > .002 || vx > .002) this.camera.setViewOffset(W, H, W * vx, H * vs, W, H); else if (this.camera.view?.enabled) this.camera.clearViewOffset();
    this.camera.updateMatrixWorld();
  }
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.aspect = w / h; this.size = [w, h]; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix();
    if (this.preview) { this.snapCamera(); this.render(0); }
  }
  // screen point → candy coordinates on the carving plane
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), ndc = new T.Vector2((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = new T.Vector3(); if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -(TRAY_TOP + (this.candyTh || .08))), hit)) return null;
    const R = this.candyR || 1; return { x:hit.x / R, y:-hit.z / R };
  }
  project(x, y) { const p = this.candyPoint(x, y).project(this.camera), r = this.canvas.getBoundingClientRect(); return { x:r.left + (p.x + 1) / 2 * r.width, y:r.top + (1 - p.y) / 2 * r.height }; }

  // ── per frame ──
  render(dt) {
    if (this.dead) return;
    const g = this.game, phase = this.shownPhase(), m = g.make, c = g.carve;
    this.time += dt;
    if (phase === 'pick') this.syncShape();
    const f = this.frame(this.stationFor(phase)), k = this.preview ? 1 : 1 - Math.exp(-dt * 3);
    this.camTarget.lerp(f.target, k); this.camDist = lerp(this.camDist, f.dist, k); this.camTilt = lerp(this.camTilt, f.tilt, k); this.camYaw = lerp(this.camYaw, f.yaw + (phase === 'pick' ? Math.sin(this.time * .2) * .12 : 0), k);
    this.viewShift = lerp(this.viewShift || 0, f.shift, k); this.viewSide = lerp(this.viewSide || 0, f.side, k);
    this.shake = Math.max(0, (this.shake || 0) - dt * .6);
    // coals breathe, and flare while the ladle sits on them
    const fire = (phase === 'melt' && m.onFire) ? 1 : 0;
    this.fireLevel = lerp(this.fireLevel || 0, fire, 1 - Math.exp(-dt * 5));
    const flick = .85 + Math.sin(this.time * 9) * .08 + Math.sin(this.time * 23) * .05;
    this.coalMat.emissiveIntensity = (1.1 + this.fireLevel * 1.2) * flick; this.coalLight.intensity = (2.2 + this.fireLevel * 4) * flick;
    if (!this.preview && Math.random() < dt * (2 + this.fireLevel * 8)) this.ember();
    this.sfx.level('coal', phase === 'melt' || phase === 'soda' ? .05 + this.fireLevel * .18 : 0, 'lowpass', 900, .4);
    for (const b of this.bulbParts) b.visible = phase === 'pick' || phase === 'melt' || phase === 'soda';
    this.updateLadle(dt, phase);
    this.updateCandy(dt, phase);
    this.updateParticles(dt);
    this.placeCamera();
    this.renderer.render(this.scene, this.camera);
  }
  ember() { this.steam(new T.Vector3(BRAZIER.x + (Math.random() - .5) * .6, COAL_TOP + .05, BRAZIER.z + (Math.random() - .5) * .6), { color:Math.random() < .5 ? 0xff8a2a : 0xffc25a, size:.05, rise:.9 + Math.random(), life:1.1, opacity:.9 }); }
  updateLadle(dt, phase) {
    const g = this.game, m = g.make, L = this.ladle;
    const making = phase === 'melt' || phase === 'soda';
    // pour: carry the ladle over the tray and tip it
    let pos = LADLE_FIRE.clone(), tip = 0;
    if (phase === 'melt') pos.y += m.onFire ? 0 : .12;
    if (phase === 'press' && this.pourT != null) {
      this.pourT += dt; const t = this.pourT;
      const over = new T.Vector3(-.35, .9, 0), go = ease(t / .5), back = ease((t - 1.3) / .5);
      pos = LADLE_FIRE.clone().lerp(over, go).lerp(LADLE_FIRE, back); tip = Math.sin(clamp01((t - .45) / .85) * Math.PI) * 1.2;
      if (t > .55 && t < 1.25 && !this.preview && Math.random() < dt * 30) this.burst(new T.Vector3(over.x + .38, over.y - .1, over.z), meltColor(m.melt).getHex(), 1, { speed:.1, size:.03, spread:.1 });
    }
    L.position.lerp(pos, phase === 'press' ? 1 : 1 - Math.exp(-dt * 8)); L.rotation.z = tip;
    // contents
    const melt = Math.min(m.melt, 1.3), sugarLeft = clamp01(1 - melt * 1.7);
    this.grains.visible = (phase === 'melt' || phase === 'pick') && sugarLeft > .02;
    if (this.grains.visible) { const mtx = new T.Matrix4(); this.grainSeeds.forEach((s, i) => { mtx.compose(s.p, s.q, new T.Vector3(1, 1, 1).multiplyScalar(sugarLeft * (.7 + (i % 5) * .1))); this.grains.setMatrixAt(i, mtx); }); this.grains.instanceMatrix.needsUpdate = true; }
    const poured = phase === 'press' && (this.pourT ?? 0) > 1.1 || phase === 'carve' || phase === 'result';
    this.melt.visible = making && !m.soda && melt > .04 || phase === 'press' && !poured && !m.soda;
    meltColor(melt, this.meltMat.color); this.meltMat.opacity = .55 + clamp01(melt * 2) * .43;
    this.melt.scale.set(.4 + clamp01(melt * 1.4) * .6, 1, .4 + clamp01(melt * 1.4) * .6);
    this.puff.visible = (phase === 'soda' && m.soda) || (phase === 'press' && !poured);
    if (this.puff.visible) { this.puff.scale.set(1, .2 + Math.min(1.2, m.puff) * .75 + Math.sin(this.time * 7) * .02, 1); this.puffMat.color.copy(meltColor(Math.max(.8, melt))).lerp(new T.Color(0xf6d79a), clamp01(m.puff) * .5); }
    // chopstick circles with the finger
    this.stirA = (this.stirA || 0) + dt * Math.min(16, (m.stirSpeed || 0) * 5);
    this.stick.visible = making;
    this.stick.position.set(Math.cos(this.stirA) * .17, -.12, Math.sin(this.stirA) * .17); this.stick.rotation.set(Math.sin(this.stirA) * .35, 0, -Math.cos(this.stirA) * .35 - .25);
    if (making && melt > .5 && !this.preview && Math.random() < dt * (m.soda ? 9 : 3)) this.steam(new T.Vector3(L.position.x + (Math.random() - .5) * .4, L.position.y, L.position.z + (Math.random() - .5) * .4), { size:.3, rise:.6, opacity:.18 });
  }
  updateCandy(dt, phase) {
    const g = this.game, m = g.make, c = g.carve;
    const poured = phase === 'press' ? clamp01(((this.pourT ?? 0) - .55) / .7) : phase === 'carve' || phase === 'result' || phase === 'pick' ? 1 : 0;
    const press = phase === 'pick' ? .7 : m.press;
    const R = this.candyR = phase === 'pick' ? .92 : lerp(.2, .5, poured) + press * .6, th = this.candyTh = phase === 'pick' ? .08 : lerp(.24, .2, poured) - press * .14;
    this.candy.visible = poured > 0;
    this.candy.scale.set(R, R, Math.max(.05, th));
    // press tool comes down over the candy
    const P = this.pressTool, pressing = phase === 'press' && poured >= 1;
    const pressPos = pressing ? new T.Vector3(0, TRAY_TOP + th + .03 + (m.pressing ? 0 : .35), 0) : new T.Vector3(3, .02, .75);
    P.position.lerp(pressPos, 1 - Math.exp(-dt * 10));
    if (pressing && m.pressing && !this.wasPressing) this.sfx.thunk(); this.wasPressing = pressing && m.pressing;
    // stamp: the chosen cutter comes down and leaves the groove
    const cutter = this.cutters[g.shape.id];
    for (const [id, cu] of Object.entries(this.cutters)) if (cu !== cutter || this.stampT == null) cu.position.lerp(cu.userData.home, 1 - Math.exp(-dt * 8));
    if (this.stampT != null) {
      this.stampT += dt; const t = this.stampT, down = ease(t / .35), up = ease((t - .7) / .45), y = TRAY_TOP + th + lerp(.6, 0, down) + up * .6;
      cutter.scale.setScalar(R); cutter.position.set(0, y, 0);
      if (t > .35 && !this.stamped) { this.stamped = true; this.dirty = true; this.sfx.clank(); if (!this.reduced) this.shake = .03; }
      if (t > 1.2) { this.stampT = null; cutter.scale.setScalar(.5); }
    } else if (phase === 'pick' && !this.stamped) { this.stamped = true; this.dirty = true; }
    // needle follows the finger, hovering when lifted
    const N = this.needle; N.visible = phase === 'carve' && g.state !== 'intro';
    if (N.visible) {
      if (c.needle) this.lastNeedle = c.needle;
      const at = this.lastNeedle ? this.candyPoint(this.lastNeedle.x, this.lastNeedle.y) : this.candyPoint(.75, -.4);
      if (!c.down) at.y += .12; else at.y += Math.abs(Math.sin(this.time * 40)) * (this.scrapeLevel || 0) * .02;
      // a fresh touch puts the needle there at once; only the hover eases
      if (c.down && !this.wasDown) N.position.copy(at); else N.position.lerp(at, 1 - Math.exp(-dt * 30));
    }
    this.wasDown = c.down;
    this.tip.visible = N.visible && c.down && !!c.needle;
    if (this.tip.visible) {
      this.tip.position.copy(this.candyPoint(c.needle.x, c.needle.y)).add(new T.Vector3(0, .006, 0));
      this.tipMat.color.setHex(c.where === 'line' ? 0xffd36a : c.where === 'inside' ? 0xff5a4a : 0xffffff);
      this.tip.scale.setScalar(1 + (this.scrapeLevel || 0) * .5 + Math.sin(this.time * 12) * .06);
    }
    for (const sh of this.shards) {
      if (sh.parent !== this.candy) continue;
      const u = sh.userData; u.wob = Math.max(0, (u.wob || 0) - dt * 1.6);
      const twitch = u.wob * Math.sin(this.time * 38 + u.mid * 5);
      sh.position.z = (u.loose ? .35 + Math.sin(this.time * 3 + u.mid * 4) * .08 : 0) + Math.abs(twitch) * .5;
      sh.rotation.z = twitch * .015;
    }
    // groove guide pulses until the first stroke, then stays faint
    const showGuide = phase === 'carve' && this.stamped && this.stampT == null;
    this.guide.visible = showGuide;
    if (showGuide) {
      const fresh = g.progressRatio() < .03;
      this.guide.position.set(0, TRAY_TOP + th + .004, 0); this.guide.scale.set(R, 1, R);
      this.guideMat.opacity = fresh ? .35 + Math.sin(this.time * 5) * .3 : c.down ? .08 : .18;
    }
    for (let k = 0; k < this.hot.length; k++) if (this.hot[k] > 0) { this.hot[k] = Math.max(0, this.hot[k] - dt * 2.2); if (this.hot[k] > 0) this.dirty = true; }
    for (const r of this.ripples) { r.t += dt; const k = r.t / .45; r.m.scale.setScalar(.04 + k * .22); r.m.material.opacity = .8 * (1 - k); }
    this.ripples = this.ripples.filter(r => { if (r.t < .45) return true; this.scene.remove(r.m); r.m.material.dispose(); return false; });
    this.sfx.level('scrape', phase === 'carve' && c.down ? (this.scrapeLevel || 0) * .22 : 0, 'bandpass', 3400, 2.5);
    this.scrapeLevel = Math.max(0, (this.scrapeLevel || 0) - dt * 4);
    // licking makes the top glossy for a while
    const wet = clamp01(c.wet / 1.5);
    this.topMat.clearcoat = .25 + wet * .75; this.topMat.roughness = .5 - wet * .35;
    if (wet > 0 && !this.preview && Math.random() < dt * 4) this.steam(this.candyPoint((Math.random() - .5) * 1.4, (Math.random() - .5) * 1.4), { color:0xfff6dd, size:.06, rise:.15, life:.6, opacity:.8 });
    // the freed shape rises, the broken one sags
    if (this.freeT != null) { this.freeT += dt; const t = ease(this.freeT / 1.2); this.inner.position.z = t * .45 / Math.max(.05, th); this.inner.rotation.z = Math.sin(this.freeT * 1.2) * .25 * t; if (!this.preview && Math.random() < dt * 6) this.steam(this.candyPoint((Math.random() - .5) * 1.3, (Math.random() - .5) * 1.3).add(new T.Vector3(0, .4, 0)), { color:0xffe9a8, size:.07, rise:.4, life:.8, opacity:.9 }); }
    else this.inner.position.z = 0;
    if (this.snapT != null) { this.snapT += dt; this.inner.rotation.y = Math.min(.12, this.snapT * .4); }
    else this.inner.rotation.y = 0;
    if (this.dirty && (!this.lastDraw || this.time - this.lastDraw > 1 / 20 || phase !== 'carve')) { this.drawTop(); this.lastDraw = this.time; }
    // shards tumble onto the tray and the counter
    this.flying = this.flying.filter(f => { if (!f.flung || f.m.position.lengthSq() < 60 && f.m.position.y > -3) return true; this.scene.remove(f.m); f.m.geometry.dispose(); return false; });
    for (const f of this.flying) {
      if (f.rest) continue;
      f.v.y -= 6 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
      const floor = f.flung ? -9 : Math.hypot(f.m.position.x, f.m.position.z) < 1.4 ? TRAY_TOP : .0;
      if (f.m.position.y < floor + .02) { f.m.position.y = floor + .02; if (Math.abs(f.v.y) < .6) { f.rest = true; f.m.rotation.x = -Math.PI / 2 + (Math.random() - .5) * .3; f.m.rotation.y = (Math.random() - .5) * .3; } else { f.v.y *= -.3; f.v.x *= .6; f.v.z *= .6; this.sfx.tone(1500 + Math.random() * 800, .03, { type:'triangle', vol:.04 }); } }
    }
  }
  updateParticles(dt) {
    for (const p of this.particles) { p.life -= dt; p.v.y -= 6 * dt; p.m.position.addScaledVector(p.v, dt); if (p.m.position.y < TRAY_TOP) { p.m.position.y = TRAY_TOP; p.v.set(0, 0, 0); p.life = Math.min(p.life, .4); } }
    this.particles = this.particles.filter(p => { if (p.life > 0) return true; this.scene.remove(p.m); return false; });
    for (const s of this.sprites) { s.life -= dt; const k = 1 - s.life / s.max; s.s.position.y += s.rise * dt; s.s.scale.setScalar(s.size * (1 + k)); s.s.material.opacity = s.opacity * Math.sin(Math.min(1, k * 1.3) * Math.PI); }
    this.sprites = this.sprites.filter(s => { if (s.life > 0) return true; this.scene.remove(s.s); s.s.material.dispose(); return false; });
  }
  destroy() {
    this.dead = true; this.observer?.disconnect(); this.sfx.destroy();
    for (const s of this.sprites) s.s.material.dispose();
    this.candy.traverse(o => o.geometry?.dispose()); for (const f of this.flying) f.m.geometry.dispose(); this.guide?.geometry.dispose();
    for (const d of this.disposables) d.dispose?.();
    this.envMap.dispose(); this.renderer.dispose();
  }
}
