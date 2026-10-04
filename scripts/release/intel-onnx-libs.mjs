import { access, readdir } from "node:fs/promises";
import { resolve } from "node:path";

// A single archive avoids ort-sys selecting the wrong Unix _deps layout.
export async function intelRuntimeArchives(build) {
  const runtime = [
    "common",
    "flatbuffers",
    "framework",
    "graph",
    "lora",
    "mlas",
    "optimizer",
    "providers",
    "session",
    "util",
  ].map((name) => resolve(build, `libonnxruntime_${name}.a`));
  for (const file of runtime) await access(file);
  const dependencies = [];
  async function visit(folder) {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      if (item.name === "CMakeFiles") continue;
      const path = resolve(folder, item.name);
      if (item.isDirectory()) await visit(path);
      else if (item.isFile() && item.name.endsWith(".a"))
        dependencies.push(path);
    }
  }
  const deps = resolve(build, "_deps");
  for (const item of await readdir(deps, { withFileTypes: true }))
    if (item.isDirectory() && item.name.endsWith("-build"))
      await visit(resolve(deps, item.name));
  if (!dependencies.length)
    throw new Error("Intel runtime dependency archives are missing.");
  return [...runtime, ...dependencies.sort()];
}
