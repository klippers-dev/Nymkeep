import { test } from "node:test";
import assert from "node:assert/strict";
import { publicReleaseConfig, UPDATE_ENDPOINT } from "./public-config.mjs";

test("public release requires matching stable versions and a public key at the fixed feed", () => {
  const bytes = Buffer.alloc(42);
  bytes.write("Ed");
  bytes[10] = 1;
  const pubkey = Buffer.from(
    `untrusted comment: synthetic public key\n${bytes.toString("base64")}\n`,
  ).toString("base64");
  const args = { pubkey, versions: ["1.2.3", "1.2.3", "1.2.3"], tag: "v1.2.3" };
  assert.deepEqual(publicReleaseConfig(args).plugins.updater.endpoints, [
    UPDATE_ENDPOINT,
  ]);
  for (const changed of [
    { pubkey: "REPLACE_WITH_PUBLIC_KEY" },
    { tag: "v1.2.2" },
    { versions: ["1.2.3", "1.2.2", "1.2.3"] },
    { endpoint: "https://example.com/feed" },
    {
      versions: ["1.2.3-beta", "1.2.3-beta", "1.2.3-beta"],
      tag: "v1.2.3-beta",
    },
  ])
    assert.throws(() => publicReleaseConfig({ ...args, ...changed }));
});
