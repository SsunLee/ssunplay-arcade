import {
  DriveGame,
  BeerGame,
  BEER_ORDERS,
  STAGES,
  clamp,
} from "./engine.js";
import { GameView } from "./stage.js";
import { BeerView } from "./beer.js";
import { beerShareSummary } from "./beer-share.js";
import { PastaGame } from "./pasta-engine.js";
import { PastaView } from "./pasta-view.js";
import { PastaController } from "./pasta-ui.js";
import { DalgonaGame } from "./dalgona-engine.js";
import { DalgonaView } from "./dalgona-view.js";
import { DalgonaController } from "./dalgona-ui.js";
import { SubwayGame } from "./subway-engine.js";
import { SubwayView } from "./subway-view.js";
import { SubwayController, SUBWAY_HELP } from "./subway-ui.js";
import { subwayShareText } from "./subway-engine.js";
import { RunwayGame } from "./runway-engine.js";
import { RunwayView } from "./runway-view.js";
import { RunwayController } from "./runway-ui.js";
import { t, languageControl, initI18n, translatePage } from "./i18n.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#dialog"),
  body = $("#dialog-body");
const KEY = "ssunplay.3d.v2";
let data = {
  version: 2,
  name: "플레이어",
  sound: true,
  beer: 0,
  pasta: 0,
  dalgona: 0,
  subway: 0,
  runway: 0,
  drive: {},
  history: [],
  practice: 0,
};
try {
  const v = JSON.parse(localStorage.getItem(KEY));
  if (v?.version === 2) data = { ...data, ...v };
} catch {}
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    toast("저장 공간이 부족합니다. 기록을 내보내 주세요.");
  }
};
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let active = null,
  views = [],
  raf = 0,
  last = 0,
  frame = 0,
  muted = !data.sound,
  audio = null,
  toastTimer;
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2500);
}
function beep(type = "tap") {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const now = audio.currentTime;
    const notes =
      type === "win"
        ? [523, 659, 784]
        : type === "fail"
          ? [220, 165, 110]
          : [330];
    notes.forEach((hz, i) => {
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = "sine";
      o.frequency.value = hz;
      o.connect(g);
      g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, now + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.065, now + i * 0.1 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.19);
      o.start(now + i * 0.1);
      o.stop(now + i * 0.1 + 0.2);
    });
  } catch {}
}
const homeIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/></svg>';
function clean() {
  cancelAnimationFrame(raf);
  views.forEach((v) => v.destroy());
  views = [];
  active?.inputController?.abort();
  active = null;
  document.body.classList.remove("playing");
  modal.close();
}
function go(path) {
  history.pushState({}, "", path);
  route();
}
window.addEventListener("popstate", route);
// a long press in a game must never start text selection, the iOS loupe or a callout menu
const inGame = (e) => e.target instanceof Element && e.target.closest(".game-shell") && !e.target.closest("input, textarea, select");
for (const type of ["selectstart", "contextmenu"]) document.addEventListener(type, (e) => inGame(e) && e.preventDefault());
document.addEventListener("touchstart", (e) => inGame(e) && e.target instanceof HTMLCanvasElement && e.preventDefault(), { passive: false });
function header(game) {
  return `<header class="${game ? "game-header" : "site-header"}"><a href="/" class="brand" data-nav>${game ? homeIcon : '<span class="brand-mark">S.</span>'}<span>${game ? "쑨플레이" : "SSUNPLAY"}${!game ? "<small>조금 이상한 게임들</small>" : ""}</span></a>${game ? `<div class="bar-title">${game === "subway" ? "지하철 뛰어타기" : game === "beer" ? "맥주 잘 따르기" : game === "pasta" ? "파스타 만들기" : game === "dalgona" ? "달고나 뽑기" : game === "runway" ? "쑨에어 버터 랜딩" : "부장님의 티코레이싱"}</div>` : ""}<nav><button data-action="records">내 기록</button><button data-action="help">${game ? "도움말" : "사이트 안내"}</button>${game ? '<button data-action="fullscreen" aria-label="전체 화면">⛶</button>' : ""}<button data-action="sound" aria-label="소리 켜기/끄기">${muted ? "♩ OFF" : "♫ ON"}</button>${languageControl()}</nav></header>`;
}
function home() {
  clean();
  document.title = "쑨플레이 — 조금 이상한 3D 게임들";
  app.innerHTML = `${header()}<main id="main" class="home"><div class="intro-line"><div><span class="eyebrow">작은 조작, 아슬아슬한 순간.</span><h1>조금 이상한 게임들</h1><p>설치 없이, 지금 바로 플레이하세요.</p></div><span class="stamp">JUST<br>ONE<br>MORE.</span></div><div class="news"><span>UPDATE</span><div class="news-lines"><p>NEW 쑨에어 버터 랜딩! 김포 14R에서 V1, 로테이트, 그리고 버터 랜딩까지.</p><p>NEW 지하철 뛰어타기! 문 닫히기 직전, 부장님의 출근 질주.</p><p>NEW 달고나 뽑기! 녹이고, 부풀리고, 살살 떼어 내기.</p></div><time>2026.10.31</time></div><section class="game-grid" aria-label="게임 목록"><a class="game-card" href="/game/drive/" data-nav><div class="card-visual"><canvas id="preview-drive" aria-label="3D 티코와 바다 절벽"></canvas><span class="card-tag yellow">간담이 서늘한</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">01 / TICO</span><h2>부장님의 티코레이싱</h2><p>브레이크 없는 부장님의 티코.<br>절벽에 얼마나 가까이 갈 수 있을까요?</p><div class="card-bottom"><span>당겼다 놓기 · 5개 스테이지</span><strong>플레이 ↗</strong></div></div></a><a class="game-card" href="/game/beer/" data-nav><div class="card-visual beer-card"><canvas id="preview-beer" aria-label="3D 맥주 탭과 유리잔"></canvas><span class="card-tag yellow">NEW · 거품까지 맛있게</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">02 / TAPROOM</span><h2>맥주 잘 따르기</h2><p>기울이면 맥주, 세우면 거품.<br>세 손님의 완벽한 한 잔을 완성하세요.</p><div class="card-bottom"><span>누르고 따르기 · 잔 기울이기</span><strong>플레이 ↗</strong></div></div></a><a class="game-card pasta-card" href="/game/pasta/" data-nav><div class="card-visual"><canvas id="preview-pasta" aria-label="파스타 만들기"></canvas><span class="card-tag">손맛 좋은 한 접시</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">03 / CUCINA</span><h2>파스타 만들기</h2><p>탁탁 썰고, 두 화구를 오가며, 출렁 토스.<br>세 단계로 완성하는 나만의 한 접시.</p><div class="card-bottom"><span>리듬 칼질 · 두 화구 멀티태스킹</span><strong>플레이 ↗</strong></div></div></a><a class="game-card dalgona-card" href="/game/dalgona/" data-nav><div class="card-visual"><canvas id="preview-dalgona" aria-label="달고나 뽑기"></canvas><span class="card-tag yellow">NEW · 숨죽이는 바늘 끝</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">04 / STREET</span><h2>달고나 뽑기</h2><p>연탄불에 녹이고, 소다로 부풀리고.<br>금 가기 전에 모양을 떼어 내세요.</p><div class="card-bottom"><span>만들기 · 바늘 뽑기</span><strong>플레이 ↗</strong></div></div></a><a class="game-card subway-card" href="/game/subway/" data-nav><div class="card-visual"><canvas id="preview-subway" aria-label="지하철 뛰어타기"></canvas><span class="card-tag yellow">NEW · 출근길의 마지막 기회</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">05 / METRO</span><h2>지하철 뛰어타기</h2><p>문 닫히기 직전, 부장님의 출근 질주.</p><div class="card-bottom"><span>좌우 이동 · 점프 · 아슬아슬 탑승</span><strong>플레이 ↗</strong></div></div></a><a class="game-card runway-card" href="/game/runway/" data-nav><div class="card-visual"><canvas id="preview-runway" aria-label="김포 활주로 14R 위의 쑨에어 여객기"></canvas><span class="card-tag yellow">NEW · 항공덕후 주목</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">06 / RUNWAY 14R</span><h2>쑨에어 버터 랜딩</h2><p>V1, 로테이트, 그리고 플레어.<br>측풍을 뚫고 버터처럼 내려앉으세요.</p><div class="card-bottom"><span>이륙 · 착륙 · 측풍</span><strong>플레이 ↗</strong></div></div></a></section><div class="home-record"><span>MY BEST</span><p>해안 절벽 <b>${data.drive[0] != null ? fmt(data.drive[0]) + "m" : "—"}</b></p><p>맥주 잘 따르기 <b>${data.beer || "—"}${data.beer ? "점" : ""}</b></p><p>파스타 만들기 <b>${data.pasta || "—"}${data.pasta ? "점" : ""}</b></p><p>달고나 뽑기 <b>${data.dalgona || "—"}${data.dalgona ? "점" : ""}</b></p><p>지하철 뛰어타기 <b>${data.subway || "—"}${data.subway ? "점" : ""}</b></p><p>쑨에어 버터 랜딩 <b>${data.runway || "—"}${data.runway ? "점" : ""}</b></p><button data-action="records">기록 보기 ↗</button></div><section class="how"><h2>생각보다 쉽고,<br>생각보다 어렵습니다.</h2><p>마우스와 손가락 하나면 충분해요.<br>짧은 한 판을 즐기고 나의 최고 기록에 도전하세요.</p></section></main><footer><a href="/" class="footer-brand" data-nav>SSUNPLAY</a><p>Play a little. Try again.</p><button data-action="credits">제작 정보 · 참고 사이트</button><a href="https://github.com/SsunLee/ssunplay-arcade" target="_blank" rel="noreferrer">GitHub ↗</a></footer>`;
  try {
    const b = new DriveGame();
    views.push(new GameView("drive", $("#preview-drive"), b, { preview: true }));
    const beerPreview = new BeerGame(42);
    beerPreview.liquid = 0.63;
    beerPreview.foam = 0.17;
    beerPreview.angle = beerPreview.targetAngle = 0;
    views.push(
      new BeerView($("#preview-beer"), beerPreview, { preview: true }),
    );
    const pastaPreview = new PastaGame(42);
    views.push(new PastaView($("#preview-pasta"), pastaPreview, { preview: true }));
    views[2].render(0);
    views.push(new DalgonaView($("#preview-dalgona"), new DalgonaGame(42), { preview: true }));
    views[3].render(0);
    views.push(new SubwayView($("#preview-subway"), new SubwayGame(42), { preview:true }));
    views[4].render(0);
    views.push(new RunwayView($("#preview-runway"), new RunwayGame(42), { preview: true }));
    views[5].render(0);
    let prev = performance.now();
    const tick = (t) => {
      if (t - prev > 100) {
        const dt = Math.min(0.1, (t - prev) / 1000);
        prev = t;
        b.clock += dt;
        views[0]?.render(dt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch (e) {
    console.error(e);
    toast("3D 미리보기를 불러오지 못했습니다.");
  }
}
function fmt(v) {
  return Math.abs(v) < 0.01 ? v.toFixed(3) : v.toFixed(2);
}
function mount(stage = 0) {
  clean();
  document.body.classList.add("playing");
  const kind = "drive",
    g = new DriveGame(stage);
  document.title = "부장님의 티코레이싱 | 쑨플레이";
  app.innerHTML = `${header(kind)}<main id="main" class="game-shell ${kind}"><canvas id="game" tabindex="0" aria-label="화면을 아래로 당긴 다음 놓아 출발하세요"></canvas><div class="hud"><div class="hud-left"><div class="hud-label" id="stage-label"></div><div id="main-value" class="main-value"></div><div id="best-value" class="best-value"></div></div><div class="hud-right"><select id="stage-select" aria-label="스테이지">${STAGES.map((s, i) => `<option value="${i}" ${i === stage ? "selected" : ""}>${i + 1}. ${s.name}</option>`).join("")}</select><div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog" title="공유"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg></button></div></div></div><div id="title-overlay" class="title-overlay"><p class="game-kicker">HOW CLOSE CAN YOU GO?</p><h1>부장님의 티코레이싱</h1><p class="game-subtitle">절벽 바로 앞, 멈출 수 있을까요?</p></div><div id="gesture-guide" class="gesture-guide"><div class="gesture-arrow">↓</div><b>아래로 당겼다가 놓으세요</b><span>한 번 출발하면 멈출 수 없어요</span></div><div id="game-status" class="game-status" role="status" aria-live="polite"></div><div id="result" class="result-overlay" hidden></div><div class="bottom-bar"><span>힘 조절이 전부입니다. 낭떠러지에선 바퀴와 무게중심을 조심하세요.</span><button data-action="help">조작 방법 ?</button></div></main>`;
  let view;
  try {
    view = new GameView(kind, $("#game"), g);
  } catch (e) {
    console.error(e);
    $("#result").hidden = false;
    $("#result").innerHTML =
      '<section class="result-card"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p><a href="/" data-nav class="primary">홈으로</a></section>';
    return;
  }
  views = [view];
  active = {
    kind,
    g,
    view,
    resultShown: false,
  };
  bindInput(active);
  $("#stage-select")?.addEventListener("change", (e) =>
    mount(+e.target.value),
  );
  last = performance.now();
  frame = 0;
  const tick = (t) => {
    if (!active) return;
    const dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    if (!modal.open) g.update(dt);
    active.view.render(dt);
    updateHUD();
    raf = requestAnimationFrame(tick);
  };
  updateHUD();
  raf = requestAnimationFrame(tick);
}
function bindInput(a) {
  const c = $("#game"),
    { g, view } = a;
  let pointer = null,
    startY = 0;
  c.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !["ready", "aim"].includes(g.phase)) return;
    beep();
    pointer = e.pointerId;
    c.setPointerCapture(pointer);
    startY = e.clientY;
    g.setPull(0);
    c.focus();
    e.preventDefault();
  });
  c.addEventListener("pointermove", (e) => {
    if (pointer !== e.pointerId) return;
    g.setPull(
      (e.clientY - startY) /
        Math.max(
          220,
          Math.min(
            view.height * 0.5 * (g.config.reach || 1),
            view.height * 0.72,
          ),
        ),
    );
    e.preventDefault();
  });
  const end = (e) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (e.type === "pointercancel") {
      g.setPull(0);
      g.phase = "ready";
      return;
    }
    g.launch();
    e.preventDefault();
  };
  c.addEventListener("pointerup", end);
  c.addEventListener("pointercancel", end);
  c.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      togglePause();
      e.preventDefault();
    }
    if (e.key.toLowerCase() === "r") {
      retry();
      e.preventDefault();
    }
    if (e.code === "Space" && !e.repeat && ["ready", "aim"].includes(g.phase)) {
      a.keyStart = performance.now();
      g.setPull(0.04);
      e.preventDefault();
    }
  });
  c.addEventListener("keyup", (e) => {
    if (e.code === "Space" && a.keyStart) {
      const hold = (performance.now() - a.keyStart) / 1000;
      a.keyStart = 0;
      g.launch(clamp(hold / 2, 0.04, 1));
      e.preventDefault();
    }
  });
}
function updateHUD() {
  const a = active;
  if (!a) return;
  const { g, kind } = a;
  if (kind === "beer") {
    updateBeerHUD();
    return;
  }
  if (a.keyStart) g.setPull(clamp((performance.now() - a.keyStart) / 2000, 0.04, 1));
  const ready = ["ready", "aim"].includes(g.phase);
  $("#title-overlay").classList.toggle("gone", !ready);
  $("#gesture-guide").classList.toggle("gone", !ready || g.phase === "aim");
  $("#game").classList.toggle("grabbing", g.phase === "aim");
  $("#stage-label").textContent = STAGES[g.stage].name;
  $("#main-value").innerHTML = `${fmt(g.gap)}<small>m</small>`;
  $("#best-value").textContent =
    "BEST " +
    (data.drive[g.stage] != null ? fmt(data.drive[g.stage]) + "m" : "—") +
    (g.phase === "run"
      ? " · " + (Math.hypot(g.car.vx, g.car.vy) * 3.6).toFixed(0) + " km/h"
      : "");
  const status =
    g.phase === "paused"
      ? "일시 정지"
      : g.phase === "judge"
        ? "잠깐… 버틸 수 있을까요?"
        : g.phase === "fall"
          ? "으아아아악!"
          : g.phase === "run" && g.slow < 0.6
            ? "숨을 참으세요…"
            : "";
  $("#game-status").textContent = status;
  $("#game-status").classList.toggle("visible", !!status);
  if (g.phase === "result" && !a.resultShown) showResult();
}
function showResult() {
  const a = active,
    { g } = a,
    r = g.result;
  a.resultShown = true;
  beep(!r.fell ? "win" : "fail");
  let newBest = false;
  if (
    !r.fell &&
    (data.drive[g.stage] == null || r.gap < data.drive[g.stage])
  ) {
    data.drive[g.stage] = r.gap;
    newBest = true;
  }
  data.history.unshift({ ...r, at: Date.now(), name: data.name });
  data.history = data.history.slice(0, 60);
  save();
  const el = $("#result");
  el.hidden = false;
  const near = !r.fell && r.gap < 1.5;
  el.innerHTML = `<section class="result-card"><span class="eyebrow">${newBest ? "NEW PERSONAL BEST" : r.fell ? "BOSS DOWN" : near ? "ON THE EDGE" : "ONE MORE TRY"}</span><h2>${r.fell ? "부장님, 추락!" : near ? "간발의 차이!" : "안전하게 정지!"}</h2><div class="result-value">${r.fell ? "풍덩!" : fmt(r.gap)}<small>${r.fell ? "" : "m"}</small></div><p>${r.fell ? "조금만 덜 당겼더라면…" : r.gap < 0 ? "앞부분이 절벽 밖으로 나왔지만, 버텼습니다!" : "절벽까지 남은 거리. 더 가까이 도전해 보세요."}</p><div class="result-actions"><button class="primary" data-action="retry">다시 도전 ↻</button><button class="secondary" data-action="share">기록 공유 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
}
function retry() {
  if (active?.kind === "subway") { mountSubway(); return; }
  if (active?.kind === "pasta") { mountPasta(); return; }
  if (active?.kind === "dalgona") { mountDalgona(); return; }
  if (active?.kind === "runway") { mountRunway(); return; }
  if (!active) return;
  const { kind, g } = active;
  if (kind === "beer") {
    mountBeer();
    return;
  }
  mount(g.stage);
}
function togglePause() {
  if (!active) return;
  active.keyStart = null;
  const g = active.g;
  if (g.phase === "paused") g.resume();
  else g.pause();
  const b = $('[data-action="pause"]');
  b.textContent = g.phase === "paused" ? "▶" : "Ⅱ";
  b.setAttribute("aria-label", g.phase === "paused" ? "계속하기" : "일시 정지");
}
function openDialog(html) {
  modal.classList.remove("share-dialog", "boast-dialog");
  modal.removeAttribute("aria-labelledby");
  if (active?.kind === "beer") {
    active.g.setPour(false);
    active.pourPointers?.clear();
  }
  if (active) active.keyStart = null;
  body.innerHTML =
    '<button class="dialog-close" data-action="close" aria-label="닫기">×</button>' +
    html;
  modal.showModal();
}
function records() {
  openDialog(
    `<span class="eyebrow">MY RECORDS</span><h2>나의 최고 기록</h2><p class="muted">이 브라우저에 저장되는 개인 기록입니다.</p><label class="name-label">플레이어 이름<input id="player-name" value="${esc(data.name)}" maxlength="20"></label><button class="mini" data-action="name">이름 저장</button><div class="record-row"><span>맥주 잘 따르기</span><strong>${data.beer || "—"}${data.beer ? "점" : ""}</strong></div><div class="record-row"><span>파스타 만들기</span><strong>${data.pasta || "—"}${data.pasta ? "점" : ""}</strong></div><div class="record-row"><span>달고나 뽑기</span><strong>${data.dalgona || "—"}${data.dalgona ? "점" : ""}</strong></div><div class="record-row"><span>지하철 뛰어타기</span><strong>${data.subway || "—"}${data.subway ? "점" : ""}</strong></div><div class="record-row"><span>쑨에어 버터 랜딩</span><strong>${data.runway || "—"}${data.runway ? "점" : ""}</strong></div>${STAGES.map((s, i) => `<div class="record-row"><span>${s.name}</span><strong>${data.drive[i] != null ? fmt(data.drive[i]) + "m" : "—"}</strong></div>`).join("")}<p class="muted small">자동차는 남은 거리가 작을수록 좋은 기록입니다.<br>추락한 기록은 최고 기록에서 제외합니다.</p><div class="dialog-actions"><button class="secondary" data-action="export">기록 내보내기</button><label class="secondary file-label">가져오기<input type="file" id="import" accept="application/json,.json"></label></div>`,
  );
  $("#import").addEventListener("change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file || file.size > 100000) throw Error();
      const v = JSON.parse(await file.text());
      if (
        v.version !== 2 ||
        (v.beer != null &&
          (!Number.isInteger(v.beer) || v.beer < 0 || v.beer > 100)) ||
        !v.drive ||
        Array.isArray(v.drive) ||
        Object.entries(v.drive).some(
          ([k, x]) =>
            !/^\d$/.test(k) ||
            +k > 4 ||
            typeof x !== "number" ||
            !Number.isFinite(x) ||
            x < -12 ||
            x > 200,
        )
      )
        throw Error();
      data.beer = Math.max(data.beer || 0, v.beer || 0);
      if (Number.isFinite(v.subway) && v.subway >= 0) data.subway = Math.max(data.subway || 0, v.subway);
      for (const [k, x] of Object.entries(v.drive))
        data.drive[k] = data.drive[k] == null ? x : Math.min(x, data.drive[k]);
      save();
      records();
      toast("기록을 가져왔습니다.");
    } catch {
      toast("올바른 쑨플레이 기록 파일을 선택해 주세요.");
    }
  });
}
function help() {
  const k = active?.kind;
  if(!k){openDialog('<span class="eyebrow">THREE LITTLE GAMES</span><h2>쑨플레이 이용 안내</h2><h3>부장님의 티코레이싱</h3><p>화면을 아래로 당겼다 놓아 출발합니다. 힘 표시와 브레이크 없이 절벽 가까이 멈추세요.</p><h3>맥주 잘 따르기</h3><p>누르는 동안 따르고, 잔의 기울기로 거품을 조절하세요. 세 손님의 주문을 완성하면 평균 점수가 기록됩니다.</p><p class="muted small">각 게임의 도움말에서 자세한 조작을 확인할 수 있습니다. 개인 기록은 브라우저에 저장되며 내보내기·가져오기를 지원합니다.</p>');return;}
  if (k === "subway") { openDialog(`<h2>지하철 뛰어타기</h2><p>${SUBWAY_HELP}</p>`); return; }
  if (k === "pasta") {
    openDialog('<span class="eyebrow">PASTA STUDIO</span><h2>파스타 만들기</h2><p>소스를 고르면 세 단계 요리가 시작됩니다. 단계마다 조작이 달라요.</p><h3>1. 재료 썰기</h3><p>재료가 칼 아래로 지나갑니다. 노란 점선이 칼날에 닿는 순간 탭하세요. 두께가 고를수록 점수가 높고, PERFECT를 이으면 콤보가 쌓입니다.</p><h3>2. 두 화구 동시에</h3><p>왼쪽 팬과 오른쪽 냄비가 한꺼번에 끓어요. 팬을 누르고 있으면 불이 세지고, 떼면 약해집니다. 팬은 천천히 반응하니 온도 바늘을 미리 초록 구간에 맞추세요. 그사이 냄비 거품이 차오르면 팬에서 손을 떼고 냄비를 톡 쳐 주세요. 면 막대가 알 덴테 구간에 들어오면 냄비에서 팬으로 끌거나 건지기를 누르세요.</p><h3>3. 만테카레</h3><p>면이 팬으로 쏟아지면 소스와 휘감아요. 위로 끌어올렸다 놓으면 면이 출렁 튀어 오릅니다. 끌어올린 길이가 힘이에요. 노란 링 높이에 맞춰 세 번! 끄는 동안 좌우로 흔들면 팬이 돌아요.</p><h3>오늘의 손님</h3><p>손님마다 원하는 소스와 부탁이 하나씩 있어요. 주문한 소스로 만들고 부탁까지 들어주면 보너스 점수와 팁을 받아요.</p><h3>피버와 플람베</h3><p>PERFECT를 다섯 번 이으면 칼이 빛나는 피버! 팬에 와인이 들어가는 순간 팬을 꾹 누르고 있으면 불꽃이 솟는 플람베가 됩니다.</p><p>키보드: Space로 썰기·팬 불 올리기·토스 힘 모으기, S로 냄비 치기, Enter로 시작·건지기, Esc로 일시 정지.</p>');
    return;
  }
  if (k === "dalgona") {
    openDialog('<span class="eyebrow">SSUN DALGONA</span><h2>달고나 뽑기</h2><p>모양을 고른 뒤 바로 뽑기로 곧장 바늘을 들거나, 직접 만들기로 설탕부터 녹여 보세요. 직접 잘 만든 달고나일수록 덜 깨져요.</p><h3>1. 설탕 녹이기</h3><p>화면을 누르고 있으면 국자가 연탄불에 올라가요. 누른 채 빙글빙글 저어야 고르게 녹습니다. 황금빛 구간에서 손을 떼세요. 너무 오래 두면 탑니다.</p><h3>2. 소다 넣기</h3><p>탭해서 소다를 넣고, 누른 채 빠르게 저어 부풀리세요. 알맞게 부풀었을 때 손을 떼면 됩니다.</p><h3>3. 누르기</h3><p>누르개를 아래로 끌어 납작하게 눌러요. 초록 구간이 딱 좋은 두께예요. 손을 떼면 모양 틀이 찍힙니다.</p><h3>4. 모양 뽑기</h3><p>바늘 끝은 손가락보다 조금 위에 있어서 손가락에 가리지 않아요. 빛나는 선 위에 손가락을 대면 바늘이 홈에 착 붙어요. 누른 채 선을 따라 여러 번 문질러 홈을 파세요. 긁는 곳이 금빛으로 빛나요. 한 구간이 다 파이면 바깥 조각이 헐거워지니 손가락으로 휙 밀어 치우세요. 많이 판 바깥쪽은 톡 쳐서 부러뜨릴 수도 있지만, 덜 팠으면 모양까지 같이 떨어질 수 있어요. 너무 빨리 긁거나 모양 안쪽을 긁으면 금 위험이 올라가고, 금이 모양 안으로 세 번 들어가면 깨져요.</p><h3>침 바르기</h3><p>침을 바르면 잠깐 동안 촉촉해져 잘 깨지지 않아요. 세 번까지 쓸 수 있습니다.</p><p>키보드: Space를 길게 눌러 녹이기·젓기·누르기, L로 침 바르기, Q로 바로 뽑기, Esc로 일시 정지. 모양 뽑기는 마우스나 터치로 해 주세요.</p>');
    return;
  }
  if (k === "runway") {
    openDialog('<span class="eyebrow">SSUN AIR · RWY 14R</span><h2>쑨에어 버터 랜딩</h2><p>김포 활주로 14R에서 이륙하고, 다시 돌아와 착륙하세요. 이륙 40% + 착륙 60%가 총점입니다.</p><h3>1. 이륙</h3><p>추력을 끝까지 올리면 속도가 붙어요. V1을 지나 VR(145kt) 무렵 기수를 천천히 드세요. 135kt(VR−10)부터는 들어도 괜찮아요. 너무 일찍 들면 뜨지 못하고, 너무 늦으면 활주로를 벗어나요. 바퀴가 뜨기 전에 13°를 넘기면 테일스트라이크! 이륙 후 15°를 유지하며 300피트까지 상승하세요.</p><h3>2. 착륙</h3><p>3° 활공각에서 시작해요. PAPI(활주로 왼쪽 등 4개)가 흰색 2개·빨간색 2개면 정상, 흰색이 많으면 높고 빨간색이 많으면 낮아요. 측풍이 불면 바람 쪽으로 살짝 기울여 중심선을 지키세요. 50피트 아래에서 추력을 줄이고 기수를 살짝 들어 플레어하세요.</p><h3>착륙 등급</h3><p>버터 랜딩(180fpm 미만) · 좋은 착륙(400fpm 미만) · 단단한 착륙(750fpm 미만) · 하드 랜딩(750fpm 이상). 1200fpm 이상, 날개·꼬리가 닿거나 활주로를 벗어나면 크래시예요. 400피트 아래에서 불안정하면 관제탑이 복행을 지시합니다.</p><h3>비행 보조</h3><p>조종 핸들을 놓으면 보조 장치가 날개를 천천히 수평으로 돌리고, 접근 중에는 중심선과 활공각 쪽으로 살짝 밀어 주며 속도를 VAPP에 맞춰요. 직접 조작하는 동안에는 꺼지고, 플레어는 직접 해야 해요!</p><h3>조작 방법</h3><p>키보드: W/↑ 기수 내리기 · S/↓ 기수 들기 · A/D 또는 ←/→ 기울이기 · Shift/+ 추력 올리기 · Ctrl/− 추력 줄이기 · Space 시작 · R 다시 시작 · Esc 일시 정지.</p><p>추력 레버: 화면 아래 가운데 추력 레버를 누르고 있으면 레버가 앞으로 밀리며 추력이 끝까지 올라가요. 누른 채로 아래로 끌면 기수 들기, 위로 끌면 기수 내리기, 좌우로 끌면 기울이기예요(조종 핸들도 같이 움직여요). 손을 떼면 조종은 가운데로 돌아오고, 추력은 이륙 전 지상에서는 아이들로, 비행 중에는 누르기 전 값으로 돌아가요. 착륙 때는 25피트 아래에서 보조 장치가 레버를 아이들로 당겨요(RETARD).</p><p>모바일: 아래 가운데 추력 레버를 누르고 있으면 가속하고, 누른 채로 끌면 조종돼요. 오른쪽 아래 조종 핸들을 끌어도 조종할 수 있어요(아래로 끌면 기수 들기, 좌우로 끌면 기울이기, 손을 떼면 가운데로 돌아와요). 화면을 끌어도 되고, 📱 버튼으로 기기 기울기 조종을 켤 수 있어요.</p><p class="muted small">실제 항공사·공항 운영과 관계없는 가상의 비행입니다.</p>');
    return;
  }
  if (k === "beer") {
    beerHelp();
    return;
  }
  openDialog(
    `<span class="eyebrow">HOW TO PLAY</span><h2>부장님의 티코레이싱</h2><p>운전석엔 부장님, 차는 각진 티코. 부장님의 퇴근길을 절벽 끝에서 멈춰 주세요.</p><p>화면을 아래로 당겨 힘을 정하고 손을 놓아 출발하세요. 멀리 당길수록 강한 힘으로 출발합니다. 출발 후에는 브레이크가 없습니다.</p><p>절벽 가까이 멈출수록 좋은 기록! 앞부분이 절벽 밖으로 나와도 무게중심이 버티면 성공입니다. 차종과 노면이 다른 5개 스테이지에 도전하세요.</p><h3>키보드</h3><p>Space를 길게 누르면 힘이 커집니다. 손을 떼면 출발합니다.<br>R 다시 시작 · Esc 일시 정지</p><p class="muted small">기록은 브라우저에 저장됩니다. 다른 기기로 옮기려면 내 기록에서 파일을 내보내 주세요.</p>`,
  );
}
function share(boast = false) {
  const a = active;
  if (!a) return;
  const r = a.g.result;
  const summary = boast && a.kind === "beer" ? beerShareSummary(a.g) : null;
  const text = t(a.kind === "subway" ? subwayShareText(r) : summary ? summary.text :
    !r
      ? `${{ beer: "맥주 잘 따르기", drive: "부장님의 티코레이싱", pasta: "파스타 만들기", dalgona: "달고나 뽑기", runway: "쑨에어 버터 랜딩" }[a.kind]} — 쑨플레이에서 한 판 도전해 보세요!`
      : a.kind === "pasta"
      ? `${a.g.recipe.name} 파스타 완성! ${r.value}점\n칼질 ${r.chopScore} · 불 조절 ${r.heatScore} · 면 익힘 ${r.noodleScore} · 토스 ${r.tossScore}\nPERFECT ${r.perfects}/${r.slices} · COMBO ${r.maxCombo}`
      : a.kind === "runway"
      ? runwayShare(r, a.controller.livery)
      : a.kind === "dalgona"
      ? `달고나 ${a.g.shape.name} 뽑기 ${r.freed ? "성공" : "실패"}! ${r.value}점
온전함 ${r.integrity} · 금 ${r.cracks} · ${r.time}초`
      : a.kind === "beer"
      ? `맥주 잘 따르기 ${a.g.result?.value || 0}점! 나만의 완벽한 한 잔에 도전해 보세요.`
      : r?.fell
        ? "부장님의 티코레이싱 — 부장님이 절벽으로 날아갔어요…"
        : `부장님의 티코레이싱 ${STAGES[a.g.stage].name}, 절벽까지 ${fmt(a.g.gap)}m!`);
  const url = location.origin + location.pathname;
  const intent = new URL("https://x.com/intent/tweet");
  intent.searchParams.set("text", text);
  intent.searchParams.set("url", url);
  const card = summary ? `<section class="boast-card" aria-label="공유할 맥주 기록"><span class="boast-label">${esc(summary.label)}</span><div class="boast-score">${summary.score}<small>${summary.final ? "점 · 평균" : "점"}</small></div><dl class="boast-stats"><div><dt>${summary.final ? "총 흘린 맥주" : "흘린 맥주"}</dt><dd>${summary.spilledMl}<small>mL</small></dd></div><div><dt>${summary.final ? "누적 넘침 감점" : "넘침 감점"}</dt><dd>−${summary.penalty}<small>점</small></dd></div></dl><p>나보다 깔끔하게 따를 수 있나요?</p></section>` : `<p>${boast ? esc(text) : "친구에게 한 판 도전을 보내보세요."}</p>`;
  const payload = boast ? text + "\n" + url : url;
  openDialog(`<h2 id="share-title">${boast ? "내 기록 자랑하기" : "게임 공유"}</h2>${card}<div class="share-options"><button data-action="copy-link"><span aria-hidden="true">↗</span>${boast ? "기록·링크 복사" : "링크 복사"}</button><a href="${esc(intent.href)}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">𝕏</span>X 공유</a></div><p id="share-feedback" role="status" aria-live="polite"></p><label class="share-url-label" for="share-url">${boast ? "공유할 기록과 링크" : "게임 링크"}</label>${boast ? `<textarea id="share-url" readonly aria-label="공유할 기록과 링크">${esc(payload)}</textarea>` : `<input id="share-url" readonly value="${esc(url)}" aria-label="공유할 게임 링크">`}`);
  modal.classList.add("share-dialog");
  if (boast) modal.classList.add("boast-dialog");
  modal.setAttribute("aria-labelledby", "share-title");
}
async function copyGameLink() {
  const field = $("#share-url"), feedback = $("#share-feedback");
  if (!field || !feedback) return;
  try {
    await navigator.clipboard.writeText(field.value);
    feedback.textContent = modal.classList.contains("boast-dialog") ? "기록과 링크를 복사했습니다." : "링크를 복사했습니다.";
  } catch {
    field.focus();
    field.select();
    field.setSelectionRange(0, field.value.length);
    feedback.textContent = "자동 복사가 제한되어 있어요. 아래 링크를 길게 눌러 복사해 주세요.";
  }
}
app.addEventListener("click", (e) => {
  const link = e.target.closest("[data-nav]");
  if (link) {
    e.preventDefault();
    go(link.getAttribute("href"));
  }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  if (a === "close") modal.close();
  if (a === "records") records();
  if (a === "help") help();
  if (a === "retry") retry();
  if (a === "beer-serve") serveBeer();
  if (a === "beer-next" && active?.kind === "beer") {
    active.g.next();
    active.resultShown = false;
    $("#result").hidden = true;
    $("#game").focus();
  }
  if (a === "pause") togglePause();
  if (a === "sound") {
    muted = !muted;
    data.sound = !muted;
    save();
    document
      .querySelectorAll('[data-action="sound"]')
      .forEach((x) => (x.textContent = muted ? "♩ OFF" : "♫ ON"));
    beep();
  }
  if (a === "share") share();
  if (a === "boast") share(true);
  if (a === "copy-link") await copyGameLink();
  if (a === "fullscreen") {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("이 브라우저에서 전체 화면을 지원하지 않습니다.");
    }
  }
  if (a === "name") {
    data.name = $("#player-name").value.trim().slice(0, 20) || "플레이어";
    save();
    toast("이름을 저장했습니다.");
  }
  if (a === "export") {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "ssunplay-records.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (a === "credits")
    openDialog(
      '<span class="eyebrow">ABOUT</span><h2>쑨플레이</h2><p>작은 조작으로 즐기는 3D 물리 게임 3종입니다.</p><p>게임 구조와 조작·물리 분석 참고: <a href="https://hedorobomb.com/ko/" target="_blank" rel="noreferrer">헤도로봄 ↗</a><br>3D 모델과 화면은 Three.js로 새로 제작했습니다.</p><p>원본 제작자와 제휴한 사이트가 아닙니다.</p><p><a href="https://github.com/SsunLee/ssunplay-arcade" target="_blank" rel="noreferrer">소스·분석·검증 기록 ↗</a></p>',
    );
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) modal.close();
});
document.addEventListener("visibilitychange", () => {
  if (
    document.hidden &&
    active &&
    !["paused", "result"].includes(active.g.phase)
  )
    togglePause();
  last = performance.now();
});
function route() {
  const p = location.pathname;
  updateRouteMeta(p);
  if (/^\/game\/subway\/?$/.test(p)) { mountSubway(); return; }
  if (/^\/game\/pasta\/?$/.test(p)) { mountPasta(); return; }
  if (/^\/game\/dalgona\/?$/.test(p)) { mountDalgona(); return; }
  if (/^\/game\/runway\/?$/.test(p)) { mountRunway(); return; }
  if (/^\/game\/beer\/?$/.test(p)) {
    mountBeer();
    return;
  }
  if (/^\/game\/drive\/?$/.test(p)) mount();
  else home();
}
initI18n();
route();

function mountPasta() {
  clean();
  document.body.classList.add("playing");
  document.title = "파스타 만들기 | 쑨플레이";
  try {
    const controller = new PastaController({ app, header: header("pasta"), modal, sound: () => !muted, onResult: (result) => {
      data.pasta = Math.max(data.pasta || 0, result.value);
      data.history.unshift({ ...result, at: Date.now(), name: data.name });
      data.history = data.history.slice(0,60);
      save();
    } });
    active = { kind:"pasta", g:controller.g, controller };
    views = [controller];
  } catch (e) {
    console.error(e);
    app.querySelector('.pasta-viewport').innerHTML = '<div class="pasta-error"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p><button data-action="retry">다시 시작</button></div>';
  }
  translatePage();
}

function mountDalgona() {
  clean();
  document.body.classList.add("playing");
  document.title = "달고나 뽑기 | 쑨플레이";
  try {
    const controller = new DalgonaController({ app, header: header("dalgona"), modal, sound: () => !muted, onResult: (result) => {
      data.dalgona = Math.max(data.dalgona || 0, result.value);
      data.history.unshift({ ...result, at: Date.now(), name: data.name });
      data.history = data.history.slice(0,60);
      save();
    } });
    active = { kind:"dalgona", g:controller.g, controller };
    views = [controller];
  } catch (e) {
    console.error(e);
    app.querySelector('.dal-viewport').innerHTML = '<div class="pasta-error"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p><button data-action="retry">다시 시작</button></div>';
  }
  translatePage();
}

function runwayShare(r, livery) {
  const ld = r.landing, to = r.takeoff, plane = `\n✈ ${livery.name}`;
  if (!ld) return `쑨에어 버터 랜딩 — 이륙 ${to?.ok ? to.value + "점" : "실패"}! 김포 14R에서 도전해 보세요.${plane}`;
  if (ld.grade === "goaround") return `쑨에어 버터 랜딩 — 고 어라운드! 다음엔 꼭 내려앉을게요.${plane}`;
  const grade = { butter: "버터 랜딩!", good: "좋은 착륙", firm: "단단한 착륙", hard: "하드 랜딩", crash: "크래시!" }[ld.grade];
  return `쑨에어 버터 랜딩 ${r.value}점 · ${grade}\n접지 강하율 ${ld.fpm}fpm · 중심선 오차 ${Math.abs(ld.centerline).toFixed(1)}m · 접지 위치 ${ld.distance >= 0 ? "+" : ""}${ld.distance}m${plane}`;
}

function mountRunway(stage = "takeoff") {
  clean();
  document.body.classList.add("playing");
  document.title = "쑨에어 버터 랜딩 | 쑨플레이";
  try {
    const controller = new RunwayController({ app, header: header("runway"), modal, stage, sound: () => !muted, onResult: (result) => {
      let best = false;
      if (result.complete && result.value > (data.runway || 0)) {
        data.runway = result.value;
        best = true;
      }
      data.history.unshift({ ...result, at: Date.now(), name: data.name });
      data.history = data.history.slice(0, 60);
      save();
      return best;
    } });
    active = { kind: "runway", g: controller.g, controller };
    views = [controller];
  } catch (e) {
    console.error(e);
    app.innerHTML = header("runway") + '<main id="main" class="game-shell runway"><div class="result-overlay"><section class="result-card"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p><a href="/" data-nav class="primary">홈으로</a></section></div></main>';
  }
  translatePage();
}

function mountBeer() {
  clean();
  document.body.classList.add("playing");
  document.title = "맥주 잘 따르기 | 쑨플레이";
  app.innerHTML =
    header("beer") +
    `<main id="main" class="game-shell beer">
      <canvas id="game" tabindex="0" aria-label="맥주 따르기: 누르고 좌우로 움직여 잔의 기울기를 조절하세요"></canvas>
      <div class="hud"><div class="hud-left"><div id="stage-label" class="hud-label"></div><div id="main-value" class="main-value"></div><div id="best-value" class="best-value"></div></div><div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button><button data-action="share" class="game-share" aria-label="게임 공유" aria-haspopup="dialog" title="공유"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m-4 4 4-4 4 4M6 11H4v10h16V11h-2"/></svg></button></div></div>
      <div id="beer-order" class="beer-order"><div class="ticket-top"><span>ORDER TICKET</span><b id="order-number">01</b></div><strong id="order-name"></strong><p id="order-request"></p><div class="order-recipe"><i id="recipe-liquid"></i><i id="recipe-foam"></i></div><div class="recipe-legend"><span>맥주</span><span>거품</span></div><div id="beer-spill" hidden></div></div>
      <div id="title-overlay" class="beer-intro"><span>SSUN TAPROOM</span><h1>오늘의 한 잔.</h1><p>기울여 따르고, 거품으로 마무리.</p></div>
      <div id="game-status" class="game-status" role="status" aria-live="polite"></div>
      <div id="beer-drag-guide" class="beer-drag-guide"><div class="drag-track" aria-hidden="true"><span>↔</span><svg viewBox="0 0 32 32"><path d="M12 17V7a3 3 0 0 1 6 0v8l2-1 3 2 3 1v7l-4 6H13l-7-9a3 3 0 0 1 4-4l2 2"/></svg></div><b>누른 채 좌우로 드래그하면 잔이 기울어요</b><small>왼쪽으로 기울이기 · 오른쪽으로 세우기</small></div>
      <div class="beer-actions">
        <button data-action="beer-serve" class="beer-serve" aria-label="서빙"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 10h15l-2 15H7L5 10ZM20 12h3c5 0 5 8-1 8h-3M4 6h16M24 27h5M27 24l3 3-3 3"/></svg><span><b>서빙</b></span><kbd>ENTER</kbd></button>
      </div><div id="result" class="result-overlay" hidden></div>
    </main>`;
  const g = new BeerGame();
  let view;
  try {
    view = new BeerView($("#game"), g);
  } catch (e) {
    console.error(e);
    toast("3D 화면을 시작하지 못했습니다.");
    return;
  }
  active = {
    kind: "beer",
    g,
    view,
    resultShown: false,
    pourPointers: new Set(),
    dragDistance: 0,
    dragLearned: false,
    inputController: new AbortController(),
  };
  views = [view];
  bindBeerInput(active);
  last = performance.now();
  const tick = (t) => {
    if (!active || active.g !== g) return;
    const dt = Math.min(0.25, (t - last) / 1000);
    last = t;
    if (!modal.open) g.update(dt);
    view.render(dt);
    updateBeerHUD();
    raf = requestAnimationFrame(tick);
  };
  updateBeerHUD();
  raf = requestAnimationFrame(tick);
}
function bindBeerInput(a) {
  const { g, inputController } = a,
    c = $("#game"),
    options = { signal: inputController.signal };
  let lastX = 0;
  const down = (e) => {
    if (e.button !== 0 || !["ready", "pour", "settle"].includes(g.phase))
      return;
    e.preventDefault();
    beep();
    a.pourPointers.add(e.pointerId);
    e.currentTarget.setPointerCapture(e.pointerId);
    lastX = e.clientX;
    g.setPour(true);
    if (e.currentTarget === c) c.focus();
  };
  const up = (e) => {
    a.pourPointers.delete(e.pointerId);
    if (!a.pourPointers.size) g.setPour(false);
  };
  for (const target of [c]) {
    target.addEventListener("pointerdown", down, options);
    target.addEventListener("pointerup", up, options);
    target.addEventListener("pointercancel", up, options);
    target.addEventListener("lostpointercapture", up, options);
    target.addEventListener("contextmenu", (e) => e.preventDefault(), options);
    target.addEventListener(
      "pointermove",
      (e) => {
        if (!a.pourPointers.has(e.pointerId)) return;
        a.dragDistance += Math.abs(e.clientX - lastX);
        if (a.dragDistance > 18) a.dragLearned = true;
        g.setAngle(g.targetAngle - ((e.clientX - lastX) / c.clientWidth) * 100);
        lastX = e.clientX;
        e.preventDefault();
      },
      options,
    );
  }
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        modal.open ||
        !active ||
        active.g !== g ||
        e.target.closest("input,select,a,button")
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        g.setPour(true);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        g.setAngle(g.targetAngle + 5);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        g.setAngle(g.targetAngle - 5);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        serveBeer();
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        retry();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        togglePause();
      }
    },
    options,
  );
  window.addEventListener(
    "keyup",
    (e) => {
      if (e.code === "Space") g.setPour(false);
    },
    options,
  );
  window.addEventListener(
    "blur",
    () => {
      g.setPour(false);
      a.pourPointers.clear();
    },
    options,
  );
}
function updateBeerHUD() {
  const a = active;
  if (!a || a.kind !== "beer") return;
  const g = a.g;
  $("#stage-label").textContent =
    "손님 " + (g.round + 1) + " / " + BEER_ORDERS.length;
  $("#main-value").innerHTML = Math.ceil(g.remaining) + "<small>초</small>";
  $("#best-value").textContent = "BEST " + (data.beer ? data.beer + "점" : "—");
  let spillReadout = $("#beer-spill");
  if (!spillReadout) {
    spillReadout = document.createElement("div");
    spillReadout.id = "beer-spill";
    $("#beer-order").append(spillReadout);
  }
  spillReadout.hidden = g.spilled < 0.001;
  spillReadout.innerHTML = `<span>흘린 맥주 <b>${Math.round(g.spilled * 500)}<small>mL</small></b></span><strong>−${Math.round(g.spillPenalty)}<small>점</small></strong>`;
  $("#beer-drag-guide").classList.toggle("learned", a.dragLearned);
  $("#order-number").textContent = String(g.round + 1).padStart(2, "0");
  $("#order-name").textContent = g.order.name;
  $("#order-request").textContent = g.order.request;
  $("#recipe-liquid").style.flex = String(g.order.liquid);
  $("#recipe-foam").style.flex = String(g.order.foam);
  $("#title-overlay").classList.toggle("gone", g.started);
  $('[data-action="beer-serve"]').disabled =
    ["paused", "tasting", "result"].includes(g.phase) || !g.started || g.total < 0.04;
  const status =
    g.phase === "paused"
      ? "일시 정지"
      : g.spillFlash > 0.1
        ? "앗, 넘쳐요! 잠깐 멈추세요."
        : g.started && g.remaining < 6
          ? "주문 마감이 얼마 안 남았어요."
          : "";
  $("#game-status").textContent = status;
  $("#game-status").classList.toggle("visible", !!status);
  if (["tasting", "result"].includes(g.phase) && !a.resultShown)
    showBeerResult();
}
function serveBeer() {
  if (active?.kind !== "beer") return;
  active.pourPointers.clear();
  active.g.setPour(false);
  if (!active.g.serve()) toast("맥주를 조금 더 따라주세요.");
}
function showBeerResult() {
  const a = active,
    g = a.g,
    r = g.roundResult,
    final = g.phase === "result";
  a.resultShown = true;
  beep(r.score >= 75 ? "win" : "fail");
  let best = false;
  if (final) {
    if (g.result.value > (data.beer || 0)) {
      data.beer = g.result.value;
      best = true;
    }
    data.history.unshift({ ...g.result, at: Date.now(), name: data.name });
    data.history = data.history.slice(0, 60);
    save();
  }
  const el = $("#result");
  el.hidden = false;
  el.innerHTML =
    '<section class="result-card beer-result"><span class="eyebrow">' +
    (final
      ? best
        ? "NEW PERSONAL BEST"
        : "SERVICE COMPLETE"
      : "CUSTOMER " + (g.round + 1)) +
    "</span><h2>" +
    (final
      ? "오늘의 탭마스터"
      : r.score >= 90
        ? "완벽한 한 잔!"
        : "한 잔 나왔습니다!") +
    '</h2><div class="result-value">' +
    (final ? g.result.value : r.score) +
    "<small>점</small></div><p>" +
    esc(r.feedback) +
    "</p>" +
    (r.spilled > 0.001 ? `<p class="spill-result">흘린 맥주 ${Math.round(r.spilled * 500)}mL · 넘침 감점 −${Math.round(r.spillPenalty)}점</p>` : "") +
    (final
      ? '<div class="beer-score-list">' +
        g.scores
          .map(
            (x, i) =>
              "<span>손님 " + (i + 1) + "<b>" + x.score + "점</b></span>",
          )
          .join("") +
        "</div>"
      : "") +
    '<div class="result-actions">' +
    (final
      ? '<button class="primary" data-action="retry">다시 도전 ↻</button>'
      : '<button class="primary" data-action="beer-next">다음 손님 →</button>') +
    '<button class="secondary boast-button" data-action="boast">자랑하기 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>';
}
function beerHelp() {
  openDialog(
    '<span class="eyebrow">HOW TO POUR</span><h2>맥주 잘 따르기</h2><p>위쪽 주문 카드의 맥주·거품 비율을 보고 세 손님의 한 잔을 완성하세요.</p><h3>따르기와 기울기</h3><p>맥주 화면을 누르는 동안 맥주가 나옵니다. 손을 떼면 멈춥니다. 누른 채 왼쪽으로 움직이면 잔이 기울고, 오른쪽으로 움직이면 세워집니다.</p><p>기울여 따르면 거품이 적게 생깁니다. 마지막에는 잔을 세워 부드러운 거품을 올려보세요. 거품은 기다리면 조금씩 가라앉습니다. 잔을 너무 기울이거나 오래 따르면 넘칩니다.</p><h3>주문 마무리</h3><p>원하는 모양이 되면 <b>서빙</b>를 누르세요. 맥주 양·거품·넘친 양으로 점수를 매깁니다. 세 손님의 평균이 최종 기록입니다. 시간은 처음 따르기 시작할 때부터 흐릅니다.</p><p class="muted small">키보드: Space 누르고 따르기 · ← 기울이기 · → 세우기 · Enter 제출 · R 다시 도전 · Esc 일시 정지</p>',
  );
}

function mountSubway() {
  clean();
  document.body.classList.add("playing");
  try {
    const controller = new SubwayController({ app, header:header("subway"), modal, sound:() => !muted, onResult:result => {
      data.subway = Math.max(data.subway || 0, result.value);
      data.history.unshift({ ...result, at:Date.now(), name:data.name });
      data.history = data.history.slice(0,60); save();
    } });
    active = { kind:"subway", g:controller.g, controller }; views = [controller];
  } catch (e) {
    console.error(e);
    app.querySelector('.subway-viewport').innerHTML = '<div class="pasta-error"><h2>3D 화면을 시작하지 못했습니다</h2><p>브라우저의 하드웨어 가속을 켜고 다시 접속해 주세요.</p><a href="/" data-nav>게임 목록으로</a></div>';
  }
  translatePage();
}

function updateRouteMeta(path = location.pathname) {
  const subway = /^\/game\/subway\/?$/.test(path);
  const title = subway ? t("지하철 뛰어타기") + " | SSUNPLAY" : "SSUNPLAY · " + t("조금 이상한 게임들");
  const description = subway ? t("문 닫히기 직전, 부장님의 출근 질주.") : t("설치 없이, 지금 바로 플레이하세요.");
  if (subway) document.title = title;
  for (const [key, value] of Object.entries({ description, "og:title":title, "og:description":description, "og:type":"website", "og:url":location.origin + path, "og:image":location.origin + "/social.svg" })) {
    const attr = key.startsWith("og:") ? "property" : "name";
    let el = document.head.querySelector(`meta[${attr}="${key}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute(attr,key); document.head.append(el); }
    el.content = value;
  }
}
window.addEventListener("languagechange", () => updateRouteMeta());
