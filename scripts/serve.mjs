// Servidor estático mínimo para public/ (sin dependencias).
// Uso: node scripts/serve.mjs [puerto]   (por defecto 5173)
// URLs limpias como en Vercel (cleanUrls): /mapa sirve mapa.html y /mapa.html redirige a /mapa.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, dirname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".geojson": "application/geo+json",
  ".json": "application/json",
};

export function servir(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith(".html")) {
        const limpia = path.replace(/(index)?\.html$/, "");
        res.writeHead(308, { Location: limpia + url.search }).end();
        return;
      }
      if (path.endsWith("/")) path += "index.html";
      else if (!extname(path)) path += ".html";
      const file = normalize(join(ROOT, path));
      if (file !== ROOT && !file.startsWith(ROOT + sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("No encontrado");
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const server = await servir(Number(process.argv[2] ?? 5173));
  console.log(`Sirviendo public/ en http://127.0.0.1:${server.address().port}/`);
}
