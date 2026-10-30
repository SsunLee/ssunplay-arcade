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
for (const id of ["drive", "beer", "pasta", "dalgona", "subway", "runway"]) {
  await mkdir(root + "dist/game/" + id, { recursive: true });
  let html = await readFile(root + "index.html", "utf8");
  if (id === "subway") html = html.replace(/<title>.*?<\/title>/, '<title>지하철 뛰어타기 | 쑨플레이</title>').replace(/<meta name="description"[^>]*>/, '<meta name="description" content="문 닫히기 직전, 부장님의 출근 질주. 세 레인을 달리고 장애물을 피해 지하철에 탑승하세요."><meta property="og:title" content="지하철 뛰어타기 | 쑨플레이"><meta property="og:description" content="문 닫히기 직전, 부장님의 출근 질주."><meta property="og:type" content="website"><meta property="og:image" content="/social.svg">');
  if (id === "runway") {
    const title = "쑨에어 버터 랜딩 | 쑨플레이 · 김포 14R 이착륙 게임";
    const desc = "V1, 로테이트, 플레어! 김포 활주로 14R에서 쌍발 여객기를 이륙시키고 측풍을 뚫고 버터처럼 착륙하세요. 항공덕후를 위한 무료 3D 브라우저 게임.";
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${desc}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:type" content="website"><meta property="og:url" content="https://ssunplay-arcade.vercel.app/game/runway/"><meta property="og:image" content="/social.svg"><link rel="canonical" href="https://ssunplay-arcade.vercel.app/game/runway/">`);
  }
  await writeFile(root + "dist/game/" + id + "/index.html", html);
}
console.log("SSUNPLAY 3D built");
