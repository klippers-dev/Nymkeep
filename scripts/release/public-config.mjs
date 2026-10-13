// Public metadata only. This tool never reads signing credentials.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UPDATE_ENDPOINT =
  "https://github.com/klippers-dev/Nymkeep/releases/latest/download/latest.json";
export function publicReleaseConfig({
  endpoint = UPDATE_ENDPOINT,
  pubkey,
  versions,
  tag,
}) {
  if (endpoint !== UPDATE_ENDPOINT)
    throw new Error("Use the approved Nymkeep stable HTTPS update endpoint.");
  if (
    !/^\d+\.\d+\.\d+$/.test(versions[0]) ||
    versions.some((value) => value !== versions[0]) ||
    tag !== `v${versions[0]}`
  )
    throw new Error(
      "Tag, npm, Cargo and Tauri versions must match a stable release.",
    );
  if (typeof pubkey !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(pubkey))
    throw new Error("Configure the updater public key before release.");
  const text = Buffer.from(pubkey, "base64").toString("utf8");
  const key = Buffer.from(text.split(/\r?\n/)[1] ?? "", "base64");
  if (
    key.length !== 42 ||
    key.subarray(0, 2).toString() !== "Ed" ||
    !key.subarray(10).some((byte) => byte !== 0)
  )
    throw new Error("The updater key must contain a valid public-key record.");
  return {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        endpoints: [endpoint],
        pubkey,
        windows: { installMode: "passive" },
      },
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const npm = JSON.parse(await readFile("package.json", "utf8"));
  const tauri = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
  const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
  const config = publicReleaseConfig({
    endpoint: process.env.NYMKEEP_UPDATE_ENDPOINT || UPDATE_ENDPOINT,
    pubkey: process.env.NYMKEEP_UPDATE_PUBLIC_KEY,
    versions: [
      npm.version,
      tauri.version,
      cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    ],
    tag: process.env.GITHUB_REF_NAME,
  });
  await writeFile(
    "src-tauri/tauri.public-release.conf.json",
    JSON.stringify(config, null, 2) + "\n",
  );
  console.log(
    "Stable release version and public updater configuration validated.",
  );
}
