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
import { fileURLToPath } from "node:url";

export async function collectPackages(root, source, output) {
  assertInside(resolve(root, "artifacts"), output);
  if (await lstat(output).catch(() => null))
    throw new Error("Use a fresh artifact directory.");
  const packages = [];
  const formats = new Map([
    ["nsis", ".exe"],
    ["dmg", ".dmg"],
    ["deb", ".deb"],
    ["appimage", ".AppImage"],
  ]);
  async function findPackages(path, extension) {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Package directory cannot be a symlink.");
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = resolve(path, entry.name);
      if (extname(file) !== extension) continue;
      if (entry.isSymbolicLink())
        throw new Error("Installable package cannot be a symlink.");
      if (entry.isFile()) packages.push(file);
    }
  }
  if ((await lstat(source)).isSymbolicLink())
    throw new Error("Bundle directory cannot be a symlink.");
  for (const [directory, extension] of formats) {
    const path = resolve(source, directory);
    if (await lstat(path).catch(() => null))
      await findPackages(path, extension);
  }
  // Tauri's AppDir and expanded deb payload intentionally contain system-library
  // symlinks. Only collect final packages from the documented format directories.
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
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.cwd();
  const manifest = await collectPackages(
    root,
    resolve(root, process.argv[2] ?? "src-tauri/target/release/bundle"),
    resolve(root, process.argv[3] ?? "artifacts/candidate"),
  );
  console.log(JSON.stringify(manifest, null, 2));
}
