import { DalgonaGame, SHAPES, MELT_GOLD, PUFF_GOLD, PRESS_GOLD, MAX_CHIPS, SNAP, outline } from './dalgona-engine.js';
import { DalgonaView } from './dalgona-view.js';

const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>';
const STEPS = {
  melt:{ n:1, title:'설탕 녹이기', short:'녹이기', body:'국자를 꾹 눌러 연탄불에 올리고, 빙글빙글 저어 녹이세요. 황금빛이 되면 손을 떼요.', hint:'누른 채 빙글빙글' },
  soda:{ n:2, title:'소다 넣기', short:'부풀리기', body:'탭해서 소다를 톡! 빠르게 저어 부풀리고, 알맞게 부풀면 손을 떼요.', hint:'탭하고 빙글빙글' },
  press:{ n:3, title:'누르기', short:'누르기', body:'누르개를 아래로 끌어 납작하게 눌러요. 너무 얇으면 잘 깨지고, 두꺼우면 잘 안 긁혀요.', hint:'아래로 끌었다 놓기' },
  carve:{ n:4, title:'모양 뽑기', short:'뽑기', body:'바늘 끝은 손가락보다 조금 위에 있어서 손가락에 가리지 않아요. 선 위에 손가락을 대면 바늘이 홈에 착 붙어요. 그대로 선을 따라 살살 문지르세요. 빨리 긁으면 금이 가고, 금이 모양 안으로 들어가면 깨져요. 다 판 조각은 손가락으로 휙 밀어 치우고, 많이 판 바깥쪽은 톡 쳐서 부러뜨릴 수도 있어요.', hint:'선 위를 누른 채 문지르기' },
};
const HINTS = {
  pick:'어떤 모양에 도전할까요?',
  melt:'누른 채 빙글빙글 저어 녹이고, 황금빛에 손을 떼요.',
  soda:'탭해서 소다를 넣고, 빙글빙글 저어 부풀려요.',
  press:'누르개를 아래로 끌었다 놓아요.',
  carve:'빛나는 선 위를 누른 채 살살 문질러요.',
  result:'오늘의 뽑기 결과예요.',
};
const GRADE_POP = {
  melt:{ perfect:'황금빛!', good:'괜찮아요', under:'덜 녹았어요', over:'탔어요…' },
  soda:{ perfect:'빵빵하게!', good:'좋아요', under:'덜 부풀었어요', over:'너무 부풀었어요' },
  press:{ perfect:'딱 좋아요!', good:'괜찮아요', under:'너무 두꺼워요', over:'너무 얇아요' },
};
const icons = {
  circle:'<svg viewBox="0 0 32 32" aria-hidden="true"><path class="ring" d="M16 6a10 10 0 1 1-9.4 6.6"/><path d="M5 9l1.6 3.6L10 11"/></svg>',
  down:'<svg viewBox="0 0 32 32" aria-hidden="true"><path class="arrow" d="M16 29l-5-6h3.5v-6h3v6H21z"/><path d="M14 4v8l-3-2-2 2 6 6h8l2-8-6-2V4a1.5 1.5 0 0 0-3 0z"/></svg>',
  trace:'<svg viewBox="0 0 32 32" aria-hidden="true"><path class="ring" d="M16 27s-10-6-10-13a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13z"/></svg>',
};
// icons traced from the very outline the needle follows
const shapeSvg = id => `<svg class="shape-icon" viewBox="-.72 -.72 1.44 1.44" aria-hidden="true"><path d="${outline(id).points.filter((_, i) => i % 3 === 0).map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(3) + ' ' + (-p.y).toFixed(3)).join('')}Z"/></svg>`;
const stars = n => '★'.repeat(n) + `<em>${'★'.repeat(4 - n)}</em>`;

