import { execFileSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repository } from "../release/prepare.mjs";

export function forbiddenPath(path) {
  return (
    /(^|\/)(\.git|\.cargo|\.tooling|\.preview|\.release-work|\.tmp-[^/]*|target|node_modules|dist|artifacts|patches|sdk-headers|sdk-libs|sdk-tools|winlibs)(\/|$)/i.test(
      path,
    ) ||
    /(^|\/)(\.env(?:\..*)?|run-dev\.ps1|winlibs\.zip)$/i.test(path) ||
    /\.(onnx|exe|dll|dmg|deb|appimage|pfx|p12|pem|key|mobileprovision|docx|download)$/i.test(
      path,
    ) ||
    /^src-tauri\/(binaries|runtime)\//i.test(path) ||
    /^src-tauri\/licenses\/DEPENDENCIES\.(json|txt)$/i.test(path) ||
    /^src-tauri\/models\/(?!manifest\.json$|ocr-manifest\.json$)/i.test(path)
  );
}

export function inspectText(path, source) {
  const problems = [];
  if (/^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s*$/m.test(source))
    problems.push("private-key material");
  if (/\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(source))
    problems.push("credential-like token");
  if (
    path === "src-tauri/Cargo.toml" &&
    /\[patch\.crates-io\]|\.\.\/patches\//.test(source)
  )
    problems.push("machine-local registry patch");
  if (
    path === "src-tauri/Cargo.lock" &&
    /name = "vswhom-sys"\r?\nversion = "0\.1\.3"\r?\n(?:dependencies|\r?\n)/.test(
      source,
    )
  )
    problems.push("non-registry recovery lock entry");
  return problems;
}

export async function listFiles(root) {
  const files = [];
  async function visit(path = "") {
    for (const name of await readdir(resolve(root, path))) {
      if (!path && name === ".git") continue;
      const child = path ? `${path}/${name}` : name;
      const stat = await lstat(resolve(root, child));
      if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${child}`);
      if (stat.isDirectory()) await visit(child);
      else if (stat.isFile()) files.push(child);
      else throw new Error(`Unsupported source entry: ${child}`);
    }
  }
  await visit();
  return files.sort();
}

export async function auditSource(root, files) {
  const failures = [];
  let bytes = 0;
  for (const path of files) {
    if (forbiddenPath(path)) {
      failures.push(`${path}: forbidden public-source path`);
      continue;
    }
    const stat = await lstat(resolve(root, path));
    if (stat.isSymbolicLink() || !stat.isFile()) {
      failures.push(`${path}: not a regular file`);
      continue;
    }
    bytes += stat.size;
    if (stat.size > 10_000_000) {
      failures.push(`${path}: unexpected large source file`);
      continue;
    }
    const content = await readFile(resolve(root, path));
    if (!content.includes(0))
      for (const problem of inspectText(path, content.toString("utf8")))
        failures.push(`${path}: ${problem}`);
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return { files: files.length, bytes };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.argv[2] ? resolve(process.argv[2]) : repository;
  try {
    const files = process.argv.includes("--all")
      ? await listFiles(root)
      : execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
          .split("\0")
          .filter(Boolean);
    if (!files.length) throw new Error("No tracked source to audit.");
    console.log(JSON.stringify(await auditSource(root, files)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
