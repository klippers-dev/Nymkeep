# Installer downloads and updates

Status: implementation and all four unsigned candidate jobs pass on PR #14
(native app 0ec3b56, CI 38298789910, candidates 38298785486). Live signed upgrade
and public release/device reviews remain open. No public installer release exists
as of 2026-10-13. Website publication was authorized on 2026-10-14; hosting
account access is being verified. Domain purchase remains a separate owner choice.

## The user journey

1. Open the public Nymkeep website and choose the operating system.
2. Download the versioned installer directly from GitHub Releases. No Git tools
   or GitHub account are required for a public release.
3. Install the Windows NSIS executable, drag the appropriate Mac app from its
   DMG to Applications, or use the Linux AppImage/Debian package.
4. Protect/Restore and screenshot processing run offline, with bundled models.
5. In a signed release, open Settings > Updates > Check for updates. Checking
   is explicit; opening Settings and ordinary processing never check the feed.
6. Review the available version, save work and restore any outstanding answers,
   then confirm installation. Drafts clear when the user confirms. Native
   mappings clear after signature verification, immediately before installation.
7. Restart when requested. Windows installation may close/relaunch the app.
   Debian packages use manual package replacement rather than this updater.

This is user-controlled updating, not a silent/background auto-update service.
Unsigned candidates have no enabled updater. The live signed version-to-version
transition still requires release/device evidence.

## Storage and trust

Website hosting stores HTML/CSS/JS and illustrations. GitHub Releases stores the
large, versioned installers, updater artifacts, public `.sig` files,
`SHA256SUMS.txt`, `downloads.json` and `latest.json`. Never store installer binaries
in normal Git commits, and never expose signing secrets to the website.

The website discovers the public latest stable release through GitHub's public
API. A catalog marker in release notes binds platform filenames, version, size
and SHA-256 to actual uploaded assets. Missing, draft, preview, mismatched,
offline or rate-limited metadata leaves the pending release state visible.
Mac users choose Apple Silicon or Intel explicitly. Hosting must allow the
public GitHub API in `connect-src`; `scripts/preview-site.mjs` is the local example.

The app's fixed feed is:
`https://github.com/klippers-dev/Nymkeep/releases/latest/download/latest.json`.
It accepts stable versioned assets from this repository. The updater's bundled
public key verifies the downloaded artifact before installation. A checksum
detects byte changes; a trusted signature also establishes signing authority.
OS code signing/notarization and the updater signature serve different purposes.
Windows code signing does not guarantee immediate SmartScreen reputation.

Update metadata/download requests expose ordinary connection information to
GitHub/CDN providers. They contain no input text, image, OCR results, mappings or
custom rules. Selecting external links also opens an ordinary browser request.
Windows may download WebView2 during initial setup if it is absent; Linux package
dependencies may require distribution repositories. These are distinct from
offline content processing.

## Maintainer release sequence

Contributions target dev; reviewed changes promote dev > stage > main. Require
native CI, clean source staging and actual device/review evidence. Bump npm,
Tauri and Cargo versions together, document changes, and use an owner-controlled
stable `vX.Y.Z` tag on tested main history.

`release.yml` builds signed drafts for Windows x64, Mac ARM64/Intel and Linux x64.
Draft preparation disables public catalog/update entries. Complete independent
privacy/license reviews and each platform's installation, permissions, export,
signing and update transition checks. Record checked-in evidence and reviewed
artifact hashes in `docs/release/APPROVAL.json`; an empty approval never passes.

The manually dispatched `publish-release.yml` runs only from main, verifies the
tag's latest Required checks result, actual uploaded hashes and public updater
signatures, removes unapproved draft assets, uploads approved catalogs and then
publishes the stable release. Source files implement this sequence; no signed
public run or production update is claimed yet. Never replace a published
version's installer bytes. Fixes receive a new version and review record.

After publication, website discovery can expose the approved installers without
a new site deployment. GitHub availability/rate limits remain dependencies. Keep
the Releases page as a fallback. There is no hosted apt repository, store channel,
delta-update service or automatic rollback service in this implementation.

## Recovery and ongoing ownership

- Failed download/signature verification never authorizes installation. Keep the
  current app and check again; a failed installation needs OS-specific recovery.
- Retain older release assets and notes. An older installed app may need them.
  Rollback is a reviewed recovery action, not a promised automatic downgrade.
- Test saved preferences across upgrades. Sessions intentionally do not migrate;
  expired, cleared or restarted mappings cannot restore old protected answers.
- Keep private signing credentials only in CI-managed secret storage; the app
  bundles only the public verification key. Rotation needs a planned trusted
  migration. Agents never read, print or request private keys/passwords.
- Maintain dependency advisories, bundled model/native-runtime licenses, device
  evidence, security reporting and support. Open source enables inspection; it
  does not by itself prove a downloaded binary matches the source.

## Read next

- [Tauri updater](https://v2.tauri.app/plugin/updater/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Windows signing](https://v2.tauri.app/distribute/sign/windows/)
- [Mac signing and notarization](https://v2.tauri.app/distribute/sign/macos/)
- [AppImage distribution](https://v2.tauri.app/distribute/appimage/)
- [Project releases](https://github.com/klippers-dev/Nymkeep/releases)
- [Project contribution guide](https://github.com/klippers-dev/Nymkeep/blob/main/CONTRIBUTING.md)
