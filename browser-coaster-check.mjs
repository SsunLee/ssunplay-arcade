import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const base = process.env.BASE_URL || "http://127.0.0.1:4197";
const output = "dist/qa/coaster";
const checks = [], errors = [];
let server, browser;
const record = (check) => { checks.push(check); console.log(check); };
const ready = (page, mode = "3d") => page.waitForFunction(
  (value) => document.body.dataset.renderer === value && !document.querySelector("#go").disabled,
  mode, { timeout: 90000 },
);
try {
  await mkdir(output, { recursive: true });
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: "4197" }, stdio: "ignore" });
    let listening = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base)).ok) { listening = true; break; } } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(listening, "local server started");
  }
  for (const id of ["drive", "beer", "pasta", "dalgona", "subway", "runway", "coaster"]) {
    for (const suffix of ["", "/", "/index.html"]) {
      const response = await fetch(`${base}/game/${id}${suffix}`);
      assert.equal(response.status, 200, `${id}${suffix}`);
      assert.match(response.headers.get("content-type"), /text\/html/);
      if (id === "coaster") assert.match(await response.text(), /\/coaster\/game\.js/);
    }
  }
  record("All seven game routes, trailing slashes and index.html return HTML");
  browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const mobile of [false, true]) {
    const label = mobile ? "mobile" : "desktop";
    const context = await browser.newContext(mobile
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
      : { viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    // The game must work with every external host blocked.
    await context.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await page.goto(base + "/game/coaster/");
    await ready(page);
    assert.equal(await page.locator("#chips button").count(), 3);
    assert.equal(await page.evaluate(() => window.THREE.REVISION), "128");
    await page.screenshot({ path: `${output}/${label}-start.png` });
    await page.locator("#go").click();
    await page.locator("#start").waitFor({ state: "hidden" });
    await page.locator('#cams [data-m="ride"]').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#cams [data-m="ride"]').getAttribute("class"), "on");
    await page.screenshot({ path: `${output}/${label}-ride.png` });
    for (let i = 0; i < 3; i++) {
      await page.locator("#chips button").nth(i).click();
      assert.equal(await page.locator("#hudName").innerText(), await page.locator("#chips button .nm").nth(i).innerText());
    }
    await page.locator("#play").click();
    assert.ok(await page.locator("#pausedTag").isVisible());
    // Native Space activation on a focused button must toggle only once.
    await page.locator("#play").focus(); await page.keyboard.press("Space");
    assert.equal(await page.locator("#pausedTag").isVisible(), false);
    await page.locator("#spd").press("End");
    assert.equal(await page.locator("#spdv").innerText(), "2.0×");
    await page.locator("#reset").click();
    assert.equal(await page.locator("#spdv").innerText(), "1.0×");
    assert.equal(await page.locator("#hudLap").innerText(), "0");
    await page.locator("#helpBtn").click(); await page.locator("#help").waitFor({ state: "visible" });
    await page.locator("#closeHelp").click(); await page.locator("#help").waitFor({ state: "hidden" });
    await page.locator('#cams [data-m="orbit"]').click();
    const x = mobile ? 195 : 500, y = mobile ? 350 : 300;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 50, y + 20, { steps: 4 }); await page.mouse.up();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/${label}-orbit.png` });
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(300);
      assert.ok(await page.locator("#dock .arcade-home").isVisible());
      await page.screenshot({ path: `${output}/mobile-landscape.png` });
    }
    record(`${label}: real 3D, three coasters, cameras, controls, help and layout`);
    if (!mobile) {
      // Simulate a genuine GPU context loss, then exercise fallback/retry repeatedly.
      await page.evaluate(() => {
        const canvas = document.querySelector("#c");
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        gl.getExtension("WEBGL_lose_context").loseContext();
      });
      await page.locator("#diag").waitFor({ state: "visible" });
      await page.getByRole("button", { name: "2D 지도 모드로 보기", exact: true }).click();
      await ready(page, "2d"); await page.waitForTimeout(300);
      assert.equal(await page.locator("#start").isVisible(), false);
      await page.screenshot({ path: `${output}/2d-fallback.png` });
      await page.locator("#retry3d").evaluate((button) => { button.click(); button.click(); button.click(); });
      await ready(page); await page.waitForTimeout(500);
      assert.equal(await page.locator("#diag").isVisible(), false);
      assert.equal(await page.locator("#chips button").count(), 3);
      record("GPU loss → 2D → repeated 3D retry recovers without duplicate controls or stale errors");
    }
    await page.locator("#dock .arcade-home").click();
    await page.locator(".game-card").first().waitFor();
    assert.equal(await page.locator(".game-card").count(), 7);
    await page.locator('.game-card[href="/game/coaster/"]').click(); await ready(page);
    await page.goBack(); await page.locator(".game-card").first().waitFor();
    await page.goForward(); await ready(page);
    record(`${label}: home card, return link and Back/Forward navigation`);
    await context.close();
  }
  const blocked = await browser.newContext();
  await blocked.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (/webgl/.test(type)) return null;
      return original.call(this, type, ...args);
    };
  });
  const page = await blocked.newPage(); page.on("pageerror", (e) => errors.push(`no-webgl: ${e.message}`));
  await page.goto(base + "/game/coaster"); await page.locator("#diag").waitFor({ state: "visible" });
  await page.keyboard.press("Enter"); assert.ok(await page.locator("#start").isVisible());
  await page.getByRole("button", { name: "2D 지도 모드로 보기", exact: true }).click();
  await ready(page, "2d"); await page.locator("#go").click();
  await page.locator("#chips button").nth(2).click();
  await page.locator("#reset").click(); await page.waitForTimeout(100);
  assert.equal(await page.locator("#err").isVisible(), false);
  record("Unavailable WebGL shows a usable explicit 2D fallback, with start guarded");
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser?.close(); server?.kill();
}
