// Local static-export validation only. GitHub Pages serves the production artifact.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("out");
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "/averiqchat";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (path !== base && !path.startsWith(`${base}/`)) {
      res.writeHead(404).end();
      return;
    }
    let file = resolve(root, `.${path.slice(base.length) || "/"}`);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    res.setHeader(
      "Content-Type",
      types[extname(file)] || "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(3100, "127.0.0.1");
