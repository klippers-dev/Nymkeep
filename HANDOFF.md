# Nymkeep handoff — 2026-10-04 (SP-035)

## Public source and contributor setup (SP-035 done; SP-036 in progress)

User authorized publication to klippers-dev/Nymkeep, dev/stage/main branches,
contribution guidance and repository protections. Existing MIT license retained.
Owner CLI admin authentication verified; the earlier connector remains read-only.

Changed: README, CONTRIBUTING, SECURITY, SUPPORT, CODE_OF_CONDUCT, privacy and
installation/maintainer guides; CODEOWNERS, issue/PR forms, Dependabot and CI;
source export/audit/protection scripts; .gitignore, package scripts, site source
links/copy and ADR-014. Candidate/release actions pinned to actual commits;
the nonexistent Tauri action v2 reference corrected to verified v1.0.0.

Checks: 65 frontend tests and production build pass; 10 release/repository tests
pass; changed files pass Prettier. Initial clean export audit: 169 files,
3,543,014 bytes, with recovery, credentials, downloaded models and generated
installers excluded. Clean genuine-SDK Rust rerun: 69 pass, fmt passes; two native
device tests remain opt-in and were verified in SP-033. Commit c1f3abe published to
main/dev/stage. All branch/tag rulesets verified active (24451248, 24451250,
24451300), GitHub Actions app 15368 bound to Required checks. Private reporting,
secret scanning/push protection, dependency alerts/security updates, read-only
tokens and all-external workflow approval verified by authenticated read-back.
CODEOWNERS reports no errors. No credentials or user clipboard accessed.

First hosted CI 37191285143: frontend/audit, Windows and Apple Silicon Mac pass,
including native Mac Vision fixture. Linux compile then runtime ABI and Intel
runtime-distribution gaps caught. PR #10 corrects ONNX input/lifetime handling,
uses Ubuntu 24.04 and adds pinned Microsoft ONNX 1.28.0 Intel source builds/cache
with macOS 13.3 minimum (ADR-015). Latest hosted results still pending. Nine
unreviewed Dependabot runs were cancelled to prioritize validation; their PRs stay
open. Future version PR volume reduced to one per ecosystem.

Assumptions/risks: sole-owner PR-only review bypass with separate mandatory CI;
public installer/signing/device/license gates stay open. Hosting deferred.
The recovered workspace is exported to a separate Git checkout so its local Cargo
patch/config stay intact and cannot enter the public commit.

## Previous Windows candidate/macOS implementation handoff (SP-033/034)

Windows x64 installable **unsigned review candidate** is ready:
`artifacts/windows-x64-review/Nymkeep_0.1.0_x64-setup.exe`.
Size: **32,290,599 bytes** (~30.8 MiB). SHA-256:
`e6e76ee114522193f65a6f0bf34645039f50784aa71af8fcb6a4ac74e54ddfc1`.
Its manifest, payload verification and README are beside it. This debug-profile
candidate is not a signed public release. No installation or app GUI launch was
performed on the user's PC; publishing/domain setup remains explicitly deferred.

Mac AXSelectedText-only capture, explicit permission controls and offline native
Swift/Vision OCR are implemented. Apple Silicon/Intel adapter Rust metadata checks,
cross-host protocol and permission UI tests pass. Native Mac app/Swift build,
Vision fixture, signing/notarization and real-device evidence await a Mac/CI host.
No Mac/Wayland supported claim has been added.

## Changed files

- `src-tauri/src/platform/macos.rs`, `platform/mod.rs`: selection-only AX with
  bounded reads/timeouts, owned CF references, no whole-field/clipboard reads,
  read-only trust status and explicit consent request.
- `src-tauri/src/shots/macos.rs`, `macos_protocol.rs`, `macos/ocr.swift` (new),
  `shots/mod.rs`, `shots/ocr.rs`: packaged Vision helper, bounded local pipes,
  30-second recognition deadline, punctuation preservation and pixel-coordinate
  conversion; generic errors and no content logs/files/network. Linux installed
  resource lookup and missing/empty/size/hash manifest failures now fail closed.
- `src-tauri/src/lib.rs`: command wiring for permission status/request and Linux
  resource directory. Core/NER detector and restore behavior are unchanged.
- `src/App.tsx`, `src/api.ts`, `tests/App.test.tsx`: native selection status and
  Mac Settings consent/check controls; no prompt on opening Settings and no false
  permission-success indication. Existing visual system retained.
