import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function verifyGlibBackport(root) {
  const record = JSON.parse(
    await readFile(resolve(root, "vendor/glib-backport.json"), "utf8"),
  );
  if (
    record.version !== "0.18.5" ||
    record.archiveSha256 !==
      "233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5" ||
    record.modifiedFile !== "src/variant_iter.rs"
  )
    throw new Error("Unreviewed GLib backport provenance.");
  const files = [];
  async function visit(path = "") {
    const directory = resolve(root, "vendor/glib", path);
    if ((await lstat(directory)).isSymbolicLink())
      throw new Error("GLib source cannot traverse symlinks.");
    for (const name of await readdir(directory)) {
      const child = path ? `${path}/${name}` : name;
      const stat = await lstat(resolve(directory, name));
      if (stat.isSymbolicLink())
        throw new Error("GLib source cannot contain symlinks.");
      if (stat.isDirectory()) await visit(child);
      else if (stat.isFile()) files.push(child);
      else throw new Error("Unexpected GLib source entry.");
    }
  }
  await visit();
  const expected = Object.keys(record.originalFiles).sort();
  if (JSON.stringify(files.sort()) !== JSON.stringify(expected))
    throw new Error("GLib archive file set changed.");
  for (const path of files) {
    const bytes = await readFile(resolve(root, "vendor/glib", path));
    if (path === record.modifiedFile) {
      if (digest(bytes) !== record.modifiedSha256)
        throw new Error("GLib safety backport changed.");
      const source = bytes.toString("utf8");
      const pointer = "let mut p: *mut libc::c_char = std::ptr::null_mut();";
      const reference = "                &mut p,\n";
      if (
        source.split(pointer).length !== 2 ||
        source.split(reference).length !== 2
      )
        throw new Error("GLib fix is absent or ambiguous.");
      const original = source
        .replace(pointer, "let p: *mut libc::c_char = std::ptr::null_mut();")
        .replace(reference, "                &p,\n");
      if (digest(original) !== record.originalFiles[path])
        throw new Error("GLib changes exceed the upstream two-line fix.");
    } else if (digest(bytes) !== record.originalFiles[path])
      throw new Error(`Unreviewed GLib source change: ${path}`);
  }
  return {
    version: record.version,
    files: files.length,
    upstreamFix: record.upstreamFix,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await verifyGlibBackport(process.cwd())));
