import { clamp, rng } from './engine.js';

// Four stations, four different hands: rhythm chopping, heat balancing,
// al dente timing under a foaming pot, and a strength-controlled pan toss.
export const SAUCES = [
  { id:'tomato', name:'토마토', subtitle:'상큼한 토마토와 마늘', color:0xc8321d, light:0xff7a45, ingredients:['tomato','onion','garlic'] },
  { id:'cream', name:'크림', subtitle:'고소한 버섯과 베이컨', color:0xf0dfba, light:0xfff6e0, ingredients:['mushroom','bacon','onion'] },
  { id:'pesto', name:'바질 페스토', subtitle:'향긋한 바질과 마늘', color:0x4f8a2c, light:0x9cc95a, ingredients:['basil','garlic','mushroom'] },
  { id:'rose', name:'로제', subtitle:'토마토와 크림의 만남', color:0xe0755a, light:0xffb08f, ingredients:['tomato','bacon','onion'] },
];

// length: body along the knife axis, width: ideal slice, speed: feed under the knife (units/s).
export const INGREDIENTS = {
  tomato:  { name:'토마토', length:1.24, width:.27, speed:.52 },
  onion:   { name:'양파', length:1.08, width:.25, speed:.62 },
  garlic:  { name:'마늘', length:.82, width:.16, speed:.48 },
  mushroom:{ name:'버섯', length:.96, width:.22, speed:.6 },
  bacon:   { name:'베이컨', length:1.5, width:.26, speed:.78 },
  basil:   { name:'바질', length:1.1, width:.16, speed:.5 },
};

// Every plate is cooked for someone: a sauce they ordered and one thing they care about.
export const CUSTOMERS = [
  { id:'worker', name:'퇴근한 회사원', line:'오늘 하루 고생했어요. 면은 꼬들꼬들하게 부탁해요!', sauce:'tomato', want:'firm', ask:'꼬들꼬들한 면' },
  { id:'grandma', name:'옆집 할머니', line:'칼질 소리가 듣기 좋더라. 고르게 썰어 줘요.', sauce:'cream', want:'even', ask:'고른 칼질' },
  { id:'kid', name:'동네 꼬마', line:'팬 휙휙 하는 거 보여 주세요!', sauce:'rose', want:'show', ask:'토스 묘기' },
  { id:'critic', name:'깐깐한 미식가', line:'불향이 살아 있어야 합니다. 플람베, 할 수 있죠?', sauce:'pesto', want:'flambe', ask:'불향 플람베' },
  { id:'student', name:'배고픈 대학생', line:'칼질 묘기 보여 주시면 친구들 데려올게요!', sauce:'tomato', want:'combo', ask:'8연속 PERFECT' },
];
const WANTS = {
  firm:r => r.doneness >= 70 && r.doneness <= 76,
  even:r => r.slices > 0 && r.perfects / r.slices >= .8,
  show:r => r.tossPerfects === 3,
  flambe:r => r.flambe && r.burn < 1,
  combo:r => r.maxCombo >= 8,
};
export const FEVER_COMBO = 5;
export const FLAMBE_AT = 8.8;

export const PHASES = ['chop','saute','boil','toss'];
export const SAUTE_TIME = 13;
export const ALDENTE = [.70,.82];
export const BOIL_TIME = 10;
export const TOSS_HEIGHT = 2.5;

export function grade(thickness, width) {
  const e = (thickness - width) / width;
  if (Math.abs(e) <= .18) return { grade:'perfect', score:100 };
  if (Math.abs(e) <= .4) return { grade:'good', score:72 };
  return { grade:e > 0 ? 'thick' : 'thin', score:25 };
}
// Al dente sits a little past the middle of a curve that speeds up as the pasta softens.
export const doneness = t => Math.pow(Math.max(0, t) / BOIL_TIME, 1.25);
export function sauteZone(t) {
  return { center:.55 + .13 * Math.sin(t * .62) + .05 * Math.sin(t * 1.7 + 1), half:.12 };
}