- `src-tauri/tests/screenshot_workflow.rs`: synthetic native OCR fixture also
  targets Mac; Windows isolated clipboard remains Windows-only.
- `src-tauri/tauri*.json`, `THIRD_PARTY_NOTICES.txt`, `.gitignore`: explicit model
  destinations, platform bundles, app-local C++ runtime, candidate updater disabled,
  Mac sidecar/minimum OS and Linux OCR resources. Major notices included; complete
  dependency licenses remain a public-redistribution gate.
- `scripts/release/prepare.mjs`, `prepare.test.mjs`, `collect.mjs`, `public-config.mjs`,
  `windows-runtime.ps1`, `check-windows-payload.mjs`, `pe.mjs`, `pe.test.mjs` (new):
  clean allowlisted source, official dependency lock, fresh outputs, signed vendor
  runtime copy, package hashes and strict executable/resource verification.
  `scripts/build-macos-ocr.mjs` builds per-architecture native helpers.
- `scripts/download-model.ps1`, `download-ocr-models.ps1`: cross-platform paths,
  verified caches and hash-checked temporary download replacement.
- `.github/workflows/desktop-candidate.yml` (new), `release.yml`: native Windows,
  Apple Silicon, Intel and Linux clean builds; internal artifact uploads or a
  protected signed draft with public updater metadata checks. Never dispatched
  here: checkout has no Git repository/remote. Credentials remain CI-owned.
- Architecture/ADRs 012/013, current state, task tickets, test/capability records,
  release build/checklist/status docs, this note and website platform copy updated.
  Windows says installer candidate; Mac says implementation added, verification pending.

## Commands and evidence

- `node .tooling/package/bin/npm-cli.js test -- --maxWorkers=1`: **65/65 pass**
  (24 App + 13 ScreenshotView + 12 helpers + 16 website).
- Final website copy: `node node_modules/vitest/vitest.mjs run tests/Site.test.ts
  --pool=forks --maxWorkers=1`: **16/16 pass**.
- `node .tooling/package/bin/npm-cli.js run build`: TypeScript/production build pass.
- `cargo test -j 2 --offline --locked -- --include-ignored --test-threads=1`
  in clean staged `src-tauri/`: **69 units + 2 explicit native Windows checks pass**.
  Includes actual NER inference, real Windows OCR/redaction/reread and every native
  clipboard pixel compared on a separate noninteractive window station. No user
  clipboard read/replace occurs. `cargo fmt --check` passes in stage and original.
- `node --test scripts/release/*.test.mjs`: **6/6 pass** (clean staging/lock/output
  checks and strict NSIS metadata comparison; arbitrary code changes are rejected).
- Both `rustc --edition=2021 --crate-type=lib --emit=metadata --target
  <aarch64-apple-darwin|x86_64-apple-darwin> src-tauri/src/platform/macos.rs`: pass.
  No full Mac/Swift application compilation is claimed.
- `powershell -NoProfile -File scripts/download-model.ps1` and OCR equivalent:
  cached SHA-256 (and OCR sizes) verified. Prescribed model command also passed;
  its shell profile emitted unrelated missing-fnm messages.
- Official Microsoft runtime signatures and copied SHA-256 verified.
  Windows SDK 10.0.26100.9169 fetched from Microsoft's NuGet packages, extracted
  with path validation and used via full official headers/libs/resource compiler.
  Registry vswhom-sys compiled; staged source has no recovery patch/config.
- Tauri clean-stage `build --debug --config src-tauri/tauri.local-candidate.conf.json
  -- --offline --locked -j 2`: pass, NSIS installer produced. Before-build disabled
  only because frontend was already built and the local shell has no npm shim.
  Original debug Cargo directory reused for disk efficiency; source/config remain clean.
- Official 7-Zip archive tools extracted (not installed), installer archive paths
  validated, all **17 payload files** extracted without executing the installer.
  `check-windows-payload.mjs` confirms x64 PE, model/runtime hashes, exact source
  manifest/notices and no recovery/private payload. Total extracted payload ~87.7 MB.
- Application comparison accepts only Tauri's known `__TAURI_BUNDLE_TYPE_VAR_UNK`
  to `NSS` metadata change (3 bytes), rejecting every other difference. This was
  confirmed in cached tauri-utils 2.9.3 `platform.rs`; after packaging Tauri restores
  UNK in the build executable. Final application SHA-256:
  `fc5aeb627748e7e9fee0b1ff2c37a95a987563f661ecaec4189e103c7a1cfea7`.
