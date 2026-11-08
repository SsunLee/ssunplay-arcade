import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("coaster is an isolated full-document route and home has seven games", async () => {
  const app = await readFile(new URL("app.js", import.meta.url), "utf8");
  assert.match(app, /class="game-card coaster-card" href="\/game\/coaster\/"/);
  assert.doesNotMatch(app, /href="\/game\/coaster\/" data-nav/);
  const html = await readFile(new URL("coaster/index.html", import.meta.url), "utf8");
  assert.match(html, /href="\/" aria-label="쑨플레이 게임 목록으로"/);
  assert.match(html, /canonical[^>]+\/game\/coaster\//);
  assert.doesNotMatch(html, /(?:src|href)="https?:[^\"]+\.(?:js|css)/);
  for (const asset of ["game.js", "three-r128.min.js", "style.css", "preview.svg", "LICENSE-three.txt"])
    assert.ok((await readFile(new URL(`coaster/${asset}`, import.meta.url))).length > 0);
});

test("coaster rewrite precedes the general SPA rewrite", async () => {
  const config = JSON.parse(await readFile(new URL("vercel.json", import.meta.url)));
  const index = config.rewrites.findIndex((r) => r.source === "/game/coaster/:path*");
  assert.ok(index >= 0 && index < config.rewrites.findIndex((r) => r.source === "/game/:path*"));
  assert.equal(config.rewrites[index].destination, "/game/coaster/index.html");
});

test("vendored Three.js retains the original compatible r128 API and MIT notice", async () => {
  const source = await readFile(new URL("coaster/three-r128.min.js", import.meta.url), "utf8");
  assert.match(source, /SPDX-License-Identifier: MIT/);
  const context = vm.createContext({}); vm.runInContext(source, context);
  assert.equal(context.THREE.REVISION, "128");
  assert.equal(typeof context.THREE.WebGLRenderer, "function");
  assert.equal(typeof context.THREE.CatmullRomCurve3, "function");
});
