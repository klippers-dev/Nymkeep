import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const repository = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const registry = "registry+https://github.com/rust-lang/crates.io-index";
const vswhomChecksum =
  "fb067e4cbd1ff067d1df46c9194b5de0e98efd2810bbc95c5d5e5f25a3231150";

export function cleanManifest(source) {
  const sections = source.split(/(?=^\[[^\n]+\]\s*$)/m);
  return sections
    .map((section) => {
      if (!section.startsWith("[patch.crates-io]")) return section;
      const match = section.match(
        /^vswhom-sys\s*=\s*\{\s*path\s*=\s*"\.\.\/patches\/vswhom-sys"\s*\}\s*$/m,
      );
      if (!match)
        throw new Error("Unrecognized registry patch; review before staging.");
      const remaining = section
        .replace(match[0], "")
        .replace("[patch.crates-io]", "")
        .trim();
      if (
        remaining &&
        !remaining
          .split("\n")
          .every((line) => !line.trim() || line.trim().startsWith("#"))
      )
        throw new Error(
          "Unexpected extra registry patch; review before staging.",
        );
      return "";
    })
    .join("")
    .replace(
      /^# MACHINE-LOCAL RECOVERY ONLY\.[\s\S]*?^# REMOVE BEFORE RELEASE[^\n]*\n/m,
      "",
    )
    .replace(/\n{3,}/g, "\n\n");
}

export function cleanLock(source) {
  const packages = source.split(/(?=^\[\[package\]\])/m);
  return packages
    .map((entry) => {
      if (!/^name = "vswhom-sys"$/m.test(entry)) return entry;
      if (!/^version = "0.1.3"$/m.test(entry))
        throw new Error("Unexpected vswhom-sys version.");
      if (/^source = /m.test(entry)) return entry;
      return `[[package]]\nname = "vswhom-sys"\nversion = "0.1.3"\nsource = "${registry}"\nchecksum = "${vswhomChecksum}"\ndependencies = [\n "cc",\n "libc",\n]\n\n`;
    })
    .join("");
}

export function assertInside(root, path) {
  const rel = relative(resolve(root), resolve(path));
  if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
    throw new Error(
      "Release staging must stay inside its designated directory.",
    );
}

async function copyChecked(source, target) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink())
    throw new Error("Symlinks are not accepted in release staging.");
  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const name of await readdir(source))
      await copyChecked(resolve(source, name), resolve(target, name));
  } else if (stat.isFile()) {
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { errorOnExist: true, force: false });
  } else throw new Error("Unsupported file in release source.");
}

export async function prepareRelease(
  root = repository,
  destination = resolve(root, ".release-work/candidate"),
) {
  const staging = resolve(root, ".release-work");
  assertInside(staging, destination);
  const parent = await lstat(staging).catch(() => null);
  if (parent?.isSymbolicLink())
    throw new Error("Release staging cannot be a symlink.");
  for (
    let path = dirname(destination);
    relative(staging, path) !== "";
    path = dirname(path)
  ) {
    const stat = await lstat(path).catch(() => null);
    if (stat?.isSymbolicLink())
      throw new Error("Release staging cannot traverse a symlink.");
    if (dirname(path) === path) throw new Error("Invalid staging ancestry.");
  }
  if (await lstat(destination).catch(() => null))
    throw new Error(
      "Use a fresh staging directory; existing output is preserved.",
    );
  const files = [
    "package.json",
    "package-lock.json",
    "index.html",
    "tsconfig.json",
    "tsconfig.node.json",
    "tsconfig.app.json",
    "vite.config.ts",
    "vitest.config.ts",
    "src",
    "public",
    "tests",
    "scripts",
    "site",
    "src-tauri/src",
    "src-tauri/tests",
    "src-tauri/icons",
    "src-tauri/capabilities",
    "src-tauri/macos",
    "src-tauri/models",
    "src-tauri/build.rs",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.windows.conf.json",
    "src-tauri/tauri.macos.conf.json",
    "src-tauri/tauri.linux.conf.json",
    "src-tauri/tauri.candidate.conf.json",
    "src-tauri/THIRD_PARTY_NOTICES.txt",
    "src-tauri/licenses",
  ];
  // Parse/sanitize before creating output. No recovery, credentials or old binaries are copied.
  const manifest = cleanManifest(
    await readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8"),
  );
  const lock = cleanLock(
    await readFile(resolve(root, "src-tauri/Cargo.lock"), "utf8"),
  );
  await mkdir(destination, { recursive: true });
  for (const path of files) {
    const source = resolve(root, path);
    if (await lstat(source).catch(() => null))
      await copyChecked(source, resolve(destination, path));
  }
  await mkdir(resolve(destination, "src-tauri"), { recursive: true });
  await writeFile(resolve(destination, "src-tauri/Cargo.toml"), manifest);
  await writeFile(resolve(destination, "src-tauri/Cargo.lock"), lock);
  await writeFile(
    resolve(destination, "CANDIDATE.txt"),
    "Nymkeep build candidate source. No public-release certification.\nMachine-local recovery, credentials and previous binaries are excluded.\n",
  );
  return destination;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const output = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(repository, `.release-work/candidate-${Date.now()}`);
  console.log(await prepareRelease(repository, output));
}