export class PastaGame {
  constructor(seed = Date.now()) {
    this.random = rng(seed);
    this.recipe = SAUCES[0];
    this.phase = 'recipe';
    this.state = 'intro';
    this.clock = 0;
    this.stateTime = 0;
    this.events = [];
    this.result = null;
    // the LCG's first draw barely moves with nearby seeds, so take its low digits
    this.customer = CUSTOMERS[Math.floor((this.random() * 9973) % 1 * CUSTOMERS.length)];
    this.recipe = SAUCES.find(s => s.id === this.customer.sauce);
    this.resetStations();
  }
  resetStations() {
    this.chop = { index:0, feed:0, lastCut:0, wait:0, knife:1, slices:[], combo:0, maxCombo:0, perfects:0, last:null, fever:false };
    this.saute = { t:0, flame:0, temp:.12, holding:false, inZone:0, burn:0, cook:0, sauce:false, cue:false, flambe:null };
    this.boil = { t:0, done:0, foam:.18, overflow:0, gust:0, stirs:0 };
    const bands = [[.46,.6],[.7,.84],[.3,.44]];
    for (let i = bands.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [bands[i], bands[j]] = [bands[j], bands[i]]; }
    this.toss = { bands, results:[], charging:false, power:0, flight:0 };
  }
  get ingredient() { return INGREDIENTS[this.recipe.ingredients[this.chop.index]]; }
  get ingredientKind() { return this.recipe.ingredients[this.chop.index]; }
  get playing() { return this.state === 'play'; }

  choose(id) { if (this.phase !== 'recipe') return false; this.recipe = SAUCES.find(s => s.id === id) || SAUCES[0]; return true; }
  start() { if (this.phase !== 'recipe') return false; this.resetStations(); this.enter('chop'); return true; }
  enter(phase) { this.phase = phase; this.state = 'intro'; this.stateTime = 0; this.events.push({ type:'phase', phase }); }
  // Input that arrives during an intro card begins the station; a short lock avoids carrying a tap over.
  begin() {
    if (this.state !== 'intro' || this.stateTime < .45 || !PHASES.includes(this.phase)) return false;
    this.state = 'play'; this.stateTime = 0;
    if (this.phase === 'chop') this.chop.wait = 0;
    this.events.push({ type:'begin', phase:this.phase });
    return true;
  }
  complete(delay = 1) { this.state = 'done'; this.stateTime = 0; this.doneDelay = delay; }

  // ── 1. chop: tap as the guide reaches the knife ──
  cut() {
    if (this.phase !== 'chop') return null;
    if (this.state === 'intro') { this.begin(); return null; }
    const c = this.chop;
    if (this.state !== 'play' || c.wait > 0 || c.knife < .09) return null;
    c.knife = 0;
    const ing = this.ingredient, thickness = Math.min(c.feed, ing.length) - c.lastCut;
    if (thickness < .035) { this.events.push({ type:'whiff' }); return null; }
    return this.addSlice(thickness, false);
  }
  addSlice(thickness, missed) {
    const c = this.chop, ing = this.ingredient, kind = this.ingredientKind;
    const g = missed ? { grade:'miss', score:0 } : grade(thickness, ing.width);
    const slice = { kind, u0:c.lastCut, u1:c.lastCut + thickness, ...g, index:c.slices.length };
    c.lastCut += thickness; c.slices.push(slice); c.last = slice;
    c.combo = g.grade === 'perfect' ? c.combo + 1 : 0;
    c.maxCombo = Math.max(c.maxCombo, c.combo);
    if (g.grade === 'perfect') c.perfects++;
    // a run of perfect cuts lights the knife up and quickens the feed
    const fever = c.combo >= FEVER_COMBO;
    if (fever !== c.fever) { c.fever = fever; this.events.push({ type:'fever', on:fever }); }
    this.events.push({ type:'slice', slice, combo:c.combo, ing:c.index, feed:c.feed, fever });
    if (ing.length - c.lastCut < ing.width * 1.05) this.nextIngredient();
    return slice;
  }
  nextIngredient() {
    const c = this.chop, ing = this.ingredient;
    if (ing.length - c.lastCut > .001) this.events.push({ type:'nub', kind:this.ingredientKind, u0:c.lastCut, u1:ing.length, ing:c.index });
    this.events.push({ type:'ingredientDone', index:c.index });
    if (c.index >= this.recipe.ingredients.length - 1) { this.complete(1.1); return; }
    c.index++; c.feed = 0; c.lastCut = 0; c.wait = .75;
    this.events.push({ type:'ingredient', index:c.index, kind:this.ingredientKind });
  }
  chopScore() {
    const s = this.chop.slices;
    if (!s.length) return 0;
    return Math.round(Math.min(100, s.reduce((a, b) => a + b.score, 0) / s.length + Math.min(6, this.chop.maxCombo)));
  }

