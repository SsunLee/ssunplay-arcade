import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:4173", tag = process.argv[3] || "local", out = "/workspace/plane-game/" + tag;
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const log = [];
async function setup(page) {
  page.on("pageerror", (e) => log.push("ERR " + e.message));
  await page.goto(base + "/game/runway/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const card = page.locator(".rw-lv-card").first();
  if (await card.isVisible().catch(() => false)) await card.click();
  await page.waitForTimeout(400);
}
const num = (page, id) => page.$eval("#" + id, (e) => +e.textContent.replace(/[^\d.-]/g, "") || 0);
const hint = (page) => page.$eval("#rw-hint", (e) => e.textContent);
// desktop: full flight with mouse throttle + keyboard yoke
{
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await setup(page);
  await page.screenshot({ path: out + "-desktop-ready.png" });
  const t = await page.locator(".rw-thr-track").boundingBox();
  await page.mouse.move(t.x + 5, t.y + t.height - 2); await page.mouse.down();
  await page.mouse.move(t.x + 5, t.y - 10, { steps: 8 }); await page.mouse.up();
  log.push("hint after throttle: " + await hint(page) + " thr=" + await num(page, "rw-thr"));
  let shot = false;
  for (let i = 0; i < 400; i++) {
    const ias = await num(page, "rw-ias");
    if (!shot && ias > 90) { await page.screenshot({ path: out + "-mid-takeoff.png" }); shot = true; log.push("mid hint: " + await hint(page) + " ias " + ias); }
    if (ias >= 145) break;
    await page.waitForTimeout(100);
  }
  log.push("rotate hint: " + await hint(page));
  await page.keyboard.down("ArrowDown");
  for (let i = 0; i < 80; i++) { if (+(await num(page, "rw-pitch")) > 13) break; await page.waitForTimeout(50); }
  await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + "-climb.png" });
  log.push("climb hint: " + await hint(page));
  await page.keyboard.press("KeyF"); // flaps up
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + "-flaps-up.png" });
  await page.waitForSelector(".rw-result", { timeout: 60000 });
  await page.waitForTimeout(500);
  log.push("takeoff: " + (await page.$eval(".rw-result h2", (e) => e.textContent)));
  await page.screenshot({ path: out + "-takeoff-result.png" });
  await page.keyboard.press("Space"); await page.waitForTimeout(800);
  await page.keyboard.press("Space"); await page.waitForTimeout(1500);
  await page.keyboard.press("KeyF"); await page.waitForTimeout(400);
  log.push("landing hint (flaps 2): " + await hint(page));
  await page.screenshot({ path: out + "-landing-approach.png" });
  await page.keyboard.press("KeyV");
  for (let i = 0; i < 1200; i++) {
    const alt = await num(page, "rw-alt"), vs = await num(page, "rw-vs");
    if (await page.locator(".rw-result").isVisible().catch(() => false)) break;
    if (alt < 30 && vs < -300) await page.keyboard.down("ArrowDown"); else await page.keyboard.up("ArrowDown");
    if (alt < 60 && alt > 30 && !log.some((l) => l.startsWith("flare"))) { log.push("flare hint: " + await hint(page)); await page.screenshot({ path: out + "-flare.png" }); }
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("ArrowDown");
  await page.waitForSelector(".rw-result", { timeout: 30000 });
  await page.waitForTimeout(800);
  log.push("landing: " + (await page.$eval(".rw-result h2", (e) => e.textContent)));
  await page.screenshot({ path: out + "-landing-result.png" });
  await page.close();
}
// mobile: two simultaneous touches, throttle + yoke
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await setup(page);
  await page.screenshot({ path: out + "-mobile-ready.png" });
  const cdp = await ctx.newCDPSession(page);
  const t = await page.locator(".rw-thr-track").boundingBox(), w = await page.locator("#rw-wheel").boundingBox();
  const tp = (x, y, id) => ({ x, y, id });
  const T0 = tp(t.x + 5, t.y + t.height - 2, 1), Y0 = tp(w.x + w.width / 2, w.y + w.height / 2, 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [T0] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [T0, Y0] });
  for (let k = 1; k <= 8; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(T0.x, T0.y - (t.height + 10) * k / 8, 1), tp(Y0.x, Y0.y + 5 * k, 2)] });
  await page.waitForTimeout(1500);
  log.push(`mobile multitouch: thr=${await num(page, "rw-thr")} wheelOn=${await page.$eval("#rw-wheel", (e) => e.classList.contains("on"))} thrOn=${await page.$eval("#rw-thr-lever", (e) => e.classList.contains("on"))}`);
  await page.screenshot({ path: out + "-mobile-multitouch.png" });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.close();
  const land = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const p2 = await land.newPage(); await setup(p2);
  await p2.locator('[data-rw="start"]').tap(); await p2.waitForTimeout(300);
  const t2 = await p2.locator(".rw-thr-track").boundingBox();
  await p2.locator('[data-rw="flapdn"]').tap();
  await p2.waitForTimeout(2500);
  await p2.screenshot({ path: out + "-mobile-landscape.png" });
}
console.log(log.join("\n"));
await b.close();
