import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportSource } from "./export.mjs";
import { auditSource, forbiddenPath, inspectText } from "./audit.mjs";
import { protectionPolicies } from "./policy.mjs";

test("public-source export preserves local recovery but publishes only official dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-public-"));
  try {
    await mkdir(join(root, "src-tauri/.cargo"), { recursive: true });
    await mkdir(join(root, "src-tauri/models/ocr"), { recursive: true });
    const local =
      '[package]\nname="fixture"\n[patch.crates-io]\nvswhom-sys = { path = "../patches/vswhom-sys" }\n';
    await writeFile(join(root, "src-tauri/Cargo.toml"), local);
    await writeFile(
      join(root, "src-tauri/Cargo.lock"),
      'version = 4\n\n[[package]]\nname = "vswhom-sys"\nversion = "0.1.3"\n',
    );
    await writeFile(
      join(root, "src-tauri/.cargo/config.toml"),
      "synthetic recovery",
    );
    await writeFile(
      join(root, "src-tauri/models/pii-model.onnx"),
      "synthetic downloaded model",
    );
    await writeFile(
      join(root, "src-tauri/models/ocr/rec.onnx"),
      "synthetic OCR model",
    );
    await writeFile(join(root, "src-tauri/models/manifest.json"), "{}");
    await writeFile(join(root, "private.key"), "synthetic forbidden fixture");
    const output = join(root, ".release-work/public-source");
    await exportSource(root, output);
    assert.equal(
      await readFile(join(root, "src-tauri/Cargo.toml"), "utf8"),
      local,
    );
    assert.ok(
      !(await readFile(join(output, "src-tauri/Cargo.toml"), "utf8")).includes(
        "patch.crates-io",
      ),
    );
    assert.ok(
      (await readFile(join(output, "src-tauri/Cargo.lock"), "utf8")).includes(
        "registry+https://github.com/rust-lang/crates.io-index",
      ),
    );
    for (const path of [
      "private.key",
      "src-tauri/.cargo",
      "src-tauri/models/pii-model.onnx",
      "src-tauri/models/ocr",
    ])
      await assert.rejects(access(join(output, path)));
    await assert.rejects(exportSource(root, output), /fresh export/);
    await assert.rejects(
      exportSource(root, join(root, "outside")),
      /designated directory/,
    );
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/leak.key"), "synthetic forbidden fixture");
    await assert.rejects(
      exportSource(root, join(root, ".release-work/rejected")),
      /Forbidden export entry/,
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "nymkeep-public-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("source audit rejects recovery, credentials and unexpected binary files without exposing values", async () => {
  assert.ok(forbiddenPath("src-tauri/.cargo/config.toml"));
  assert.ok(forbiddenPath("docs/nested/private.p12"));
  assert.ok(forbiddenPath("src-tauri/models/pii-model.onnx"));
  assert.ok(!forbiddenPath("src-tauri/models/manifest.json"));
  assert.ok(!forbiddenPath("src-tauri/tests/fixtures/synthetic-note.png"));
  assert.deepEqual(inspectText("src-tauri/Cargo.toml", "[patch.crates-io]"), [
    "machine-local registry patch",
  ]);
  const root = await mkdtemp(join(tmpdir(), "nymkeep-audit-"));
  try {
    const fixture = "ghp_" + "x".repeat(40);
    await writeFile(join(root, "README.md"), fixture);
    await assert.rejects(
      auditSource(root, ["README.md"]),
      (error) =>
        error.message.includes("credential-like token") &&
        !error.message.includes(fixture),
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "nymkeep-audit-")));
    await rm(root, { recursive: true, force: true });
  }
});

test("owner review bypass cannot bypass CI/history protection and release tags remain restricted", () => {
  const [ci, review, tags] = protectionPolicies(123, 456);
  assert.deepEqual(ci.bypass_actors, []);
  assert.deepEqual(
    ci.rules.find((rule) => rule.type === "required_status_checks").parameters
      .required_status_checks,
    [{ context: "Required checks", integration_id: 456 }],
  );
  assert.ok(ci.rules.some((rule) => rule.type === "deletion"));
  assert.ok(ci.rules.some((rule) => rule.type === "non_fast_forward"));
  assert.equal(review.bypass_actors[0].bypass_mode, "pull_request");
  assert.equal(review.rules[0].parameters.require_code_owner_review, true);
  assert.equal(review.rules[0].parameters.required_approving_review_count, 1);
  assert.equal(tags.bypass_actors[0].actor_id, 123);
  assert.ok(tags.rules.some((rule) => rule.type === "creation"));
  assert.throws(() => protectionPolicies(undefined, 456), /Verified owner/);
});
