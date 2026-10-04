# Desktop build candidates — 2026-10-04

Publishing and domain setup remain deferred. An internal unsigned candidate is
different from a signed, device-certified public release.

## Reproducible clean build

1. Use a healthy SDK/toolchain on the target OS. Never use the recovery files in
   `sdk-*`, `patches/vswhom-sys` or `src-tauri/.cargo/config.toml` for a candidate.
2. From the original repository: `node scripts/release/prepare.mjs .release-work/candidate`.
   Use a fresh destination. The staging script rejects unknown registry patches,
   symlinks and output outside `.release-work`, and preserves existing output.
3. In the staged directory: `npm ci`, `pwsh -File scripts/download-model.ps1`,
   `npm test -- --maxWorkers=1`, `node --test scripts/release/*.test.mjs`, `npm run build`.
   Model scripts verify SHA-256 even when cached; downloads are build-time only.
4. On Mac: `node scripts/build-macos-ocr.mjs aarch64-apple-darwin` or
   `x86_64-apple-darwin`, matching the Rust target. Requires macOS 13.3+ and Xcode tools.
   Export `MACOSX_DEPLOYMENT_TARGET=13.3` before Cargo; CI's helper step sets it.
   Intel Macs need Git, Python 3.10+ and CMake 3.28+. Run
   `node scripts/build-intel-onnx.mjs` in the original source
   checkout before Cargo. Export its printed `ORT_LIB_PATH` and `ORT_LIB_PROFILE`
   in the build shell; CI exports them automatically. This compiles the pinned
   official ONNX runtime into ignored build workspace. Apple Silicon uses the
   normal verified prebuilt runtime. See ADR-015.
   On Linux: use Ubuntu 24.04 for the current prebuilt runtime ABI, install the
   workflow's WebKitGTK/AppIndicator prerequisites, and run
   `pwsh -File scripts/download-ocr-models.ps1`.
   On Windows: `pwsh -File scripts/release/windows-runtime.ps1`; app-local C++
   runtime DLLs are copied only from Visual Studio's signed redistributable folder.
5. In staged `src-tauri`: `cargo fmt --check`, `cargo test --locked -j 2`.
   On Mac explicitly run `cargo test --locked -j 2 --test screenshot_workflow -- --ignored`
   for Vision → detection → opaque pixels → OCR reread against synthetic data.
6. In staged root: `npm run tauri -- build --config src-tauri/tauri.candidate.conf.json -- --locked -j 2`.
   Add `--target <Rust target>` before `--config` when specifying an architecture.
7. Collect output: `node scripts/release/collect.mjs src-tauri/target/release/bundle artifacts/candidate`.
   With an explicit target use `src-tauri/target/<target>/release/bundle`.
   The output includes installable packages, SHA-256, sizes and candidate status.
   For Windows, extract the NSIS archive without running it, validate archive paths,
   then run `node scripts/release/check-windows-payload.mjs <payload-directory> <built-exe>`
   before any command regenerates the build executable. It verifies exact executable
   bytes except Tauri's documented `__TAURI_BUNDLE_TYPE_VAR_UNK` → `NSS` marker,
   x64 PE, model/runtime hashes, manifest/notices and absence of recovery files.
   The verifier rejects any additional executable-byte difference or ambiguous marker.

The local Windows review build uses `--debug` and a genuine Microsoft SDK fetched
from Microsoft's NuGet packages. It reuses the local Cargo artifact directory for
disk efficiency while compiling allowlisted staged source without the recovery
config/patch. A debug candidate is for internal review; public builds use release mode.

## Prepared platform paths

- Windows x64: per-user NSIS setup. The WebView2 bootstrapper can fetch Microsoft's
  runtime during installation if missing; text/image Protect/Restore remains offline.
- Mac Apple Silicon and Intel: separate native build jobs on `macos-15` and
  `macos-15-intel`, with a packaged Vision helper and explicit permission controls.
- Linux x64: deb/AppImage, bundled OCR manifest/resources, clipboard capture fallback.
  X11/AT-SPI capture and Wayland portal shortcuts/device coverage remain open.

`.github/workflows/desktop-candidate.yml` is a manually dispatched workflow that
uploads internal unsigned candidates, without release publishing or signing credentials.
The public source repository is [klippers-dev/Nymkeep](https://github.com/klippers-dev/Nymkeep).
Required CI validates four native targets before branch promotion. Hosted Windows,
Apple Silicon and Ubuntu 24.04 Rust checks pass; the Apple Silicon Swift helper
and native Vision fixture also pass. Intel runtime compilation is under validation
in PR #10. The candidate workflow has not been dispatched. These checks do not
certify installation, permissions, signing or a supported desktop environment.

## Public release gates

Use `.github/workflows/release.yml` only after the independent privacy, license and
device checks in `RELEASE_CHECKLIST.md`. It produces a draft and uses CI signing.
Set the **public** repository variables `NYMKEEP_UPDATE_ENDPOINT` and
`NYMKEEP_UPDATE_PUBLIC_KEY`; placeholders cause the release configuration step to fail.
Windows OS code signing and Mac signing/notarization need actual CI setup and evidence.
Updater signing alone does not certify the operating-system installer signature.
The candidate includes major-component notices; the complete dependency license
inventory and required license texts still need review before public redistribution.

Real-device checks include install/uninstall/update, permission deny/grant/revoke,
selected-text fallback (no whole-control reads on Mac), shortcuts/tray/autostart,
native Copy/Save/paste in destination apps and High-DPI/language coverage.
Never display Mac/Wayland supported until the relevant device/compositor evidence exists.
Connect `site/release.js` only to a verified public signed artifact after those gates pass.

References: [Tauri Windows installer](https://v2.tauri.app/distribute/windows-installer/),
[Tauri sidecars](https://v2.tauri.app/develop/sidecar/),
[Apple Vision word bounds](<https://developer.apple.com/documentation/vision/vnrecognizedtext/boundingbox(for:)>),
[GitHub runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
