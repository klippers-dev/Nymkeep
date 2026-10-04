import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const site = new URL("../site/", import.meta.url);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/site.js", ["site.js", "text/javascript; charset=utf-8"]],
  ["/release.js", ["release.js", "text/javascript; charset=utf-8"]],
  ["/assets/nymkeep-mark.svg", ["assets/nymkeep-mark.svg", "image/svg+xml"]],
  ["/assets/shortcut-keys.jpg", ["assets/shortcut-keys.jpg", "image/jpeg"]],
  [
    "/assets/screenshot-original.png",
    ["assets/screenshot-original.png", "image/png"],
  ],
  [
    "/assets/screenshot-redacted.png",
    ["assets/screenshot-redacted.png", "image/png"],
  ],
]);

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1").pathname;
  const asset = files.get(path);
  if (!asset || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  try {
    const data = await readFile(fileURLToPath(new URL(asset[0], site)));
    response.writeHead(200, {
      "Content-Type": asset[1],
      "Content-Length": data.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Preview asset unavailable");
  }
});
server.on("error", (error) => {
  console.error("Website preview:", error.message);
  process.exitCode = 1;
});
server.listen(4173, "127.0.0.1", () => {
  console.log("Nymkeep website preview: http://127.0.0.1:4173");
});