export class DalgonaController {
  constructor({ app, header, modal, sound, onResult }) {
    this.g = new DalgonaGame(); this.modal = modal; this.onResult = onResult; this.dead = false; this.cache = {}; this.shown = false;
    this.abort = new AbortController(); this.pointer = null; this.keyHold = false;
    app.innerHTML = header + `<main id="main" class="game-shell dalgona" data-stage="pick">
<div class="dal-top"><div class="dal-heading"><span class="dal-eyebrow">SSUN DALGONA</span><h1 id="dal-title">달고나 뽑기</h1><p id="dal-instruction" class="dal-instruction" role="status">${HINTS.pick}</p></div>
<div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog">${shareIcon}</button></div></div>
<div class="dal-viewport"><canvas id="game" tabindex="0" aria-label="달고나 노점: 누른 채 저어 녹이고, 아래로 끌어 누르고, 선을 따라 긁어 모양을 떼세요"></canvas>
<ol class="dal-steps" aria-label="달고나 단계">${Object.entries(STEPS).map(([id, s]) => `<li data-step="${id}"><i>${s.n}</i><span>${s.short}</span></li>`).join('')}</ol>
<div id="dal-pop" class="dal-pop" aria-hidden="true"></div>
<div id="dal-gauge" class="dal-gauge" hidden><b id="dal-gauge-label"></b><div class="gauge-track"><span id="dal-gauge-zone" class="gauge-zone"></span><i id="dal-gauge-needle" class="gauge-needle"></i></div></div>
<div id="dal-hud" class="dal-hud" hidden><div class="dal-time"><b id="dal-time">0</b><small>초</small></div><div class="dal-risk"><span>금 위험</span><div class="risk-track"><i id="dal-risk"></i></div><div id="dal-chips" class="dal-chips"></div></div></div>
<button id="dal-lick" class="dal-lick" hidden><span aria-hidden="true">💧</span>침 바르기 <b id="dal-licks">3</b></button>
<div id="dal-intro" class="dal-intro" hidden><span id="dal-intro-step" class="intro-step"></span><h2 id="dal-intro-title"></h2><p id="dal-intro-body"></p><div class="intro-hint"><span id="dal-intro-icon" class="intro-icon"></span><b id="dal-intro-hint"></b></div></div>
<div id="dal-status" class="dal-status" hidden>일시 정지</div></div>
<div class="dal-bottom">
<div id="dal-shapes" class="dal-shapes" role="group" aria-label="달고나 모양">${SHAPES.map(s => `<button type="button" data-shape="${s.id}" aria-pressed="${s.id === this.g.shape.id}">${shapeSvg(s.id)}<b>${s.name}</b><span class="dal-stars" aria-label="난이도 ${s.level}">${stars(s.level)}</span></button>`).join('')}</div>
<p id="dal-note" class="dal-note">모양 그대로 떼어 내면 하나 더!</p>
<div id="dal-meter" class="dal-meter" hidden><div class="meter-track"><i id="dal-meter-fill"></i></div></div>
<div class="dal-bottom-row"><div id="dal-detail" class="dal-detail" role="status"></div><div id="dal-modes" class="dal-modes"><button id="dal-quick" class="dal-next">바로 뽑기 →</button><button id="dal-next" class="dal-make"><b>직접 만들기</b><small>설탕 녹이고 소다 넣기부터</small></button></div></div>
<p class="dal-key-help">누르기·빙글빙글·끌기·드래그 · 키보드 Space 길게 · Q 바로 뽑기</p></div>
<div id="result" class="result-overlay dal-result-overlay" hidden></div></main>`;
    this.shell = app.querySelector('.dalgona'); this.canvas = app.querySelector('#game');
    this.view = new DalgonaView(this.canvas, this.g, { sound });
    this.canvas.__dalgona = this;
    this.bind(); this.updateHUD(true);
    let prev = performance.now();
    const frame = now => {
      if (this.dead) return;
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (!modal.open) {
        // keyboard: holding Space stirs or presses on its own
        if (this.keyHold) { const g = this.g; if (g.phase === 'melt' || g.phase === 'soda') g.stir(1.7 * dt); if (g.phase === 'press') { this.keyPress = (this.keyPress || 0) + dt * .45; g.pressTo(this.keyPress); } }
        this.g.update(dt);
        for (const e of this.g.events.splice(0)) { this.view.handle(e); this.onEvent(e); }
        this.view.render(this.g.phase === 'paused' ? 0 : dt);
        this.updateHUD();
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  $(id) { return this.shell.querySelector('#' + id); }
  set(id, prop, value) { const k = id + prop; if (this.cache[k] === value) return; this.cache[k] = value; const el = this.$(id); if (prop === 'text') el.textContent = value; else if (prop === 'html') el.innerHTML = value; else if (prop === 'hidden') el.hidden = value; else el.style[prop] = value; }
  phase() { return this.g.phase === 'paused' ? this.g.previousPhase : this.g.phase; }

  bind() {
    const opt = { signal:this.abort.signal }, c = this.canvas, g = this.g;
    this.shell.addEventListener('click', e => {
      const shape = e.target.closest('[data-shape]');
      if (shape && g.choose(shape.dataset.shape)) this.shell.querySelectorAll('[data-shape]').forEach(b => b.setAttribute('aria-pressed', String(b === shape)));
      const mode = e.target.closest('#dal-next') ? 'make' : e.target.closest('#dal-quick') ? 'quick' : null;
      if (mode) { this.view.sfx.ensure(); if (g.phase === 'pick') g.start(mode); this.updateHUD(true); c.focus({ preventScroll:true }); }
      if (e.target.closest('#dal-lick')) { this.view.sfx.ensure(); g.lick(); }
    }, opt);
    const scale = () => Math.min(c.clientWidth, c.clientHeight) * .3;
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.modal.open || this.pointer != null) return;
      e.preventDefault(); this.pointer = e.pointerId; c.setPointerCapture(e.pointerId); c.focus({ preventScroll:true });
      this.view.sfx.ensure(); this.last = [e.clientX, e.clientY]; this.startY = e.clientY;
      // a finger hides the needle tip, so on touch the tip sits well above it and the finger holds the far end
      this.lift = e.pointerType === 'touch' ? Math.round(Math.max(56, Math.min(84, c.clientHeight * .14))) : 0; this.view.lift = this.lift;
      if (g.phase === 'carve') { if (!this.grab(e)) this.needleAt(e, true); } else g.press(true);
    }, opt);
    c.addEventListener('pointermove', e => {
      if (e.pointerId !== this.pointer) return;
      e.preventDefault();
      const d = Math.hypot(e.clientX - this.last[0], e.clientY - this.last[1]); this.last = [e.clientX, e.clientY];
      if (g.phase === 'melt' || g.phase === 'soda') g.stir(d / scale());
      if (g.phase === 'press') g.pressTo((e.clientY - this.startY) / (c.clientHeight * .32));
      if (g.phase === 'carve') { if (this.hand) this.drag(e); else this.needleAt(e, true); }
    }, opt);
    const up = e => {
      if (e && e.pointerId !== this.pointer) return; this.pointer = null;
      // a hand that never swiped was a tap: snap that piece off
      const h = this.hand; this.hand = null;
      if (h && !h.flung) g.breakOff(h.s);
      if (g.phase === 'carve') g.needle(0, 0, false); else g.press(false);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(type, up, opt);
    window.addEventListener('blur', () => { this.pointer = null; this.keyHold = false; g.press(false); g.needle(0, 0, false); }, opt);
    c.addEventListener('keydown', e => {
      if (this.modal.open) return;
      if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; if (g.phase === 'pick') { g.start(); this.updateHUD(true); return; } this.keyHold = true; this.keyPress = g.make.press; if (g.phase !== 'carve') g.press(true); }
      if (e.code === 'Enter') { e.preventDefault(); if (g.phase === 'pick') g.start(); }
      if (e.code === 'KeyQ' && g.phase === 'pick') { g.start('quick'); this.updateHUD(true); }
      if (e.code === 'KeyL') g.lick();
      if (e.code === 'Escape') { e.preventDefault(); if (g.phase === 'paused') g.resume(); else g.pause(); }
    }, opt);
    c.addEventListener('keyup', e => { if (e.code !== 'Space') return; e.preventDefault(); this.keyHold = false; if (g.phase !== 'carve') g.press(false); }, opt);
  }
  // Touching the outside (away from the groove) is the hand, not the needle:
  // swipe a piece to fling it, tap it to snap it off.
  grab(e) {
    const g = this.g, c = g.carve, p = this.view.pick(e.clientX, e.clientY), tip = this.view.pick(e.clientX, e.clientY - this.lift); if (!p || g.state !== 'play') return false;
    // the finger is on a piece, but if the needle tip above it lands on the groove the needle wins
    const s = g.outerAt(p.x, p.y);
    if (s < 0 || c.popped[s] || !(c.clearing != null || !tip || g.nearest(tip.x, tip.y).d >= SNAP)) return c.clearing != null;
    this.hand = { s, x:p.x, y:p.y, t:performance.now(), sx:p.x, sy:p.y, vx:0, vy:0, flung:false };
    g.needle(0, 0, false); this.shell.dataset.needle = 'hand';
    return true;
  }
  drag(e) {
    const g = this.g, h = this.hand, p = this.view.pick(e.clientX, e.clientY); if (!p) return;
    const now = performance.now(), dt = Math.max(.008, (now - h.t) / 1000);
    h.vx += ((p.x - h.x) / dt - h.vx) * .6; h.vy += ((p.y - h.y) / dt - h.vy) * .6; h.x = p.x; h.y = p.y; h.t = now;
    if (!h.flung && Math.hypot(p.x - h.sx, p.y - h.sy) > .09) { h.flung = true; g.breakOff(h.s, h.vx, h.vy); }
    // a sweeping finger takes every loose piece it passes over
    if (h.flung) { const s = g.outerAt(p.x, p.y); if (s >= 0 && g.carve.loose[s] && !g.carve.popped[s]) g.breakOff(s, h.vx, h.vy); }
  }
  needleAt(e, down) { const p = this.view.pick(e.clientX, e.clientY - this.lift); if (p) this.g.needle(p.x, p.y, down); }

