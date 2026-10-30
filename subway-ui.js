import { SubwayGame, LENGTH, MAX_BUMPS } from './subway-engine.js';
import { SubwayView } from './subway-view.js';

export const SUBWAY_HELP = '좌우 스와이프 또는 화면 양쪽 탭으로 이동하세요. 위로 스와이프하거나 Space로 점프! ← → / A D 이동 · Enter 출발 · Esc 일시 정지. 세 번 부딪히면 넘어져요.';
export class SubwayController {
  constructor({ app, header, modal, sound, onResult }) {
    this.g = new SubwayGame(); this.abort = new AbortController(); this.modal = modal;
    app.innerHTML = header + `<main id="main" class="game-shell subway"><div class="subway-top"><div><span class="eyebrow">SSUN METRO · 08:59</span><h1>지하철 뛰어타기</h1></div><div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-action="share" aria-label="게임 공유">↗</button></div></div><div class="subway-viewport"><canvas id="game" tabindex="0" aria-label="지하철 뛰어타기"></canvas><div class="subway-hud"><div><span>문 닫히기까지</span><b id="sub-time">21.0s</b></div><div><span>남은 거리</span><b id="sub-distance">150m</b></div><div><span>부딪힘</span><b id="sub-bumps">0 / 3</b></div></div><p id="sub-message" class="subway-message" role="status" aria-live="polite"></p><div id="sub-intro" class="subway-intro"><span>출근길의 마지막 기회</span><h2>부장님, 뛰세요!</h2><p>${SUBWAY_HELP}</p><button id="sub-start" class="primary">출발 →</button></div><div id="result" class="result-overlay" hidden></div></div><div class="subway-bottom"><button data-move="-1" aria-label="왼쪽 이동">←</button><button id="sub-jump">점프 ↑</button><button data-move="1" aria-label="오른쪽 이동">→</button></div></main>`;
    this.shell = app.querySelector('.subway'); this.canvas = app.querySelector('#game');
    this.view = new SubwayView(this.canvas, this.g, { sound }); this.canvas.__subway = this;
    const opt = { signal:this.abort.signal }, g = this.g;
    const start = () => { this.view.sfx.ensure(); g.start(); this.canvas.focus({ preventScroll:true }); };
    this.shell.addEventListener('click', e => {
      if (e.target.closest('#sub-start')) start();
      const move = e.target.closest('[data-move]');
      if (move && !modal.open) { this.view.sfx.ensure(); g.move(Number(move.dataset.move)); }
      if (e.target.closest('#sub-jump') && !modal.open) { this.view.sfx.ensure(); g.jump(); }
    }, opt);
    this.canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || modal.open || this.pointer) return;
      e.preventDefault(); this.view.sfx.ensure(); this.canvas.focus({ preventScroll:true });
      this.pointer = { id:e.pointerId, x:e.clientX, y:e.clientY }; this.canvas.setPointerCapture(e.pointerId);
    }, opt);
    this.canvas.addEventListener('pointerup', e => {
      const p = this.pointer; if (!p || p.id !== e.pointerId) return; this.pointer = null;
      if (modal.open) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (g.phase === 'ready') return start();
      if (dy < -28 && Math.abs(dy) > Math.abs(dx)) g.jump();
      else if (Math.abs(dx) > 28) g.move(Math.sign(dx));
      else if (Math.abs(dy) < 28) { const r = this.canvas.getBoundingClientRect(); g.move(e.clientX < r.left + r.width / 2 ? -1 : 1); }
    }, opt);
    this.canvas.addEventListener('pointercancel', () => { this.pointer = null; }, opt);
    window.addEventListener('keydown', e => {
      if (modal.open || e.target.closest('input,textarea,select') || e.repeat) return;
      if (!['ArrowLeft','ArrowRight','ArrowUp','a','A','d','D',' ','Enter','Escape'].includes(e.key)) return;
      e.preventDefault(); this.view.sfx.ensure();
      if (e.key === 'Escape') this.shell.querySelector('[data-action="pause"]').click();
      else if (g.phase === 'ready' && ['Enter',' '].includes(e.key)) start();
      else if (['ArrowLeft','a','A'].includes(e.key)) g.move(-1);
      else if (['ArrowRight','d','D'].includes(e.key)) g.move(1);
      else if (['ArrowUp',' '].includes(e.key)) g.jump();
    }, opt);
    let prev = performance.now(), lastHUD = '';
    const frame = now => {
      if (this.dead) return;
      const dt = Math.min(.05, (now - prev) / 1000); prev = now;
      if (!modal.open) {
        g.update(dt);
        for (const e of g.events.splice(0)) this.view.handle(e);
        this.view.render(dt);
      }
      const key = [g.phase, g.count, g.remaining.toFixed(1), Math.ceil(LENGTH - g.z), g.bumps].join('|');
      if (key !== lastHUD) {
        lastHUD = key;
        this.shell.querySelector('#sub-time').textContent = g.remaining.toFixed(1) + 's';
        this.shell.querySelector('#sub-distance').textContent = Math.max(0, Math.ceil(LENGTH - g.z)) + 'm';
        this.shell.querySelector('#sub-bumps').textContent = `${g.bumps} / ${MAX_BUMPS}`;
        this.shell.querySelector('#sub-intro').hidden = g.phase !== 'ready';
        this.shell.querySelector('#sub-message').textContent = g.phase === 'paused' ? '일시 정지' : g.phase === 'count' ? String(g.count) : g.phase === 'run' && g.announced ? '문이 닫힙니다~' : '';
        this.shell.dataset.urgent = String(g.remaining < 6);
      }
      if (g.phase === 'result' && !this.shown) { this.shown = true; onResult(g.result); this.result(); }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  result() {
    const r = this.g.result, el = this.shell.querySelector('#result'); el.hidden = false;
    const message = r.cleared ? '탑승 성공!' : r.reason === 'door' ? '서류가방만 출근했어요…' : r.reason === 'missed' ? '헉헉… 열차는 칼퇴근.' : '죄송합니다! 죄송합니다! 철퍼덕.';
    el.innerHTML = `<section class="result-card subway-result"><span class="eyebrow">${r.cleared ? 'JUST IN TIME' : 'NEXT TRAIN, PLEASE'}</span><h2>${message}</h2><p>${r.title}</p>${r.cleared ? `<div class="subway-margin">문 닫히기 <strong>${r.margin.toFixed(1)}</strong>초 전!</div>` : '<p>다음 열차를 이용해 주세요</p>'}<div class="result-value">${r.value}<small>점</small></div><p><span>달린 거리</span> ${r.distance}m · <span>피한 장애물</span> ${r.dodges} · <span>부딪힘</span> ${r.bumps}</p><div class="result-actions"><button class="primary" data-action="retry">다시 도전 ↻</button><button class="secondary" data-action="boast">기록 공유 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
  }
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); this.abort.abort(); this.view.destroy(); }
}
