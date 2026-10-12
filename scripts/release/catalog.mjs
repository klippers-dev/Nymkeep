// Build public release metadata from actual assets and explicit review evidence.
// Only PUBLIC updater keys and public signatures are read here.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  lstat,
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY = "klippers-dev/Nymkeep";
export const MARKER = "NYMKEEP_DOWNLOADS_V1";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const targets = {
  "windows-x86_64": {
    label: "Windows 11, 64-bit",
    installer: "_x64-setup.exe",
    updater: "nsis",
  },
  "darwin-aarch64": {
    label: "macOS 13.3+, Apple Silicon",
    installer: "_aarch64.dmg",
    updater: "app",
  },
  "darwin-x86_64": {
    label: "macOS 13.3+, Intel",
    installer: "_x64.dmg",
    updater: "app",
  },
  "linux-x86_64": {
    label: "Linux x64, Ubuntu 24.04 baseline",
    installer: "_amd64.AppImage",
    updater: "appimage",
    manual: "_amd64.deb",
  },
};
function assetName(url, tag) {
  const prefix = `https://github.com/${REPOSITORY}/releases/download/${tag}/`;
  if (typeof url !== "string" || !url.startsWith(prefix))
    throw new Error("Asset must belong to this versioned Nymkeep release.");
  const name = url.slice(prefix.length);
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.includes(".."))
    throw new Error("Unsafe release asset name.");
  return name;
}
async function reviewDocument(root, path) {
  if (
    typeof path !== "string" ||
    !/^docs\/release\/evidence\/[A-Za-z0-9_.-]+\.md$/.test(path)
  )
    throw new Error(
      "Review evidence must be a checked-in release evidence document.",
    );
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const stat = await lstat(resolve(root, ...parts.slice(0, i)));
    if (
      stat.isSymbolicLink() ||
      (i === parts.length ? !stat.isFile() : !stat.isDirectory())
    )
      throw new Error("Review evidence cannot be redirected.");
  }
  return readFile(resolve(root, path), "utf8");
}
async function evidence(root, path) {
  const text = await reviewDocument(root, path);
  if (!/^Status: passed\s*$/m.test(text) || text.length < 80)
    throw new Error("Release evidence must record a completed review.");
}
export async function approvedCatalog({
  root,
  assets,
  release,
  approval,
  feed,
  verify,
}) {
  if (
    !release.draft ||
    release.prerelease ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
  )
    throw new Error(
      "Finalize a stable draft, never mutate a published release.",
    );
  const version = release.tag_name.slice(1);
  if (
    approval.schema !== 1 ||
    approval.version !== version ||
    feed.version?.replace(/^v/, "") !== version
  )
    throw new Error("Approval, updater and release versions must agree.");
  const selected = Object.keys(approval.platforms ?? {});
  if (!selected.length || selected.some((id) => !targets[id]))
    throw new Error(
      "At least one known platform needs explicit release approval.",
    );
  for (const kind of ["licenses", "privacy"])
    await evidence(root, approval.evidence?.[kind]);
  const notesPath = approval.notesFile;
  if (
    typeof notesPath !== "string" ||
    !/^docs\/release\/evidence\/[A-Za-z0-9_.-]+\.md$/.test(notesPath)
  )
    throw new Error("Use checked-in release notes.");
  const notes = await reviewDocument(root, notesPath);
  if (notes.length < 20 || notes.length > 20_000 || notes.includes(MARKER))
    throw new Error("Invalid public release notes.");
  const packages = new Map();
  async function checked(name, expectedHash) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name.includes(".."))
      throw new Error("Unsafe release filename.");
    const metadata = release.assets.find((asset) => asset.name === name);
    if (
      !metadata ||
      metadata.state !== "uploaded" ||
      assetName(metadata.browser_download_url, release.tag_name) !== name
    )
      throw new Error(`Missing uploaded release asset: ${name}`);
    const path = resolve(assets, name);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error("Release assets cannot be symlinks.");
    const bytes = await readFile(path),
      sha256 = hash(bytes);
    if (
      metadata.size !== bytes.length ||
      bytes.length > 512 * 1024 * 1024 ||
      (expectedHash && expectedHash !== sha256) ||
      (metadata.digest && metadata.digest !== `sha256:${sha256}`)
    )
      throw new Error(`Release asset size/checksum mismatch: ${name}`);
    packages.set(name, {
      name,
      url: metadata.browser_download_url,
      bytes: bytes.length,
      sha256,
    });
    return { path, bytes, sha256, metadata };
  }
  const catalog = {
    schema: 1,
    version,
    verified: true,
    releaseUrl: `https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`,
    platforms: [],
  };
  const approvedFeed = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {},
  };
  for (const id of selected) {
    const definition = targets[id],
      review = approval.platforms[id];
    if (review.approved !== true)
      throw new Error(`Platform approval is incomplete: ${id}`);
    await evidence(root, review.deviceEvidence);
    if (!id.startsWith("linux-"))
      await evidence(root, review.osSigningEvidence);
    const installerName = `Nymkeep_${version}${definition.installer}`;
    if (!/^[a-f0-9]{64}$/.test(review.sha256?.[installerName] ?? ""))
      throw new Error(
        "Approval must bind each installer to its reviewed SHA-256.",
      );
    const installer = await checked(
      installerName,
      review.sha256[installerName],
    );
    if (installer.bytes.length < 100_000)
      throw new Error("Unexpectedly small installer.");
    const entry = {
      id,
      label: definition.label,
      ...packages.get(installerName),
    };
    if (definition.manual) {
      const name = `Nymkeep_${version}${definition.manual}`;
      if (!/^[a-f0-9]{64}$/.test(review.sha256?.[name] ?? ""))
        throw new Error(
          "The Debian installer needs its own reviewed checksum.",
        );
      await checked(name, review.sha256[name]);
      entry.manual = packages.get(name);
    }
    const updater =
      feed.platforms[id + "-" + definition.updater] ?? feed.platforms[id];
    if (
      !updater ||
      typeof updater.signature !== "string" ||
      !updater.signature ||
      updater.signature.length > 16_384
    )
      throw new Error(`Missing signed updater metadata: ${id}`);
    const updateName = assetName(updater.url, release.tag_name);
    if (!/^[a-f0-9]{64}$/.test(review.sha256?.[updateName] ?? ""))
      throw new Error(
        "Approval must bind the updater artifact to its reviewed checksum.",
      );
    const update = await checked(updateName, review.sha256[updateName]);
    const signature = await checked(updateName + ".sig");
    if (signature.bytes.toString("utf8").trim() !== updater.signature.trim())
      throw new Error(
        "Updater signature differs from its public signature asset.",
      );
    await verify(update.path, updater.signature);
    approvedFeed.platforms[id] = {
      url: updater.url,
      signature: updater.signature.trim(),
    };
    approvedFeed.platforms[id + "-" + definition.updater] =
      approvedFeed.platforms[id];
    catalog.platforms.push(entry);
  }
  const checksums =
    [...packages.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((item) => `${item.sha256}  ${item.name}`)
      .join("\n") + "\n";
  const body = `${notes.trim()}\n\n<!-- ${MARKER}\n${JSON.stringify(catalog)}\n-->\n`;
  return {
    catalog,
    feed: approvedFeed,
    checksums,
    body,
    keep: [
      ...packages.keys(),
      "latest.json",
      "downloads.json",
      "SHA256SUMS.txt",
    ],
  };
}

