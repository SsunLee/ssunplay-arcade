import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://127.0.0.1:4173",
  checks = [],
  errors = [];
await fs.mkdir("dist/qa", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const record = (check, detail = {}) => {
  checks.push({ check, ...detail });
  console.log(JSON.stringify(checks.at(-1)));
};
const phase = (p, name) =>
  p.locator('#game[data-phase="' + name + '"]').waitFor({ timeout: 15000 });
try {
  const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.locator("#preview-beer[data-renderer]").waitFor();
  assert.equal(await p.locator(".game-card").count(), 3);
  await p.screenshot({ path: "dist/qa/home-v21.png", fullPage: true });
  record("three-game-home");
  await p.locator('a[href="/game/drive/"]').click();
  await phase(p, "ready");
  assert.equal(
    await p.locator("#power-number,#power-box,#power-fill").count(),
    0,
  );
  const r = await p.locator("#game").boundingBox();
  await p.mouse.move(1000, r.y + 120);
  await p.mouse.down();
  await p.mouse.move(1000, r.y + 280, { steps: 4 });
  await phase(p, "aim");
  assert.equal((await p.locator("body").innerText()).includes("%"), false);
  await p.screenshot({ path: "dist/qa/drive-no-force.png" });
  await p.mouse.up();
  await phase(p, "run");
  record("drive-no-force-indicator");
  await p.getByRole("button", { name: "다시 시작", exact: true }).click();
  await phase(p, "ready");
  record("drive-retry");
  await p.goto(base + "/game/curling/", { waitUntil: "domcontentloaded" });
  await phase(p, "ready");
  const a = await p.screenshot();
  await p.waitForTimeout(1800);
  const b = await p.screenshot();
  assert.equal(a.equals(b), false);
  record("curling-autonomous-sway");
  await p.locator("#result").waitFor({ state: "visible", timeout: 65000 });
  assert.match(await p.locator("#result").innerText(), /늦었어요/);
  await p.screenshot({ path: "dist/qa/curling-idle-collapse.png" });
  record("curling-random-idle-collapse");
  await p.getByRole("button", { name: "다시 도전 ↻", exact: true }).click();
  await phase(p, "ready");
  await p.locator("#game").focus();
  await p.keyboard.down("Space");
  await p.waitForTimeout(425);
  await p.keyboard.up("Space");
  await p
    .locator("#stage-label")
    .filter({ hasText: "2번째" })
    .waitFor({ timeout: 25000 });
  record("curling-catch-next-stage");
  await p.goto(base + "/game/beer/", { waitUntil: "domcontentloaded" });
  await phase(p, "ready");
  await p.getByRole("button", { name: "도움말", exact: true }).click();
  assert.match(await p.locator("dialog").innerText(), /거품/);
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  record("beer-help");
  const scores = [];
  for (let i = 0; i < 3; i++) {
    await p.getByRole("button", { name: "↶ 잔 기울이기", exact: true }).click();
    await p.locator("#game").focus();
    await p.keyboard.down("Space");
    const until = i ? 24 : 26;
    await p.waitForFunction(
      (n) => parseInt(document.querySelector("#main-value").textContent) <= n,
      until,
      { timeout: 40000 },
    );
    await p.keyboard.up("Space");
    await phase(p, "settle");
    await p.getByRole("button", { name: "잔 세우기 ↑", exact: true }).click();
    if (i === 0) {
      await p.screenshot({ path: "dist/qa/beer-desktop.png" });
      await p.getByRole("button", { name: "일시 정지", exact: true }).click();
      await phase(p, "paused");
      const time = await p.locator("#main-value").innerText();
      await p.waitForTimeout(1200);
      assert.equal(await p.locator("#main-value").innerText(), time);
      await p.getByRole("button", { name: "계속하기", exact: true }).click();
      await phase(p, "settle");
      record("beer-pause-stops-flow-and-time");
    }
    await p
      .getByRole("button", { name: "이 잔 드리기 ↗", exact: true })
      .click();
    await p.locator("#result").waitFor({ state: "visible" });
    const score = parseInt(await p.locator(".result-value").innerText());
    assert.ok(score >= 0 && score <= 100);
    scores.push(score);
    record("beer-order-submission", { round: i + 1, score });
    if (i < 2) {
      await p.getByRole("button", { name: "다음 손님 →", exact: true }).click();
      await phase(p, "ready");
    }
  }
  assert.match(await p.locator("#result").innerText(), /오늘의 탭마스터/);
  assert.equal(await p.locator(".beer-score-list span").count(), 3);
  await p.screenshot({ path: "dist/qa/beer-final.png" });
  record("beer-three-orders-final");
  await p.getByRole("button", { name: "내 기록", exact: true }).click();
  const promise = p.waitForEvent("download");
  await p.getByRole("button", { name: "기록 내보내기", exact: true }).click();
  const backup = JSON.parse(
    await fs.readFile(await (await promise).path(), "utf8"),
  );
  assert.ok(Number.isInteger(backup.beer));
  record("beer-record-export", { best: backup.beer });
  await p
    .locator("#import")
    .setInputFiles({
      name: "bad-beer.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...backup, beer: 101 })),
    });
  await p
    .getByText("올바른 쑨플레이 기록 파일을 선택해 주세요.", { exact: true })
    .waitFor();
  record("beer-import-rejects-invalid-score");
  await p
    .locator("#import")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await p.getByText("기록을 가져왔습니다.", { exact: true }).waitFor();
  record("beer-record-import");
  await ctx.close();
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    }),
    m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(base + "/game/beer/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await phase(m, "ready");
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  const cd = await mobile.newCDPSession(m),
    box = await m.locator("#game").boundingBox(),
    x = 220,
    y = box.y + box.height * 0.58;
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await m.waitForTimeout(200);
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x - 70, y }],
  });
  await phase(m, "pour");
  await m.waitForTimeout(1000);
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await phase(m, "settle");
  await m.screenshot({ path: "dist/qa/beer-mobile.png" });
  record("mobile-native-touch-pour-tilt-release", {
    width: 390,
    noHorizontalOverflow: true,
  });
  await m.getByRole("button", { name: "일시 정지", exact: true }).click();
  await phase(m, "paused");
  record("mobile-pause");
  await mobile.close();
  assert.deepEqual(errors, []);
  await fs.writeFile(
    "browser-verification-v21.json",
    JSON.stringify(
      {
        version: "2.1.0",
        testedAt: new Date().toISOString(),
        baseUrl: base,
        status: "passed",
        checks,
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
} catch (e) {
  await fs.writeFile(
    "browser-verification-v21.json",
    JSON.stringify(
      {
        version: "2.1.0",
        status: "failed",
        checks,
        pageErrors: errors,
        error: String(e),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
