import { PastaGame, SAUCES, INGREDIENTS, ALDENTE, BOIL_TIME, sauteZone, SAUTE_TIME } from './pasta-engine.js';
import { PastaView } from './pasta-view.js';

const shareIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg>';
const hex = c => '#' + c.toString(16).padStart(6, '0');
const ING_COLOR = { tomato:0xe2432a, onion:0x9c4a85, garlic:0xeee2c2, mushroom:0xa0714b, bacon:0xd0605a, basil:0x3f8f35 };
const STEPS = {
  chop:{ n:1, title:'재료 썰기', short:'썰기', body:'점선이 칼날에 닿는 순간 톡! 같은 두께로 썰수록 점수가 올라가요.', hint:'탭해서 시작', icon:'tap' },
  saute:{ n:2, title:'불 조절', short:'볶기', body:'누르고 있으면 불이 세지고, 떼면 약해져요. 온도를 초록 구간에 맞춰 주세요.', hint:'꾹 누르고 있기', icon:'hold' },
  boil:{ n:3, title:'면 삶기', short:'삶기', body:'거품이 넘치기 전에 냄비를 톡톡! 알 덴테 구간에서 건지세요.', hint:'탭해서 면 넣기', icon:'tap' },
  toss:{ n:4, title:'팬 토스', short:'토스', body:'위로 끌어올렸다 놓으면 팬이 튀어 올라요. 노란 링 높이에 맞춰 세 번!', hint:'위로 끌었다 놓기', icon:'up' },
};
const HINTS = {
  recipe:'어떤 소스로 만들어 볼까요?',
  chop:'점선이 칼날에 닿을 때 탭!',
  saute:'누르면 불이 세지고, 떼면 약해져요.',
  boil:'톡톡 저어 거품을 누르고, 알 덴테에 건지기!',
  toss:'위로 끌었다 놓아 팬을 튕기세요.',
  result:'완성! 오늘의 한 접시를 확인하세요.',
};
const POP = { perfect:'PERFECT', good:'GOOD', thick:'두꺼워요', thin:'얇아요', miss:'놓쳤어요', high:'너무 높아요!', low:'조금 더 세게!' };
const NOODLE_WORD = { raw:'딱딱해요', firm:'덜 익음', aldente:'알 덴테', soft:'부드러움', mushy:'푹 퍼짐' };
const icons = {
  tap:'<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12" r="5" class="ring"/><path d="M14 13v10l-3-2-2 2 6 6h8l2-8-6-2v-6a1.5 1.5 0 0 0-3 0z"/></svg>',
  hold:'<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12" r="7" class="ring pulse"/><path d="M14 13v10l-3-2-2 2 6 6h8l2-8-6-2v-6a1.5 1.5 0 0 0-3 0z"/></svg>',
  up:'<svg viewBox="0 0 32 32" aria-hidden="true"><path class="arrow" d="M16 3l-5 6h3.5v6h3V9H21z"/><path d="M14 15v8l-3-2-2 2 6 6h8l2-8-6-2v-4a1.5 1.5 0 0 0-3 0z"/></svg>',
};