- Changed frontend/scripts/site/config/workflow Prettier checks and YAML parse/step
  checks pass. Protected-file EPERM formatting was applied through apply_patch.

Routine failures resolved: a new test initially referenced a transitive uuid crate;
it now uses a std-only unique temporary directory and all Rust checks pass. Vitest
worker startup timed out during heavy linking; serialized reruns/fork pool pass.
An initial payload byte check compared against a test-regenerated executable;
final standalone rebuild and the narrowly verified Tauri bundle marker comparison
establish the final payload. No product behavior was relaxed to make tests pass.

## Assumptions and open risks

Synthetic fixtures only. Protect/Restore/image processing stays offline. No raw
input/output network path, signing-key/password/license-credential access, global
SDK installation, user app installation or publishing occurred. Recovery files in
the original workspace remain untouched and excluded from staging and packages.
WebView2 may fetch Microsoft's runtime during setup when absent, documented separately.

Public release still needs OS signing/updater proof, complete license inventory,
independent privacy/performance review, clean-device install/uninstall/update,
native GUI Copy/Save/paste and the app/High-DPI/language matrix. Mac native builds
and permission/device checks are pending; Linux capture/X11/Wayland implementation
and device evidence remain pending. No reliable Mac/Linux calendar ETA is claimed.
See `docs/release/BUILD_CANDIDATES.md` and `PLATFORM_STATUS.md`.

---

# Previous handoff — 2026-10-04 (SP-032)

Screenshot implementation verification and final website polish are complete.
The website now says **Built & verified**, qualified by actual Windows synthetic
OCR, pixel, file and clipboard evidence. Public installer readiness remains a
separate release gate. Hosting/domain work is still deferred by the user.

## Changed files

- `site/index.html`, `site/styles.css`, `site/site.js`: consistent local SVG icon
  family, action-specific theme icons, retained icons across stage/release updates,
  active section navigation, interruptible 220ms pointer feedback, one-time
  workflow/image arrival, instant keyboard actions, reduced-motion cancellation.
  Content is visible without JS, IntersectionObserver or WAAPI. Screenshot/FAQ/
  roadmap/download copy separates implemented functionality from signed releases.
- `tests/Site.test.ts`: 16 site checks, including pointer/keyboard interruption,
  live reduced-motion changes, observer navigation and retained dynamic icons.
- `src-tauri/src/shots/mod.rs`: four additional test-only cases covering all five
  supported image formats without OCR, animated GIF first-frame behavior,
  transparent pixel masking, Unicode/case-insensitive PNG overwrite, invalid
  request preservation and content-free write errors. Runtime behavior unchanged.
- `src-tauri/tests/screenshot_workflow.rs`: actual isolated native clipboard
  evidence also covers OCR-independent manual boxes and rejected unmasked export
  preserving the previous safe image. User clipboard is never accessed.
- `CURRENT_STATE.md`, `TASKS.md`, `TEST_MATRIX.md`, `DESIGN.md`,
  `docs/FEATURE_VERIFICATION.md`, `site/HANDOFF.md`, this note: current evidence,
  design conventions, completion and remaining release limits.

## Commands and results

- `cargo test -j 2 --offline --locked -- --include-ignored --test-threads=1`
  from `src-tauri/`: **65 unit + 2 explicit native Windows integration checks pass**.
  Actual OCR, PNG pixel replacement/reread and clipboard RGBA comparisons pass.
- `cargo fmt`, then `cargo fmt --check`: clean.
- `node .tooling/package/bin/npm-cli.js test`: **62/62 pass** (21 App,
  13 ScreenshotView, 12 helpers, 16 website).
- `node .tooling/package/bin/npm-cli.js run build`: TypeScript and production build pass.
- `node node_modules/vitest/vitest.mjs run tests/Site.test.ts`: **16/16 pass**
  after the final SVG markup corrections.
- Prettier write/check for the three site files and Site tests: clean. Direct
  test-file write returned EPERM; formatted content was applied with apply_patch.
- Browser: walkthrough by pointer and keyboard, both themes, image comparison,
  FAQ keyboard toggle, mobile menu/Escape/focus/link-close, active section state,
  local SVG references and 360/768/1024/1366 widths pass; no horizontal overflow
  or console errors. Stable light-theme badge contrast is 7.33:1, body labels 5.9:1.
  A hidden mobile-role attribute query timed out after successful navigation;
  direct DOM state confirmed the destination and closed menu. No app defect.

## Assumptions and open risks

