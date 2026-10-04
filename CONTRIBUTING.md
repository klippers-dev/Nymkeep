# Contributing to Nymkeep

Nymkeep is independently maintained by Klippers. Small, well-explained
contributions keep privacy behavior reviewable. Maintainers decide scope and
merges. Forks and modifications are welcome under MIT; access to merge upstream
is controlled separately.

## Choose a change

Read `ARCHITECTURE.md`, `DECISIONS.md`, `CURRENT_STATE.md` and the relevant ticket
in `TASKS.md`. Check existing issues/PRs before starting. Use the bug or feature
forms for public reports. Discuss larger features before starting implementation.
Security-sensitive findings follow [SECURITY.md](SECURITY.md).

Documentation, synthetic regression fixtures, accessibility improvements and
focused platform checks are useful contributions. State what you actually tested;
do not label macOS or Wayland supported based on compilation.

## Local setup

Install Node.js 22.12+ or Node 24, npm, stable Rust and PowerShell 7 (`pwsh`).
Follow [Tauri's OS prerequisites](https://v2.tauri.app/start/prerequisites/).
Windows needs MSVC plus an actual Windows SDK. Never recreate a missing SDK using
the developer-only recovery documented in ADR-007. macOS needs Xcode tools and
Linux needs WebKitGTK 4.1, AppIndicator, librsvg and patchelf.
Linux CI uses Ubuntu 24.04 to match the current ONNX Runtime ABI. On Intel macOS
13.3+, run `node scripts/build-intel-onnx.mjs` and export its printed `ORT_LIB_PATH`
and `ORT_LIB_PROFILE` before Cargo; this builds the pinned official runtime because
an Intel prebuilt is unavailable. Apple Silicon uses the normal verified prebuilt.
This is development setup, rather than platform certification.

```sh
git clone https://github.com/YOUR-USERNAME/Nymkeep.git
cd Nymkeep
git remote add upstream https://github.com/klippers-dev/Nymkeep.git
git fetch upstream
git switch -c fix/your-change upstream/dev
npm ci
pwsh -NoProfile -File scripts/download-model.ps1
```

The download command verifies the committed SHA-256 manifest. These public model
resources are developer downloads, excluded from Git. Linux additionally runs:

```sh
pwsh -NoProfile -File scripts/download-ocr-models.ps1
```

Windows developers also prepare the verified app-local runtime from their
installed Visual Studio toolchain:

```sh
pwsh -NoProfile -File scripts/release/windows-runtime.ps1
```

For macOS build the local Vision helper before native app checks:

```sh
node scripts/build-macos-ocr.mjs aarch64-apple-darwin
# Use x86_64-apple-darwin on an Intel Mac.
```

`npm run dev` previews the UI with no native processing. `npm run tauri dev`
starts the desktop app. Windows runtime packaging and platform-specific candidate
steps are documented in [BUILD_CANDIDATES.md](docs/release/BUILD_CANDIDATES.md).

## Preserve the privacy contract

- Use only fictional fixtures in tests, screenshots, logs, issues and PRs.
- Keep Protect/Restore and image processing offline. Never add raw text/image
  telemetry, remote inference, content logs or automatic model downloads.
- Preserve stable aliases, collision rejection, boundary-aware restoration and
  all-or-nothing restore. Do not reset token counters within a running session.
- Keep originals hidden in notices/toasts; preserve expiration, reveal controls,
  pending-result invalidation and image-draft cleanup.
- Pixel redaction must replace pixels before encoding. CSS overlays and blur
  alone do not establish the export contract.
- Write a new ADR before architecture/privacy changes. Respect `AGENTS.md`.
- Never commit signing credentials, local SDK recovery, downloaded models,
  captured private content or generated installers. Signing is CI-owned.

## Check your contribution

From the repository root:

```sh
npm test -- --maxWorkers=1
npm run test:tooling
npm run build
node scripts/repository/audit.mjs
```

From `src-tauri/`:

```sh
cargo fmt --check
cargo test --locked -j 2
```

Run meaningful native checks when touching OS capture/OCR/export and record the
device, OS and result in the PR. Ignored native tests are opt-in because they need
device facilities. Missing model/device evidence must be disclosed. Green unit
tests do not certify installer signing or platform support.

## Submit a pull request

Push your topic branch to your fork and target **dev**. Explain the problem,
resulting behavior, privacy impact and commands/results. Include synthetic visual
evidence for UI changes and update relevant docs. Keep changes focused and add a
`HANDOFF.md` entry with changed files, checks, assumptions and open risks.

CI runs without release secrets on contribution PRs. First-time fork workflows
may need maintainer approval. Resolve review comments; changed code needs fresh
approval. Maintainers promote dev → stage → main through PRs. Contributors should
not target main directly.

Contributions use the existing MIT license. Include provenance and license
information for third-party material. Follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
There is no CLA or donation requirement.
