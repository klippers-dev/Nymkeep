import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvedCatalog } from "./catalog.mjs";

test("publication binds approved assets to hashes, version, evidence and signature verification", async () => {
  const root = await mkdtemp(join(tmpdir(), "nymkeep-catalog-"));
  try {
    const assets = join(root, "assets");
    await mkdir(assets);
    await mkdir(join(root, "docs/release/evidence"), { recursive: true });
    const evidence = "docs/release/evidence/synthetic-review.md";
    await writeFile(
      join(root, evidence),
      "Status: passed\n\nSynthetic completed test evidence for a fictional release; includes device, signing, license and privacy checks.\n",
    );
    const name = "Nymkeep_1.2.3_x64-setup.exe",
      bytes = Buffer.alloc(100_001, 7),
      signature = "c3ludGhldGljLXNpZ25hdHVyZQ==";
    await writeFile(join(assets, name), bytes);
    await writeFile(join(assets, name + ".sig"), signature);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const url = `https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3/${name}`;
    const release = {
      draft: true,
      prerelease: false,
      tag_name: "v1.2.3",
      assets: [
        {
          name,
          size: bytes.length,
          state: "uploaded",
          digest: `sha256:${sha256}`,
          browser_download_url: url,
        },
        {
          name: name + ".sig",
          size: signature.length,
          state: "uploaded",
          browser_download_url: url + ".sig",
        },
      ],
    };
    const approval = {
      schema: 1,
      version: "1.2.3",
      notesFile: evidence,
      evidence: { licenses: evidence, privacy: evidence },
      platforms: {
        "windows-x86_64": {
          approved: true,
          deviceEvidence: evidence,
          osSigningEvidence: evidence,
          sha256: { [name]: sha256 },
        },
      },
    };
    const feed = {
      version: "1.2.3",
      platforms: { "windows-x86_64": { url, signature } },
    };
    let signatures = 0;
    const options = {
      root,
      assets,
      release,
      approval,
      feed,
      verify: async () => {
        signatures++;
      },
    };
    const result = await approvedCatalog(options);
    assert.equal(signatures, 1);
    assert.equal(result.catalog.verified, true);
    assert.ok(result.body.includes("NYMKEEP_DOWNLOADS_V1"));
    assert.ok(result.checksums.includes(sha256));
    assert.ok(!result.keep.includes("latest.candidate.json"));
    await assert.rejects(
      approvedCatalog({
        ...options,
        verify: async () => {
          throw new Error("Synthetic signature rejection");
        },
      }),
      /signature rejection/,
    );
    await assert.rejects(
      approvedCatalog({ ...options, release: { ...release, draft: false } }),
      /never mutate/,
    );
    await assert.rejects(
      approvedCatalog({
        ...options,
        approval: { ...approval, version: "1.2.2" },
      }),
      /versions must agree/,
    );
    await assert.rejects(
      approvedCatalog({ ...options, approval: { ...approval, platforms: {} } }),
      /explicit release approval/,
    );
    await writeFile(join(assets, name), Buffer.alloc(bytes.length, 8));
    await assert.rejects(approvedCatalog(options), /checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
