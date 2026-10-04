// Tauri temporarily changes this exact 3-byte bundle indicator while packaging,
// then restores UNK in the build output. No other executable difference is accepted.
export function comparePackagedExecutable(expected, payload) {
  if (expected.equals(payload))
    return { exact: true, bundleMarkerPatched: false };
  const marker = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const offset = expected.indexOf(marker);
  if (offset < 0 || expected.indexOf(marker, offset + 1) >= 0)
    throw new Error("Expected one Tauri bundle marker.");
  const packaged = Buffer.from(expected);
  packaged.write("NSS", offset + marker.length - 3, "ascii");
  if (!packaged.equals(payload))
    throw new Error("Application differs beyond the NSIS bundle marker.");
  return { exact: false, bundleMarkerPatched: true };
}
