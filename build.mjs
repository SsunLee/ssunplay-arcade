import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
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
for (const id of ["curling", "drive", "beer"]) {
  await mkdir(root + "dist/game/" + id, { recursive: true });
  await cp(root + "index.html", root + "dist/game/" + id + "/index.html");
}
console.log("SSUNPLAY 3D built");
