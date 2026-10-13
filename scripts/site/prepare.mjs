import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const PUBLIC_FILES = [
  "index.html",
  "styles.css",
  "site.js",
  "release.js",
  "downloads.js",
  "assets/nymkeep-mark.svg",
  "assets/shortcut-keys.jpg",
  "assets/screenshot-original.png",
  "assets/screenshot-redacted.png",
];
export const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src https://api.github.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

async function ordinaryPath(root, path) {
  const rel = relative(root, path);
  if (!rel || isAbsolute(rel) || rel.startsWith(".." + sep))
    throw new Error("Path must stay inside the selected source.");
  const parts = rel.split(sep);
  for (let i = 0; i <= parts.length; i++) {
    const stat = await lstat(resolve(root, ...parts.slice(0, i))).catch(
      (error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (stat?.isSymbolicLink())
      throw new Error("Website paths cannot traverse a symlink.");
    if (stat && i < parts.length && !stat.isDirectory())
      throw new Error("Website parent is not a directory.");
  }
}

export async function prepareWebsite({
  root = repository,
  output,
  provider,
  canonicalUrl = null,
}) {
  root = resolve(root);
  if (!["cloudflare", "vercel"].includes(provider))
    throw new Error("Choose cloudflare or vercel explicitly.");
  if (!output) throw new Error("Choose a fresh website staging directory.");
  const out = resolve(root, output),
    rel = relative(root, out);
  if (rel !== "website-dist" && !rel.startsWith(`.release-work${sep}`))
    throw new Error(
      "Use website-dist or a directory inside .release-work; preserve desktop dist.",
    );
  await ordinaryPath(root, out);
  if (await lstat(out).catch(() => null))
    throw new Error(
      "Use a fresh website staging directory; existing files are preserved.",
    );
  let canonical = null;
  if (canonicalUrl !== null) {
    const url = new URL(canonicalUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      url.hostname === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
      url.hostname.includes(":")
    )
      throw new Error(
        "Use the verified public HTTPS root URL without credentials or parameters.",
      );
    canonical = url.origin + "/";
  }
  // Validate every input before creating any output; never walk the private workspace.
  const contents = new Map();
  for (const name of PUBLIC_FILES) {
    const path = resolve(root, "site", name);
    await ordinaryPath(root, path);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 5_000_000)
      throw new Error(`Invalid public website file: ${name}`);
    contents.set(name, await readFile(path));
  }
  if (canonical) {
    let html = contents.get("index.html").toString("utf8");
    if (!html.includes("</head>")) throw new Error("Website head is missing.");
    html = html.replace(
      "</head>",
      `    <link rel="canonical" href="${escape(canonical)}" />\n    <meta property="og:url" content="${escape(canonical)}" />\n  </head>`,
    );
    contents.set("index.html", Buffer.from(html));
    contents.set(
      "sitemap.xml",
      Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escape(canonical)}</loc></url></urlset>\n`,
      ),
    );
  }
  contents.set(
    "robots.txt",
    Buffer.from(
      `User-agent: *\nAllow: /\n${canonical ? `Sitemap: ${canonical}sitemap.xml\n` : ""}`,
    ),
  );
  contents.set(
    "404.html",
    Buffer.from(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Nymkeep</title><link rel="stylesheet" href="/styles.css"><link rel="icon" href="/assets/nymkeep-mark.svg"></head><body><main class="wrap section"><a class="nav-brand" href="/"><img src="/assets/nymkeep-mark.svg" width="32" height="32" alt=""><span>Nymkeep</span></a><h1>That page isn't here.</h1><p>Return to Nymkeep to explore local text protection and image redaction.</p><a class="btn btn-primary" href="/">Back to Nymkeep</a></main></body></html>\n`,
    ),
  );
  const assets = resolve(out, "public");
  const inventoryPath = out + ".inventory.json";
  if (await lstat(inventoryPath).catch(() => null))
    throw new Error("Existing deployment inventory is preserved.");
  await mkdir(assets, { recursive: true });
  const records = [];
  async function save(path, bytes, urlPath = null) {
    bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    await mkdir(dirname(resolve(out, path)), { recursive: true });
    await writeFile(resolve(out, path), bytes, { flag: "wx" });
    records.push({ path, urlPath, bytes: bytes.length, sha256: sha256(bytes) });
  }
  for (const [name, bytes] of contents)
    await save("public/" + name, bytes, "/" + name);
  const noCachePaths = [
    "/",
    ...[...contents.keys()]
      .filter((name) => !name.startsWith("assets/"))
      .map((name) => "/" + name),
  ];
  if (provider === "cloudflare") {
    const headers = [
      "/*",
      ...Object.entries(SECURITY_HEADERS).map(
        ([name, value]) => `  ${name}: ${value}`,
      ),
      ...noCachePaths.flatMap((path) => [
        path,
        "  Cache-Control: public, max-age=0, must-revalidate",
      ]),
      "/assets/*",
      "  Cache-Control: public, max-age=3600, must-revalidate",
      "",
    ].join("\n");
    await save("public/_headers", headers);
  } else {
    await save(
      "vercel.json",
      JSON.stringify(
        {
          $schema: "https://openapi.vercel.sh/vercel.json",
          framework: null,
          buildCommand: "",
          installCommand: "",
          outputDirectory: "public",
          headers: [
            {
              source: "/(.*)",
              headers: [
                ...Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
                  key,
                  value,
                })),
              ],
            },
            ...noCachePaths.map((source) => ({
              source,
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=0, must-revalidate",
                },
              ],
            })),
            {
              source: "/assets/(.*)",
              headers: [
                {
                  key: "Cache-Control",
                  value: "public, max-age=3600, must-revalidate",
                },
              ],
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );
  }
  const inventory = {
    schema: 1,
    provider,
    canonicalUrl: canonical,
    createdAt: new Date().toISOString(),
    files: records,
  };
  await writeFile(inventoryPath, JSON.stringify(inventory, null, 2) + "\n", {
    flag: "wx",
  });
  return {
    directory: out,
    assets,
    inventory: inventoryPath,
    provider,
    files: records.length,
    bytes: records.reduce((sum, item) => sum + item.bytes, 0),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !["--provider", "--output", "--canonical-url"].includes(args[i]) ||
      !args[i + 1]
    )
      throw new Error("Use --provider, --output and optional --canonical-url.");
    options[args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] =
      args[i + 1];
  }
  console.log(JSON.stringify(await prepareWebsite(options)));
}
