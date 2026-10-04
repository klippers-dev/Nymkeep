import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target =
  process.argv[2] ||
  (process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin");
if (process.platform !== "darwin")
  throw new Error("The native Vision helper must be compiled on macOS.");
if (!["aarch64-apple-darwin", "x86_64-apple-darwin"].includes(target))
  throw new Error("Unsupported macOS target.");
const swiftTarget =
  target === "aarch64-apple-darwin"
    ? "arm64-apple-macosx13.3"
    : "x86_64-apple-macosx13.3";
const folder = resolve(root, "src-tauri/binaries");
mkdirSync(folder, { recursive: true });
const result = spawnSync(
  "xcrun",
  [
    "swiftc",
    "-O",
    "-target",
    swiftTarget,
    "-framework",
    "Vision",
    "-framework",
    "ImageIO",
    "-framework",
    "Foundation",
    resolve(root, "src-tauri/macos/ocr.swift"),
    "-o",
    resolve(folder, `nymkeep-ocr-${target}`),
  ],
  { stdio: "inherit" },
);
if (result.error || result.status !== 0)
  throw new Error("Native Vision helper compilation failed.");
console.log(`Built native OCR helper for ${target}.`);
if (process.env.GITHUB_ENV)
  appendFileSync(process.env.GITHUB_ENV, "MACOSX_DEPLOYMENT_TARGET=13.3\n");
console.log("For Cargo, export MACOSX_DEPLOYMENT_TARGET=13.3.");
