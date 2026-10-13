import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyResources } from "./verify-resources.mjs";

test("packaged resources require exact model bytes, complete target notices and unchanged license text", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-resources-"));
  try {
    const source = join(root, "source"),
      payload = join(root, "payload");
    const target = "x86_64-pc-windows-msvc";
    await mkdir(join(source, "src-tauri/models"), { recursive: true });
    await mkdir(join(source, "src-tauri/licenses"));
    const files = {};
    for (const name of ["pii-model.onnx", "config.json", "vocab.txt"]) {
      const bytes = Buffer.from(`Synthetic ${name} fixture`);
      await writeFile(join(source, "src-tauri/models", name), bytes);
      files[name] = {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      };
    }
    await writeFile(
      join(source, "src-tauri/models/manifest.json"),
      JSON.stringify({ files }),
    );
    await writeFile(
      join(source, "src-tauri/THIRD_PARTY_NOTICES.txt"),
      "Synthetic notices",
    );
    await writeFile(
      join(source, "src-tauri/licenses/LICENSE.txt"),
      "Synthetic copyright fixture",
    );
    await writeFile(
      join(source, "src-tauri/licenses/DEPENDENCIES.txt"),
      "Synthetic dependency terms",
    );
    await writeFile(
      join(source, "src-tauri/licenses/DEPENDENCIES.json"),
      JSON.stringify({
        target,
        complete: true,
        unresolved: [],
        components: Array.from({ length: 300 }, (_, id) => ({
          name: `synthetic-${id}`,
        })),
      }),
    );
    await cp(join(source, "src-tauri"), payload, { recursive: true });
    assert.equal(
      (await verifyResources(source, payload, target)).licenseComponents,
      300,
    );
    await writeFile(join(payload, "models/pii-model.onnx"), "altered model");
    await assert.rejects(
      verifyResources(source, payload, target),
      /model mismatch/,
    );
    await cp(
      join(source, "src-tauri/models/pii-model.onnx"),
      join(payload, "models/pii-model.onnx"),
    );
    await writeFile(join(payload, "licenses/LICENSE.txt"), "altered copyright");
    await assert.rejects(
      verifyResources(source, payload, target),
      /resource differs/,
    );
    await cp(
      join(source, "src-tauri/licenses/LICENSE.txt"),
      join(payload, "licenses/LICENSE.txt"),
    );
    await assert.rejects(
      verifyResources(source, payload, "aarch64-apple-darwin"),
      /wrong target/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
