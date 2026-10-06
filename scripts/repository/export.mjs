import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertInside,
  cleanLock,
  cleanManifest,
  repository,
} from "../release/prepare.mjs";
import { auditSource, forbiddenPath, listFiles } from "./audit.mjs";

const sources = [
  ".gitattributes",
  ".gitignore",
  ".github",
  "LICENSE",
  "README.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "DECISIONS.md",
  "CURRENT_STATE.md",
  "TASKS.md",
  "HANDOFF.md",
  "ROADMAP.md",
  "THREAT_MODEL.md",
  "TEST_MATRIX.md",
  "PRODUCT.md",
  "DESIGN.md",
  "BRAND.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "docs",
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vitest.config.ts",
  "src",
  "public",
  "tests",
  "scripts",
  "site",
  "src-tauri/.gitignore",
  "src-tauri/src",
  "src-tauri/tests",
  "src-tauri/icons",
  "src-tauri/capabilities",
  "src-tauri/macos",
  "src-tauri/build.rs",
  "src-tauri/THIRD_PARTY_NOTICES.txt",
  "src-tauri/licenses",
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.windows.conf.json",
  "src-tauri/tauri.macos.conf.json",
  "src-tauri/tauri.linux.conf.json",
  "src-tauri/tauri.candidate.conf.json",
  "src-tauri/models/manifest.json",
  "src-tauri/models/ocr-manifest.json",
];

export async function exportSource(
  root = repository,
  destination = resolve(root, ".release-work/public-source"),
) {
  const staging = resolve(root, ".release-work");
  assertInside(staging, destination);
  for (let path = dirname(destination); ; path = dirname(path)) {
    const stat = await lstat(path).catch(() => null);
    if (stat?.isSymbolicLink())
      throw new Error("Public-source destination traverses a symlink.");
    if (!relative(staging, path)) break;
    if (dirname(path) === path) throw new Error("Invalid export ancestry.");
  }
  if (await lstat(destination).catch(() => null))
    throw new Error(
      "Use a fresh export directory; existing files are preserved.",
    );
  const manifest = cleanManifest(
    await readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8"),
  );
  const lock = cleanLock(
    await readFile(resolve(root, "src-tauri/Cargo.lock"), "utf8"),
  );
  async function copy(path) {
    if (forbiddenPath(path)) throw new Error(`Forbidden export entry: ${path}`);
    const from = resolve(root, path),
      to = resolve(destination, path);
    const stat = await lstat(from);
    if (stat.isSymbolicLink())
      throw new Error(`Source symlink rejected: ${path}`);
    if (stat.isDirectory()) {
      await mkdir(to, { recursive: true });
      for (const name of await readdir(from)) await copy(`${path}/${name}`);
    } else if (stat.isFile()) {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { force: false, errorOnExist: true });
    } else throw new Error(`Unsupported source entry: ${path}`);
  }
  for (const path of sources)
    if (await lstat(resolve(root, path)).catch(() => null)) await copy(path);
  await mkdir(resolve(destination, "src-tauri"), { recursive: true });
  await writeFile(resolve(destination, "src-tauri/Cargo.toml"), manifest);
  await writeFile(resolve(destination, "src-tauri/Cargo.lock"), lock);
  await auditSource(destination, await listFiles(destination));
  return destination;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      await exportSource(
        repository,
        process.argv[2] ? resolve(process.argv[2]) : undefined,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