Synthetic images only; offline native Protect/Restore/image processing unchanged.
No architecture/privacy change, therefore no new ADR. No signing or license
credentials touched. Existing unsigned embedded Windows development executable
is unaffected by test-only native edits. Machine-local SDK recovery remains local
and is excluded from shipping; compilation used the documented local environment.

Actual native GUI Save-dialog cancellation/overwrite consent, destination-app
paste, High-DPI/language/device matrix, independent privacy review, performance
and signed packaging remain public-release requirements. File overwrite tests
establish backend behavior, not interactive dialog consent. macOS/Linux/Wayland
require implementation and real devices/compositors; no supported badge or ETA.

Review: `http://127.0.0.1:4173/#screenshots`.
Proof: `.preview/website-final-desktop-2026-10-04.png` and
`.preview/website-final-mobile-2026-10-04.png`.

---

# Previous handoff — 2026-10-04 (SP-030/031)

Screenshot implementation completed: OCR-independent manual boxes, normalized
bounded images, actual PNG preview, native image clipboard and explicit PNG save,
keyboard review, stale-result protection and image draft cleanup. Website polished
with verified capabilities, refined section links and honest platform status.
Publishing/domain setup is deferred at the user's explicit request.

## Changed files

- `src/ScreenshotView.tsx` (new), `src/App.tsx`, `src/App.css`, `src/api.ts`,
  `src/shots.ts`: isolated image review, native commands, bounds, export controls
  and privacy lifecycle; removed old screenshot state/handlers from App.
- `src-tauri/src/shots/capture.rs` (new), `shots/mod.rs`, `shots/ocr.rs`,
  `src-tauri/src/lib.rs`: offline normalization/EXIF, size limits, optional OCR,
  black PNG output, native clipboard and native save dialog on worker threads.
  `shots/boxes.rs` received formatting only; detector/restore core unchanged.
- `src-tauri/Cargo.toml`, `Cargo.lock`, `build.rs`: cached pinned dialog plugin,
  test runtime feature, locked compatible dependencies, and Tauri's compiled
  Common Controls manifest linked into Windows integration-test executables.
- `tests/ScreenshotView.test.tsx` (new), `tests/App.test.tsx`, `tests/Shots.test.ts`,
  `src-tauri/tests/screenshot_workflow.rs`: workflow/privacy/failure tests and
  isolated real native clipboard pixel comparison using synthetic data.
- `site/index.html`, `site/styles.css`, `tests/Site.test.ts`, `site/README.md`,
  `site/HANDOFF.md`: image capabilities, hero action, platform readiness,
  anchor spacing and visual review. Existing canonical identity/assets retained.
- `.github/workflows/release.yml`: frontend test step now actually runs `npm test`
  before building. No signing configuration or credentials changed.
- `ARCHITECTURE.md`, append-only `DECISIONS.md` ADR-011, `CURRENT_STATE.md`,
  `TEST_MATRIX.md`, `TASKS.md`, `docs/FEATURE_VERIFICATION.md`, new
  `docs/release/PLATFORM_STATUS.md`: implementation and release evidence/gates.
- Generated app `dist/` refreshed. Review proofs and CLI config are under ignored
  `.preview/`; this checkout has no Git repository.
- `src-tauri/target/debug/nymkeep.exe` rebuilt with embedded frontend through
  Tauri's custom protocol. Local unsigned development artifact; no public bundle
  or installer generated, and its GUI is not certified by the backend tests.

## Commands and validation

- Read architecture, decisions, current state and task tickets before code;
  appended ADR-011 before privacy/architecture changes.
- `npm test` via `node .tooling/package/bin/npm-cli.js test`: **59/59 pass**
  (21 App, 13 ScreenshotView, 12 helpers, 13 website).
- `npm run build` via the same local npm CLI: **pass**, including TypeScript.
- `cargo test -j 2 --offline --locked`: **61/61 pass**, 2 device tests skipped.
- `cargo test -j 2 --offline --locked -- --include-ignored --test-threads=1`:
  **61 units + 2/2 actual Windows integration checks pass**. Real OCR/detection/
  redacted PNG/OCR reread and native clipboard round-trip compare every RGBA pixel.
