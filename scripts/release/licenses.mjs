import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function licenseFiles(root, declared) {
  const names = (await readdir(root)).filter((name) =>
    /^(licen[sc]e|copying|copyright|notice)(?:[._-]|$)/i.test(name),
  );
  if (declared) names.push(declared);
  const texts = [];
  for (const name of [...new Set(names)].sort()) {
    const path = resolve(root, name);
    const rel = relative(root, path);
    if (!rel || rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel))
      throw new Error("License path escapes package.");
    for (
      let current = path;
      current !== resolve(root);
      current = dirname(current)
    ) {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error("License path cannot traverse a symlink.");
    }
    const stat = await lstat(path);
    if (!stat.isFile() || stat.size > 2_000_000) continue;
    const bytes = await readFile(path);
    if (bytes.includes(0)) throw new Error("License text must be UTF-8 text.");
    texts.push({
      name: rel.split(sep).join("/"),
      sha256: hash(bytes),
      text: bytes.toString("utf8"),
    });
  }
  return texts;
}

export async function dependencyNotices(root, metadata, lock, target) {
  const components = [];
  const unresolved = [];
  const supplements = JSON.parse(
    await readFile(
      resolve(root, "src-tauri/licenses/supplements.json"),
      "utf8",
    ).catch(() => "{}"),
  );
  const add = (
    ecosystem,
    name,
    version,
    license,
    files,
    source,
    provenanceNote,
  ) => {
    if (typeof license !== "string" || !license.trim() || !files.length)
      unresolved.push(`${ecosystem}:${name}@${version}`);
    components.push({
      ecosystem,
      name,
      version,
      license: license ?? null,
      source,
      ...(provenanceNote ? { provenanceNote } : {}),
      licenseFiles: files.map(({ name, sha256, source }) => ({
        name,
        sha256,
        ...(source ? { source } : {}),
      })),
      texts: files,
    });
  };
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const visited = new Set();
  const pending = [...metadata.workspace_members];
  while (pending.length) {
    const id = pending.pop();
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(nodes.get(id)?.dependencies ?? []));
  }
  for (const pkg of metadata.packages) {
    if (!visited.has(pkg.id) || metadata.workspace_members.includes(pkg.id))
      continue;
    let files = await licenseFiles(
      dirname(pkg.manifest_path),
      pkg.license_file,
    );
    const supplement = supplements[`${pkg.name}@${pkg.version}`];
    if (!files.length && supplement) {
      const vcs = JSON.parse(
        await readFile(
          resolve(dirname(pkg.manifest_path), ".cargo_vcs_info.json"),
          "utf8",
        ),
      );
      if (
        supplement.license !== pkg.license ||
        supplement.revision !== vcs.git.sha1
      )
        throw new Error(
          `License supplement does not match ${pkg.name}@${pkg.version}.`,
        );
      files = [];
      const licenseRoot = resolve(root, "src-tauri/licenses");
      for (const entry of supplement.files) {
        const path = resolve(licenseRoot, entry.name);
        const rel = relative(licenseRoot, path);
        if (
          !rel ||
          rel === ".." ||
          rel.startsWith(".." + sep) ||
          isAbsolute(rel)
        )
          throw new Error("Supplement path escapes license resources.");
        for (
          let current = path;
          current !== licenseRoot;
          current = dirname(current)
        )
          if ((await lstat(current)).isSymbolicLink())
            throw new Error("License supplement cannot traverse a symlink.");
        const bytes = await readFile(path);
        if (hash(bytes) !== entry.sha256)
          throw new Error(
            `License supplement checksum mismatch for ${pkg.name}.`,
          );
        files.push({
          name: entry.name,
          sha256: entry.sha256,
          source: entry.source,
          text: bytes.toString("utf8"),
        });
      }
    }
    add(
      "cargo",
      pkg.name,
      pkg.version,
      pkg.license,
      files,
      pkg.source?.startsWith("registry+")
        ? `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`
        : (pkg.source ?? "vendored source"),
      supplement?.note,
    );
  }
  for (const [path, info] of Object.entries(lock.packages)) {
    if (!path.startsWith("node_modules/") || info.dev) continue;
    const folder = resolve(root, path);
    const pkg = JSON.parse(
      await readFile(resolve(folder, "package.json"), "utf8"),
    );
    const files = await licenseFiles(folder);
    if (pkg.name === "@tauri-apps/plugin-opener") {
      // Its upstream SPDX file declares the shared Tauri license terms.
      for (const name of ["APACHE-2.0.txt", "TAURI-MIT.txt"]) {
        const bytes = await readFile(resolve(root, "src-tauri/licenses", name));
        files.push({
          name: `shared-tauri/${name}`,
          sha256: hash(bytes),
          text: bytes.toString("utf8"),
        });
      }
    }
    add(
      "npm",
      pkg.name,
      pkg.version,
      pkg.license,
      files,
      info.resolved ?? pkg.homepage ?? null,
    );
  }
  components.sort((a, b) =>
    `${a.ecosystem}:${a.name}@${a.version}`.localeCompare(
      `${b.ecosystem}:${b.name}@${b.version}`,
    ),
  );
  const inventory = {
    target,
    scope:
      "resolved Rust dependencies (including build/test) and production JavaScript; vendor/model notices are separate",
    complete: unresolved.length === 0,
    unresolved,
    components: components.map(({ texts, ...component }) => component),
  };
  const text = components
    .map((component) =>
      [
        `${component.ecosystem}: ${component.name} ${component.version}`,
        `Declared license: ${component.license ?? "UNRESOLVED"}`,
        `Source: ${component.source ?? "UNRESOLVED"}`,
        ...(component.provenanceNote
          ? [`Notice: ${component.provenanceNote}`]
          : []),
        ...component.texts.map(
          (file) =>
            `\n--- ${file.name} (SHA-256 ${file.sha256}) ---\n${file.text}`,
        ),
      ].join("\n"),
    )
    .join("\n\n" + "=".repeat(72) + "\n\n");
  return { inventory, text };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
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
    throw new Error("Choose an explicit supported build target.");
  const metadata = JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--locked",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--format-version",
        "1",
        "--filter-platform",
        target,
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 40_000_000 },
    ),
  );
  const lock = JSON.parse(
    await readFile(resolve(root, "package-lock.json"), "utf8"),
  );
  const result = await dependencyNotices(root, metadata, lock, target);
  const out = resolve(root, "src-tauri/licenses");
  await mkdir(out, { recursive: true });
  await writeFile(
    resolve(out, "DEPENDENCIES.json"),
    JSON.stringify(result.inventory, null, 2) + "\n",
  );
  await writeFile(resolve(out, "DEPENDENCIES.txt"), result.text + "\n");
  console.log(
    JSON.stringify({
      target,
      components: result.inventory.components.length,
      complete: result.inventory.complete,
      unresolved: result.inventory.unresolved,
    }),
  );
  if (!result.inventory.complete) process.exitCode = 1;
}