export class PastaController {
  constructor({ app, header, modal, sound, onResult }) {
    this.g = new PastaGame(); this.modal = modal; this.onResult = onResult; this.dead = false; this.cache = {}; this.shown = false;
    this.abort = new AbortController(); this.pointer = null; this.keyCharge = null;
    app.innerHTML = header + `<main id="main" class="game-shell pasta" data-stage="recipe">
<div class="pasta-top"><div class="pasta-heading"><span class="pasta-eyebrow">SSUN CUCINA</span><h1 id="pasta-stage-title">오늘은, 파스타.</h1><p id="pasta-instruction" class="pasta-instruction" role="status">${HINTS.recipe}</p></div>
<div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog">${shareIcon}</button></div></div>
<div class="pasta-viewport"><canvas id="game" tabindex="0" aria-label="파스타 조리대: 탭으로 썰고, 누르고 있어 불을 올리고, 위로 끌어 팬을 튕기세요"></canvas>
<ol class="pasta-steps" aria-label="조리 단계">${Object.entries(STEPS).map(([id, s]) => `<li data-step="${id}"><i>${s.n}</i><span>${s.short}</span></li>`).join('')}</ol>
<div id="pasta-pop" class="pasta-pop" aria-hidden="true"></div>
<div id="pasta-gauge" class="pasta-gauge" hidden><b id="pasta-gauge-label"></b><div class="gauge-track"><span id="pasta-gauge-zone" class="gauge-zone"></span><i id="pasta-gauge-needle" class="gauge-needle"></i></div></div>
<div id="pasta-intro" class="pasta-intro" hidden><span id="pasta-intro-step" class="intro-step"></span><h2 id="pasta-intro-title"></h2><p id="pasta-intro-body"></p><div class="intro-hint"><span id="pasta-intro-icon" class="intro-icon"></span><b id="pasta-intro-hint"></b></div></div>
<div id="pasta-status" class="pasta-status" hidden>일시 정지</div></div>
<div class="pasta-bottom">
<div id="pasta-recipes" class="pasta-recipes" role="group" aria-label="파스타 소스">${SAUCES.map((s, i) => `<button type="button" data-sauce="${s.id}" aria-pressed="${i === 0}" style="--sauce:${hex(s.color)}"><span class="sauce-dot" aria-hidden="true"></span><b>${s.name}</b></button>`).join('')}</div>
<p id="pasta-recipe-note" class="pasta-recipe-note">${SAUCES[0].subtitle}</p>
<div id="pasta-chips" class="pasta-chips" hidden></div>
<div id="pasta-meter" class="pasta-meter" hidden><div class="meter-track"><span id="pasta-window" class="meter-window"></span><i id="pasta-meter-fill"></i></div><div id="pasta-meter-scale" class="meter-scale"></div></div>
<div class="pasta-bottom-row"><div id="pasta-detail" class="pasta-detail" role="status"></div><button id="pasta-next" class="pasta-next">요리 시작 →</button></div>
<p class="pasta-key-help">탭·누르기·끌어올리기 · 키보드 Space / Enter</p></div>
<div id="result" class="result-overlay pasta-result-overlay" hidden></div></main>`;
    this.shell = app.querySelector('.pasta'); this.canvas = app.querySelector('#game');
    this.view = new PastaView(this.canvas, this.g, { sound });
    this.bind(); this.updateHUD(true);
    let prev = performance.now();
    const frame = now => {
      if (this.dead) return;
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (!modal.open) {
        if (this.keyCharge != null && this.g.phase === 'toss') { this.keyCharge += dt * .85; this.g.charge(this.keyCharge); }
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
      const recipe = e.target.closest('[data-sauce]');
      if (recipe && g.choose(recipe.dataset.sauce)) { this.shell.querySelectorAll('[data-sauce]').forEach(b => b.setAttribute('aria-pressed', String(b === recipe))); this.$('pasta-recipe-note').textContent = g.recipe.subtitle; }
      if (e.target.closest('#pasta-next')) { this.view.sfx.ensure(); if (g.phase === 'recipe') g.start(); else if (g.phase === 'boil') g.drain(); this.updateHUD(true); c.focus({ preventScroll:true }); }
    }, opt);
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.modal.open || this.pointer != null) return;
      e.preventDefault(); this.pointer = e.pointerId; c.setPointerCapture(e.pointerId); c.focus({ preventScroll:true });
      this.press(e.clientY);
    }, opt);
    c.addEventListener('pointermove', e => {
      if (e.pointerId !== this.pointer || this.startY == null) return;
      e.preventDefault();
      g.charge((this.startY - e.clientY) / (this.canvas.clientHeight * .42));
    }, opt);
    const up = e => { if (e && e.pointerId !== this.pointer) return; this.pointer = null; this.startY = null; this.lift(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(type, up, opt);
    window.addEventListener('blur', () => { this.pointer = null; this.startY = null; this.keyCharge = null; this.lift(); }, opt);
    c.addEventListener('contextmenu', e => e.preventDefault(), opt);
    c.addEventListener('keydown', e => {
      if (this.modal.open) return;
      if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; if (g.phase === 'recipe') { g.start(); this.updateHUD(true); return; } if (g.phase === 'toss') { if (g.state === 'intro') g.begin(); else this.keyCharge = 0; return; } this.press(null); }
      if (e.code === 'Enter') { e.preventDefault(); if (g.phase === 'recipe') g.start(); else if (g.phase === 'boil') g.drain(); else this.press(null); }
      if (e.code === 'Escape') { e.preventDefault(); if (g.phase === 'paused') g.resume(); else g.pause(); }
    }, opt);
    c.addEventListener('keyup', e => { if (e.code !== 'Space') return; e.preventDefault(); if (this.keyCharge != null) { this.keyCharge = null; g.release(); } this.lift(); }, opt);
  }
  // One press means something different at every station.
  press(y) {
    const g = this.g; this.view.sfx.ensure();
    if (g.phase === 'chop') g.cut();
    else if (g.phase === 'saute') g.hold(true);
    else if (g.phase === 'boil') g.stir();
    else if (g.phase === 'toss') { if (y != null) this.startY = y; g.charge(0); }
  }
  lift() { const g = this.g; if (g.phase === 'saute') g.hold(false); if (g.phase === 'toss') g.release(); }

  pop(text, tone = '') {
    const el = this.$('pasta-pop'); el.textContent = text; el.className = 'pasta-pop ' + tone; void el.offsetWidth; el.classList.add('show');
  }
  onEvent(e) {
    if (e.type === 'slice') this.pop(e.slice.grade === 'perfect' && e.combo > 1 ? `PERFECT ×${e.combo}` : POP[e.slice.grade], e.slice.grade);
    if (e.type === 'toss') this.pop(POP[e.grade], e.grade);
    if (e.type === 'overflow') this.pop('넘쳤어요!', 'miss');
    if (e.type === 'drain') { const s = this.g.noodleState(e.done); this.pop(NOODLE_WORD[s], s === 'aldente' ? 'perfect' : 'thick'); }
    if (e.type === 'phase' || e.type === 'begin') this.updateHUD(true);
  }

  updateHUD(force = false) {
    const g = this.g, phase = this.phase(), changed = force || phase !== this.lastPhase || g.state !== this.lastState;
    const c = this.canvas.dataset;
    c.phase = g.phase; c.state = g.state; c.slices = g.chop.slices.length; c.perfects = g.chop.perfects;
    c.cut = phase === 'chop' && g.chop.wait <= 0 && g.state === 'play' ? ((g.chop.feed - g.chop.lastCut) / g.ingredient.width).toFixed(2) : ''; c.temp = Math.round(g.saute.temp * 100); c.done = Math.round(g.boil.done * 100); c.foam = Math.round(g.boil.foam * 100); c.band = g.toss.bands[Math.min(2, g.toss.results.length)].join(); c.flight = g.toss.flight > 0 ? 1 : 0; c.tosses = g.toss.results.length;
    if (changed) {
      this.lastPhase = phase; this.lastState = g.state; this.shell.dataset.stage = phase;
      const step = STEPS[phase];
      this.$('pasta-stage-title').textContent = step ? `${step.n} / 4 ${step.title}` : phase === 'result' ? '오늘의 한 접시' : '오늘은, 파스타.';
      this.$('pasta-instruction').textContent = HINTS[phase] || '';
      this.$('pasta-recipes').hidden = phase !== 'recipe'; this.$('pasta-recipe-note').hidden = phase !== 'recipe';
      this.$('pasta-chips').hidden = phase !== 'chop' && phase !== 'toss';
      this.$('pasta-meter').hidden = phase !== 'boil' && phase !== 'saute';
      const next = this.$('pasta-next');
      next.hidden = phase !== 'recipe' && phase !== 'boil';
      next.textContent = phase === 'recipe' ? '요리 시작 →' : '지금 건지기!';
      this.shell.querySelectorAll('.pasta-steps li').forEach(li => { const s = STEPS[li.dataset.step]; li.className = !step ? (phase === 'result' ? 'done' : '') : s.n < step.n ? 'done' : s.n === step.n ? 'active' : ''; });
      const intro = this.$('pasta-intro'), showIntro = !!step && g.state === 'intro';
      intro.hidden = !showIntro;
      if (showIntro) {
        this.$('pasta-intro-step').textContent = `STEP ${step.n} / 4`; this.$('pasta-intro-title').textContent = step.title;
        this.$('pasta-intro-body').textContent = step.body; this.$('pasta-intro-hint').textContent = step.hint; this.$('pasta-intro-icon').innerHTML = icons[step.icon];
      }
      if (phase === 'boil') this.$('pasta-meter-scale').innerHTML = '<span>딱딱</span><span>알 덴테</span><span>퍼짐</span>';
      if (phase === 'saute') this.$('pasta-meter-scale').innerHTML = '<span>소스 졸이기</span>';
      const win = this.$('pasta-window'); win.hidden = phase !== 'boil';
      if (phase === 'boil') { const max = 1.25; win.style.left = ALDENTE[0] / max * 100 + '%'; win.style.width = (ALDENTE[1] - ALDENTE[0]) / max * 100 + '%'; }
      const gauge = this.$('pasta-gauge'); gauge.hidden = !['saute', 'boil', 'toss'].includes(phase) || g.state === 'intro';
      gauge.dataset.kind = phase;
      this.$('pasta-gauge-label').textContent = phase === 'saute' ? '온도' : phase === 'boil' ? '거품' : '힘';
      if (phase === 'result' && !this.shown) { this.shown = true; this.showResult(); this.onResult?.(g.result); }
    }
    this.set('pasta-status', 'hidden', g.phase !== 'paused');
    if (phase === 'chop') {
      const ch = g.chop, list = g.recipe.ingredients;
      this.set('pasta-chips', 'html', list.map((k, i) => `<span class="${i < ch.index || g.state === 'done' ? 'done' : i === ch.index ? 'active' : ''}"><i style="background:${hex(ING_COLOR[k])}"></i>${INGREDIENTS[k].name}${i < ch.index || g.state === 'done' ? ' ✓' : ''}</span>`).join(''));
      this.set('pasta-detail', 'text', `PERFECT ${ch.perfects} / ${ch.slices.length} · COMBO ${ch.combo}`);
    }
    if (phase === 'saute') {
      const s = g.saute, z = sauteZone(s.t);
      this.set('pasta-gauge-zone', 'bottom', ((z.center - z.half) * 100).toFixed(1) + '%');
      this.set('pasta-gauge-zone', 'height', (z.half * 200).toFixed(1) + '%');
      this.set('pasta-gauge-needle', 'bottom', (Math.min(1, s.temp) * 100).toFixed(1) + '%');
      this.set('pasta-meter-fill', 'width', (Math.min(1, s.t / SAUTE_TIME) * 100).toFixed(1) + '%');
      const hot = s.temp > z.center + z.half, cold = s.temp < z.center - z.half;
      this.set('pasta-detail', 'text', g.state !== 'play' ? '' : hot ? '타고 있어요! 손을 떼세요' : cold ? '불이 약해요, 꾹 누르세요' : '좋아요, 그대로!');
      this.shell.dataset.heat = g.state === 'play' ? hot ? 'hot' : cold ? 'cold' : 'good' : '';
    }
    if (phase === 'boil') {
      const b = g.boil;
      this.set('pasta-meter-fill', 'width', (Math.min(1, b.done / 1.25) * 100).toFixed(1) + '%');
      this.set('pasta-gauge-zone', 'bottom', '75%'); this.set('pasta-gauge-zone', 'height', '25%');
      this.set('pasta-gauge-needle', 'bottom', (Math.min(1, b.foam) * 100).toFixed(1) + '%');
      this.set('pasta-detail', 'text', g.state === 'intro' ? '' : NOODLE_WORD[g.noodleState()] + (b.overflow ? ` · 넘침 ${b.overflow}` : ''));
      this.$('pasta-next').disabled = g.state !== 'play' || g.phase === 'paused';
      this.shell.dataset.foam = b.foam > .75 ? 'high' : '';
    }
    if (phase === 'toss') {
      const t = g.toss, band = t.bands[Math.min(2, t.results.length)];
      this.set('pasta-gauge-zone', 'bottom', (band[0] / 1.15 * 100).toFixed(1) + '%');
      this.set('pasta-gauge-zone', 'height', ((band[1] - band[0]) / 1.15 * 100).toFixed(1) + '%');
      const shown = t.charging ? t.power : t.results.at(-1)?.height ?? 0;
      this.set('pasta-gauge-needle', 'bottom', (Math.min(1.15, shown) / 1.15 * 100).toFixed(1) + '%');
      this.set('pasta-chips', 'html', [0, 1, 2].map(i => { const r = t.results[i]; return `<span class="${r ? r.grade : i === t.results.length ? 'active' : ''}">${i + 1}${r ? ' · ' + r.score : ''}</span>`; }).join(''));
      this.set('pasta-detail', 'text', g.state === 'play' ? `${Math.min(3, t.results.length + 1)} / 3` : '');
    }
    if (phase === 'recipe') this.$('pasta-next').disabled = false;
  }
  showResult() {
    const r = this.g.result, g = this.g;
    const stars = r.value >= 90 ? 3 : r.value >= 70 ? 2 : r.value >= 45 ? 1 : 0;
    const parts = [['chop', r.chopScore], ['heat', r.heatScore], ['noodle', r.noodleScore], ['toss', r.tossScore]].sort((a, b) => a[1] - b[1]);
    const weak = parts[0][0];
    const critic = r.value >= 92 ? '셰프, 이건 메뉴판에 올려야 해요!'
      : weak === 'chop' ? '칼질이 들쭉날쭉해요. 점선에 리듬을 맞춰 보세요.'
      : weak === 'heat' ? (r.burn > 1 ? '불맛을 넘어 탄 맛이 나요.' : '소스가 덜 졸았어요. 불을 조금 더 세게!')
      : weak === 'noodle' ? (r.overflow > 1 ? '냄비가 넘쳤어요! 거품을 톡톡 눌러 주세요.' : ['raw', 'firm'].includes(r.noodle) ? '면이 아직 딱딱해요. 조금만 더 기다려요.' : r.noodle === 'aldente' ? '면은 완벽해요! 다른 단계만 다듬으면 돼요.' : '면이 퍼졌어요. 조금 더 일찍 건져 보세요.')
      : '토스가 아쉬워요. 노란 링 높이를 노려 보세요.';
    this.$('result').hidden = false;
    this.$('result').innerHTML = `<section class="result-card pasta-result" aria-labelledby="pasta-result-title"><span class="eyebrow">BUON APPETITO!</span><h2 id="pasta-result-title">${g.recipe.name} 파스타 완성!</h2><div class="pasta-score-line"><div class="result-value">${r.value}<small>점</small></div><span class="pasta-stars" aria-label="${stars} / 3">${'★'.repeat(stars)}<em>${'★'.repeat(3 - stars)}</em></span></div><p class="pasta-critic">${critic}</p><div class="pasta-score-list"><span>칼질<b>${r.chopScore}</b></span><span>불 조절<b>${r.heatScore}</b></span><span>면 익힘<b>${r.noodleScore}</b></span><span>토스<b>${r.tossScore}</b></span></div><p class="pasta-result-detail">PERFECT ${r.perfects}/${r.slices} · COMBO ${r.maxCombo} · ${NOODLE_WORD[r.noodle]}</p><div class="result-actions"><button class="primary" data-action="retry">한 접시 더 →</button><button class="secondary" data-action="boast">자랑하기 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.abort.abort(); this.view.destroy(); }
}
