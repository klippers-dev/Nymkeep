import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { dependencyNotices, licenseFiles } from "./licenses.mjs";

test("inventory follows the resolved graph and excludes unshipped development JavaScript", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-notices-"));
  try {
    await mkdir(join(root, "crate"));
    await writeFile(
      join(root, "crate/LICENSE"),
      "Synthetic MIT copyright fixture",
    );
    const metadata = {
      workspace_members: ["app"],
      resolve: {
        nodes: [
          { id: "app", dependencies: ["used"] },
          { id: "used", dependencies: [] },
        ],
      },
      packages: [
        { id: "app", name: "app" },
        {
          id: "used",
          name: "dependency",
          version: "1.0.0",
          license: "MIT",
          manifest_path: join(root, "crate/Cargo.toml"),
          source: "registry",
        },
        { id: "unused", name: "unused", manifest_path: "must not read" },
      ],
    };
    const { inventory, text } = await dependencyNotices(
      root,
      metadata,
      { packages: { "node_modules/dev-only": { dev: true } } },
      "synthetic-target",
    );
    assert.equal(inventory.complete, true);
    assert.equal(inventory.components.length, 1);
    assert.equal(inventory.components[0].licenseFiles[0].sha256.length, 64);
    assert.ok(text.includes("Synthetic MIT copyright fixture"));
    assert.ok(!JSON.stringify(inventory).includes(root));
    assert.deepEqual(
      await licenseFiles(join(root, "crate")),
      await licenseFiles(join(root, "crate")),
    );
    await assert.rejects(
      licenseFiles(join(root, "crate"), "../private.key"),
      /escapes/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing license text stays unresolved instead of receiving invented terms", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-notices-"));
  try {
    const metadata = {
      workspace_members: ["app"],
      resolve: { nodes: [{ id: "app", dependencies: ["missing"] }] },
      packages: [
        {
          id: "missing",
          name: "missing",
          version: "1",
          license: "MIT",
          manifest_path: join(root, "Cargo.toml"),
        },
      ],
    };
    const { inventory } = await dependencyNotices(
      root,
      metadata,
      { packages: {} },
      "synthetic-target",
    );
    assert.equal(inventory.complete, false);
    assert.deepEqual(inventory.unresolved, ["cargo:missing@1"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supplements reject changed upstream revisions and altered license text", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-notices-"));
  try {
    const folder = join(root, "src-tauri/licenses");
    await mkdir(folder, { recursive: true });
    const bytes = "Synthetic license fixture";
    await writeFile(join(folder, "fixture.txt"), bytes);
    await writeFile(
      join(root, ".cargo_vcs_info.json"),
      JSON.stringify({ git: { sha1: "verified-revision" } }),
    );
    const record = {
      license: "MIT",
      revision: "verified-revision",
      files: [
        {
          name: "fixture.txt",
          sha256: createHash("sha256").update(bytes).digest("hex"),
          source: "https://example.invalid/pinned-license",
        },
      ],
    };
    await writeFile(
      join(folder, "supplements.json"),
      JSON.stringify({ "missing@1": record }),
    );
    const metadata = {
      workspace_members: ["app"],
      resolve: { nodes: [{ id: "app", dependencies: ["missing"] }] },
      packages: [
        {
          id: "missing",
          name: "missing",
          version: "1",
          license: "MIT",
          manifest_path: join(root, "Cargo.toml"),
        },
      ],
    };
    const generate = () =>
      dependencyNotices(root, metadata, { packages: {} }, "synthetic-target");
    assert.equal((await generate()).inventory.complete, true);
    await writeFile(join(folder, "fixture.txt"), bytes + " altered");
    await assert.rejects(generate(), /checksum mismatch/);
    await writeFile(join(folder, "fixture.txt"), bytes);
    await writeFile(
      join(root, ".cargo_vcs_info.json"),
      JSON.stringify({ git: { sha1: "changed-revision" } }),
    );
    await assert.rejects(generate(), /does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