  buzz(ms) { try { navigator.vibrate?.(ms); } catch {} }
  pop(text, tone = '') { const el = this.$('dal-pop'); el.textContent = text; el.className = 'dal-pop ' + tone; void el.offsetWidth; el.classList.add('show'); }
  onEvent(e) {
    const g = this.g, m = g.make;
    if (e.type === 'step') {
      const v = e.step === 'melt' ? m.melt : e.step === 'soda' ? m.puff : m.press, gold = e.step === 'melt' ? MELT_GOLD : e.step === 'soda' ? PUFF_GOLD : PRESS_GOLD;
      const key = e.grade === 'perfect' ? 'perfect' : e.grade === 'good' ? 'good' : v < gold[0] ? 'under' : 'over';
      this.pop(GRADE_POP[e.step][key], e.grade === 'bad' ? 'miss' : e.grade);
    }
    if (e.type === 'burnt') this.pop('타고 있어요!', 'miss');
    if (e.type === 'touch') this.buzz(e.where === 'line' ? 8 : 20);
    if (e.type === 'shard') this.buzz(15);
    if (e.type === 'crack') { this.buzz(e.inward ? [40, 30, 40] : 25); this.pop(e.inward ? '쩍! 금이 갔어요' : '바깥쪽 금, 휴…', e.inward ? 'miss' : 'good'); this.shell.dataset.flash = ''; void this.shell.offsetWidth; this.shell.dataset.flash = e.inward ? 'bad' : 'soft'; }
    if (e.type === 'shard') this.pop(e.how === 'snap' ? '똑!' : e.how === 'chip' ? '앗, 같이 떨어졌어요' : e.vx || e.vy ? '휙!' : '톡!', e.how === 'chip' ? 'miss' : 'small');
    if (e.type === 'loose' && !this.looseHint) { this.looseHint = true; this.pop('떨어졌어요! 휙 밀어 치워요', 'good'); }
    if (e.type === 'stuck') { this.buzz(10); this.pop('아직 단단해요, 더 파요', 'small'); }
    if (e.type === 'carved') { this.buzz([20, 40, 20]); this.pop('다 팠어요! 조각을 휙~', 'perfect'); }
    if (e.type === 'phase' && e.phase === 'carve') this.looseHint = false;
    if (e.type === 'lick') this.pop('촉촉하게…', 'good');
    if (e.type === 'free') this.pop('성공!', 'perfect');
    if (e.type === 'snap') this.pop('깨졌어요!', 'miss');
    if (e.type === 'phase' || e.type === 'begin') this.updateHUD(true);
  }

