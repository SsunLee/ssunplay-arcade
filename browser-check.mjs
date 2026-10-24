import { chromium } from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const out = "browser-verification.json";
const prior = process.env.ONLY_MOBILE
  ? JSON.parse(await fs.readFile(out, "utf8"))
  : null;
const results = (prior?.checks || []).filter(
    (x) => !x.check.startsWith("mobile-"),
  ),
  errors = prior?.pageErrors || [];
async function record(check, info = {}) {
  results.push({ check, ...info });
  console.log(JSON.stringify(results.at(-1)));
}
try {
  if (!process.env.ONLY_MOBILE) {
    const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base + "/", { waitUntil: "domcontentloaded" });
    await p.locator("#preview-drive[data-triangles]").waitFor();
    assert.equal(await p.locator(".game-card").count(), 2);
    await p.screenshot({ path: "preview-desktop.png", fullPage: true });
    await record("desktop-home", { cards: 2 });
    await p.locator('a[href="/game/drive/"]').click();
    await p.locator("#game[data-renderer]").waitFor();
    for (let s = 0; s < 5; s++) {
      await p.locator("#stage-select").selectOption("" + s);
      await p.waitForTimeout(120);
      const triangles = +(await p
        .locator("#game")
        .getAttribute("data-triangles"));
      assert.ok(triangles > 10000);
      if (process.env.STAGE_SCREENSHOTS === "1")
        await p.screenshot({ path: "preview-stage-" + s + ".png" });
      await record("stage-3d", { stage: s, triangles });
    }
    await p.locator("#stage-select").selectOption("0");
    const r = await p.locator("#game").boundingBox();
    await p.mouse.move(950, r.y + 110);
    await p.mouse.down();
    await p.mouse.move(950, r.y + 110 + r.height * 0.5 * 0.5, { steps: 6 });
    await p.waitForTimeout(120);
    await p.locator('#game[data-phase="aim"]').waitFor({ timeout: 10000 });
    assert.equal(await p.locator("#power-number").innerText(), "50%");
    await record("mouse-pull", { percent: "50%" });
    await p.mouse.up();
    await p.waitForTimeout(200);
    await p.locator('#game[data-phase="run"]').waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "일시 정지", exact: true }).click();
    await p.waitForTimeout(80);
    await p.locator('#game[data-phase="paused"]').waitFor({ timeout: 10000 });
    await p.getByRole("button", { name: "계속하기", exact: true }).click();
    await record("pause-resume");
    await p.locator("#result").waitFor({ state: "visible", timeout: 90000 });
    assert.match(await p.locator("#result").innerText(), /안전하게 정지/);
    await p.screenshot({ path: "preview-drive-result.png" });
    await record("drive-stop-result", {
      result: await p.locator(".result-value").innerText(),
    });
    await p.getByRole("button", { name: "다시 도전 ↻", exact: true }).click();
    await p.waitForTimeout(80);
    await p.locator('#game[data-phase="ready"]').waitFor({ timeout: 10000 });
    await record("retry");
    await p.goto(base + "/game/curling/", { waitUntil: "domcontentloaded" });
    await p.locator("#game[data-renderer]").waitFor();
    await p.screenshot({ path: "preview-curling.png" });
    await p.mouse.move(640, 450);
    await p.mouse.down();
    await p.waitForTimeout(25);
    await p.mouse.move(640, 425);
    await p.waitForTimeout(25);
    await p.mouse.move(640, 400);
    await p.waitForTimeout(25);
    await p.mouse.move(640, 375);
    await p.mouse.up();
    await p.waitForTimeout(100);
    await p.locator('#game[data-phase="roll"]').waitFor({ timeout: 10000 });
    const flickPhase = await p.locator("#game").getAttribute("data-phase");
    assert.equal(flickPhase, "roll");
    await record("mouse-curling-flick", { phase: flickPhase });
    await p.waitForTimeout(5500);
    await p.screenshot({ path: "preview-curling-play.png" });
    await record("curling-after-flick", {
      phase: await p.locator("#game").getAttribute("data-phase"),
      stage: await p.locator("#stage-label").innerText(),
    });
    if (await p.locator("#result").isVisible())
      await p.getByRole("button", { name: "다시 도전 ↻", exact: true }).click();
    else
      await p.getByRole("button", { name: "다시 시작", exact: true }).click();
    await p.locator("#game").focus();
    await p.keyboard.down("Space");
    await p.waitForTimeout(425);
    await p.keyboard.up("Space");
    await p
      .locator("#stage-label")
      .filter({ hasText: "2번째" })
      .waitFor({ timeout: 30000 });
    assert.match(await p.locator("#stage-label").innerText(), /2번째/);
    await record("curling-keyboard", {
      phase: await p.locator("#game").getAttribute("data-phase"),
      stage: await p.locator("#stage-label").innerText(),
    });
    await p.getByRole("button", { name: "내 기록", exact: true }).click();
    assert.ok(await p.locator("dialog").isVisible());
    const download = p.waitForEvent("download");
    await p.getByRole("button", { name: "기록 내보내기", exact: true }).click();
    const dl = await download;
    const filename = await dl.path(),
      backup = JSON.parse(await fs.readFile(filename, "utf8"));
    assert.equal(backup.version, 2);
    assert.ok(Number.isFinite(backup.drive[0]));
    await record("records-export", { version: backup.version });
    await p.locator("#import").setInputFiles({
      name: "roundtrip.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await p.getByText("기록을 가져왔습니다.", { exact: true }).waitFor();
    await record("records-import");
    await p.locator("#import").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
    await p
      .getByText("올바른 쑨플레이 기록 파일을 선택해 주세요.", { exact: true })
      .waitFor();
    await record("invalid-import-rejected");
    await p.getByRole("button", { name: "닫기", exact: true }).click();
    await ctx.close();
  }
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    }),
    m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(base + "/", { waitUntil: "domcontentloaded" });
  await m.locator("#preview-drive[data-triangles]").waitFor();
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await m.screenshot({ path: "preview-mobile.png", fullPage: true });
  await m.locator('a[href="/game/drive/"]').click();
  await m.locator("#game[data-renderer]").waitFor();
  await m.screenshot({ path: "preview-mobile-drive.png" });
  const cd = await mobile.newCDPSession(m),
    box = await m.locator("#game").boundingBox();
  const x = 300,
    y = box.y + 150,
    end = y + box.height * 0.5 * 0.4;
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= 6; i++) {
    await cd.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + ((end - y) * i) / 6 }],
    });
    await m.waitForTimeout(20);
  }
  await m.waitForTimeout(80);
  await m.getByText("40%", { exact: true }).waitFor({ timeout: 10000 });
  await cd.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await m.waitForTimeout(100);
  await m.locator('#game[data-phase="run"]').waitFor({ timeout: 10000 });
  await record("mobile-native-touch", {
    width: 390,
    pull: "40%",
    phase: "run",
    horizontalOverflow: false,
  });
  await m.getByRole("button", { name: "도움말", exact: true }).click();
  assert.ok(await m.locator("dialog").isVisible());
  await record("mobile-help");
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        baseUrl: base,
        execution: process.env.ONLY_MOBILE
          ? "desktop passed; mobile resumed in isolated context"
          : "full sequential desktop and mobile",
        checks: results,
        pageErrors: errors,
        status: "passed",
      },
      null,
      2,
    ),
  );
} catch (e) {
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        baseUrl: base,
        checks: results,
        pageErrors: errors,
        status: "failed",
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