- `cargo fmt --check`: **clean**. Prior native formatting drift is resolved.
- Changed frontend/site/test/workflow Prettier checks: **clean**.
- Final website rerun: **13/13 pass** after native-verification copy.
- `node node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle
  --config .preview/tauri-review-build.json -- --offline --locked -j 2`: **pass**.
  Frontend had already been built; temporary config only disables the unavailable
  shell npm shim's redundant beforeBuild command. Initial build attempts using
  `CARGO_NET_OFFLINE=true`/manual `ORT_LIB_PATH` omitted prebuilt-runtime link
  prerequisites. Final CLI Cargo `--offline` path reuses the existing official ORT
  cache with its standard prerequisite libraries. No model/runtime download,
  signing credentials or machine-local recovery changes were needed.
- Native tests use the documented machine-recovery environment: MSVC and
  `sdk-tools` on PATH, INCLUDE/LIB/RC set, `RUSTFLAGS=-C debuginfo=1`. The recovery
  files/patch were not edited and must never ship. A healthy SDK remains required
  for public CI packaging.
- An initial OLE clipboard backup test failed during restoration after its pixel
  comparison succeeded. Replaced it with a child process on a separate
  noninteractive Windows window station; final test never reads or changes the
  user's clipboard. Its isolation follows [Microsoft's window station API](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setprocesswindowstation).
- Browser: light/dark, 360/768/1024/1366 px, comparison/keyboard FAQ, mobile
  Menu/Escape/link close, all local images and no horizontal overflow checked.
  No console warnings/errors. Loopback website preview remains at
  `http://127.0.0.1:4173/#screenshots`.
  Final review proofs: `.preview/website-polish-review-2026-10-04.png`,
  `.preview/website-polish-mobile-2026-10-04.png`, and
  `.preview/website-polish-full-2026-10-04.png`.

## Assumptions and open risks

- Source/manual masking is implemented and synthetic native evidence passed;
  this is not a public release or full GUI/OCR accuracy certification.
- Native application UI automation was unavailable. Real GUI Save cancellation/
  overwrite, destination-app paste, High-DPI, formats/languages, accessibility and
  app/device compatibility remain release checks. No macOS/Wayland support claim.
- Windows is closest to public release. Signing/updater setup, independent privacy
  review and release device/performance checks remain. Mac/Linux adapters and real
  hardware/compositor work remain, so there is no reliable calendar ETA.
- No private input/output is networked; no raw PII/filenames in logs or toasts;
  no original sidecar saves; text placeholder/restore contract remains unchanged.
- Website hosting and installer URLs remain unconfigured by user preference.
  Signing keys, passwords and license credentials were neither accessed nor changed.

---

# Nymkeep handoff - 2026-10-04 (SP-029 capability verification + website)

See [the capability audit](docs/FEATURE_VERIFICATION.md) and
[website handoff](site/HANDOFF.md) for the evidence matrix, changed files,
commands, assumptions and open risks. The website now includes screenshot/image
redaction, actual synthetic before/after assets, complete detector/control
coverage and accurate built/testing/planned status. Review:
`http://127.0.0.1:4173/#screenshots`.

42 frontend tests, 57 Rust unit tests, 1 explicitly run real Windows OCR
integration check and the production build pass. Existing native formatting
drift remains. Full native image clipboard/device testing, the manual-only export
gate, independent privacy review and signed public release remain open. No
native runtime code or privacy behavior changed. Prior handoffs follow.

# Nymkeep handoff - 2026-10-03 (SP-028 website design)

See [the website handoff](site/HANDOFF.md) for changed files, commands, assumptions
and open risks. Website review runs at `http://127.0.0.1:4173`.
40 frontend tests, 57 Rust tests and the app build pass. Existing Rust formatting
drift remains outside this website task. Signed release/download connection is next.

---

# Nymkeep handoff — 2026-09-21 (quick-capture Alt-release fix, Muse Spark)

## Changed files

- `src-tauri/src/lib.rs`: `do_quick_capture` now waits (max ~800ms) for the
  physical Alt key release via `GetAsyncKeyState` before injecting Ctrl+C.
  Without this, the target app receives Ctrl+Alt+C and the copy silently
  fails. Falls through after timeout (best effort).

## Commands run

- `cargo test -j 1`: 57/57. Dev app relaunched with the fix.

## Open risks

- Real-world grab reliability still needs user trials (focus races beyond the
  Alt hold, elevated windows, terminals). Ask the user for: app name, whether
  text was selected, exact toast text.

---

# Nymkeep handoff — 2026-09-21 (Alt+J quick capture, Muse Spark)

## Changed files

