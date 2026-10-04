// Public updater metadata only. Signing credentials are owned by CI and never read here.
import { writeFile } from "node:fs/promises";
const endpoint = process.env.NYMKEEP_UPDATE_ENDPOINT ?? "";
const pubkey = process.env.NYMKEEP_UPDATE_PUBLIC_KEY ?? "";
let url;
try {
  url = new URL(endpoint);
} catch {
  throw new Error("Configure a real public updater endpoint before release.");
}
if (
  url.protocol !== "https:" ||
  ["localhost", "127.0.0.1"].includes(url.hostname) ||
  url.hostname.endsWith(".invalid")
)
  throw new Error("A public HTTPS updater endpoint is required.");
if (pubkey.length < 40 || /REPLACE|PRIVATE|SECRET/i.test(pubkey))
  throw new Error("Configure the updater public key before release.");
await writeFile(
  "src-tauri/tauri.public-release.conf.json",
  JSON.stringify(
    {
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { endpoints: [endpoint], pubkey } },
    },
    null,
    2,
  ) + "\n",
);
console.log("Public updater configuration validated.");
