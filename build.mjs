import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
await rm(root + "dist", { recursive: true, force: true });
await mkdir(root + "dist");
await build({
  entryPoints: [root + "app.js"],
  outfile: root + "dist/bundle.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "eof",
});
for (const n of ["index.html", "style.css", "favicon.svg", "social.svg"])
  await cp(root + n, root + "dist/" + n);
await cp(root + "dist/bundle.js", root + "bundle.js");
for (const id of ["drive", "beer", "pasta", "dalgona", "subway"]) {
  await mkdir(root + "dist/game/" + id, { recursive: true });
  let html = await readFile(root + "index.html", "utf8");
  if (id === "subway") html = html.replace(/<title>.*?<\/title>/, '<title>지하철 뛰어타기 | 쑨플레이</title>').replace(/<meta name="description"[^>]*>/, '<meta name="description" content="문 닫히기 직전, 부장님의 출근 질주. 세 레인을 달리고 장애물을 피해 지하철에 탑승하세요."><meta property="og:title" content="지하철 뛰어타기 | 쑨플레이"><meta property="og:description" content="문 닫히기 직전, 부장님의 출근 질주."><meta property="og:type" content="website"><meta property="og:image" content="/social.svg">');
  await writeFile(root + "dist/game/" + id + "/index.html", html);
}
console.log("SSUNPLAY 3D built");
