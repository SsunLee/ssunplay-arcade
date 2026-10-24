import {
  CurlingGame,
  DriveGame,
  BeerGame,
  BEER_ORDERS,
  STAGES,
  CURL_DISTANCES,
  clamp,
  flickVelocity,
} from "./engine.js";
import { GameView } from "./stage.js";
import { BeerView } from "./beer.js";
const $ = (s) => document.querySelector(s),
  app = $("#app"),
  modal = $("#dialog"),
  body = $("#dialog-body");
const KEY = "ssunplay.3d.v2";
let data = {
  version: 2,
  name: "플레이어",
  sound: true,
  curling: 0,
  beer: 0,
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
function header(game) {
  return `<header class="${game ? "game-header" : "site-header"}"><a href="/" class="brand" data-nav>${game ? homeIcon : '<span class="brand-mark">S.</span>'}<span>${game ? "쑨플레이" : "SSUNPLAY"}${!game ? "<small>조금 이상한 게임들</small>" : ""}</span></a>${game ? `<div class="bar-title">${game === "curling" ? "의자 컬링" : game === "beer" ? "맥주 잘 따르기" : "치킨 드라이브"}</div>` : ""}<nav><button data-action="records">내 기록</button><button data-action="help">${game ? "도움말" : "사이트 안내"}</button>${game ? '<button data-action="fullscreen" aria-label="전체 화면">⛶</button>' : ""}<button data-action="sound" aria-label="소리 켜기/끄기">${muted ? "♩ OFF" : "♫ ON"}</button></nav></header>`;
}
function home() {
  clean();
  document.title = "쑨플레이 — 조금 이상한 3D 게임들";
  app.innerHTML = `${header()}<main id="main" class="home"><div class="intro-line"><div><span class="eyebrow">작은 조작, 아슬아슬한 순간.</span><h1>조금 이상한 게임들</h1><p>설치 없이, 지금 바로 플레이하세요.</p></div><span class="stamp">JUST<br>ONE<br>MORE.</span></div><div class="news"><span>UPDATE</span><p>NEW 맥주 잘 따르기! 잔 기울기와 거품의 균형에 도전하세요.</p><time>2026.10.25</time></div><section class="game-grid" aria-label="게임 목록"><a class="game-card" href="/game/curling/" data-nav><div class="card-visual"><canvas id="preview-curling" aria-label="3D 사무실과 주황색 의자"></canvas><span class="card-tag">한 번 더 하게 되는</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">01 / OFFICE</span><h2>의자 컬링</h2><p>쓰러지기 직전의 동료.<br>의자를 밀어서 구해주세요.</p><div class="card-bottom"><span>스와이프 · 거리 챌린지</span><strong>플레이 ↗</strong></div></div></a><a class="game-card" href="/game/drive/" data-nav><div class="card-visual"><canvas id="preview-drive" aria-label="3D 자동차와 바다 절벽"></canvas><span class="card-tag yellow">간담이 서늘한</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">02 / CHICKEN</span><h2>치킨 드라이브</h2><p>브레이크 없는 치킨의 도전.<br>절벽에 얼마나 가까이 갈 수 있을까요?</p><div class="card-bottom"><span>당겼다 놓기 · 5개 스테이지</span><strong>플레이 ↗</strong></div></div></a><a class="game-card" href="/game/beer/" data-nav><div class="card-visual beer-card"><canvas id="preview-beer" aria-label="3D 맥주 탭과 유리잔"></canvas><span class="card-tag yellow">NEW · 거품까지 맛있게</span><span class="play-icon">↗</span></div><div class="card-copy"><span class="card-no">03 / TAPROOM</span><h2>맥주 잘 따르기</h2><p>기울이면 맥주, 세우면 거품.<br>세 손님의 완벽한 한 잔을 완성하세요.</p><div class="card-bottom"><span>누르고 따르기 · 잔 기울이기</span><strong>플레이 ↗</strong></div></div></a></section><div class="home-record"><span>MY BEST</span><p>의자 컬링 <b>${data.curling || "—"}${data.curling ? "m" : ""}</b></p><p>해안 절벽 <b>${data.drive[0] != null ? fmt(data.drive[0]) + "m" : "—"}</b></p><p>맥주 잘 따르기 <b>${data.beer || "—"}${data.beer ? "점" : ""}</b></p><button data-action="records">기록 보기 ↗</button></div><section class="how"><h2>생각보다 쉽고,<br>생각보다 어렵습니다.</h2><p>마우스와 손가락 하나면 충분해요.<br>짧은 한 판을 즐기고 나의 최고 기록에 도전하세요.</p></section></main><footer><a href="/" class="footer-brand" data-nav>SSUNPLAY</a><p>Play a little. Try again.</p><button data-action="credits">제작 정보 · 참고 사이트</button><a href="https://github.com/SsunLee/ssunplay-arcade" target="_blank" rel="noreferrer">GitHub ↗</a></footer>`;
  try {
    const a = new CurlingGame(42),
      b = new DriveGame();
    a.preview = true;
    a.pose();
    views.push(
      new GameView("curling", $("#preview-curling"), a, { preview: true }),
      new GameView("drive", $("#preview-drive"), b, { preview: true }),
    );
    const beerPreview = new BeerGame(42);
    beerPreview.liquid = 0.63;
    beerPreview.foam = 0.17;
    beerPreview.angle = beerPreview.targetAngle = 0;
    views.push(
      new BeerView($("#preview-beer"), beerPreview, { preview: true }),
    );
    let prev = performance.now();
    const tick = (t) => {
      if (t - prev > 100) {
        const dt = Math.min(0.1, (t - prev) / 1000);
        prev = t;
        a.update(dt);
        b.clock += dt;
        views[0]?.render(dt);
        views[1]?.render(dt);
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
function mount(kind, stage = 0, { practice = false } = {}) {
  clean();
  document.body.classList.add("playing");
  const g = kind === "curling" ? new CurlingGame() : new DriveGame(stage);
  if (kind === "curling" && stage) g.reset(stage);
  document.title =
    (kind === "curling" ? "의자 컬링" : "치킨 드라이브") + " | 쑨플레이";
  app.innerHTML = `${header(kind)}<main id="main" class="game-shell ${kind}"><canvas id="game" tabindex="0" aria-label="${kind === "curling" ? "의자를 잡고 앞으로 빠르게 밀어 놓으세요" : "화면을 아래로 당긴 다음 놓아 출발하세요"}"></canvas><div class="hud"><div class="hud-left"><div class="hud-label" id="stage-label"></div><div id="main-value" class="main-value"></div><div id="best-value" class="best-value"></div></div><div class="hud-right">${kind === "drive" ? `<select id="stage-select" aria-label="스테이지">${STAGES.map((s, i) => `<option value="${i}" ${i === stage ? "selected" : ""}>${i + 1}. ${s.name}</option>`).join("")}</select>` : ""}<div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button></div></div></div><div id="title-overlay" class="title-overlay"><p class="game-kicker">${kind === "curling" ? "SAVE YOUR COWORKER" : "HOW CLOSE CAN YOU GO?"}</p><h1>${kind === "curling" ? "의자 컬링" : "치킨 드라이브"}</h1><p class="game-subtitle">${kind === "curling" ? "쓰러지는 동료에게 의자를 밀어주세요!" : "절벽 바로 앞, 멈출 수 있을까요?"}</p></div><div id="gesture-guide" class="gesture-guide"><div class="gesture-arrow">${kind === "curling" ? "↑" : "↓"}</div><b>${kind === "curling" ? "의자를 잡고 앞으로 슥!" : "아래로 당겼다가 놓으세요"}</b><span>${kind === "curling" ? "빠르게 밀수록 멀리 갑니다" : "한 번 출발하면 멈출 수 없어요"}</span></div><div id="game-status" class="game-status" role="status" aria-live="polite"></div><div id="result" class="result-overlay" hidden></div><div class="bottom-bar"><span>${practice ? "연습 모드 · 최고 기록에 반영되지 않습니다" : kind === "curling" ? "의자를 움직여 위치를 맞추고, 마지막 순간에 빠르게 미세요." : "힘 조절이 전부입니다. 낭떠러지에선 바퀴와 무게중심을 조심하세요."}</span><button data-action="help">조작 방법 ?</button></div></main>`;
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
    practice,
    lastStage: g.stage,
    resultShown: false,
    lastMode: g.man?.mode,
  };
  bindInput(active);
  $("#stage-select")?.addEventListener("change", (e) =>
    mount("drive", +e.target.value),
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
    { kind, g, view } = a;
  let pointer = null,
    startY = 0,
    samples = [],
    offset = { x: 0, z: 0 };
  const sample = (e) => {
    const p = view.floorPoint(e.clientX, e.clientY);
    if (!p) return;
    const now = performance.now(),
      t = Math.abs(e.timeStamp - now) < 10000 ? e.timeStamp : now;
    samples.push({ x: e.clientX, y: e.clientY, fx: p.x, fz: p.z, t });
    samples = samples.filter((x) => t - x.t < 110);
    g.moveGrab(p.x + offset.x, p.z + offset.z);
  };
  c.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !["ready", "aim"].includes(g.phase)) return;
    if (kind === "curling" && !view.hitChair(e.clientX, e.clientY)) {
      toast("주황색 의자를 잡아주세요.");
      return;
    }
    beep();
    pointer = e.pointerId;
    c.setPointerCapture(pointer);
    if (kind === "drive") {
      startY = e.clientY;
      g.setPull(0);
    } else {
      const p = view.floorPoint(e.clientX, e.clientY);
      if (!p) return;
      offset = { x: g.chair.x - p.x, z: g.chair.z - p.z };
      g.grab(g.chair.x, g.chair.z);
      samples = [];
      sample(e);
    }
    c.focus();
    e.preventDefault();
  });
  c.addEventListener("pointermove", (e) => {
    if (pointer !== e.pointerId) return;
    if (kind === "drive")
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
    else {
      const events = e.getCoalescedEvents?.();
      for (const p of events?.length ? events : [e]) sample(p);
    }
    e.preventDefault();
  });
  const end = (e) => {
    if (pointer !== e.pointerId) return;
    pointer = null;
    if (e.type === "pointercancel") {
      if (kind === "drive") {
        g.setPull(0);
        g.phase = "ready";
      } else {
        g.chair.held = false;
        g.phase = "ready";
      }
      return;
    }
    if (kind === "drive") g.launch();
    else {
      const v = flickVelocity(samples, view.height, performance.now());
      g.release(v?.vx || 0, v?.vz || 0);
    }
    samples = [];
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
    if (
      kind === "drive" &&
      e.code === "Space" &&
      !e.repeat &&
      ["ready", "aim"].includes(g.phase)
    ) {
      a.keyStart = performance.now();
      g.setPull(0.04);
      e.preventDefault();
    }
    if (
      kind === "curling" &&
      e.code === "Space" &&
      !e.repeat &&
      g.phase === "ready"
    ) {
      a.keyStart = performance.now();
      e.preventDefault();
    }
    if (
      kind === "curling" &&
      g.phase === "ready" &&
      ["ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      g.chair.x = clamp(
        g.chair.x + (e.key === "ArrowLeft" ? -0.06 : 0.06),
        -1,
        1,
      );
      e.preventDefault();
    }
  });
  c.addEventListener("keyup", (e) => {
    if (e.code === "Space" && a.keyStart) {
      const hold = (performance.now() - a.keyStart) / 1000;
      a.keyStart = 0;
      if (kind === "drive") g.launch(clamp(hold / 2, 0.04, 1));
      else g.release(0, -clamp(hold * 8, 1.2, 17));
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
  if (a.keyStart && kind === "drive")
    g.setPull(clamp((performance.now() - a.keyStart) / 2000, 0.04, 1));
  const ready = ["ready", "aim"].includes(g.phase),
    rolling = ["roll", "run", "judge", "fall", "success"].includes(g.phase);
  $("#title-overlay").classList.toggle(
    "gone",
    !ready || (kind === "curling" && g.man.mode !== "stand"),
  );
  $("#gesture-guide").classList.toggle("gone", !ready || g.phase === "aim");
  $("#game").classList.toggle("grabbing", g.phase === "aim");

  if (kind === "drive") {
    $("#stage-label").textContent = STAGES[g.stage].name;
    $("#main-value").innerHTML = `${fmt(g.gap)}<small>m</small>`;
    $("#best-value").textContent =
      "BEST " +
      (data.drive[g.stage] != null ? fmt(data.drive[g.stage]) + "m" : "—") +
      (g.phase === "run"
        ? " · " + (Math.hypot(g.car.vx, g.car.vy) * 3.6).toFixed(0) + " km/h"
        : "");
  } else {
    $("#stage-label").textContent =
      `${g.stage + 1}번째 동료${a.practice ? " · 연습" : ""}`;
    $("#main-value").innerHTML = `${g.distance}<small>m</small>`;
    $("#best-value").textContent =
      "BEST " + (data.curling ? data.curling + "m" : "—");
    if (a.lastMode !== "sit" && g.man.mode === "sit") {
      beep("win");
      if (!a.practice) {
        data.curling = Math.max(data.curling, g.distance);
        save();
      }
      g.bestDistance = Math.max(g.bestDistance, g.distance);
    }
    a.lastMode = g.man.mode;
    if (a.lastStage !== g.stage) {
      a.lastStage = g.stage;
      a.lastMode = "stand";
      viewRefresh();
      return;
    }
  }
  const status =
    g.phase === "paused"
      ? "일시 정지"
      : g.phase === "judge"
        ? "잠깐… 버틸 수 있을까요?"
        : g.phase === "fall"
          ? kind === "drive"
            ? "으아아아악!"
            : g.feedback
          : kind === "curling" && g.man.mode === "sit"
            ? "나이스 캐치!"
            : g.phase === "run" && g.slow < 0.6
              ? "숨을 참으세요…"
              : "";
  $("#game-status").textContent = status;
  $("#game-status").classList.toggle("visible", !!status);
  if (g.phase === "result" && !a.resultShown) showResult();
}
function viewRefresh() {
  const a = active,
    oldCanvas = $("#game"),
    next = oldCanvas.cloneNode();
  a.view.destroy();
  oldCanvas.replaceWith(next);
  a.view = new GameView(a.kind, next, a.g);
  views = [a.view];
  bindInput(a);
}
function showResult() {
  const a = active,
    { g, kind } = a,
    r = g.result;
  a.resultShown = true;
  const success = kind === "drive" ? !r.fell : r.ok;
  beep(success ? "win" : "fail");
  let newBest = false;
  if (!a.practice) {
    if (
      kind === "drive" &&
      !r.fell &&
      (data.drive[g.stage] == null || r.gap < data.drive[g.stage])
    ) {
      data.drive[g.stage] = r.gap;
      newBest = true;
    }
    data.history.unshift({ ...r, at: Date.now(), name: data.name });
    data.history = data.history.slice(0, 60);
    save();
  }
  const el = $("#result");
  el.hidden = false;
  const near = kind === "drive" && !r.fell && r.gap < 1.5;
  el.innerHTML = `<section class="result-card"><span class="eyebrow">${newBest ? "NEW PERSONAL BEST" : r.fell ? "CHICKEN DOWN" : near ? "ON THE EDGE" : "ONE MORE TRY"}</span><h2>${kind === "curling" ? (r.ok ? "모두 구했어요!" : "앗, 늦었어요!") : r.fell ? "치킨, 추락!" : near ? "간발의 차이!" : "안전하게 정지!"}</h2><div class="result-value">${kind === "curling" ? g.bestDistance || 0 : r.fell ? "풍덩!" : fmt(r.gap)}<small>${kind === "drive" && r.fell ? "" : "m"}</small></div><p>${kind === "curling" ? esc(r.reason) : r.fell ? "조금만 덜 당겼더라면…" : r.gap < 0 ? "앞부분이 절벽 밖으로 나왔지만, 버텼습니다!" : "절벽까지 남은 거리. 더 가까이 도전해 보세요."}</p><div class="result-actions"><button class="primary" data-action="retry">다시 도전 ↻</button>${kind === "curling" && g.stage > 0 ? '<button class="secondary" data-action="practice">이 거리부터 연습</button>' : ""}<button class="secondary" data-action="share">기록 공유 ↗</button></div><a href="/" data-nav class="text-link">게임 목록으로</a></section>`;
}
function retry() {
  if (!active) return;
  const { kind, g, practice } = active;
  if (kind === "beer") {
    mountBeer();
    return;
  }
  mount(kind, kind === "drive" ? g.stage : practice ? g.stage : 0, {
    practice,
  });
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
    `<span class="eyebrow">MY RECORDS</span><h2>나의 최고 기록</h2><p class="muted">이 브라우저에 저장되는 개인 기록입니다.</p><label class="name-label">플레이어 이름<input id="player-name" value="${esc(data.name)}" maxlength="20"></label><button class="mini" data-action="name">이름 저장</button><div class="record-row"><span>맥주 잘 따르기</span><strong>${data.beer || "—"}${data.beer ? "점" : ""}</strong></div><div class="record-row"><span>의자 컬링</span><strong>${data.curling || "—"}${data.curling ? "m" : ""}</strong></div>${STAGES.map((s, i) => `<div class="record-row"><span>${s.name}</span><strong>${data.drive[i] != null ? fmt(data.drive[i]) + "m" : "—"}</strong></div>`).join("")}<p class="muted small">자동차는 남은 거리가 작을수록 좋은 기록입니다.<br>추락한 기록과 연습 기록은 최고 기록에서 제외합니다.</p><div class="dialog-actions"><button class="secondary" data-action="export">기록 내보내기</button><label class="secondary file-label">가져오기<input type="file" id="import" accept="application/json,.json"></label></div>`,
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
        !Number.isFinite(v.curling) ||
        (!CURL_DISTANCES.includes(v.curling) && v.curling !== 0) ||
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
      data.curling = Math.max(data.curling, v.curling);
      data.beer = Math.max(data.beer || 0, v.beer || 0);
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
  if(!k){openDialog('<span class="eyebrow">THREE LITTLE GAMES</span><h2>쑨플레이 이용 안내</h2><h3>의자 컬링</h3><p>혼자 비틀거리는 동료에게 의자를 밀어주세요. 동료가 주저앉기 전에 위치와 속도를 맞추세요.</p><h3>치킨 드라이브</h3><p>화면을 아래로 당겼다 놓아 출발합니다. 힘 표시와 브레이크 없이 절벽 가까이 멈추세요.</p><h3>맥주 잘 따르기</h3><p>누르는 동안 따르고, 잔의 기울기로 거품을 조절하세요. 세 손님의 주문을 완성하면 평균 점수가 기록됩니다.</p><p class="muted small">각 게임의 도움말에서 자세한 조작을 확인할 수 있습니다. 개인 기록은 브라우저에 저장되며 내보내기·가져오기를 지원합니다.</p>');return;}
  if (k === "beer") {
    beerHelp();
    return;
  }
  openDialog(
    `<span class="eyebrow">HOW TO PLAY</span><h2>${k === "curling" ? "의자 컬링" : k === "drive" ? "치킨 드라이브" : "쑨플레이에 오신 걸 환영해요"}</h2>${!k || k === "curling" ? "<h3>의자 컬링</h3><p>동료가 비틀거리다 무작위로 주저앉습니다. 주황색 의자를 잡고 앞으로 빠르게 밀어 놓으세요. 마지막 순간의 스와이프 속도가 의자의 속도가 됩니다. 좌우로 움직여 동료와 위치도 맞출 수 있어요.</p><p>너무 빠르게 부딪히면 동료가 넘어집니다. 의자가 골반 아래 도착했을 때 속도가 줄어들어야 안전하게 앉을 수 있어요. 성공하면 다음 동료가 더 멀리 등장합니다.</p>" : ""}${!k || k === "drive" ? "<h3>치킨 드라이브</h3><p>화면을 아래로 당겨 힘을 정하고 손을 놓아 출발하세요. 멀리 당길수록 강한 힘으로 출발합니다. 출발 후에는 브레이크가 없습니다.</p><p>절벽 가까이 멈출수록 좋은 기록! 앞부분이 절벽 밖으로 나와도 무게중심이 버티면 성공입니다. 차종과 노면이 다른 5개 스테이지에 도전하세요.</p>" : ""}<h3>키보드</h3><p>${k === "curling" ? "← →로 의자 위치를 정하고, Space를 눌렀다 놓으면 발사합니다. 누른 시간으로 힘을 정합니다." : "Space를 길게 누르면 힘이 커집니다. 손을 떼면 출발합니다."}<br>R 다시 시작 · Esc 일시 정지</p><p class="muted small">기록은 브라우저에 저장됩니다. 다른 기기로 옮기려면 내 기록에서 파일을 내보내 주세요.</p>`,
  );
}
async function share() {
  const a = active;
  if (!a) return;
  const r = a.g.result;
  const text =
    a.kind === "beer"
      ? `맥주 잘 따르기 ${a.g.result?.value || 0}점! 나만의 완벽한 한 잔에 도전해 보세요.`
      : a.kind === "curling"
        ? `의자 컬링 ${a.g.bestDistance || 0}m! 동료를 구해보세요.`
        : r?.fell
          ? "치킨 드라이브에서 절벽으로 날아갔어요…"
          : `치킨 드라이브 ${STAGES[a.g.stage].name}, 절벽까지 ${fmt(a.g.gap)}m!`;
  const url = location.origin + location.pathname;
  try {
    if (navigator.share)
      await navigator.share({ title: "쑨플레이", text, url });
    else {
      await navigator.clipboard.writeText(text + " " + url);
      toast("기록과 링크를 복사했습니다.");
    }
  } catch (e) {
    if (e.name !== "AbortError")
      toast("공유하지 못했습니다. 주소를 복사해 주세요.");
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
  if (a === "beer-upright" && active?.kind === "beer") active.g.setAngle(0);
  if (a === "beer-tilt" && active?.kind === "beer") active.g.setAngle(40);
  if (a === "practice" && active)
    mount("curling", active.g.stage, { practice: true });
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
  if (/^\/game\/beer\/?$/.test(p)) {
    mountBeer();
    return;
  }
  if (/^\/game\/(curling|drive)\/?$/.test(p))
    mount(p.includes("curling") ? "curling" : "drive");
  else home();
}
route();

function mountBeer() {
  clean();
  document.body.classList.add("playing");
  document.title = "맥주 잘 따르기 | 쑨플레이";
  app.innerHTML =
    header("beer") +
    '<main id="main" class="game-shell beer"><canvas id="game" tabindex="0" aria-label="맥주 따르기: 누르고 좌우로 움직여 잔의 기울기를 조절하세요"></canvas><div class="hud"><div class="hud-left"><div id="stage-label" class="hud-label"></div><div id="main-value" class="main-value"></div><div id="best-value" class="best-value"></div></div><div class="controls"><button data-action="retry" aria-label="다시 시작">↻</button><button data-action="pause" aria-label="일시 정지">Ⅱ</button></div></div><div id="beer-order" class="beer-order"><span>오늘의 주문</span><strong id="order-name"></strong><p id="order-request"></p><div class="order-recipe"><i id="recipe-liquid"></i><i id="recipe-foam"></i></div><div class="recipe-legend"><span>맥주</span><span>거품</span></div></div><div id="title-overlay" class="beer-intro"><span>ONE PERFECT POUR</span><h1>맥주 잘 따르기</h1><p>기울이면 맥주, 세우면 거품.</p></div><div id="game-status" class="game-status" role="status" aria-live="polite"></div><div class="beer-actions"><div class="tilt-actions"><button data-action="beer-tilt">↶ 잔 기울이기</button><button data-action="beer-upright">잔 세우기 ↑</button></div><button id="beer-pour" class="beer-pour" aria-label="누르고 맥주 따르기">누르고 따르기</button><button data-action="beer-serve" class="beer-serve">이 잔 드리기 ↗</button><span>누른 채 좌우로 움직여도 잔을 기울일 수 있어요.</span></div><div id="result" class="result-overlay" hidden></div><div class="bottom-bar"><span>왼쪽으로 기울이기 · 오른쪽으로 세우기 · 손을 떼면 멈춰요.</span><button data-action="help">조작 방법 ?</button></div></main>';
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
    button = $("#beer-pour"),
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
  for (const target of [c, button]) {
    target.addEventListener("pointerdown", down, options);
    target.addEventListener("pointerup", up, options);
    target.addEventListener("pointercancel", up, options);
    target.addEventListener("lostpointercapture", up, options);
    target.addEventListener("contextmenu", (e) => e.preventDefault(), options);
    target.addEventListener(
      "pointermove",
      (e) => {
        if (!a.pourPointers.has(e.pointerId)) return;
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
  $("#order-name").textContent = g.order.name;
  $("#order-request").textContent = g.order.request;
  $("#recipe-liquid").style.flex = String(g.order.liquid);
  $("#recipe-foam").style.flex = String(g.order.foam);
  $("#title-overlay").classList.toggle("gone", g.started);
  $("#beer-pour").classList.toggle("held", g.pouring);
  $("#beer-pour").textContent = g.pouring
    ? "따르는 중 · 손을 떼면 멈춤"
    : "누르고 따르기";
  $("#beer-pour").disabled = ["paused", "tasting", "result"].includes(g.phase);
  $('[data-action="beer-serve"]').disabled =
    ["paused", "tasting", "result"].includes(g.phase) || !g.started;
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
      ? '<button class="primary" data-action="retry">다시 도전 ↻</button><button class="secondary" data-action="share">기록 공유 ↗</button>'
      : '<button class="primary" data-action="beer-next">다음 손님 →</button>') +
    '</div><a href="/" data-nav class="text-link">게임 목록으로</a></section>';
}
function beerHelp() {
  openDialog(
    '<span class="eyebrow">HOW TO POUR</span><h2>맥주 잘 따르기</h2><p>위쪽 주문 카드의 맥주·거품 비율을 보고 세 손님의 한 잔을 완성하세요.</p><h3>따르기와 기울기</h3><p>화면이나 아래 버튼을 누르는 동안 맥주가 나옵니다. 손을 떼면 멈춥니다. 누른 채 왼쪽으로 움직이면 잔이 기울고, 오른쪽으로 움직이면 세워집니다. 기울이기·세우기 버튼도 사용할 수 있어요.</p><p>기울여 따르면 거품이 적게 생깁니다. 마지막에는 잔을 세워 부드러운 거품을 올려보세요. 거품은 기다리면 조금씩 가라앉습니다. 잔을 너무 기울이거나 오래 따르면 넘칩니다.</p><h3>주문 마무리</h3><p>원하는 모양이 되면 <b>이 잔 드리기</b>를 누르세요. 맥주 양·거품·넘친 양으로 점수를 매깁니다. 세 손님의 평균이 최종 기록입니다. 시간은 처음 따르기 시작할 때부터 흐릅니다.</p><p class="muted small">키보드: Space 누르고 따르기 · ← 기울이기 · → 세우기 · Enter 제출 · R 다시 도전 · Esc 일시 정지</p>',
  );
}
