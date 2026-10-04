import { test } from "node:test";
import assert from "node:assert/strict";
import { comparePackagedExecutable } from "./pe.mjs";

test("accepts only the documented UNK to NSS bundle metadata change", () => {
  const expected = Buffer.from("code-data\0__TAURI_BUNDLE_TYPE_VAR_UNK\0tail");
  const payload = Buffer.from("code-data\0__TAURI_BUNDLE_TYPE_VAR_NSS\0tail");
  assert.equal(
    comparePackagedExecutable(expected, payload).bundleMarkerPatched,
    true,
  );
  assert.equal(comparePackagedExecutable(expected, expected).exact, true);
});
test("rejects executable changes outside that marker and other bundle types", () => {
  const expected = Buffer.from("code-data\0__TAURI_BUNDLE_TYPE_VAR_UNK\0tail");
  assert.throws(() =>
    comparePackagedExecutable(
      expected,
      Buffer.from("changed!!\0__TAURI_BUNDLE_TYPE_VAR_NSS\0tail"),
    ),
  );
  assert.throws(() =>
    comparePackagedExecutable(
      expected,
      Buffer.from("code-data\0__TAURI_BUNDLE_TYPE_VAR_MSI\0tail"),
    ),
  );
  assert.throws(() =>
    comparePackagedExecutable(expected, Buffer.from("truncated")),
  );
});
test("rejects ambiguous markers instead of broad executable normalization", () => {
  const expected = Buffer.from(
    "__TAURI_BUNDLE_TYPE_VAR_UNK\0__TAURI_BUNDLE_TYPE_VAR_UNK",
  );
  assert.throws(() =>
    comparePackagedExecutable(
      expected,
      Buffer.from("__TAURI_BUNDLE_TYPE_VAR_NSS\0__TAURI_BUNDLE_TYPE_VAR_UNK"),
    ),
  );
});
