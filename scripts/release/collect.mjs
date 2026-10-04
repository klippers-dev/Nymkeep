import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  lstat,
} from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { assertInside } from "./prepare.mjs";

const root = process.cwd();
const source = resolve(
  root,
  process.argv[2] ?? "src-tauri/target/release/bundle",
);
const output = resolve(root, process.argv[3] ?? "artifacts/candidate");
assertInside(resolve(root, "artifacts"), output);
if (await lstat(output).catch(() => null))
  throw new Error("Use a fresh artifact directory.");
const packages = [];
async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = resolve(path, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("Unexpected symlink in bundle output.");
    if (entry.isDirectory() && !entry.name.endsWith(".app")) await walk(file);
    else if (
      entry.isFile() &&
      [".exe", ".dmg", ".deb", ".AppImage"].includes(extname(file))
    )
      packages.push(file);
  }
}
await walk(source);
if (!packages.length) throw new Error("No installable package produced.");
await mkdir(output, { recursive: true });
const manifest = {
  status: "unsigned-internal-candidate",
  publicRelease: false,
  packages: [],
};
for (const path of packages) {
  const bytes = await readFile(path);
  if (bytes.length < 100_000)
    throw new Error("Unexpectedly small installable package.");
  const name = basename(path);
  if (manifest.packages.some((entry) => entry.name === name))
    throw new Error("Duplicate package name.");
  await cp(path, resolve(output, name), { force: false, errorOnExist: true });
  manifest.packages.push({
    name,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  resolve(output, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  resolve(output, "README.txt"),
  "Internal unsigned Nymkeep candidate. Not a signed public release.\nReview installation, permissions, native OCR, clipboard export, uninstall and privacy on a test device.\n",
);
console.log(JSON.stringify(manifest, null, 2));
