# Nymkeep CURRENT_STATE

Updated: 2026-10-04. Clean Windows installer candidate and macOS implementation
(SP-033/034), following screenshot/website verification (SP-030/031/032).

SP-035: audited MIT source is public at https://github.com/klippers-dev/Nymkeep.
main/dev/stage and owner-only release tags are protected; mandatory CI,
CODEOWNERS/PR review, private reporting, secret push protection, dependency alerts
and fork approval settings were applied and read back. Hosted Windows and Apple
Silicon tests pass, including the native Mac Vision fixture. SP-036/PR #10
addresses Linux compilation/runtime ABI and Intel runtime builds; device/public
installer certification remains separate.

## What works (verified)

- `cargo test -j 2`: 69/69 pass from clean staged source with the genuine Microsoft SDK,
  including three Mac OCR protocol checks and fail-closed Linux pack validation;
  NER tests with real ONNX inference
  (`Wolfgang`->PERSON_1, `Berlin`->LOC_1), the graceful NER-off path, and 21
  screenshot mapping/normalization/export tests.
  Two ignored device checks were explicitly run and passed: actual Windows
  OCR → detection → opaque PNG → OCR reread, and native image clipboard
  round-trip with every RGBA pixel compared. The clipboard test uses a separate
  noninteractive window station and never reads or replaces the user's clipboard.
  Ordinary runs skip these checks; actual OCR languages/device access are required.
- Frontend: 65/65 Vitest tests pass (24 App workflows + 13 screenshot review +
  12 screenshot helpers + 16 website tests); production build and TypeScript pass.
  `cargo fmt --check` and changed frontend/site Prettier checks are clean.
- Windows x64 NSIS installer candidate built from clean staged source, with
  embedded frontend, verified model resources and four signed Microsoft app-local
  C++ runtime DLLs. Installer archive extraction/hashes and x64 PE are checked;
  installation is not run on the user's PC. The review candidate is unsigned and
  uses the debug profile; public signing and device certification remain pending.
  Six release tests verify patch/lock sanitation, exclusions, fresh outputs and strict
  Tauri NSIS metadata comparison. Final artifact:
  `artifacts/windows-x64-review/Nymkeep_0.1.0_x64-setup.exe` (32,290,599 bytes).
- Mac AXSelectedText-only capture, explicit permission onboarding and bounded
  offline Swift/Vision OCR helper implemented. Standalone adapter Rust metadata
  checks pass for Apple Silicon/Intel; protocol and permission UI tests pass on
  Windows. Hosted Apple Silicon Rust/Swift build and native Vision fixture now pass;
  Intel builds and real-device permission/export/signing checks remain pending.
  Both native Mac CI jobs are prepared; SP-035 sets up the public GitHub repository
  and required native CI. Report the actual runs separately from device support.
- Linux OCR now uses Tauri's installed resource directory and rejects missing,
  empty, malformed, wrong-size or hash-mismatched packs. deb/AppImage resource
  packaging is configured; Linux builds/capture/compositor certification remain pending.
- UI: five focused views (Protect, Restore, Session, Settings, Screenshot), responsive
  side-by-side review, manual correction for missed phrases, browser-preview
  honesty, accessible controls, and system light/dark themes.
- Screenshot: paste/drop/file input normalized to orientation-correct PNG with
  compressed/decoded limits; optional OCR; manual drag and keyboard-coordinate
  boxes independent of OCR; exclusions, actual export preview, native image copy,
  explicit redacted PNG save and separate protected OCR text copy. Empty/unmasked
  exports are blocked. Manual boxes survive detection/error; drafts clear on
  navigation/session clear/Start over, pending stale results are discarded and
  images/OCR text hide on blur. See ADR-011 and capability evidence.
- Identity: Nymkeep's geometric `N` represents source, reversible alias, and
  return. It is used in the application header, favicon, brand board, and
  regenerated Windows/macOS/iOS/Android icon bundles. The shield is retained only
  where it means the Protect action.
