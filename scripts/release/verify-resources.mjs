import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function verifyResources(source, payload, target) {
  const verified = [];
  async function regular(path) {
    const rel = relative(payload, path);
    if (!rel || rel === ".." || rel.startsWith(".." + sep))
      throw new Error("Resource path escapes payload.");
    for (
      let current = path;
      current !== payload;
      current = resolve(current, "..")
    ) {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("Resource cannot traverse a symlink.");
    }
    const bytes = await readFile(path);
    return bytes;
  }
  async function identical(from, name) {
    const expected = await readFile(resolve(source, from));
    const bytes = await regular(resolve(payload, name));
    if (!bytes.equals(expected))
      throw new Error(`Packaged resource differs: ${name}`);
    verified.push({ name, bytes: bytes.length, sha256: hash(bytes) });
  }
  async function models(manifestName, names) {
    const manifest = JSON.parse(
      await readFile(resolve(source, "src-tauri/models", manifestName), "utf8"),
    );
    for (const name of names) {
      const bytes = await regular(resolve(payload, "models", name));
      const entry = manifest.files[name];
      if (
        !entry ||
        bytes.length !== entry.bytes ||
        hash(bytes) !== entry.sha256.toLowerCase()
      )
        throw new Error(`Packaged model mismatch: ${name}`);
      verified.push({
        name: `models/${name}`,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  await models("manifest.json", ["pii-model.onnx", "config.json", "vocab.txt"]);
  await identical("src-tauri/models/manifest.json", "models/manifest.json");
  if (target === "x86_64-unknown-linux-gnu") {
    await models("ocr-manifest.json", [
      "ocr/det.onnx",
      "ocr/rec.onnx",
      "ocr/dict.txt",
    ]);
    await identical(
      "src-tauri/models/ocr-manifest.json",
      "models/ocr/ocr-manifest.json",
    );
  }
  await identical(
    "src-tauri/THIRD_PARTY_NOTICES.txt",
    "THIRD_PARTY_NOTICES.txt",
  );
  async function licenses(path = "") {
    for (const name of await readdir(
      resolve(source, "src-tauri/licenses", path),
    )) {
      const child = path ? `${path}/${name}` : name;
      const stat = await lstat(resolve(source, "src-tauri/licenses", child));
      if (stat.isSymbolicLink())
        throw new Error("License source cannot be a symlink.");
      if (stat.isDirectory()) await licenses(child);
      else await identical(`src-tauri/licenses/${child}`, `licenses/${child}`);
    }
  }
  await licenses();
  const inventory = JSON.parse(
    await regular(resolve(payload, "licenses/DEPENDENCIES.json")),
  );
  if (
    inventory.target !== target ||
    !inventory.complete ||
    inventory.unresolved.length ||
    inventory.components.length < 300
  )
    throw new Error(
      "Packaged license inventory is incomplete or for the wrong target.",
    );
  return { target, verified, licenseComponents: inventory.components.length };
}
