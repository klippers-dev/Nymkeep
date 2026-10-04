// Check an already-extracted NSIS payload. Does not run/install the application.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { comparePackagedExecutable } from "./pe.mjs";
const root = process.cwd();
const payload = resolve(root, process.argv[2]);
const expected = process.argv[3] ? resolve(root, process.argv[3]) : null;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const model = JSON.parse(
  await readFile(resolve(root, "src-tauri/models/manifest.json"), "utf8"),
);
const runtime = JSON.parse(
  await readFile(
    resolve(root, "src-tauri/runtime/windows/manifest.json"),
    "utf8",
  ),
);
const verified = [];
for (const name of ["pii-model.onnx", "config.json", "vocab.txt"]) {
  const bytes = await readFile(resolve(payload, "models", name));
  if (hash(bytes).toLowerCase() !== model.files[name].sha256.toLowerCase())
    throw new Error("Model payload mismatch.");
  verified.push("models/" + name);
}
for (const entry of runtime) {
  const bytes = await readFile(resolve(payload, entry.name));
  if (
    bytes.length !== entry.bytes ||
    hash(bytes).toLowerCase() !== entry.sha256.toLowerCase()
  )
    throw new Error("Runtime payload mismatch.");
  verified.push(entry.name);
}
for (const name of ["THIRD_PARTY_NOTICES.txt", "models/manifest.json"]) {
  if (
    !(await readFile(resolve(payload, name))).equals(
      await readFile(resolve(root, "src-tauri", name)),
    )
  )
    throw new Error("Resource payload differs from source.");
  verified.push(name);
}
const exe = await readFile(resolve(payload, "nymkeep.exe"));
if (exe.readUInt16LE(exe.readUInt32LE(60) + 4) !== 0x8664)
  throw new Error("Expected an x64 PE executable.");
const comparison = expected
  ? comparePackagedExecutable(await readFile(expected), exe)
  : null;
const names = await readdir(payload, { recursive: true });
if (
  names.some((name) =>
    /sdk-|vswhom|\.cargo|private\.key|Cargo\.toml/i.test(name),
  )
)
  throw new Error("Forbidden recovery/private payload.");
console.log(
  JSON.stringify(
    {
      architecture: "x86_64",
      executableSha256: hash(exe),
      executableMatches: comparison ? true : null,
      bundleMetadataComparison: comparison,
      verified,
      recoveryFiles: false,
      applicationExecuted: false,
      installationTested: false,
    },
    null,
    2,
  ),
);