  // ── 2. sauté: hold to raise the flame, the pan answers with lag ──
  hold(on) {
    if (this.phase !== 'saute') return;
    this.saute.pressed = !!on;
    if (on && this.state === 'intro') this.begin();
    this.saute.holding = this.saute.pressed && this.state === 'play';
  }
  heatScore() { const s = this.saute; return Math.round(clamp(s.inZone / SAUTE_TIME * 108 + (s.flambe ? 10 : 0) - s.burn * 12, 0, 100)); }

  // ── 3. boil: tap to knock the foam down, drain in the al dente window ──
  stir() {
    if (this.phase !== 'boil') return false;
    if (this.state === 'intro') return this.begin();
    if (this.state !== 'play') return false;
    const b = this.boil; b.foam = Math.max(.05, b.foam - .3); b.stirs++;
    this.events.push({ type:'stir' });
    return true;
  }
  drain() {
    if (this.phase !== 'boil' || this.state !== 'play') return false;
    this.events.push({ type:'drain', done:this.boil.done });
    this.complete(1.1);
    return true;
  }
  noodleScore() {
    const b = this.boil, [lo, hi] = ALDENTE;
    const off = b.done < lo ? lo - b.done : b.done > hi ? b.done - hi : 0;
    return Math.round(clamp(100 - off * 420 - b.overflow * 15, 0, 100));
  }
  noodleState(d = this.boil.done) { return d < .45 ? 'raw' : d < ALDENTE[0] ? 'firm' : d <= ALDENTE[1] ? 'aldente' : d < 1 ? 'soft' : 'mushy'; }

  // ── 4. toss: drag up to charge, release to flip; meet the height band ──
  charge(power) {
    if (this.phase !== 'toss') return;
    if (this.state === 'intro') { this.begin(); }
    const t = this.toss;
    if (this.state !== 'play' || t.results.length >= 3) return;
    t.charging = true; t.power = clamp(power, 0, 1.15);
  }
  release() {
    const t = this.toss;
    if (this.phase !== 'toss' || this.state !== 'play' || !t.charging) return null;
    // Released mid-air: the pan flips as soon as the pasta lands.
    if (t.flight > 0) { t.pending = true; return null; }
    t.charging = false; t.pending = false;
    if (t.power < .06) { t.power = 0; return null; }
    const [lo, hi] = t.bands[t.results.length], h = t.power;
    const off = h < lo ? lo - h : h > hi ? h - hi : 0;
    const r = { height:h, band:[lo, hi], score:Math.round(clamp(100 - off * 380, 0, 100)), grade:off === 0 ? 'perfect' : off < .1 ? 'good' : h > hi ? 'high' : 'low' };
    t.results.push(r); t.flight = 1.05; t.power = 0;
    this.events.push({ type:'toss', ...r, n:t.results.length, bravo:t.results.length === 3 && t.results.every(x => x.grade === 'perfect') });
    return r;
  }
  tossScore() { const r = this.toss.results; return r.length ? Math.round(r.reduce((a, b) => a + b.score, 0) / 3) : 0; }

  pause() { if (['paused','result','recipe'].includes(this.phase)) return; this.previousPhase = this.phase; this.phase = 'paused'; this.saute.holding = this.saute.pressed = false; this.toss.charging = false; }
  resume() { if (this.phase === 'paused') this.phase = this.previousPhase; }