- `src-tauri/src/lib.rs`: third shortcut (`quick`, default Alt+J) through the
  whole pipeline (parse, validate all-distinct, load/save/rollback, register,
  handler, tray item). `do_quick_capture`: secure capture first, else
  simulated Ctrl+C (SendInput) + clipboard-sequence polling + verify-changed,
  else guided error. `protect_and_write` extracted and shared.
- `src-tauri/Cargo.toml`: `winapi` (sequence poll), windows
  `Win32_Foundation` + `Win32_UI_Input_KeyboardAndMouse` (SendInput).
- `src/api.ts`, `src/App.tsx`: third recorder, keysChanged, Settings explainer
  ("Skip Ctrl+C..."), protect-tip quick line. `components.tsx`: `Keys`
  hardened against empty values.
- `tests/App.test.tsx`: shortcut fixtures carry `quick`.
- `D:/Nymkeep/sdk-libs`: msimg32, opengl32, shlwapi, mpr libs generated.

## Commands run

- `cargo test -j 1`: 57/57 (2 new parser/validate tests).
- `npx vitest run`: 29/29. `npm run build`: clean. Dev app relaunched.

## Assumptions

- Quick capture is Windows-only (SendInput); elsewhere it guides to manual.
- Failure degrades to the manual flow; quick mode is labeled fallback-class
  (clipboard history may keep the original). Prior clipboard content is
  replaced by design; disclosed in UI.
- Alt+X rejected as default (Word books it); Alt+J is rebindable anyway.

## Open risks

- Real-world grab reliability unmeasured (focus races, elevated windows,
  terminals). Needs user trials in the user's own apps.
- Confidence-scored detection still open (user asked).

---

# Nymkeep handoff — 2026-09-21 (bare-digit phones, Muse Spark)

## Changed files

- `src-tauri/src/core.rs`: phone patterns extended with structured bare
  digits (10-digit 6-9 start, 12-digit 91 prefix, 11-digit 0 prefix).
  Letter-prefixed and structure-less digit runs stay untouched by design.
  New test `bare_digit_phones_need_mobile_structure`.

## Commands run

- `cargo test -j 1`: 55/55.

## Open risks

- User asked about confidence-scored detection for digits-only strings;
  deterministic layer is binary today, NER has the only threshold (0.80).
  Confidence display + review confirm is a follow-up, not built.
- `N159876543210`-style letter-prefixed IDs need the user's real format
  (custom regex SP-015 is the long-term home).

---

# Nymkeep handoff — website review fixes (Muse Spark)

## Changed files

- `site/styles.css`: fixed bento empty cell (wide card no longer spans rows in
  a 2-col grid with 4 items), fixed `demo-arrow`/step-number/skip-link to use
  paired tokens so text stays readable, added `prefers-color-scheme: dark`
  theme via the same variables.

## Verification

- `node --check site/site.js` clean. Copy and contrast re-audited in both
  themes. Static server serves the folder; refresh picks up changes.

## Open risks

- Still not rendered in a real browser here; check desktop, mobile, and dark
  OS preference before publishing.

---

# Nymkeep handoff — product website (static site, Muse Spark)

## Changed files

- `site/index.html`, `site/styles.css`, `site/site.js`, `site/assets/`
  (new, self-contained, no build step): nav, split hero with a real
  transformation demo, trust strip, 3-step how-it-works, 4-cell feature grid,
  detector pills, roadmap strip, download card, support block, FAQ, footer.
- Brand tokens from BRAND.md/DESIGN.md (ink, cyan, amber, frost, system sans,
  single radius scale). No gradients, no fake stats, no testimonials, one CTA
  intent label ("Download"), eyebrows avoided.

## Verification

- `node --check site/site.js` clean. Copy self-audited. Contrast follows the
  app palette (ink-on-light body, dark button fills).

## Assumptions

- `SITE.DOWNLOAD_URL` is empty until the first signed beta; buttons fall back
  to the download section + beta-request email. No dead links ship.
- Support section mirrors the in-app copy; star/follow/sponsor URLs still
  pending from the user.

## Open risks

- Not rendered in a browser here; spot-check desktop + mobile + dark-mode
  system preference before publishing. Serve the whole `site/` folder so the
  favicon resolves.

---

# Nymkeep handoff — 2026-09-21 (split-word fix + label modes, Muse Spark)

## Changed files

- `src-tauri/src/shots/boxes.rs`: gap-aware joining (adjacent same-line OCR
  fragments merge without space, so split emails like `a` + `lex@b.co` detect
  as one secret); `map_to_boxes` now takes the real joined text (it previously
  rebuilt text with spaces, silently dropping gap-joined spans); box padding
  kept. 3 new tests, 1 fixture widened.
