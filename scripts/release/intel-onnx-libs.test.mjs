import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { intelRuntimeArchives } from "./intel-onnx-libs.mjs";

async function dispose(root) {
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("nymkeep-intel-"));
  await rm(root, { recursive: true, force: true });
}

test("Intel archive collection includes Unix dependency outputs, not CMake probes or vendor source fixtures", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "nymkeep-intel-libs-"));
  try {
    for (const name of [
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
    ])
      await writeFile(
        resolve(root, `libonnxruntime_${name}.a`),
        "synthetic archive fixture",
      );
    const outputs = [
      "_deps/onnx-build/libonnx.a",
      "_deps/abseil_cpp-build/absl/base/libabsl_base.a",
      "_deps/protobuf-build/Release/libprotobuf-lite.a",
    ];
    for (const path of [
      ...outputs,
      "_deps/onnx-src/libfixture.a",
      "_deps/onnx-build/CMakeFiles/probe/libcmTC.a",
    ]) {
      await mkdir(resolve(root, path, ".."), { recursive: true });
      await writeFile(resolve(root, path), "synthetic archive fixture");
    }
    const archives = await intelRuntimeArchives(root);
    assert.equal(archives.length, 13);
    for (const path of outputs)
      assert.ok(archives.includes(resolve(root, path)));
    assert.ok(
      !archives.some(
        (path) => path.includes("-src") || path.includes("CMakeFiles"),
      ),
    );
  } finally {
    await dispose(root);
  }
});

test("Intel runtime packaging rejects an incomplete build", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "nymkeep-intel-incomplete-"));
  try {
    await writeFile(
      resolve(root, "libonnxruntime_session.a"),
      "synthetic archive fixture",
    );
    await assert.rejects(() => intelRuntimeArchives(root), { code: "ENOENT" });
  } finally {
    await dispose(root);
  }
});
