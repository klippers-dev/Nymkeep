import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SECURITY_HEADERS } from "./prepare.mjs";
import { verifyWebsite } from "./verify.mjs";

test("public verification rejects authentication walls, modified assets, missing headers and private route exposure", async () => {
  const bytes = Buffer.from("Synthetic Nymkeep public page");
  const inventory = {
    schema: 1,
    provider: "vercel",
    files: [
      {
        path: "public/index.html",
        urlPath: "/index.html",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ],
  };
  const options = {
    url: "https://synthetic.example/",
    inventory,
    fetcher: async (url) =>
      new Response(["/", "/index.html"].includes(url.pathname) ? bytes : null, {
        status: ["/", "/index.html"].includes(url.pathname) ? 200 : 404,
        headers: SECURITY_HEADERS,
      }),
  };
  const result = await verifyWebsite(options);
  assert.equal(result.filesVerified, 1);
  assert.equal(result.privatePathsBlocked, 6);
  await assert.rejects(
    verifyWebsite({
      ...options,
      fetcher: async () => new Response(null, { status: 401 }),
    }),
    /not publicly available/,
  );
  await assert.rejects(
    verifyWebsite({
      ...options,
      fetcher: async () => new Response(bytes, { headers: {} }),
    }),
    /security header/,
  );
  await assert.rejects(
    verifyWebsite({
      ...options,
      fetcher: async () =>
        new Response("Changed synthetic page", { headers: SECURITY_HEADERS }),
    }),
    /Homepage differs/,
  );
  await assert.rejects(
    verifyWebsite({
      ...options,
      fetcher: async (url) =>
        url.pathname === "/.env"
          ? new Response("Synthetic forbidden file")
          : options.fetcher(url),
    }),
    /route or missing page is exposed/,
  );
  await assert.rejects(
    verifyWebsite({ ...options, url: "http://synthetic.example/" }),
    /public HTTPS/,
  );
});