- `src/App.tsx`: preview box-label modes Type/Nymkeep/None (preview only;
  shared image stays plain black) + explanatory note.
- `src/App.css`: segmented label control style.

## Commands run

- `cargo test -j 1`: 54/54. `npx tsc --noEmit` clean, `npm run build` clean.

## Open risks

- Gap threshold (max(1, h/8)) is a heuristic; tune with real miss examples.
- Burned-in output labels need a font pipeline (deferred, noted in review).

---

# Nymkeep handoff — 2026-09-21 (mask opacity + padding fix, Muse Spark)

## Changed files

- `src-tauri/src/shots/boxes.rs`: `map_to_boxes` now pads every box by
  max(2, h/10) px per side (glyph edges no longer peek). New test
  `padding_covers_glyph_edges`; updated occurrence coords.
- `src/App.css`: `.shot-box` and `.shot-box.manual` are solid black now, so
  the preview matches the redacted output. Excluded/draft states unchanged.
- `D:/Nymkeep/sdk-libs/bcrypt.lib`: generated from System32 (was the next
  missing link lib after the shots changes pulled new deps).

## Commands run

- `cargo test -j 1`: 51/51. Dev app relaunched with fixes.

## Open risks

- User-reported OCR misses need concrete examples (which words, what image)
  before tuning thresholds or padding further.

---

# Nymkeep handoff — 2026-09-21 (screenshot UI session, Muse Spark)

## Changed files

- `src/api.ts`: shot types + `api.shots` (status/detect/redact).
- `src/shots.ts` (new) + `tests/Shots.test.ts` (new, 9 tests): dataURL parse,
  box toggle/clamp/flatten, base64 blob.
- `src/components.tsx`: `image` icon. `src/App.tsx`: Screenshot nav + view
  (paste/drop/file input, Detect, preview with toggle boxes + drag brush,
  Copy redacted image via ClipboardItem, Copy safe text, Start over).
- `src/App.css`: shot dropzone/preview/box/actions styles.
- `TASKS.md`: SP-027 in_progress. `CURRENT_STATE.md`: vitest 20 -> 29.

## Commands run

- `npx tsc --noEmit` clean, `npx vitest run` 29/29, `npm run build` clean.
- `npm run tauri dev` launched (run-dev.ps1); nymkeep.exe running.

## Assumptions

- Clipboard image write uses `navigator.clipboard.write` (Chromium/WebView2).
  If it fails on a machine, the message says so; Rust-side write is the fallback
  task.
- Redact-all-words UX: detectors decide sensitivity; brush covers OCR misses.
- The 2 lib warnings (unused hex_decode/verify_manifest on Windows) predate
  this session; Linux manifest path still uses them.

## Open risks

- Real OCR accuracy on screenshots unmeasured (SP-027 benchmark still open).
- User test of the full Detect -> review -> Copy flow pending (app is running).

---

# Nymkeep handoff — 2026-09-21 (shot backend session, Muse Spark)

## Changed files

- `src-tauri/src/shots/{mod,ocr,boxes}.rs` (new): isolated SP-027 component.
  OCR backends (Windows in-OS via `windows` 0.62 + `windows-future` 0.3 channel
  blocking; Linux PP-OCRv6 Small via ORT with manifest verify), word->pixel
  mapping, black-box redact, detect/redact pure functions with 9 unit tests.
- `src-tauri/src/lib.rs`: `pub mod shots`, `shots_status/shots_detect/
  shots_redact` commands, `Mutex<shots::ShotState>` managed state. Removed the
  duplicate `ShotState` (kept the one in `shots/mod.rs`).
- `src-tauri/Cargo.toml`: `image`, `base64`, `windows` 0.62, `windows-future`
  0.3 deps. `src-tauri/tauri.conf.json`: `models/ocr/*` resources.
- `src-tauri/models/ocr*`: PP-OCRv6 Small det/rec/dict + manifest + download
  script. ROADMAP SP-027: Linux-bundled decision. TASKS: SP-027 row.
  CURRENT_STATE: test count 41 -> 50.

## Commands run

- `cargo check -j 1`, `cargo fmt`, `cargo test -j 1` (50/50) with the
  machine-recovery env (MSVC on PATH, INCLUDE/LIB/RC, `RUSTFLAGS="-C
  debuginfo=1"` for link memory).

## Assumptions