async function verifier(out, publicKey) {
  if (!publicKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKey))
    throw new Error(
      "The public updater key is required for signature verification.",
    );
  const directory = await mkdtemp(resolve(out, ".signature-check-"));
  const key = resolve(directory, "updater.pub");
  await writeFile(key, Buffer.from(publicKey, "base64"));
  return {
    verify: async (artifact, encoded) => {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded.trim()))
        throw new Error("Invalid updater signature encoding.");
      const signature = resolve(directory, "artifact.sig");
      await writeFile(signature, Buffer.from(encoded.trim(), "base64"));
      execFileSync("minisign", ["-Vm", artifact, "-p", key, "-x", signature], {
        stdio: "pipe",
        timeout: 30_000,
      });
    },
    close: async () => {
      const rel = relative(out, directory);
      if (!rel || rel.startsWith(".." + sep) || isAbsolute(rel))
        throw new Error("Invalid signature verification workspace.");
      await rm(directory, { recursive: true, force: true });
    },
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, metaPath, assetFolder, outputFolder, approvalPath] =
    process.argv.slice(2);
  if (!["--draft", "--approved"].includes(mode))
    throw new Error("Choose draft preparation or approved publication.");
  const release = JSON.parse(await readFile(metaPath, "utf8")),
    assets = resolve(assetFolder),
    out = resolve(outputFolder);
  if (
    !release.draft ||
    release.prerelease ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name)
  )
    throw new Error("Expected a stable unpublished draft.");
  if (await lstat(out).catch(() => null))
    throw new Error("Use a fresh release metadata directory.");
  await mkdir(out, { recursive: true });
  if (mode === "--draft") {
    const candidate = JSON.parse(
      await readFile(resolve(assets, "latest.json"), "utf8"),
    );
    if (candidate.version?.replace(/^v/, "") !== release.tag_name.slice(1))
      throw new Error("Draft update version mismatch.");
    await writeFile(
      resolve(out, "latest.candidate.json"),
      JSON.stringify(candidate, null, 2) + "\n",
    );
    await writeFile(
      resolve(out, "latest.json"),
      JSON.stringify({ version: candidate.version, platforms: {} }, null, 2) +
        "\n",
    );
    await writeFile(
      resolve(out, "downloads.json"),
      JSON.stringify(
        {
          schema: 1,
          version: candidate.version,
          verified: false,
          platforms: [],
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const signature = await verifier(
      out,
      process.env.NYMKEEP_UPDATE_PUBLIC_KEY,
    );
    try {
      const result = await approvedCatalog({
        root: process.cwd(),
        assets,
        release,
        approval: JSON.parse(await readFile(approvalPath, "utf8")),
        feed: JSON.parse(
          await readFile(resolve(assets, "latest.candidate.json"), "utf8"),
        ),
        verify: signature.verify,
      });
      for (const [name, text] of [
        ["latest.json", JSON.stringify(result.feed, null, 2)],
        ["downloads.json", JSON.stringify(result.catalog, null, 2)],
        ["SHA256SUMS.txt", result.checksums],
        ["release-body.md", result.body],
        ["keep-assets.json", JSON.stringify(result.keep)],
      ])
        await writeFile(resolve(out, name), text + "\n");
    } finally {
      await signature.close();
    }
  }
  console.log(
    "Release metadata prepared; publication is a separate workflow action.",
  );
}
