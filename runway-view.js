import * as T from "three";
import { Factory, noiseTexture } from "./models.js";
import { RWY, DEG, rng, clamp, getLivery } from "./runway-engine.js";
// World frame matches the engine: x along runway 14R, y up, z to the right of the centreline.
const V = new T.Vector3(), LOOK = new T.Vector3(), L = RWY.length, W = RWY.width, Q = new T.Quaternion();
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const approach = (v, target, rate, dt) => v + clamp(target - v, -rate * dt, rate * dt);

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// ---- Airliner geometry -------------------------------------------------------------------
// Body frame: origin on the fuselage centreline above the main wheels, x to the nose, y up, z to the right.
// Proportions follow a 37.6 m single-aisle twin jet: 4 m fuselage, 34 m span plus sharklets.
const CY = 4, R = 2, NOSE = 17.4, NOSE_LEN = 6.4, CONE = -8.6, TAIL = -20;
const pw = (v, p) => Math.pow(Math.max(0, v), p);
/** The fuselage cross-section at x: an ellipse centred at yc with half-width a and half-height b. */
function fuselageSection(x) {
  let top = CY + R, bot = CY - R, a = R;
  if (x > NOSE - NOSE_LEN) {
    // a blunt radome that rises into the cockpit roof; the chin stays low and full
    const t = clamp((NOSE - x) / NOSE_LEN, 0, 1), y0 = CY - 0.62;
    top = y0 + (CY + R - y0) * pw(1 - pw(1 - t, 1.9), 0.62);
    bot = y0 - (y0 - (CY - R)) * pw(1 - pw(1 - t, 2.8), 0.5);
    a = R * pw(1 - pw(1 - t, 2.4), 0.52);
  } else if (x < CONE) {
    // the tail cone sweeps its belly upward (tailstrike clearance) and narrows to the APU exhaust
    const s = clamp((CONE - x) / (CONE - TAIL), 0, 1);
    top = CY + R - 0.85 * pw(s, 2.2);
    bot = CY - R + 2.3 * s * s;
    a = lerp(R, 0.32, pw(s, 1.15));
  }
  return { yc: (top + bot) / 2, a, b: (top - bot) / 2 };
}
/** A point on (or `off` metres outside) the fuselage skin; θ = 0 on top, π/2 on the right side, π underneath. */
const skinPoint = (x, th, off = 0) => {
  const s = fuselageSection(x);
  return [x, s.yc + (s.b + off) * Math.cos(th), (s.a + off) * Math.sin(th)];
};
/** Builds an indexed grid geometry from a (cols+1)×(rows+1) point/uv generator, wound outward. */
function gridGeometry(cols, rows, at, flip = false, out = { pos: [], uv: [], idx: [] }) {
  const base = out.pos.length / 3;
  for (let i = 0; i <= cols; i++)
    for (let j = 0; j <= rows; j++) {
      const { p, uv = [0, 0] } = at(i, j);
      out.pos.push(...p);
      out.uv.push(...uv);
    }
  const id = (i, j) => base + i * (rows + 1) + j;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const a = id(i, j), b = id(i, j + 1), c = id(i + 1, j), d = id(i + 1, j + 1);
      out.idx.push(...(flip ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
  return out;
}
function toGeometry({ pos, uv, idx }) {
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A strip of fuselage skin between stations `xs` (ascending) and angles th0..th1. */
const skinGeometry = (xs, th0, th1, rows, off = 0) =>
  toGeometry(gridGeometry(xs.length - 1, rows, (i, j) => ({ p: skinPoint(xs[i], lerp(th0, th1, j / rows), off), uv: [i / (xs.length - 1), j / rows] })));
/**
 * Decals laid on the skin: each part is a quad in (x, θ) with corners [aft-top, fwd-top, aft-bottom, fwd-bottom]
 * as seen from its own side, so the texture reads upright and nose-right on the right side, nose-left on the left.
 */
function decalGeometry(parts, off) {
  const out = { pos: [], uv: [], idx: [] };
  for (const { c, nx = 1, nt = 1 } of parts) {
    const side = Math.sign(c[0][1] + c[3][1]) || 1;
    gridGeometry(nx, nt, (i, j) => {
      const u = i / nx, v = j / nt, x = lerp(lerp(c[0][0], c[1][0], u), lerp(c[2][0], c[3][0], u), v),
        th = lerp(lerp(c[0][1], c[1][1], u), lerp(c[2][1], c[3][1], u), v);
      return { p: skinPoint(x, th, off), uv: [side > 0 ? u : 1 - u, 1 - v] };
    }, side < 0, out);
  }
  return toGeometry(out);
}
/** A rectangle on the skin from x0 to x1 (x0 < x1) and angle t0 (upper) to t1 (lower), on the right side; side −1 mirrors it. */
const rect = (x0, x1, t0, t1, side = 1, nx = 1, nt = 1) => {
  return { c: [[x0, side * t0], [x1, side * t0], [x0, side * t1], [x1, side * t1]], nx, nt };
};

// Symmetric airfoil (NACA 00xx), half-thickness per unit of maximum thickness at chord fraction s.
const airfoil = (s) => 5 * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s * s + 0.2843 * s ** 3 - 0.1036 * s ** 4);
const CHORD = Array.from({ length: 15 }, (_, k) => (1 - Math.cos((Math.PI * k) / 14)) / 2);
/**
 * Lofts an airfoil through `sections`: { le: [x,y,z], c: chord (aft along −x), t: max thickness,
 * n: thickness axis, cut: x where the trailing edge is cut away for a hinged surface, wall: starts a new strip }.
 * `side` −1 mirrors in z. `uvAt` maps body positions to texture coordinates.
 */
function loftGeometry(sections, { side = 1, cap = true, uvAt = null } = {}) {
  const out = { pos: [], uv: [], idx: [] }, M = CHORD.length * 2 - 1;
  const ring = (S) => {
    const n = S.n ?? [0, 1, 0], end = S.cut == null ? 1 : clamp((S.le[0] - S.cut) / S.c, 0, 1), pts = [];
    for (let k = 0; k < M; k++) {
      const upper = k < CHORD.length, s = Math.min(upper ? CHORD[CHORD.length - 1 - k] : CHORD[k - CHORD.length + 1], end),
        h = (upper ? 1 : -1) * S.t * airfoil(s);
      pts.push([S.le[0] - s * S.c + n[0] * h, S.le[1] + n[1] * h, (S.le[2] + n[2] * h) * side]);
    }
    return pts;
  };
  // wind so the +n face points along n: flip when chord (+x) × span disagrees with n, and again when mirrored
  const s0 = sections[0], s1 = sections[1], n0 = s0.n ?? [0, 1, 0],
    flip = (-(s1.le[2] - s0.le[2]) * n0[1] + (s1.le[1] - s0.le[1]) * n0[2] < 0) !== (side < 0);
  const strip = (list) => {
    const rings = list.map(ring);
    gridGeometry(rings.length - 1, M, (i, j) => {
      const p = rings[i][j % M];
      return { p, uv: uvAt ? uvAt(p) : [0, 0] };
    }, flip, out);
  };
  let run = [sections[0]];
  for (let i = 1; i < sections.length; i++) {
    if (sections[i].wall) {
      if (run.length > 1) strip(run);
      strip([sections[i - 1], sections[i]]);
      run = [sections[i]];
    } else run.push(sections[i]);
  }
  if (run.length > 1) strip(run);
  if (cap) {
    const last = ring(sections.at(-1)), mid = last.reduce((m, p) => m.map((v, i) => v + p[i] / M), [0, 0, 0]),
      base = out.pos.length / 3;
    out.pos.push(...mid, ...last.flat());
    for (let k = 0; k <= M; k++) out.uv.push(...(uvAt ? uvAt(k ? last[k - 1] : mid) : [0, 0]));
    // the cap faces outward along the last span segment
    const prev = sections.at(-2).le, tipDir = new T.Vector3(...sections.at(-1).le).sub(new T.Vector3(...prev)), A = new T.Vector3(...mid);
    tipDir.z *= side;
    const nCap = new T.Vector3(...last[0]).sub(A).cross(new T.Vector3(...last[1]).sub(A)), out_ = nCap.dot(tipDir) >= 0;
    for (let k = 0; k < M; k++) {
      const a = base + 1 + k, b = base + 1 + ((k + 1) % M);
      out.idx.push(...(out_ ? [base, a, b] : [base, b, a]));
    }
  }
  return toGeometry(out);
}
const halfAt = (S, x) => S.t * airfoil(clamp((S.le[0] - x) / S.c, 0, 1));
/**
 * A hinged control surface filling the cut-out between two lofted sections SA and SB (body frame, hinge A→B
 * along +z, or +y when `vertical`). Returns the pivot: rotation.z (or .y) deflects it, positive = trailing edge
 * down (or to the right).
 */
function controlSurface(F, parent, SA, SB, mat, { vertical = false, side = 1, uvAt = null, top = false, chord = 0 } = {}) {
  // spoilers (`top`) are thin plates on the upper skin from the hinge `chord` metres aft
  const ends = [SA, SB].map((S) => {
    const n = S.n ?? [0, 1, 0], hx = S.cut, h = top ? halfAt(S, hx) + 0.02 : halfAt(S, hx), tx = top ? hx - chord : S.le[0] - S.c;
    const lift = top ? h - 0.03 : 0, tl = top ? halfAt(S, tx) - 0.01 : 0;
    const P = (x, off, dh) => [x + n[0] * (off + dh), S.le[1] + n[1] * (off + dh), (S.le[2] + n[2] * (off + dh)) * side];
    return { hinge: P(hx, lift, 0), hu: P(hx, lift, top ? 0.035 : h), hl: P(hx, lift, top ? -0.035 : -h), tu: P(tx, tl, top ? 0.025 : 0.012), tl: P(tx, tl, top ? -0.025 : -0.012) };
  });
  // hinges always run toward +z (or up) so a positive deflection means the same on both sides
  if (side < 0 && !vertical) ends.reverse();
  const A = new T.Vector3(...ends[0].hinge), B = new T.Vector3(...ends[1].hinge), mount = new T.Group(), pivot = new T.Group();
  mount.position.copy(A).add(B).multiplyScalar(0.5);
  mount.quaternion.copy(Q.setFromUnitVectors(vertical ? new T.Vector3(0, 1, 0) : new T.Vector3(0, 0, 1), B.clone().sub(A).normalize()));
  parent.add(mount);
  mount.add(pivot);
  const inv = mount.quaternion.clone().invert(), local = (p) => new T.Vector3(...p).sub(mount.position).applyQuaternion(inv).toArray();
  // eight corners: hinge upper/lower and trailing upper/lower at each end
  const [a, b] = ends, faces = [[a.hu, b.hu, a.tu, b.tu], [b.hl, a.hl, b.tl, a.tl], [a.hl, b.hl, a.hu, b.hu], [a.tu, b.tu, a.tl, b.tl], [a.hu, a.tu, a.hl, a.tl], [b.tu, b.hu, b.tl, b.hl]];
  const out = { pos: [], uv: [], idx: [] }, mid = new T.Vector3(...local(a.hinge)).lerp(new T.Vector3(...local(b.tu)), 0.5);
  for (const f of faces) {
    const base = out.pos.length / 3, [p0, p1, p2, p3] = f.map((p) => new T.Vector3(...local(p)));
    // wind each face so its normal points away from the middle of the panel
    const n = p2.clone().sub(p0).cross(p1.clone().sub(p0)), c = p0.clone().add(p1).add(p2).add(p3).multiplyScalar(0.25).sub(mid);
    for (const p of f) {
      out.pos.push(...local(p));
      out.uv.push(...(uvAt ? uvAt(p) : [0, 0]));
    }
    out.idx.push(...(n.dot(c) >= 0 ? [base, base + 2, base + 1, base + 1, base + 2, base + 3] : [base, base + 1, base + 2, base + 1, base + 3, base + 2]));
  }
  F.mesh(toGeometry(out), mat, pivot);
  // a dark hinge line so the panel reads as a separate, moving part
  const len = A.distanceTo(B), th = top ? 0.08 : new T.Vector3(...a.hu).distanceTo(new T.Vector3(...a.hl)) + 0.02;
  F.cube(pivot, vertical ? [0.07, len, th] : [0.07, th, len], [-0.03, 0, 0], mat.userData.edge).castShadow = false;
  return pivot;
}

// Wing planform: 27° leading-edge sweep, unswept inner trailing edge to the kink, 5° dihedral.
const WING = { y: 2.75, dih: Math.tan(5 * DEG), le0: 4.8, sweep: 0.51, kink: 6.3, te0: -2.5, tip: 17, teTip: -5.3 };
const wingLE = (z) => WING.le0 - z * WING.sweep;
const wingTE = (z) => (z <= WING.kink ? WING.te0 : lerp(WING.te0, WING.teTip, (z - WING.kink) / (WING.tip - WING.kink)));
const wingY = (z) => WING.y + z * WING.dih;
const wingT = (z) => (z <= WING.kink ? lerp(0.72, 0.42, z / WING.kink) : lerp(0.42, 0.17, (z - WING.kink) / (WING.tip - WING.kink)));
/** A wing section at span z, optionally cut at chord fraction `cut` for a hinged surface. */
const wingSec = (z, cut = null, wall = false) => {
  const le = wingLE(z), c = le - wingTE(z);
  return { le: [le, wingY(z), z], c, t: wingT(z), cut: cut == null ? null : le - cut * c, wall };
};
// Hinged surfaces along the span: [z0, z1, chord fraction kept by the wing]
const FLAPS = [[2.2, 6.0, 0.72], [6.6, 12.2, 0.73]], AILERON = [12.5, 15.8, 0.76];
// Horizontal stabiliser: 33° sweep, 6° dihedral, rooted inside the tail cone.
const STAB = { y: CY + 0.3, dih: Math.tan(6 * DEG), le0: -13.6, sweep: 0.64, te0: -17.5, teSweep: 0.27, span: 6.2 };
const stabSec = (z, cut = null, wall = false) => {
  const le = STAB.le0 - z * STAB.sweep, c = le - (STAB.te0 - z * STAB.teSweep);
  return { le: [le, STAB.y + z * STAB.dih, z], c, t: lerp(0.42, 0.14, z / STAB.span), cut: cut == null ? null : le - cut * c, wall };
};
// Fin, in fin metres: x along the body, y up from FIN_Y. A low dorsal fillet blends the leading edge into the spine.
const FIN_Y = CY + 1.6;
const FIN_LE = [[-0.7, -9.6], [0.15, -10.7], [0.4, -11.3], [0.7, -12.3], [1.1, -13.1], [6.6, -17.72]];
const finLE = (y) => {
  for (let i = 1; i < FIN_LE.length; i++) if (y <= FIN_LE[i][0]) return lerp(FIN_LE[i - 1][1], FIN_LE[i][1], (y - FIN_LE[i - 1][0]) / (FIN_LE[i][0] - FIN_LE[i - 1][0]));
  return FIN_LE.at(-1)[1];
};
const finTE = (y) => -19.7 - (y + 0.7) * 0.16;
// The fin texture is drawn in fin metres over this rectangle.
const FIN = { x0: -22, x1: -9, y0: -1, y1: 6.8 };
// rudder hinge in fin metres, bottom to top
const RUDDER = { x0: -18.05, y0: 0.15, x1: -19.85, y1: 6.4 };
const rudderHinge = (y) => lerp(RUDDER.x0, RUDDER.x1, (y - RUDDER.y0) / (RUDDER.y1 - RUDDER.y0));
const finSec = (y, cut = false, wall = false) => {
  const le = finLE(y);
  return { le: [le, FIN_Y + y, 0], c: le - finTE(y), t: lerp(0.55, 0.2, (y + 0.7) / 7.3), n: [0, 0, 1], cut: cut ? rudderHinge(y) : null, wall };
};
const finUV = (p) => [(p[0] - FIN.x0) / (FIN.x1 - FIN.x0), (p[1] - FIN_Y - FIN.y0) / (FIN.y1 - FIN.y0)];
const wave = (c, base, amp, phase, x0 = -22, x1 = -9) => {
  for (let x = x0; x <= x1 + 0.01; x += 0.25) c.lineTo(x, base + Math.sin(x * 1.4 + phase) * amp);
};

/** Paints a livery's tail pattern over the whole fin rectangle; the fin and rudder shapes crop it. */
function paintFin(c, w, h, lv) {
  const k = lv.colors;
  c.setTransform(w / (FIN.x1 - FIN.x0), 0, 0, -h / (FIN.y1 - FIN.y0), (-FIN.x0 * w) / (FIN.x1 - FIN.x0), (FIN.y1 * h) / (FIN.y1 - FIN.y0));
  c.fillStyle = k.tail;
  c.fillRect(-23, -2, 15, 10);
  c.lineCap = "round";
  if (lv.tail === "swirl") {
    // a red spiral inside a blue ring
    const cx = -17.3, cy = 3.1, r = 1.2;
    c.strokeStyle = k.accent2;
    c.lineWidth = 0.2;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = k.accent;
    c.lineWidth = 0.24;
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, a = t * Math.PI * 3.4, rr = 0.08 + t * (r - 0.36);
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.stroke();
  } else if (lv.tail === "stripes") {
    const bands = [k.accent, k.accent2, k.accent3, k.accent4, k.accent5];
    bands.forEach((col, i) => {
      c.fillStyle = col;
      c.fillRect(-23, 6.6 - (i + 1) * 0.86, 15, 0.62);
    });
  } else if (lv.tail === "sweep") {
    const g = c.createLinearGradient(-18, 0.4, -15, 6.2);
    g.addColorStop(0, k.tail);
    g.addColorStop(0.55, k.accent);
    g.addColorStop(1, k.tail);
    c.fillStyle = g;
    c.fillRect(-23, -2, 15, 10);
    c.strokeStyle = k.accent2;
    c.lineWidth = 0.14;
    c.beginPath();
    c.moveTo(-12.2, 0.3);
    c.quadraticCurveTo(-16.6, 2.4, -19.9, 6.5);
    c.stroke();
  } else if (lv.tail === "slant") {
    c.fillStyle = k.accent;
    c.beginPath();
    c.moveTo(-9, -1);
    c.lineTo(-22, -1);
    c.lineTo(-22, 2.8);
    c.closePath();
    c.fill();
    c.fillStyle = k.accent2;
    c.beginPath();
    c.arc(-17.2, 3.7, 0.5, 0, Math.PI * 2);
    c.fill();
  } else if (lv.tail === "wing") {
    // two abstract wing petals rising from the fin root
    for (const [col, tip, bend] of [[k.accent, [-20.1, 6.0], 1.6], [k.accent2, [-18.5, 6.4], 0.9]]) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(-15.6, 0.9);
      c.bezierCurveTo(-15.6 - bend, 2.4, tip[0] + 0.8, tip[1] - 1.6, ...tip);
      c.bezierCurveTo(tip[0] + 1.4, tip[1] - 0.8, -14.8 + bend * 0.2, 2.6, -15.6, 0.9);
      c.fill();
    }
  } else if (lv.tail === "band") {
    // a white stripe parallel to the leading edge
    c.fillStyle = k.accent;
    c.beginPath();
    c.moveTo(-12.24, -1);
    c.lineTo(-13.04, -1);
    c.lineTo(-20.0, 7.3);
    c.lineTo(-19.2, 7.3);
    c.closePath();
    c.fill();
  } else if (lv.tail === "waves") {
    for (const [col, base, amp, ph] of [[k.accent, 2.5, 0.28, 0], [k.accent2, 1.2, 0.22, 1.7]]) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(-22, -1);
      wave(c, base, amp, ph);
      c.lineTo(-9, -1);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = "#ffffff";
    c.lineWidth = 0.12;
    for (const [base, ph] of [[3.4, 0.6], [4.3, 2.2]]) {
      c.beginPath();
      wave(c, base, 0.2, ph);
      c.stroke();
    }
  } else if (lv.tail === "sun") {
    // the classic sun-and-S logo
    c.fillStyle = k.accent;
    c.beginPath();
    c.arc(-17.1, 3.4, 1.15, 0, Math.PI * 2);
    c.fill();
    c.translate(-17.1, 3.4);
    c.scale(1, -1);
    c.fillStyle = k.tail;
    c.font = "900 1.7px 'Space Grotesk', 'Arial Black', sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("S", 0, 0.08);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function paintTitle(c, w, h, lv) {
  c.clearRect(0, 0, w, h);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = lv.colors.title;
  c.font = "900 92px 'Space Grotesk', 'Arial Black', sans-serif";
  if (lv.id === "ssun") {
    c.fillText("SSUN AIR", w / 2 - 70, h / 2 + 4);
    c.fillStyle = lv.colors.accent2;
    c.font = "800 58px sans-serif";
    c.fillText("쑨에어", w / 2 + 330, h / 2 + 6);
  } else c.fillText(lv.title, w / 2, h / 2 + 4, w * 0.94);
}
/** A rounded window or door outline as an alpha texture. */
const roundedTexture = (w, h, r, fill, stroke = null, lw = 0) =>
  canvasTexture(w, h, (c) => {
    c.beginPath();
    c.roundRect(lw / 2 + 1, lw / 2 + 1, w - lw - 2, h - lw - 2, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw;
      c.stroke();
    }
  });

/** Recolours an airliner in place: livery materials and the painted textures are owned by each plane. */
export function applyLivery(plane, lv) {
  const u = plane.userData, p = u.paint, k = lv.colors, metal = !!lv.metal;
  for (const key of ["body", "belly", "cheat", "stripe", "engine", "band", "winglet"]) if (k[key]) p[key].color.set(k[key]);
  for (const m of u.cheat) m.visible = !!k.cheat;
  for (const m of u.stripe) m.visible = !!k.stripe;
  for (const m of [p.fin, p.rudder, p.engine, p.winglet, p.cheat]) {
    m.metalness = metal ? 0.55 : 0.08;
    m.roughness = metal ? 0.3 : 0.48;
  }
  const t = u.textures;
  paintFin(t.fin.image.getContext("2d"), t.fin.image.width, t.fin.image.height, lv);
  paintTitle(t.title.image.getContext("2d"), t.title.image.width, t.title.image.height, lv);
  for (const tex of Object.values(t)) tex.needsUpdate = true;
  u.livery = lv.id;
}

/** Twin-engine single-aisle jet in one of the fictional liveries. Origin at the main wheels, nose +x. */
export function airlinerModel(F, livery = getLivery()) {
  const plane = new T.Group(), body = new T.Group();
  plane.add(body);
  // longer gear legs lift the airframe so the tail clears the runway up to the 13° tailstrike limit
  const lift = 0.8;
  body.position.y = lift;
  const grey = F.mat(0xb9bfc2, 0.5, 0.35), dark = F.mat(0x22282d, 0.4, 0.2), metalMat = F.mat(0x9aa3a8, 0.32, 0.75);
  // wings a shade darker than the fuselage, with bright moving surfaces
  const wingMat = F.mat(0xd7dde1, 0.5, 0.15), flapMat = F.mat(0xa9b4bb, 0.5, 0.3), spoilerMat = F.mat(0x8c979e, 0.5, 0.3),
    moveMat = F.mat(0xf2b632, 0.45, 0.05);
  // livery paint is per plane (not from the shared factory cache) so it can be recoloured on its own
  const coat = (map = null) => new T.MeshStandardMaterial({ color: map ? 0xffffff : 0xf6f7f4, map, roughness: 0.48, metalness: 0.08 });
  const textures = { fin: canvasTexture(640, 364, () => {}), title: canvasTexture(1024, 128, () => {}) };
  const paint = { body: coat(), belly: coat(), cheat: coat(), stripe: coat(), engine: coat(), band: coat(), winglet: coat(), fin: coat(textures.fin), rudder: coat(textures.fin) };
  for (const m of [flapMat, spoilerMat, moveMat, paint.rudder]) m.userData.edge = dark;
  const decal = (map, extra = {}) => new T.MeshStandardMaterial({ map, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, ...extra });

  // fuselage: painted upper skin and belly share one profile; stations bunch up at the nose and tail cone
  const xs = [];
  for (let i = 0; i <= 18; i++) xs.push(lerp(TAIL, CONE, i / 18));
  for (let i = 1; i <= 6; i++) xs.push(lerp(CONE, NOSE - NOSE_LEN, i / 6));
  for (let i = 1; i <= 26; i++) xs.push(NOSE - NOSE_LEN * pw(1 - i / 26, 1.7));
  const seam = Math.PI / 2 + 0.42;
  F.mesh(skinGeometry(xs, -seam, seam, 48), paint.body, body);
  F.mesh(skinGeometry(xs, seam, Math.PI * 2 - seam, 16), paint.belly, body);
  // APU exhaust closing the tail cone
  const apu = F.mesh(new T.CircleGeometry(0.3, 18), dark, body, [TAIL - 0.01, fuselageSection(TAIL).yc, 0]);
  apu.rotation.y = -Math.PI / 2;
  apu.scale.y = 1.05;
  // cockpit glazing: windshield, sliding side window and the small aft pane, both sides
  const cockpit = [];
  for (const s of [-1, 1]) {
    const q = (aftTop, fwdTop, aftBot, fwdBot) => {
      cockpit.push({ c: [aftTop, fwdTop, aftBot, fwdBot].map(([x, t]) => [x, s * t]), nx: 6, nt: 8 });
    };
    q([15.22, 0.07], [15.62, 0.07], [15.5, 1.14], [16.08, 1.08]); // windshield, wrapping round to the centre post
    q([14.5, 0.93], [15.32, 0.95], [14.5, 1.2], [15.42, 1.18]); // sliding side window
    q([13.8, 0.93], [14.38, 0.93], [13.8, 1.2], [14.38, 1.2]); // aft pane
  }
  F.mesh(decalGeometry(cockpit, 0.02), new T.MeshStandardMaterial({ color: 0x16222b, roughness: 0.12, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), body).castShadow = false;
  // cabin windows, doors with outlines, overwing exits
  const windowMat = decal(roundedTexture(32, 44, 13, "#1d2a33"), { alphaTest: 0.4, transparent: false });
  const doorMat = decal(roundedTexture(64, 128, 16, null, "#6d777d", 5), { alphaTest: 0.4, transparent: false });
  const wins = [], doors = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k <= 17; k++) {
      const x = 9.0 - k * 0.95;
      wins.push(rect(x - 0.15, x + 0.15, 1.15, 1.37, s));
    }
    for (const x of [10.05, -8.05]) doors.push(rect(x - 0.42, x + 0.42, 1.1, 2.08, s, 1, 4));
    for (const x of [0.45, -0.5]) doors.push(rect(x - 0.3, x + 0.3, 1.04, 1.62, s, 1, 2));
  }
  F.mesh(decalGeometry(wins, 0.01), windowMat, body).castShadow = false;
  F.mesh(decalGeometry(doors, 0.012), doorMat, body).castShadow = false;
  // cheatline and pinstripe, following the skin from nose to tail cone
  const cheat = [], stripe = [];
  for (const s of [-1, 1]) {
    cheat.push(F.mesh(decalGeometry([rect(-16.6, 15.7, 1.72, 1.88, s, 60, 1)], 0.008), paint.cheat, body));
    stripe.push(F.mesh(decalGeometry([rect(-15.8, 14.8, 1.94, 2.0, s, 60, 1)], 0.008), paint.stripe, body));
  }
  for (const m of [...cheat, ...stripe]) {
    m.castShadow = false;
    Object.assign(m.material, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  const titleMat = decal(textures.title);
  for (const s of [-1, 1]) F.mesh(decalGeometry([rect(-3.6, 6.2, 0.55, 1.12, s, 16, 4)], 0.014), titleMat, body).castShadow = false;

  // wings with flaps, spoilers and ailerons in cut-outs, blended sharklets, engines and pylons
  const surf = { ailerons: [], flaps: [], spoilers: [], elevators: [], rudder: null };
  const [[f0, f1, fc], [f2, f3, fc2]] = FLAPS, [a0, a1, ac] = AILERON;
  const wingSecs = [wingSec(0), wingSec(f0), wingSec(f0, fc, true), wingSec(f1, fc), wingSec(f1, null, true), wingSec(WING.kink),
    wingSec(f2), wingSec(f2, fc2, true), wingSec(f3, fc2), wingSec(f3, null, true), wingSec(a0), wingSec(a0, ac, true),
    wingSec(a1, ac), wingSec(a1, null, true), wingSec(WING.tip)];
  // sharklet: curves up from the tip, sweeps back and tapers
  const tipY = wingY(WING.tip), sharklet = [wingSec(WING.tip)];
  for (const [dz, dy, dx, c, t, tilt] of [[0.22, 0.05, -0.18, 1.32, 0.15, 30], [0.42, 0.3, -0.42, 1.18, 0.13, 62], [0.55, 0.75, -0.8, 1.02, 0.11, 80], [0.72, 2.45, -2.25, 0.5, 0.06, 84]])
    sharklet.push({ le: [wingLE(WING.tip) + dx, tipY + dy, WING.tip + dz], c, t, n: [0, Math.cos(tilt * DEG), -Math.sin(tilt * DEG)] });
  const stabSecs = [stabSec(0), stabSec(0.9), stabSec(0.9, 0.68, true), stabSec(5.9, 0.68), stabSec(5.9, null, true), stabSec(STAB.span)];
  for (const s of [-1, 1]) {
    F.mesh(loftGeometry(wingSecs, { side: s, cap: false }), wingMat, body);
    F.mesh(loftGeometry(sharklet, { side: s }), paint.winglet, body);
    surf.ailerons.push({ side: s, pivot: controlSurface(F, body, wingSec(a0, ac), wingSec(a1, ac), moveMat, { side: s }) });
    for (const [z0, z1, cut] of FLAPS) {
      surf.flaps.push(controlSurface(F, body, wingSec(z0, cut), wingSec(z1, cut), flapMat, { side: s }));
      // spoilers sit on the upper skin just ahead of each flap
      const sp = (z) => ({ ...wingSec(z), cut: wingLE(z) - 0.5 * (wingLE(z) - wingTE(z)) });
      surf.spoilers.push(controlSurface(F, body, sp(z0 + 0.2), sp(z1 - 0.2), spoilerMat, { side: s, top: true, chord: 0.2 * (wingLE((z0 + z1) / 2) - wingTE((z0 + z1) / 2)) }));
    }
    F.mesh(loftGeometry(stabSecs, { side: s }), wingMat, body);
    surf.elevators.push(controlSurface(F, body, stabSec(0.9, 0.68), stabSec(5.9, 0.68), moveMat, { side: s }));
    // flap track fairings
    for (const z of [4.1, 8.2, 10.9]) {
      const fair = F.mesh(F.ball, grey, body, [wingTE(z) + 0.15, wingY(z) - 0.26, s * z], [1.25, 0.2, 0.15]);
      fair.rotation.z = 0.06;
    }
    // engine: nacelle lathed around x, hung on a pylon slightly ahead of the leading edge
    const ez = 5.75, eng = new T.Group();
    eng.position.set(2.2, 1.75, s * ez);
    body.add(eng);
    const lathe = (pts, mat, segs = 32) => {
      const g = new T.LatheGeometry(pts.map(([r, x]) => new T.Vector2(r, x)), segs);
      g.rotateZ(-Math.PI / 2);
      return F.mesh(g, mat, eng);
    };
    const cowl = [[0.8, -2.15], [0.9, -1.6], [0.99, -0.9], [1.06, -0.1], [1.09, 0.6], [1.08, 1.3], [1.04, 1.85], [0.99, 2.12], [0.93, 2.22]];
    lathe(cowl, paint.engine);
    lathe(cowl.slice(3, 6).map(([r, x]) => [r + 0.008, x]), paint.band);
    lathe([[0.93, 2.22], [0.88, 2.2], [0.85, 2.1], [0.86, 1.6], [0.86, 1.45]], metalMat);
    const fan = F.mesh(new T.CircleGeometry(0.87, 32), dark, eng, [1.5, 0, 0]);
    fan.rotation.y = Math.PI / 2;
    lathe([[0.001, 2.05], [0.12, 1.98], [0.26, 1.78], [0.3, 1.52]].reverse(), F.mat(0xd8dcde, 0.3, 0.5), 20);
    lathe([[0.62, -2.75], [0.7, -2.4], [0.8, -2.15]], metalMat);
    lathe([[0.001, -3.45], [0.3, -3.1], [0.5, -2.75], [0.55, -2.5]], F.mat(0x5d666c, 0.4, 0.6), 20);
    const pylon = new T.Shape();
    const wy = wingY(ez) - 1.75, le = wingLE(ez) - 2.2, te = wingTE(ez) - 2.2;
    pylon.moveTo(1.5, 0.95);
    pylon.lineTo(le + 0.2, wy - 0.02);
    pylon.lineTo(te + 0.3, wy - 0.05);
    pylon.quadraticCurveTo(te - 0.3, wy - 0.35, te + 0.6, wy - 0.6);
    pylon.lineTo(-2.9, 0.74);
    pylon.lineTo(-1.8, 0.8);
    pylon.closePath();
    const pg = new T.ExtrudeGeometry(pylon, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
    pg.translate(0, 0, -0.17);
    F.mesh(pg, paint.body, eng);
  }
  // belly fairing smoothing the wing root into the lower fuselage
  F.mesh(F.ball, paint.belly, body, [0.6, 2.5, 0], [6.4, 0.66, 2.12]).castShadow = false;
  // vertical fin painted with the livery's tail pattern; the rudder shares the texture
  const finSecs = [finSec(-0.7), finSec(RUDDER.y0), finSec(RUDDER.y0, true, true), finSec(0.4, true), finSec(0.7, true), finSec(1.1, true), finSec(RUDDER.y1, true), finSec(RUDDER.y1, false, true), finSec(6.6)];
  F.mesh(loftGeometry(finSecs, { uvAt: finUV }), paint.fin, body);
  surf.rudder = controlSurface(F, body, finSec(RUDDER.y0, true), finSec(RUDDER.y1, true), paint.rudder, { vertical: true, uvAt: finUV });
  // landing gear (retractable): twin-wheel mains under the wing roots, nose gear under the cockpit
  const gear = new T.Group();
  gear.position.y = -lift;
  body.add(gear);
  const tyre = new T.CylinderGeometry(0.58, 0.58, 0.42, 18);
  tyre.rotateX(Math.PI / 2);
  const hub = new T.CylinderGeometry(0.3, 0.3, 0.44, 12);
  hub.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const z = s * 3.8, top = wingY(3.8) + lift - 0.25;
    F.rod(gear, [0, 0.58, z], [0.05, top, z], 0.17, grey);
    F.rod(gear, [0, 1.9, z], [-0.05, top - 0.2, s * 2.1], 0.08, grey); // side brace
    F.rod(gear, [0, 0.58, z - 0.3], [0, 0.58, z + 0.3], 0.1, grey);
    F.cube(gear, [1.1, 1.9, 0.05], [0.05, top - 1.15, z + s * 0.24], paint.belly); // gear door
    for (const o of [-0.28, 0.28]) {
      F.mesh(tyre, dark, gear, [0, 0.58, z + o]);
      F.mesh(hub, grey, gear, [0, 0.58, z + o]);
    }
  }
  const noseX = 13, noseTyre = new T.CylinderGeometry(0.4, 0.4, 0.28, 16);
  noseTyre.rotateX(Math.PI / 2);
  F.rod(gear, [noseX, 0.42, 0], [noseX + 0.1, fuselageSection(noseX).yc - fuselageSection(noseX).b + lift + 0.2, 0], 0.13, grey);
  F.rod(gear, [noseX, 0.42, -0.22], [noseX, 0.42, 0.22], 0.08, grey);
  for (const o of [-0.2, 0.2]) F.mesh(noseTyre, dark, gear, [noseX, 0.42, o]);
  // navigation lights
  const lamp = (color, pos) => F.mesh(new T.SphereGeometry(0.2, 8, 6), new T.MeshBasicMaterial({ color }), body, pos);
  lamp(0xff3030, [wingLE(WING.tip) - 0.4, tipY + 0.05, -(WING.tip + 0.15)]);
  lamp(0x30ff70, [wingLE(WING.tip) - 0.4, tipY + 0.05, WING.tip + 0.15]);
  const strobe = lamp(0xffffff, [TAIL - 0.1, fuselageSection(TAIL).yc + 0.4, 0]);
  const beacon = lamp(0xff2020, [-2, CY + R + 0.05, 0]);
  const landing = [lamp(0xfff6d8, [wingLE(2.6) - 0.25, wingY(2.6) - 0.05, 2.6]), lamp(0xfff6d8, [wingLE(2.6) - 0.25, wingY(2.6) - 0.05, -2.6])];
  plane.userData = { body, gear, strobe, beacon, landing, surf, paint, textures, cheat, stripe, deflect: { aileron: 0, elevator: 0, rudder: 0, flaps: 0, spoilers: 0 } };
  plane.rotation.order = "YZX";
  applyLivery(plane, livery);
  return plane;
}

/** Renders the airliner in each livery from a 3/4 front view into PNG data URLs for the livery picker. */
export function renderLiveryShots(ids, width = 480, height = 200) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  try {
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene(), F = new Factory();
    scene.add(new T.HemisphereLight(0xe2efff, 0x8a8f86, 2.1));
    const sun = new T.DirectionalLight(0xfff0d6, 2.4);
    sun.position.set(30, 50, 40);
    scene.add(sun);
    const plane = airlinerModel(F);
    plane.userData.landing.forEach((m) => (m.visible = false));
    scene.add(plane);
    const camera = new T.PerspectiveCamera(17, width / height, 1, 1000);
    camera.position.set(40, 13.5, 56.5);
    camera.lookAt(-1.2, 3.6, 0);
    const shots = {};
    for (const id of ids) {
      applyLivery(plane, getLivery(id));
      renderer.render(scene, camera);
      shots[id] = canvas.toDataURL("image/png");
    }
    plane.traverse((o) => {
      o.geometry?.dispose();
      if (o.material?.map) o.material.map.dispose();
    });
    return shots;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

const lightPoints = (positions, color, size = 4) => {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  return new T.Points(geo, new T.PointsMaterial({ color, size, sizeAttenuation: false, depthWrite: false, transparent: true }));
};

export class RunwayView {
  constructor(canvas, game, { preview = false, livery } = {}) {
    this.canvas = canvas;
    this.game = game;
    this.preview = preview;
    this.F = new Factory();
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(50, 1, 1.5, 30000);
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.dead = false;
    this.clock = 0;
    this.shake = 0;
    this.smoke = [];
    this.lights();
    this.airport();
    this.plane = airlinerModel(this.F, getLivery(livery));
    this.scene.add(this.plane);
    this.particles();
    this.resize();
    this.cameraReady = false;
    this.render(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.dataset.renderer = "WebGL 3D";
  }
  lights() {
    const sky = 0x9cc3e4;
    this.scene.background = new T.Color(sky);
    this.scene.fog = new T.Fog(0xc4d8e6, 2500, 16000);
    this.hemi = new T.HemisphereLight(0xe2efff, 0x7c8a5a, 2.0);
    this.scene.add(this.hemi);
    this.sun = new T.DirectionalLight(0xfff0d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
  }
  airport() {
    const F = this.F, root = new T.Group(), rand = rng(1404);
    this.scene.add(root);
    this.root = root;
    const grass = noiseTexture(["#7d9a52", "#89a65b", "#71904a", "#94ad62"], 128, 14);
    grass.repeat.set(900, 900);
    const ground = F.mesh(new T.PlaneGeometry(40000, 40000), new T.MeshStandardMaterial({ color: 0xc4cfa0, map: grass, roughness: 1 }), root, [L / 2, -0.6, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const flat = (w, d, x, z, mat, y = 0.03) => {
      const m = F.mesh(new T.PlaneGeometry(w, d), mat, root, [x, y, z]);
      m.rotation.x = -Math.PI / 2;
      m.castShadow = false;
      return m;
    };
    const asphaltTex = noiseTexture(["#55595c", "#5e6265", "#4c5053", "#666a6d"], 128, 22);
    asphaltTex.repeat.set(L / 40, 2);
    const asphalt = new T.MeshStandardMaterial({ color: 0xd8dcdd, map: asphaltTex, roughness: 0.92 });
    const concrete = new T.MeshStandardMaterial({ color: 0xa9adab, map: asphaltTex, roughness: 0.95 });
    flat(L + 240, W + 18, L / 2, 0, concrete, 0.02); // shoulders and blast pads
    flat(L, W, L / 2, 0, asphalt, 0.04);
    // ICAO-style markings, mirrored for both ends
    const white = [], yellow = [], y = 0.07;
    const mark = (list, x0, x1, z, w) => list.push({ p: [(x0 + x1) / 2, y, z], s: [Math.abs(x1 - x0), 0.02, w] });
    const end = (f) => {
      // f maps a distance from this threshold to world x
      for (let i = 0; i < 8; i++) for (const s of [-1, 1]) mark(white, f(6), f(36), s * (1.8 + i * 3.6), 1.8);
      for (const s of [-1, 1]) mark(white, f(RWY.aim), f(RWY.aim + 50), s * 13, 9);
      for (const [d, n] of [[150, 3], [300, 3], [600, 2], [750, 2], [900, 1], [1050, 1]])
        for (let i = 0; i < n; i++) for (const s of [-1, 1]) mark(white, f(d), f(d + 22.5), s * (9 + i * 3.3), 1.8);
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) mark(yellow, f(-8 - i * 18), f(-18 - i * 18), s * 7, 3);
    };
    end((d) => d);
    end((d) => L - d);
    for (let x = 100; x < L - 130; x += 50) mark(white, x, x + 30, 0, 0.9);
    for (const s of [-1, 1]) mark(white, 0, L, s * (W / 2 - 0.6), 0.9);
    const paint = new T.MeshStandardMaterial({ color: 0xf2f2ec, roughness: 0.7 });
    const paintY = new T.MeshStandardMaterial({ color: 0xe8c33a, roughness: 0.7 });
    for (const [list, m] of [[white, paint], [yellow, paintY]]) this.F.batch(root, list, m).castShadow = false;
    // runway designations: read from the approach, number above the L/R letter
    const designation = (text, letter) =>
      canvasTexture(256, 512, (c, w, h) => {
        c.fillStyle = "#f2f2ec";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = "700 230px 'Arial Narrow', 'Roboto Condensed', sans-serif";
        c.save();
        c.scale(0.62, 1);
        c.fillText(text, w / 2 / 0.62, h * 0.27);
        c.fillText(letter, w / 2 / 0.62, h * 0.74);
        c.restore();
      });
    for (const [text, letter, x, turn] of [["14", "R", 75, -1], ["32", "L", L - 75, 1]]) {
      const g = new T.PlaneGeometry(13, 26);
      g.rotateX(-Math.PI / 2);
      g.rotateY((turn * Math.PI) / 2);
      const m = new T.Mesh(g, new T.MeshStandardMaterial({ map: designation(text, letter), transparent: true, roughness: 0.7, depthWrite: false }));
      m.position.set(x, 0.08, 0);
      m.receiveShadow = true;
      root.add(m);
    }
    // parallel taxiway, connectors, apron
    const twyZ = -185, taxi = new T.MeshStandardMaterial({ color: 0xc6cacb, map: asphaltTex, roughness: 0.95 });
    flat(L + 200, 26, L / 2, twyZ, taxi, 0.025);
    const twyLine = [], blue = [];
    for (let x = -80; x < L + 100; x += 4) twyLine.push({ p: [x, 0.06, twyZ], s: [2.6, 0.02, 0.4] });
    for (const cx of [60, 700, 1350, 2000, 2600, L - 60]) {
      flat(25, Math.abs(twyZ) - W / 2, cx, (twyZ - W / 2) / 2, taxi, 0.022);
      for (let z = -W / 2 - 4; z > twyZ; z -= 5) twyLine.push({ p: [cx, 0.06, z], s: [0.4, 0.02, 2.8] });
      // holding point bars
      for (const o of [-1.2, 1.2, -3, 3]) twyLine.push({ p: [cx + (o > 0 ? 1 : -1) * 0, 0.065, -W / 2 - 75 + o], s: [24, 0.02, 0.35] });
    }
    for (let x = -80; x < L + 100; x += 60) blue.push(x, 1, twyZ - 14, x, 1, twyZ + 14);
    F.batch(root, twyLine, paintY).castShadow = false;
    flat(1800, 230, 1500, -330, concrete, 0.02);
    // terminal, tower, hangars
    const term = new T.Group();
    term.position.set(1500, 0, -470);
    root.add(term);
    F.cube(term, [980, 18, 34], [0, 9, 0], F.mat(0xe6e3dc, 0.6));
    F.cube(term, [990, 1.6, 40], [0, 18.6, 0], F.mat(0x9ea6ab, 0.4, 0.3));
    const glassMat = F.mat(0x5b7a90, 0.12, 0.6);
    F.cube(term, [960, 9, 0.6], [0, 9, 17.2], glassMat);
    for (let i = -6; i <= 6; i++) {
      F.cube(term, [4, 4, 34], [i * 72, 6, 35], F.mat(0xd6d6d0, 0.5, 0.2));
      F.cube(term, [6, 7, 6], [i * 72, 3.5, 54], F.mat(0xc9ccc9, 0.5, 0.2));
    }
    const sign = canvasTexture(1024, 128, (c, w, h) => {
      c.fillStyle = "#24435a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#fff";
      c.font = "700 70px sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("김포 · GIMPO  SSUN TERMINAL", w / 2, h / 2 + 4);
    });
    F.mesh(new T.PlaneGeometry(120, 15), new T.MeshBasicMaterial({ map: sign }), term, [0, 23, 17.4]);
    F.cube(term, [122, 17, 1], [0, 23, 16.8], F.mat(0x24435a));
    const tower = new T.Group();
    tower.position.set(2350, 0, -300);
    root.add(tower);
    F.mesh(new T.CylinderGeometry(3.2, 4.4, 52, 18), F.mat(0xe9e7e0, 0.6), tower, [0, 26, 0]);
    F.mesh(new T.CylinderGeometry(8.6, 6.4, 4, 12), F.mat(0xd6d4cf, 0.5), tower, [0, 53, 0]);
    F.mesh(new T.CylinderGeometry(8.2, 8.6, 5.5, 12), F.mat(0x3c5b70, 0.1, 0.6), tower, [0, 57.7, 0]);
    F.mesh(new T.CylinderGeometry(9.2, 8.4, 1.4, 12), F.mat(0xcfd2d2, 0.4, 0.3), tower, [0, 61.1, 0]);
    F.rod(tower, [0, 61.6, 0], [0, 70, 0], 0.25, 0xd23c2a);
    for (let i = 0; i < 3; i++) {
      const hx = 2700 + i * 115, hz = -330;
      F.cube(root, [100, 22, 70], [hx, 11, hz], F.mat(0xdedfd9, 0.6, 0.15));
      const roof = F.mesh(new T.CylinderGeometry(35, 35, 100, 20, 1, false, 0, Math.PI), F.mat(0xb7c0c4, 0.4, 0.4), root, [hx, 22, hz]);
      roof.rotation.z = Math.PI / 2;
      roof.scale.set(0.35, 1, 1);
    }
    // parked airliners at the gates
    for (const [x, rot, id] of [[1180, 0, "saekdong"], [1396, 0, "skyblue"], [1756, 0, "tangerine"]]) {
      const p = airlinerModel(F, getLivery(id));
      p.userData.landing.forEach((m) => (m.visible = false));
      p.position.set(x, 0, -385);
      p.rotation.y = Math.PI / 2 + rot;
      root.add(p);
    }
    // apartment blocks and the hills beyond (northern Seoul feel)
    const blocks = [], blocks2 = [];
    for (let i = 0; i < 160; i++) {
      const side = i % 3 === 0 ? -1 : 1, x = -1500 + rand() * (L + 4000), z = side * (900 + rand() * 2600), h = 25 + rand() * 60;
      (i % 4 ? blocks : blocks2).push({ p: [x, h / 2, z], s: [55 + rand() * 30, h, 14], r: [0, (rand() - 0.5) * 0.4, 0] });
    }
    F.batch(root, blocks, F.mat(0xeeebe2, 0.8)).castShadow = false;
    F.batch(root, blocks2, F.mat(0xd9d2c4, 0.8)).castShadow = false;
    const hills = [];
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = 7000 + rand() * 7000, h = 300 + rand() * 650;
      hills.push({ p: [L / 2 + Math.cos(a) * r, h * 0.45, Math.sin(a) * r], s: [1200 + rand() * 1800, h, 1200 + rand() * 1600], r: [0, rand() * 3, 0] });
    }
    F.batch(root, hills, F.mat(0x6e8790, 0.95), new T.ConeGeometry(0.5, 1, 7)).castShadow = false;
    const river = flat(30000, 900, L / 2, 3400, new T.MeshStandardMaterial({ color: 0x7ea9c4, roughness: 0.3, metalness: 0.1 }), 0.5);
    river.receiveShadow = false;
    // lights: edges, threshold/end bars, approach lights and the PAPI
    const edge = [], green = [], red = [], approach = [];
    for (let x = 0; x <= L; x += 60) for (const s of [-1, 1]) edge.push(x, 0.5, s * (W / 2 + 1.5));
    for (let z = -W / 2; z <= W / 2; z += 3) { green.push(-1, 0.4, z); red.push(L + 1, 0.4, z); }
    for (let x = -900; x < -20; x += 30) for (let k = -2; k <= 2; k++) approach.push(x, 0.8, k * 1.1);
    for (let k = -14; k <= 14; k++) if (Math.abs(k) > 2) approach.push(-300, 0.8, k * 1.5);
    root.add(lightPoints(edge, 0xfff3cf, 3), lightPoints(green, 0x46ff7a, 4), lightPoints(red, 0xff3b30, 4), lightPoints(approach, 0xffffff, 3), lightPoints(blue, 0x3f6dff, 3));
    const papiPos = [];
    for (let i = 0; i < 4; i++) {
      const z = -(W / 2 + 15 + (3 - i) * 9);
      F.cube(root, [1.2, 1, 2.2], [RWY.papiX, 0.6, z], F.mat(0x30363a));
      papiPos.push(RWY.papiX + 0.7, 1, z);
    }
    this.papi = lightPoints(papiPos, 0xffffff, 7);
    this.papi.geometry.setAttribute("color", new T.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
    this.papi.material.vertexColors = true;
    root.add(this.papi);
    // windsock beside the touchdown zone
    const sock = new T.Group();
    sock.position.set(320, 0, 75);
    root.add(sock);
    F.rod(sock, [0, 0, 0], [0, 7, 0], 0.12, 0xdadada);
    this.sock = F.mesh(new T.ConeGeometry(0.7, 4.5, 10, 1, true), F.mat(0xf06a2b, 0.7), sock, [2.2, 7, 0]);
    this.sock.rotation.z = -Math.PI / 2;
    this.sockRoot = sock;
  }
  particles() {
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(new Float32Array(300 * 3), 3));
    this.smokePoints = new T.Points(geo, new T.PointsMaterial({ color: 0xe4e4e0, size: 2.6, transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(this.smokePoints);
  }
  puff(n, spread = 1, life = 1.6) {
    const p = this.plane.position;
    for (let i = 0; i < n; i++)
      this.smoke.push({ x: p.x + (Math.random() - 0.5) * 2, y: 0.6 + Math.random(), z: p.z + (Math.random() < 0.5 ? -3.8 : 3.8) * (spread > 2 ? Math.random() : 1), vx: -4 + Math.random() * 6, vy: 0.6 + Math.random() * spread, vz: (Math.random() - 0.5) * 3 * spread, life });
  }
  handle(e) {
    if (e.type === "touchdown") {
      this.shake = Math.min(1.2, e.fpm / 500);
      this.puff(60);
    }
    if (e.type === "fail" || (e.type === "stage" && e.stage === "landing" && !e.ok && this.game.landing?.reason !== "goaround")) {
      this.shake = 1.5;
      this.puff(160, 6, 3.5);
    }
  }
  /** Ailerons, elevators and rudder follow the controls; flaps and spoilers follow the phase of flight. */
  animateSurfaces(dt) {
    const g = this.game, a = g.ac, u = this.plane.userData, d = u.deflect, S = u.surf, to = g.stage === "takeoff";
    const ldgReason = g.landing?.reason, onGround = a.h <= 0.05;
    let rudder;
    if (to && a.ground) rudder = -g.wind.cross * 1.6; // hold the centreline against the crosswind
    else if (!to && (g.phase === "roll" || (onGround && g.phase === "result")) || (!to && a.h < 8)) rudder = -g.crab * 3; // kick out the crab
    else rudder = g.ctl.roll * 6;
    const flaps = g.flapDeg ?? 15; // the pilot's flap lever
    const spoilers = onGround && (g.phase === "roll" || (g.phase === "result" && ldgReason !== "goaround" && (!to || g.takeoff?.ok === false))) ? 55 : 0;
    d.aileron = approach(d.aileron, g.ctl.roll * 22, 90, dt);
    d.elevator = approach(d.elevator, g.ctl.pitch * 22, 90, dt);
    d.rudder = approach(d.rudder, clamp(rudder, -25, 25), 40, dt);
    d.flaps = this.cameraReady ? approach(d.flaps, flaps, 14, dt) : flaps;
    d.spoilers = approach(d.spoilers, spoilers, 120, dt);
    for (const s of S.ailerons) s.pivot.rotation.z = -s.side * d.aileron * DEG;
    for (const p of S.elevators) p.rotation.z = -d.elevator * DEG;
    for (const p of S.flaps) p.rotation.z = d.flaps * DEG;
    for (const p of S.spoilers) p.rotation.z = -d.spoilers * DEG;
    S.rudder.rotation.y = d.rudder * DEG;
  }
  /** Repaints the player's aircraft without rebuilding the scene. */
  setLivery(id) {
    applyLivery(this.plane, getLivery(id));
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = this.camera.aspect < 0.8 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    const g = this.game, a = g.ac, p = this.plane, u = p.userData;
    p.position.set(a.x, Math.max(0, a.h), a.z);
    p.rotation.set(a.bank * DEG, -a.psi, a.pitch * DEG);
    u.gear.visible = a.gear;
    this.animateSurfaces(dt);
    u.strobe.visible = Math.sin(this.clock * 7) > 0.85;
    u.beacon.visible = Math.sin(this.clock * 4.2 + 1) > 0.4;
    // PAPI shows what the pilot's eye sees
    const col = this.papi.geometry.attributes.color, lights = g.papi;
    lights.forEach((white, i) => col.setXYZ(i, 1, white ? 1 : 0.13, white ? 1 : 0.1));
    col.needsUpdate = true;
    const wdir = (g.wind.dir - RWY.heading) * DEG;
    this.sockRoot.rotation.y = Math.PI - wdir;
    this.sock.rotation.x = Math.sin(this.clock * 3) * 0.08;
    // camera: chase behind along the runway so the crab angle and the runway are both visible.
    // Distances fit the wingspan to the screen width, so portrait phones sit further back.
    const portrait = this.camera.aspect < 0.8, fit = (half) => half / (Math.tan((this.camera.fov / 2) * DEG) * this.camera.aspect),
      back = Math.max(44, fit(21)), up = portrait ? 14 : 11;
    // takeoff roll: tuck in low behind the tail as the speed builds, then ease back out from rotation
    const close = g.stage === "takeoff" && g.phase === "fly" && a.ground ? smooth(15, 90, g.ias) * (1 - smooth(1, 9, a.pitch)) : 0;
    this.close = this.cameraReady ? approach(this.close ?? 0, close, close > (this.close ?? 0) ? 0.5 : 0.3, dt) : close;
    const c = smooth(0, 1, this.close), cBack = lerp(back, Math.max(32, fit(17)), c), cUp = lerp(up, 7.5, c);
    if (this.preview) {
      V.set(a.x + 34, 9, a.z + 46);
      LOOK.set(a.x - 2, 4, a.z);
    } else if (g.phase === "result" || g.phase === "clear") {
      const k = this.clock * 0.12;
      V.set(a.x + Math.cos(k) * 70 - 20, Math.max(6, a.h + 14), a.z + Math.sin(k) * 70 + 30);
      LOOK.set(a.x, Math.max(2, a.h + 3), a.z);
    } else if (g.stage === "takeoff") {
      V.set(a.x - cBack, Math.max(a.h, 0) + cUp - 2 * (1 - c), a.z + (portrait ? 0 : lerp(6, 5, c)));
      LOOK.set(a.x + lerp(60, 70, c), Math.max(a.h, 0) + lerp(2, 1, c), a.z);
    } else {
      const ahead = 320;
      V.set(a.x - back, a.h + up, a.z * 0.85);
      LOOK.set(a.x + ahead, Math.max(0, a.h - ahead * Math.tan(3.2 * DEG)) + 2, a.z * 0.6);
    }
    if (!this.cameraReady) {
      this.camera.position.copy(V);
      this.look = LOOK.clone();
      this.cameraReady = true;
    } else {
      const k = 1 - Math.exp(-dt * (g.phase === "fly" ? 6 : 2));
      this.camera.position.lerp(V, k);
      this.look.lerp(LOOK, k);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.camera.position.z += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.look);
    this.sun.position.set(a.x - 120, Math.max(0, a.h) + 220, a.z + 160);
    this.sun.target.position.set(a.x, Math.max(0, a.h), a.z);
    // tyre smoke and debris
    const arr = this.smokePoints.geometry.attributes.position.array;
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.life <= 0) this.smoke.splice(i, 1);
    }
    this.smoke = this.smoke.slice(-300);
    for (let i = 0; i < 300; i++) {
      const s = this.smoke[i];
      arr[i * 3] = s?.x ?? 0;
      arr[i * 3 + 1] = s?.y ?? -999;
      arr[i * 3 + 2] = s?.z ?? 0;
    }
    this.smokePoints.geometry.attributes.position.needsUpdate = true;
  }
  render(dt) {
    if (this.dead) return;
    this.clock += dt;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.canvas.dataset.phase = this.game.phase;
    this.canvas.dataset.stage = this.game.stage;
  }
  destroy() {
    this.dead = true;
    this.observer?.disconnect();
    const geos = new Set(), mats = new Set(), textures = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
      if (o.material)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          mats.add(m);
          for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
        }
    });
    for (const v of geos) v.dispose();
    for (const v of mats) v.dispose();
    for (const v of textures) v.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