- `windows-future` 0.3 matches `windows` 0.62 (0.2 does not). Async WinRT calls
  block via Completed-callback + channel; no executor added.
- Linux OCR compiles but never ran here (no Linux); gated tests cover Windows
  paths + pure logic only. Frontend canvas UI is the next session.
- `general_purpose` (not `general`) is the correct `base64` 0.22 path.

## Open risks

- Real OCR accuracy on screenshots is unmeasured (needs the SP-027 benchmark).
- `platform/mod.rs` guard edit from the rename wave is style-only.

---

# Nymkeep handoff — 2026-09-21

## Changed files

- `src/components.tsx`, `src/App.tsx`, `src/App.css`: added and integrated the
  Nymkeep identity while preserving navigation and action icons.
- `public/nymkeep-mark.svg`, `public/nymkeep-brand-board.png`, `index.html`, and
  `src-tauri/icons/**`: added the canonical geometric `N`, concept board, favicon,
  and regenerated platform icon bundles. The mark remains distinct at 16 px.
- `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`: aligned product metadata
  with the Nymkeep name and Klippers authorship.
- `src-tauri/target/debug/nymkeep.exe` (generated): rebuilt through the Tauri CLI
  in `custom-protocol` mode so the production frontend is embedded and the desktop
  app does not depend on the Vite `localhost:1420` development server. The icon
  extracted from the executable is an exact 32 x 32 pixel match for
  `src-tauri/icons/32x32.png`.
- `src-tauri/src/platform/mod.rs`: corrected target OS configuration guards.
- `ROADMAP.md`, `TASKS.md`, `CURRENT_STATE.md`, `TEST_MATRIX.md`, `DESIGN.md`:
  brought the product plan, shipped scope, design system, and verification record
  up to date.
- `BRAND.md`: records the Nymkeep naming rationale, preliminary clearance,
  rejected conflicting names, mark construction, and competitor position.
- Repository and machine-recovery paths now use the single root `D:/Nymkeep`.
  Legacy product-name literals, environment fallbacks, workflow paths, generated
  results, and old Rust build artifacts were removed.
- `Nymkeep_Product_Engineering_Build_Spec_v0.1.docx`: renamed and rebranded all
  document text, headers, metadata, UI artwork, and architecture artwork. A
  19-page native Word render confirmed the layout remains intact.

## Commands run

- `node node_modules/@tauri-apps/cli/tauri.js icon public/nymkeep-mark.svg`
- `node node_modules/prettier/bin/prettier.cjs --write ...`
- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vitest/vitest.mjs run` (20 tests)
- `npm run build`
- `cargo test -j 1` with the documented machine-recovery environment (41 tests)
- `cargo fmt --check`
- `node node_modules/prettier/bin/prettier.cjs --check ...`
- `cargo clean -p nymkeep` followed by `cargo build -j 1` with the documented
  machine-recovery environment and `TEMP`/`TMP` redirected to `D:`
- Extracted the associated icon from `nymkeep.exe` and compared all 1024 pixels
  against `src-tauri/icons/32x32.png` (0 differing pixels)
- Built the frontend directly with local TypeScript/Vite binaries, then ran
  `tauri build --debug --no-bundle` with `beforeBuildCommand` disabled because
  this agent shell does not expose an `npm` shim
- Launched the resulting executable with port 1420 closed and captured the live
  window; the Nymkeep Protect UI loaded from embedded assets without a server
- Ran a case-insensitive repository text and filename audit, cleaned the complete
  Rust target directory, and rebuilt from the new root so stale paths and legacy
  package artifacts cannot survive in generated output

## Assumptions

- Existing utility icons were intentionally retained; only the master identity
  changed.
- A plain `cargo build` creates a development executable that expects `devUrl`.
  Use `tauri dev` while developing and `tauri build` for any standalone/offline
  executable.
- The geometric `N` is canonical because its separated source, alias, and return
  segments express reversible pseudonymization without a generic security badge.
- Mobile icon files generated by Tauri remain in the bundle for future targets.
- Name and domain checks are time-sensitive preliminary screening; formal
  jurisdictional trademark clearance remains required before launch.

## Open risks

- The development machine's `C:` drive had roughly 10 MB free at final check;
  future tooling can fail until unrelated disk space is reclaimed.
- Windows signing, real-device application coverage, macOS accessibility, and
  Linux accessibility/Wayland support still require their roadmap gates.
- The UI review shows original and protected text side by side; per-span visual
  highlighting remains tracked under SP-017.