- Session privacy/correctness: originals are hidden in the Session view, sensitive
  component state clears on navigation or window blur, mappings expire after 30
  minutes without use, and metadata reads do not extend that lifetime.
- NER: INT8 BERT-small PII model (27 MB, Apache-2.0, SHA-256 verified) behind the
  detector interface. Pure-Rust WordPiece, BIO decode for PERSON/ORG/LOC at 0.80
  confidence, windowed long inputs, lazy CPU load, honest on/off in the UI.
- Detectors, custom terms, money/dates opt-in, restore contract, shortcuts,
  tray, toasts, autostart, updater wiring, platform adapters as before.
- Website: static local marketing page with fictional Protect/Restore and image
  before/after examples, evidence-backed Built & verified screenshot status, responsive
  navigation and light/dark themes. No private-input handling or public installer.
  Consistent SVG icons, active section navigation, pointer-only walkthrough motion,
  one-time workflow/image entrance motion and reduced-motion cancellation are verified.
  PNG/JPEG/WebP/GIF/BMP, GIF first-frame, alpha, Unicode file overwrite, invalid
  export preservation and OCR-independent native clipboard export checks pass.
  Image assets come from the synthetic native-backend check. See
  `docs/FEATURE_VERIFICATION.md` and `site/HANDOFF.md` for evidence and limits.

## Machine-local toolchain recovery (THIS DEV MACHINE ONLY, never ship)

A failed BuildTools update deleted the Windows SDK here. Recovered without admin:
`D:/Nymkeep/sdk-libs` (66 import libs regenerated from System32 DLLs via
dumpbin+lib.exe, plus PathCch alias and 2 GUIDs), `D:/Nymkeep/sdk-headers`
(minimal CRT headers), `D:/Nymkeep/sdk-tools/rc.exe` (windres shim),
`patches/vswhom-sys` ([patch.crates-io] stub), `src-tauri/.cargo/config.toml`
(link paths). Build env for this machine: MSVC bin dir on PATH, INCLUDE/LIB/RC
set, `cargo test -j 2`, and `RUSTFLAGS="-C debuginfo=1"` if linking runs out of
memory. See ADR-007. CI and releases use a healthy SDK and NONE of this.

SP-033 fetched genuine Microsoft Windows SDK 10.0.26100.9169 NuGet packages to
ignored `.release-work/`. Its full headers, import libraries and native resource
compiler were used for the clean installer and 69+2 native tests. The official
registry vswhom-sys compiles successfully. The original recovery remains local;
`scripts/release/prepare.mjs` excludes it and restores the official lock entry.

## Known gaps and release checks

- Per-span diff highlighting and its screen-reader alternative (SP-017).
- Dismissible first-run onboarding and remaining native error taxonomy (SP-018).
- macOS implementation needs actual Mac compile/link/permission/device evidence;
  Linux AT-SPI capture remains a stub.
- Wayland portal shortcuts (contract only, needs real-compositor tests).
- Release signing run + device-matrix pass (workflow and checklist ready).
- Screenshot native GUI review → Copy/paste into destination apps and Save dialog
  cancellation/overwrite need the release device matrix. The automated native
  clipboard/pixel/file checks passed; they do not certify the whole GUI matrix.
  Windows OCR availability now probes an installed profile-language engine.
  Small/blurred text, broader languages, High-DPI and device coverage remain open.
- Independent privacy review, Windows performance measurements and real app
  compatibility checks remain release gates. Public website hosting/domain setup
  is deferred at the user's request. Windows has an unsigned installer candidate;
  Mac/Linux builds/device evidence remain pending. See `docs/release/PLATFORM_STATUS.md`
  and `docs/release/BUILD_CANDIDATES.md`. Complete dependency license inventory and
  required license texts are still a public-redistribution gate.
