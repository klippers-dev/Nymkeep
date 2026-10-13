import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectPackages } from "./collect.mjs";

test("collects final Linux packages without traversing AppDir library symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-collect-"));
  try {
    const source = join(root, "bundle");
    await mkdir(join(source, "appimage/Nymkeep.AppDir/usr/lib"), {
      recursive: true,
    });
    await mkdir(join(source, "deb"));
    await mkdir(join(root, "synthetic-library"));
    await symlink(
      join(root, "synthetic-library"),
      join(source, "appimage/Nymkeep.AppDir/usr/lib/native"),
      "junction",
    );
    const payload = Buffer.alloc(100_001, 7);
    await writeFile(join(source, "appimage/Nymkeep.AppImage"), payload);
    await writeFile(join(source, "deb/Nymkeep.deb"), payload);
    await writeFile(
      join(source, "appimage/Nymkeep.AppDir/not-an-installer.exe"),
      payload,
    );
    const output = join(root, "artifacts/review");
    const manifest = await collectPackages(root, source, output);
    assert.equal(manifest.publicRelease, false);
    assert.deepEqual(
      manifest.packages.map((p) => p.name),
      ["Nymkeep.deb", "Nymkeep.AppImage"],
    );
    assert.deepEqual(await readFile(join(output, "Nymkeep.deb")), payload);
    await assert.rejects(
      collectPackages(root, source, output),
      /fresh artifact/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects redirected package directories and undersized installers", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-collect-"));
  try {
    await mkdir(join(root, "bundle"));
    await mkdir(join(root, "external"));
    await symlink(join(root, "external"), join(root, "bundle/deb"), "junction");
    await assert.rejects(
      collectPackages(root, join(root, "bundle"), join(root, "artifacts/one")),
      /symlink/,
    );
    await rm(join(root, "bundle/deb"));
    await mkdir(join(root, "bundle/deb"));
    await writeFile(join(root, "bundle/deb/tiny.deb"), Buffer.alloc(10));
    await assert.rejects(
      collectPackages(root, join(root, "bundle"), join(root, "artifacts/two")),
      /small installable/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
