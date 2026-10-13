import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
} from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { prepareWebsite, repository, PUBLIC_FILES } from "./prepare.mjs";

async function fixture() {
  const base = resolve(repository, ".release-work");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "website-test-"));
  for (const name of PUBLIC_FILES) {
    await mkdir(dirname(resolve(root, "site", name)), { recursive: true });
    await writeFile(
      resolve(root, "site", name),
      name === "index.html"
        ? "<!doctype html><head><title>Synthetic Nymkeep</title></head><body>Fixture</body>"
        : `Synthetic public fixture: ${name}`,
    );
  }
  await writeFile(
    resolve(root, ".env"),
    "SYNTHETIC_PRIVATE_VALUE=must_not_ship\n",
  );
  await writeFile(
    resolve(root, "site", "HANDOFF.md"),
    "Internal synthetic note; do not publish.",
  );
  return {
    root,
    cleanup: async () => {
      const rel = relative(base, root);
      if (
        !rel.startsWith("website-test-") ||
        rel.includes("..") ||
        isAbsolute(rel)
      )
        throw new Error("Unsafe fixture cleanup.");
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("website packages contain only explicit public assets and provider headers, with reviewed hashes", async () => {
  const f = await fixture();
  try {
    for (const provider of ["cloudflare", "vercel"]) {
      const built = await prepareWebsite({
        root: f.root,
        output: `.release-work/${provider}`,
        provider,
        canonicalUrl: "https://synthetic.example/",
      });
      const inventory = JSON.parse(await readFile(built.inventory, "utf8"));
      assert.equal(inventory.provider, provider);
      assert.ok(
        inventory.files.every((item) => /^[a-f0-9]{64}$/.test(item.sha256)),
      );
      assert.ok(
        !inventory.files.some((item) =>
          /\.env|HANDOFF|src-tauri|models|sdk-/.test(item.path),
        ),
      );
      const names = await readdir(built.assets);
      assert.ok(
        names.includes("404.html") &&
          names.includes("robots.txt") &&
          names.includes("sitemap.xml"),
      );
      assert.ok(!names.includes("HANDOFF.md") && !names.includes(".env"));
      assert.match(
        await readFile(resolve(built.assets, "index.html"), "utf8"),
        /rel="canonical" href="https:\/\/synthetic.example\/"/,
      );
      const config = await readFile(
        resolve(
          built.directory,
          provider === "vercel" ? "vercel.json" : "public/_headers",
        ),
        "utf8",
      );
      assert.ok(config.includes("connect-src https://api.github.com"));
      assert.ok(config.includes("form-action 'none'"));
      if (provider === "vercel")
        assert.equal(JSON.parse(config).outputDirectory, "public");
      await assert.rejects(
        prepareWebsite({
          root: f.root,
          output: `.release-work/${provider}`,
          provider,
        }),
        /fresh website staging/,
      );
    }
    await assert.rejects(
      prepareWebsite({ root: f.root, output: "dist", provider: "vercel" }),
      /preserve desktop dist/,
    );
    await assert.rejects(
      prepareWebsite({
        root: f.root,
        output: ".release-work/bad",
        provider: "other",
      }),
      /explicitly/,
    );
    for (const canonicalUrl of [
      "http://synthetic.example/",
      "https://synthetic.example/path",
      "https://user:synthetic@synthetic.example/",
      "https://localhost/",
      "https://synthetic.example/?private=synthetic",
    ])
      await assert.rejects(
        prepareWebsite({
          root: f.root,
          output: ".release-work/bad",
          provider: "cloudflare",
          canonicalUrl,
        }),
      );
  } finally {
    await f.cleanup();
  }
});

test("website staging rejects redirected source assets and destination ancestors", async () => {
  const f = await fixture();
  try {
    const moved = resolve(f.root, "synthetic-assets");
    await mkdir(moved);
    // The junction and its target are both inside this owned synthetic fixture.
    await symlink(
      moved,
      resolve(f.root, ".release-work"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      prepareWebsite({
        root: f.root,
        output: ".release-work/redirected",
        provider: "vercel",
      }),
      /symlink/,
    );
    await rm(resolve(f.root, ".release-work"));
    await rm(resolve(f.root, "site/assets"), { recursive: true });
    await symlink(
      moved,
      resolve(f.root, "site/assets"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      prepareWebsite({
        root: f.root,
        output: ".release-work/redirected",
        provider: "vercel",
      }),
      /symlink/,
    );
  } finally {
    await f.cleanup();
  }
});
