import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "dist");
http
  .createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, "http://local").pathname),
        f = resolve(
          root,
          p === "/" || p.startsWith("/game/") ? "index.html" : "." + p,
        );
      if (!f.startsWith(root + sep)) throw Error();
      const b = await readFile(f);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
        }[extname(f)] || "application/octet-stream",
      );
      res.end(b);
    } catch {
      res.writeHead(404).end("not found");
    }
  })
  .listen(Number(process.env.PORT || 4173), "0.0.0.0");