  update(dt) {
    if (['paused','result','recipe'].includes(this.phase)) return;
    dt = clamp(dt, 0, .05); this.clock += dt; this.stateTime += dt;
    if (this.state === 'done') {
      if (this.stateTime >= this.doneDelay) { const i = PHASES.indexOf(this.phase); if (i < PHASES.length - 1) this.enter(PHASES[i + 1]); else this.finish(); }
      return;
    }
    if (this.phase === 'chop') this.chop.knife += dt;
    // A press held through the intro lock still starts the burner.
    if (this.phase === 'saute' && this.state === 'intro' && this.saute.pressed && this.begin()) this.saute.holding = true;
    if (this.state !== 'play') return;
    if (this.phase === 'chop') {
      const c = this.chop, ing = this.ingredient;
      if (c.wait > 0) { c.wait -= dt; return; }
      c.feed += ing.speed * (c.fever ? 1.12 : 1) * dt;
      if (c.feed - c.lastCut > ing.width * 2.1 || c.feed > ing.length + ing.width * .5) this.addSlice(Math.min(c.feed, ing.length) - c.lastCut, true);
    }
    if (this.phase === 'saute') {
      const s = this.saute;
      s.t += dt;
      s.flame = clamp(s.flame + (s.holding ? 2.6 : -2.6) * dt, 0, 1);
      s.temp += ((.12 + s.flame * .95) - s.temp) * Math.min(1, dt * .9);
      const z = sauteZone(s.t), top = z.center + z.half;
      if (Math.abs(s.temp - z.center) <= z.half) { s.inZone += dt; s.cook += dt; }
      else if (s.temp > top) { s.burn += (s.temp - top) * dt * 4; s.cook += dt * .8; }
      else s.cook += dt * .3;
      if (!s.sauce && s.t >= SAUTE_TIME * .45) { s.sauce = true; this.events.push({ type:'sauce' }); }
      // the wine goes in: only a hot pan under a held flame catches it
      if (!s.cue && s.t >= FLAMBE_AT - 1.6) { s.cue = true; this.events.push({ type:'flambeCue' }); }
      if (s.flambe == null && s.t >= FLAMBE_AT) { s.flambe = s.holding && s.temp >= z.center - z.half * .25; this.events.push({ type:'flambe', ok:s.flambe }); }
      if (s.t >= SAUTE_TIME) { s.holding = false; this.complete(.9); }
    }
    if (this.phase === 'boil') {
      const b = this.boil;
      b.t += dt; b.done = doneness(b.t);
      b.gust -= dt;
      if (b.gust <= 0) { b.gust = 1.2 + this.random() * 1.6; b.surge = .1 + this.random() * .16; }
      b.foam += (.075 + (b.surge || 0) * Math.max(0, b.gust - 1)) * dt + .03 * dt * b.done;
      if (b.foam >= 1) { b.overflow++; b.foam = .38; this.events.push({ type:'overflow' }); }
      if (b.done >= 1.25) this.drain();
    }
    if (this.phase === 'toss') {
      const t = this.toss;
      if (t.flight > 0) { t.flight -= dt; if (t.flight <= 0) { t.flight = 0; this.events.push({ type:'land', n:t.results.length }); if (t.results.length >= 3) this.complete(.8); else if (t.pending) this.release(); } }
    }
  }
  finish() {
    const chopScore = this.chopScore(), heatScore = this.heatScore(), noodleScore = this.noodleScore(), tossScore = this.tossScore();
    const cooked = Math.round(chopScore * .3 + heatScore * .25 + noodleScore * .3 + tossScore * .15);
    const r = {
      game:'pasta', recipe:this.recipe.id, chopScore, heatScore, noodleScore, tossScore,
      slices:this.chop.slices.length, perfects:this.chop.perfects, maxCombo:this.chop.maxCombo,
      doneness:Math.round(this.boil.done * 100), noodle:this.noodleState(), overflow:this.boil.overflow,
      burn:Math.round(this.saute.burn * 10) / 10, high:this.toss.results.filter(r => r.grade === 'high').length,
      tossPerfects:this.toss.results.filter(r => r.grade === 'perfect').length, flambe:!!this.saute.flambe,
      customer:this.customer.id,
    };
    // the customer's wish is a bonus on top of the cooking, a wrong sauce costs it
    r.ordered = this.recipe.id === this.customer.sauce; r.wish = WANTS[this.customer.want](r);
    r.value = r.metric = Math.min(100, cooked + (!r.ordered ? -5 : r.wish ? 6 : 0));
    r.tip = r.ordered ? Math.round(r.value / 10) * 500 + (r.wish ? 3000 : 0) : 0;
    this.result = r;
    this.phase = 'result'; this.state = 'done';
    this.events.push({ type:'finish' });
    return true;
  }
}
