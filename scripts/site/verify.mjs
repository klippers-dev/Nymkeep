import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS } from "./prepare.mjs";

export async function verifyWebsite({ url, inventory, fetcher = fetch }) {
  const base = new URL(url);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("Verify the public HTTPS root URL.");
  if (
    inventory.schema !== 1 ||
    !["cloudflare", "vercel"].includes(inventory.provider) ||
    !Array.isArray(inventory.files)
  )
    throw new Error("Invalid deployment inventory.");
  const files = inventory.files.filter((file) => file.urlPath);
  if (!files.some((file) => file.urlPath === "/index.html"))
    throw new Error("Missing website homepage inventory.");
  async function get(path) {
    const response = await fetcher(new URL(path, base), {
      redirect: "follow",
      credentials: "omit",
      signal: AbortSignal.timeout(20_000),
    });
    if (response.url && new URL(response.url).origin !== base.origin)
      throw new Error("Website redirected outside the selected deployment.");
    return response;
  }
  const homepage = await get("/");
  if (homepage.status !== 200)
    throw new Error(
      `Website is not publicly available (HTTP ${homepage.status}).`,
    );
  for (const [name, expected] of Object.entries(SECURITY_HEADERS)) {
    const value = homepage.headers.get(name);
    if (
      !value ||
      (name === "Strict-Transport-Security"
        ? !/max-age=[1-9][0-9]+/.test(value)
        : value !== expected)
    )
      throw new Error(`Website security header mismatch: ${name}`);
  }
  const homepageBytes = Buffer.from(await homepage.arrayBuffer());
  const index = files.find((file) => file.urlPath === "/index.html");
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  if (digest(homepageBytes) !== index.sha256)
    throw new Error("Homepage differs from the reviewed website build.");
  for (const file of files) {
    if (
      !/^\/[A-Za-z0-9_./-]+$/.test(file.urlPath) ||
      file.urlPath.includes("..") ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0 ||
      file.bytes > 5_000_000
    )
      throw new Error("Invalid public asset inventory entry.");
    const response = await get(file.urlPath);
    if (
      response.status !== 200 &&
      !(file.urlPath === "/404.html" && response.status === 404)
    )
      throw new Error(`Public website asset unavailable: ${file.urlPath}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256)
      throw new Error(
        `Public website asset differs from reviewed bytes: ${file.urlPath}`,
      );
  }
  const probes = [
    "/.env",
    "/HANDOFF.md",
    "/src-tauri/Cargo.toml",
    "/models/pii-model.onnx",
    "/sdk-libs/vcruntime.lib",
    "/not-a-nymkeep-page",
  ];
  for (const path of probes) {
    const response = await get(path);
    if (![400, 403, 404].includes(response.status))
      throw new Error(
        `Private workspace route or missing page is exposed: ${path}`,
      );
    await response.body?.cancel();
  }
  return {
    url: base.href,
    provider: inventory.provider,
    filesVerified: files.length,
    privatePathsBlocked: probes.length,
    securityHeaders: "pass",
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [url, path] = process.argv.slice(2);
  if (!url || !path)
    throw new Error(
      "Use verify.mjs <public HTTPS root URL> <local inventory JSON>.",
    );
  console.log(
    JSON.stringify(
      await verifyWebsite({
        url,
        inventory: JSON.parse(await readFile(path, "utf8")),
      }),
    ),
  );
}
