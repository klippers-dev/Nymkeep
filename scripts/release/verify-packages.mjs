// Extract review packages; never install or launch the Nymkeep application.
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { assertInside } from "./prepare.mjs";
import { verifyResources } from "./verify-resources.mjs";

const root = process.cwd();
const target = process.argv[2];
if (
  ![
    "x86_64-pc-windows-msvc",
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-unknown-linux-gnu",
  ].includes(target)
)
  throw new Error("Choose an explicit package target.");
const bundle = resolve(root, `src-tauri/target/${target}/release/bundle`);
const out = resolve(root, ".release-work/package-verification");
assertInside(resolve(root, ".release-work"), out);
if (await lstat(out).catch(() => null))
  throw new Error("Package verification requires a fresh directory.");
await mkdir(out, { recursive: true });
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8_000_000,
    ...options,
  });
async function one(directory, extension) {
  const files = (await readdir(join(bundle, directory))).filter((name) =>
    name.endsWith(extension),
  );
  if (files.length !== 1)
    throw new Error("Expected one native package per format.");
  return join(bundle, directory, files[0]);
}
async function resourcesBelow(directory) {
  const matches = [];
  let visited = 0;
  async function visit(path) {
    if (++visited > 20_000) throw new Error("Unexpectedly large package tree.");
    if (await lstat(join(path, "models/manifest.json")).catch(() => null))
      matches.push(path);
    for (const entry of await readdir(path, { withFileTypes: true }))
      if (entry.isDirectory() && !entry.isSymbolicLink())
        await visit(join(path, entry.name));
  }
  await visit(directory);
  if (matches.length !== 1)
    throw new Error("Expected one packaged resource tree.");
  return matches[0];
}
const reports = [];
if (target.endsWith("windows-msvc")) {
  const packagePath = await one("nsis", ".exe");
  const tool = "C:/Program Files/7-Zip/7z.exe";
  const listing = run(tool, ["l", "-slt", packagePath]);
  const entries = listing
    .split(/\r?\n/)
    .filter((line) => line.startsWith("Path = "))
    .slice(1)
    .map((line) => line.slice(7));
  if (
    entries.some((name) =>
      /(^[\\/]|^[A-Za-z]:|(?:^|[\\/])\.\.(?:[\\/]|$))/.test(name),
    )
  )
    throw new Error("Unsafe installer archive path.");
  run(tool, ["x", packagePath, `-o${out}/windows`, "-y"]);
  const payload = await resourcesBelow(join(out, "windows"));
  const resources = await verifyResources(root, payload, target);
  const executable = join(
    root,
    `src-tauri/target/${target}/release/nymkeep.exe`,
  );
  const native = JSON.parse(
    run(process.execPath, [
      "scripts/release/check-windows-payload.mjs",
      payload,
      executable,
    ]),
  );
  reports.push({ package: basename(packagePath), resources, native });
} else if (target.endsWith("apple-darwin")) {
  const packagePath = await one("dmg", ".dmg");
  const mount = join(out, "mac");
  await mkdir(mount);
  run("hdiutil", [
    "attach",
    "-readonly",
    "-nobrowse",
    "-mountpoint",
    mount,
    packagePath,
  ]);
  try {
    const payload = await resourcesBelow(join(mount, "Nymkeep.app"));
    const resources = await verifyResources(root, payload, target);
    const executable = join(mount, "Nymkeep.app/Contents/MacOS/nymkeep");
    const helper = join(mount, "Nymkeep.app/Contents/MacOS/nymkeep-ocr");
    const arch = target.startsWith("aarch64") ? "arm64" : "x86_64";
    for (const path of [executable, helper])
      if (run("lipo", ["-archs", path]).trim() !== arch)
        throw new Error("Mac payload architecture mismatch.");
    run(helper, ["--probe"], { timeout: 30_000 });
    const result = JSON.parse(
      run(helper, [], {
        input: await readFile(
          join(root, "src-tauri/tests/fixtures/synthetic-note.png"),
        ),
        timeout: 30_000,
      }),
    );
    if (
      !result.words.some((word) => word.text === "mira@example.com") ||
      !result.words.some((word) => word.text === "192.0.2.42")
    )
      throw new Error("Packaged Vision helper failed the synthetic fixture.");
    reports.push({
      package: basename(packagePath),
      resources,
      native: {
        architecture: arch,
        packagedVisionFixture: true,
        applicationExecuted: false,
      },
    });
  } finally {
    run("hdiutil", ["detach", mount]);
  }
} else {
  const deb = await one("deb", ".deb");
  run("dpkg-deb", ["--extract", deb, join(out, "deb")]);
  const payload = await resourcesBelow(join(out, "deb"));
  reports.push({
    package: basename(deb),
    resources: await verifyResources(root, payload, target),
  });
  const appimage = await one("appimage", ".AppImage");
  const directory = join(out, "appimage");
  await mkdir(directory);
  run(appimage, ["--appimage-extract"], { cwd: directory });
  reports.push({
    package: basename(appimage),
    resources: await verifyResources(
      root,
      await resourcesBelow(join(directory, "squashfs-root")),
      target,
    ),
  });
}
await writeFile(
  join(out, "report.json"),
  JSON.stringify({ applicationInstalled: false, reports }, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    target,
    packages: reports.map((report) => report.package),
    resourceVerification: true,
    applicationInstalled: false,
  }),
);
