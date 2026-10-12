(() => {
  "use strict";
  const repository = "klippers-dev/Nymkeep";
  const definitions = {
    "windows-x86_64": ["Windows 11 · 64-bit", "_x64-setup.exe"],
    "darwin-aarch64": ["Mac · Apple Silicon", "_aarch64.dmg"],
    "darwin-x86_64": ["Mac · Intel", "_x64.dmg"],
    "linux-x86_64": ["Linux · AppImage", "_amd64.AppImage"],
  };
  function validate(catalog, release) {
    if (
      catalog?.schema !== 1 ||
      catalog.verified !== true ||
      !/^\d+\.\d+\.\d+$/.test(catalog.version) ||
      !Array.isArray(catalog.platforms) ||
      !catalog.platforms.length ||
      catalog.platforms.length > 4
    )
      throw new Error("Unavailable release");
    const tag = `v${catalog.version}`;
    if (
      catalog.releaseUrl !==
      `https://github.com/${repository}/releases/tag/${tag}`
    )
      throw new Error("Invalid release page");
    if (
      release &&
      (release.draft !== false ||
        release.prerelease !== false ||
        release.tag_name !== tag ||
        !release.published_at)
    )
      throw new Error("Unpublished release");
    const ids = new Set();
    function packageEntry(entry, suffix) {
      const name = `Nymkeep_${catalog.version}${suffix}`;
      if (
        entry.name !== name ||
        entry.url !==
          `https://github.com/${repository}/releases/download/${tag}/${name}` ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 100_000 ||
        entry.bytes > 512 * 1024 * 1024
      )
        throw new Error("Invalid installer");
      if (release) {
        const asset = release.assets?.find((item) => item.name === name);
        if (
          !asset ||
          asset.state !== "uploaded" ||
          asset.size !== entry.bytes ||
          asset.browser_download_url !== entry.url ||
          (asset.digest && asset.digest !== `sha256:${entry.sha256}`)
        )
          throw new Error("Installer metadata mismatch");
      }
      return entry;
    }
    for (const entry of catalog.platforms) {
      const definition = definitions[entry.id];
      if (!definition || ids.has(entry.id)) throw new Error("Invalid platform");
      ids.add(entry.id);
      packageEntry(entry, definition[1]);
      if (entry.manual) {
        if (entry.id !== "linux-x86_64")
          throw new Error("Invalid alternate package");
        packageEntry(entry.manual, "_amd64.deb");
      }
    }
    return catalog;
  }
  function text(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }
  function render(catalog) {
    const container = document.querySelector("[data-download-options]");
    if (!container) return;
    container.replaceChildren();
    for (const entry of catalog.platforms) {
      for (const [item, label] of [
        [entry, definitions[entry.id][0]],
        ...(entry.manual ? [[entry.manual, "Linux · Debian package"]] : []),
      ]) {
        const row = document.createElement("div");
        row.className = "download-option";
        const link = document.createElement("a");
        link.href = item.url;
        link.textContent = label;
        link.className = "text-link";
        const size = document.createElement("span");
        size.textContent = `${(item.bytes / 1048576).toFixed(1)} MB`;
        row.append(link, size);
        const details = document.createElement("details");
        details.className = "download-checksum";
        const summary = document.createElement("summary");
        summary.textContent = `Verify ${label} download`;
        const digest = document.createElement("code");
        digest.textContent = `SHA-256 ${item.sha256}`;
        details.append(summary, digest);
        row.append(details);
        container.append(row);
      }
    }
    container.hidden = false;
    const platform =
      navigator.userAgentData?.platform || navigator.platform || "";
    const preferred = /^Win/i.test(platform)
      ? "windows-x86_64"
      : /Linux/i.test(platform)
        ? "linux-x86_64"
        : null;
    const selected =
      catalog.platforms.find((entry) => entry.id === preferred) ??
      catalog.platforms[0];
    const chooseMac =
      /Mac/i.test(platform) &&
      catalog.platforms.some((entry) => entry.id.startsWith("darwin-"));
    const title = chooseMac
      ? "Choose your Mac installer"
      : `Download ${definitions[selected.id][0].split(" · ")[0]}`;
    document
      .querySelectorAll("[data-release-cta], [data-installer-link]")
      .forEach((link) => {
        link.href = chooseMac ? "#download-options" : selected.url;
        const icon = link.querySelector(".icon")?.cloneNode(true);
        link.replaceChildren(document.createTextNode(title));
        if (icon) link.append(icon);
        link.setAttribute(
          "aria-label",
          chooseMac
            ? title
            : `Download Nymkeep for ${definitions[selected.id][0]}`,
        );
      });
    text("[data-release-status]", `Nymkeep ${catalog.version} is available`);
    text(
      "[data-platform-label]",
      chooseMac
        ? "Mac - choose Apple Silicon or Intel below"
        : definitions[selected.id][0],
    );
    text(
      "[data-release-note]",
      "Choose the installer for your system. Files are hosted on GitHub Releases; no account or developer tools are needed.",
    );
    text(
      "[data-release-meta]",
      `Version ${catalog.version} · verified public release`,
    );
    text(
      "[data-download-description]",
      "Download Nymkeep, install it, and review a sample. Text and screenshot protection run locally on your device.",
    );
    text(
      "[data-release-faq]",
      "Available installers are listed above. Already installed? Open Settings → Updates. You choose when to check and install a signed update; Debian packages update manually.",
    );
  }
  window.NYMKEEP_DOWNLOADS = { validate };
  window.NYMKEEP_DOWNLOADS_READY = (async () => {
    const config = window.NYMKEEP_RELEASE;
    try {
      if (config?.catalog) {
        render(validate(config.catalog));
        return;
      }
      if (!config?.discover || typeof window.fetch !== "function") return;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await window.fetch(
          `https://api.github.com/repos/${repository}/releases/latest`,
          {
            signal: controller.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            headers: { Accept: "application/vnd.github+json" },
          },
        );
        if (!response.ok) return;
        const release = await response.json();
        if (typeof release.body !== "string" || release.body.length > 100_000)
          return;
        const match = release.body.match(
          /<!-- NYMKEEP_DOWNLOADS_V1\s*([\s\S]*?)-->/,
        );
        if (!match || match[1].length > 32_000) return;
        render(validate(JSON.parse(match[1]), release));
      } finally {
        clearTimeout(timer);
      }
    } catch {
      /* Missing, invalid, offline or rate-limited metadata keeps the pending state. */
    }
  })();
})();