  updateHUD(force = false) {
    const g = this.g, phase = this.phase(), changed = force || phase !== this.lastPhase || g.state !== this.lastState, m = g.make, c = g.carve;
    const d = this.canvas.dataset;
    d.phase = g.phase; d.state = g.state; d.melt = Math.round(m.melt * 100); d.puff = Math.round(m.puff * 100); d.press = Math.round(m.press * 100); d.progress = Math.round(g.progressRatio() * 100); d.chips = c.chips; d.cracks = c.cracks.length;
    if (changed) {
      this.lastPhase = phase; this.lastState = g.state; this.shell.dataset.stage = phase;
      const step = STEPS[phase], quick = g.mode === 'quick';
      this.shell.dataset.mode = quick && phase !== 'pick' ? 'quick' : 'make';
      this.$('dal-title').textContent = step ? (quick ? step.title : `${step.n} / 4 ${step.title}`) : phase === 'result' ? '오늘의 뽑기' : '달고나 뽑기';
      this.$('dal-instruction').textContent = HINTS[phase] || '';
      this.$('dal-shapes').hidden = phase !== 'pick'; this.$('dal-note').hidden = phase !== 'pick';
      this.$('dal-modes').hidden = phase !== 'pick';
      this.$('dal-meter').hidden = phase !== 'carve';
      this.shell.querySelectorAll('.dal-steps li').forEach(li => { const s = STEPS[li.dataset.step]; li.className = !step ? (phase === 'result' ? 'done' : '') : s.n < step.n ? 'done' : s.n === step.n ? 'active' : ''; });
      const intro = this.$('dal-intro'), showIntro = !!step && g.state === 'intro'; intro.hidden = !showIntro;
      if (showIntro) {
        this.$('dal-intro-step').textContent = quick ? '바로 뽑기' : `STEP ${step.n} / 4`; this.$('dal-intro-title').textContent = step.title; this.$('dal-intro-body').textContent = step.body; this.$('dal-intro-hint').textContent = step.hint;
        this.$('dal-intro-icon').innerHTML = icons[phase === 'press' ? 'down' : phase === 'carve' ? 'trace' : 'circle'];
      }
      const gauge = this.$('dal-gauge'); gauge.hidden = !['melt', 'soda', 'press'].includes(phase) || g.state === 'intro'; gauge.dataset.kind = phase;
      this.$('dal-gauge-label').textContent = phase === 'melt' ? '색' : phase === 'soda' ? '부풂' : '두께';
      const zone = phase === 'melt' ? MELT_GOLD.map(v => v / 1.3) : phase === 'soda' ? PUFF_GOLD.map(v => v / 1.15) : PRESS_GOLD;
      this.$('dal-gauge-zone').style.bottom = zone[0] * 100 + '%'; this.$('dal-gauge-zone').style.height = (zone[1] - zone[0]) * 100 + '%';
      this.$('dal-hud').hidden = this.$('dal-lick').hidden = phase !== 'carve' || g.state === 'intro';
      this.$('dal-chips').innerHTML = Array.from({ length:MAX_CHIPS }, (_, i) => `<i data-i="${i}"></i>`).join('');
      if (phase === 'result' && !this.shown) { this.shown = true; this.showResult(); this.onResult?.(g.result); }
    }
    this.set('dal-status', 'hidden', g.phase !== 'paused');
    if (phase === 'melt') { this.set('dal-gauge-needle', 'bottom', (Math.min(1, m.melt / 1.3) * 100).toFixed(1) + '%'); this.set('dal-detail', 'text', g.state !== 'play' ? '' : m.melt > MELT_GOLD[1] ? '타기 직전! 손을 떼요' : m.melt >= MELT_GOLD[0] ? '황금빛! 지금 손을 떼요' : m.onFire && (m.stirSpeed || 0) < .6 ? '저어 주세요, 눌어붙어요' : m.onFire ? '사르르 녹는 중…' : '꾹 눌러 불에 올려요'); this.shell.dataset.heat = m.melt >= MELT_GOLD[0] && m.melt <= MELT_GOLD[1] ? 'good' : m.melt > MELT_GOLD[1] ? 'hot' : ''; }
    if (phase === 'soda') { this.set('dal-gauge-needle', 'bottom', (Math.min(1, m.puff / 1.15) * 100).toFixed(1) + '%'); this.set('dal-detail', 'text', g.state !== 'play' ? '' : !m.soda ? '탭해서 소다 넣기' : m.puff >= PUFF_GOLD[1] ? '그만! 손을 떼요' : m.puff >= PUFF_GOLD[0] ? '딱 좋아요, 손을 떼요' : '빙글빙글 더 빠르게!'); this.shell.dataset.heat = m.puff >= PUFF_GOLD[0] && m.puff <= PUFF_GOLD[1] ? 'good' : m.puff > PUFF_GOLD[1] ? 'hot' : ''; }
    if (phase === 'press') { this.set('dal-gauge-needle', 'bottom', (m.press * 100).toFixed(1) + '%'); this.set('dal-detail', 'text', g.state !== 'play' ? '' : m.press > PRESS_GOLD[1] ? '너무 얇아져요!' : m.press >= PRESS_GOLD[0] ? '딱 좋아요, 손을 떼요' : '아래로 더 끌어요'); this.shell.dataset.heat = m.press >= PRESS_GOLD[0] && m.press <= PRESS_GOLD[1] ? 'good' : m.press > PRESS_GOLD[1] ? 'hot' : ''; }
    if (phase === 'carve') {
      this.shell.dataset.heat = '';
      this.set('dal-time', 'text', String(Math.max(0, Math.ceil(g.shape.time - c.t))));
      this.set('dal-risk', 'width', (Math.min(1, c.tension) * 100).toFixed(0) + '%');
      this.shell.dataset.risk = c.tension > .7 ? 'high' : c.tension > .4 ? 'mid' : '';
      this.set('dal-chips', 'html', Array.from({ length:MAX_CHIPS }, (_, i) => `<i class="${i < c.chips ? 'on' : ''}"></i>`).join(''));
      this.set('dal-licks', 'text', String(c.licks)); this.$('dal-lick').disabled = c.licks <= 0 || c.wet > 0 || g.state !== 'play';
      const left = g.shape.time - c.t;
      // what the needle is doing right now, so every touch answers at once
      const pct = `${Math.round(g.progressRatio() * 100)}%`;
      const loose = c.loose.filter((v, i) => v && !c.popped[i]).length;
      this.set('dal-detail', 'text', g.state === 'intro' ? '' : c.clearing != null ? (loose ? `남은 조각을 휙 밀어 치워요 · ${loose}` : '깔끔해요!') : this.hand ? '휙 밀면 날아가요' : c.tension > .7 ? '살살! 금이 가려고 해요' : !c.down ? (g.progressRatio() < .03 ? '빛나는 선 위를 눌러 보세요' : loose ? `떨어진 조각은 휙 밀어 치워요 · ${pct}` : `선 위를 계속 문질러요 · ${pct}`) : c.where === 'inside' ? '안쪽은 긁으면 흠집이 나요!' : c.where === 'outside' ? '선 쪽으로 옮겨요' : c.wet > 0 ? `촉촉해서 덜 깨져요 · ${pct}` : left < 12 ? `서둘러요! · ${pct}` : `사각사각… ${pct}`);
      this.shell.dataset.needle = this.hand ? 'hand' : c.down ? c.where || '' : '';
      this.set('dal-meter-fill', 'width', (g.progressRatio() * 100).toFixed(1) + '%');
    }
    if (phase === 'pick') this.$('dal-next').disabled = this.$('dal-quick').disabled = false;
  }
  showResult() {
    const r = this.g.result, g = this.g, shape = g.shape;
    const title = r.freed ? (r.bonus ? '하나 더!' : '모양 뽑기 성공!') : r.reason === 'broken' ? '앗, 깨졌어요' : '시간이 다 됐어요';
    const line = r.bonus ? '이야, 솜씨 좋네! 하나 더 가져가!' : r.freed ? '잘 뽑았네! 다음엔 더 깔끔하게 해 봐.' : r.reason === 'timeout' ? '시간이 다 됐어. 침을 발라 가며 해 봐.' : r.make != null && r.make < 70 ? '달고나가 잘 깨지네. 만들 때 황금빛을 노려 봐.' : '너무 급했어. 바늘은 살살!';
    this.$('result').hidden = false;
    this.$('result').innerHTML = `<section class="result-card dal-result ${r.freed ? 'win' : 'lose'}" aria-labelledby="dal-result-title"><span class="eyebrow">${r.freed ? 'DALGONA MASTER' : 'ONE MORE TRY'}</span><h2 id="dal-result-title">${title}</h2><div class="dal-score-line"><div class="result-value">${r.value}<small>점</small></div><span class="dal-shape-badge">${shapeSvg(shape.id)}${shape.name}</span></div><p class="dal-vendor"><b>뽑기 아저씨</b>“${line}”</p><div class="dal-score-list">${r.make == null ? '<span>모드<b>바로 뽑기</b></span>' : `<span>만들기<b>${r.make}</b></span>`}<span>온전함<b>${r.integrity}</b></span><span>금<b>${r.cracks}</b></span><span>시간<b>${r.time}초</b></span></div><div class="result-actions"><button class="primary" data-action="retry">하나 더 →</button><button class="secondary" data-action="boast">자랑하기 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.abort.abort(); this.view.destroy(); }
}
