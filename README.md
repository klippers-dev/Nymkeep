# Nymkeep

Protect sensitive text and screenshot regions locally before sharing with AI.
Nymkeep combines validated patterns, optional on-device name detection and local
OCR in a Tauri desktop app. Text placeholders can be restored within the current
session; screenshot redaction permanently replaces selected pixels in the export.

[Contribute](CONTRIBUTING.md) · [Privacy](docs/PRIVACY.md) ·
[Architecture](ARCHITECTURE.md) · [Security](SECURITY.md) ·
[Release status](docs/release/PLATFORM_STATUS.md)

## Download and platform status

**The first public installer has not been released.** Windows has an unsigned
internal review candidate. Hosted Windows, Apple Silicon Mac, Intel Mac and
Ubuntu 24.04 Rust/model checks pass, including native Vision OCR fixtures on both
Mac architectures. macOS device/signing evidence and Linux
capture/Wayland work remain pending. Build targets do not establish supported platforms.

Public installers will appear on [GitHub Releases](https://github.com/klippers-dev/Nymkeep/releases)
and, after hosting, the Nymkeep website. You will be able to download and run the
installer without Git, a compiler or a GitHub account. See the
[installation guide](docs/INSTALLATION.md) and
[release checklist](docs/release/RELEASE_CHECKLIST.md).
Source archives and CI artifacts are for developers, rather than public installers.

## What it does

- **Protect text:** select text and press **Alt+C**, or explicitly paste into the
  review window. Windows reads exposed selections; unavailable selection capture
  falls back to clipboard input and is labeled. Review before sharing.
- **Restore replies:** copy a reply and press **Alt+R**, or use Restore. Known
  placeholders restore exactly; unknown tokens stay unchanged for review.
- **Redact screenshots:** open, drop or explicitly paste an image. Local OCR finds
  text; the same rules and optional local NER identify sensitive spans. Review
  boxes, add manual boxes and Copy/Save a redacted PNG. Manual masking works when
  OCR is unavailable. Image exports do not support Restore.
- **Control the session:** mappings are memory-only and expire after 30 minutes
  without use. Originals stay hidden until revealed. Closing hides to the tray;
  Quit ends the session.

Protect, Restore and screenshot processing do not send input/output to a server.
Explicit developer model downloads and installer/update delivery are separate.
Saved custom rules are plaintext on your device; clipboard history/sync may retain
copied text. Detection can miss information. Reversible aliases are
pseudonymization and do not guarantee anonymity. See [the privacy guide](docs/PRIVACY.md).

## Build from source

Use Node.js 22.12+ or Node 24, npm, stable Rust, PowerShell 7 (`pwsh`), and
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.
Windows requires a healthy MSVC toolchain and Windows SDK; macOS requires Xcode
tools. Start with [contributor setup](CONTRIBUTING.md#local-setup).

```sh
git clone https://github.com/klippers-dev/Nymkeep.git
cd Nymkeep
npm ci
pwsh -NoProfile -File scripts/download-model.ps1
npm run dev        # browser UI preview; desktop IPC is unavailable
npm run tauri dev  # desktop app with the offline engine
```

Models are explicitly downloaded, checked against committed SHA-256 manifests
and excluded from Git. Packaged releases bundle verified resources. Linux also
needs `scripts/download-ocr-models.ps1`; macOS needs the native Vision helper.
See [candidate builds](docs/release/BUILD_CANDIDATES.md).

```sh
npm test -- --maxWorkers=1
npm run test:tooling
npm run build
cd src-tauri
cargo fmt --check
cargo test --locked -j 2
```

Frontend tests mock IPC; Rust tests exercise detectors, restoration and real model
inference. Native OCR/clipboard tests are explicit device checks. See
[evidence](docs/FEATURE_VERIFICATION.md) and [the test matrix](TEST_MATRIX.md).

## Contribute

Nymkeep is independently maintained by Klippers. Contributions are welcome and
reviewed for privacy, correctness, accessibility and maintainability. Review and
release timing follow maintainer availability; there is no guaranteed support SLA.

Fork the repository, create a topic branch from **dev**, and open a PR targeting
**dev**. Tested changes promote through **stage** to **main**. Read
[CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and
[the maintainer workflow](docs/MAINTAINERS.md). Sensitive findings follow
[SECURITY.md](SECURITY.md). Use synthetic examples in public issues and PRs.

## Website and license

The static site lives in `site/`. Run `npm run preview:site` and open
`http://127.0.0.1:4173`. Examples are fictional; the website does not process
private input. Hosting is deferred. [The website handoff](site/README.md) explains
how verified installer links will be connected later.

Project source is [MIT licensed](LICENSE). Third-party models/runtimes retain
their own terms; see [notices](src-tauri/THIRD_PARTY_NOTICES.txt). The complete
dependency notice inventory remains a public-binary release gate.
