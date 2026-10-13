import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cleanManifest,
  cleanLock,
  prepareRelease,
  assertInside,
} from "./prepare.mjs";

test("release manifest strips only the known local patch and rejects unknown patches", () => {
  const before =
    '[package]\nname="fixture"\n[patch.crates-io]\nvswhom-sys = { path = "../patches/vswhom-sys" }\n[profile.release]\nlto=true\n';
  const after = cleanManifest(before);
  assert.ok(after.includes("[profile.release]"));
  assert.ok(!after.includes("patch.crates-io"));
  assert.throws(() =>
    cleanManifest(before.replace("../patches/vswhom-sys", "../unknown")),
  );
  const shipped = before.replace(
    "[profile.release]",
    'glib = { path = "../vendor/glib" }\n[profile.release]',
  );
  const release = cleanManifest(shipped);
  assert.ok(release.includes('glib = { path = "../vendor/glib" }'));
  assert.ok(!release.includes("vswhom-sys"));
  assert.equal(cleanManifest(release), release);
  assert.throws(() =>
    cleanManifest(shipped.replace("../vendor/glib", "../vendor/unknown")),
  );
  assert.throws(() =>
    cleanManifest(
      before.replace(
        "[profile.release]",
        'other = { path = "secret" }\n[profile.release]',
      ),
    ),
  );
});

test("release lock restores the official dependency source without changing unrelated entries", () => {
  const before =
    'version = 4\n\n[[package]]\nname = "vswhom-sys"\nversion = "0.1.3"\n\n[[package]]\nname = "other"\nversion = "1.0.0"\n';
  const after = cleanLock(before);
  assert.ok(
    after.includes("registry+https://github.com/rust-lang/crates.io-index"),
  );
  assert.ok(after.includes(' "cc",\n "libc",'));
  assert.ok(after.endsWith('name = "other"\nversion = "1.0.0"\n'));
  assert.equal(cleanLock(after), after);
});

test("staging excludes recovery, private and old build files and never overwrites output", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-stage-"));
  try {
    await mkdir(join(root, "src-tauri/.cargo"), { recursive: true });
    await mkdir(join(root, "src-tauri/target"), { recursive: true });
    await mkdir(join(root, "patches"), { recursive: true });
    await writeFile(
      join(root, "src-tauri/Cargo.toml"),
      '[package]\nname="fixture"\n',
    );
    await writeFile(join(root, "src-tauri/Cargo.lock"), "version = 4\n");
    for (const path of [
      "private.key",
      "patches/local.rs",
      "src-tauri/.cargo/config.toml",
      "src-tauri/target/old.exe",
    ])
      await writeFile(join(root, path), "synthetic forbidden fixture");
    const output = join(root, ".release-work/candidate");
    await prepareRelease(root, output);
    assert.ok(
      (await readFile(join(output, "src-tauri/Cargo.toml"), "utf8")).includes(
        "fixture",
      ),
    );
    for (const path of [
      "private.key",
      "patches",
      "src-tauri/.cargo",
      "src-tauri/target",
    ])
      await assert.rejects(access(join(output, path)));
    await assert.rejects(prepareRelease(root, output), /fresh staging/);
    assert.throws(() => assertInside(join(root, ".release-work"), root));
    await assert.rejects(
      prepareRelease(root, join(root, "../outside")),
      /designated directory/,
    );
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), "nymkeep-stage-")));
    await rm(root, { recursive: true, force: true });
  }
});
