import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repository } from "./prepare.mjs";
import { verifyGlibBackport } from "./verify-glib.mjs";

test("GLib backport contains exactly the upstream fix and rejects changed source", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-glib-"));
  try {
    await cp(join(repository, "vendor"), join(root, "vendor"), {
      recursive: true,
    });
    assert.equal((await verifyGlibBackport(root)).version, "0.18.5");
    const source = join(root, "vendor/glib/src/variant_iter.rs");
    const original = await readFile(source, "utf8");
    await writeFile(source, original.replace("&mut p,", "&p,"));
    await assert.rejects(verifyGlibBackport(root), /backport changed/);
    await writeFile(source, original);
    await writeFile(
      join(root, "vendor/glib/extra.rs"),
      "// unexpected fixture",
    );
    await assert.rejects(verifyGlibBackport(root), /file set changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
