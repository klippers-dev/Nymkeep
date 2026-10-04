# Capability verification — SP-029/030/031/032, 2026-10-04

This is a source-and-test audit of the current local Windows development build.
It is not a public-release certification or a complete device/app matrix.
All test data and website examples are synthetic.

| Capability                                                                                                     | Evidence                                                                                                                                                                                                                                                                       | Website wording / remaining limit                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline Protect and Restore                                                                                    | `src-tauri/src/core.rs`, native command wiring in `src-tauri/src/lib.rs`; core and frontend workflow tests                                                                                                                                                                     | Built. Protect/Restore do not transmit raw text. Pasting into an AI service is a separate user action.                                                                                                                                                                                                                |
| Stable per-kind placeholders, exact restore, unknown-token review                                              | Core tests for stable tokens, case variants, boundaries, collision rejection, no partial restore and unknown tokens; review UI tests                                                                                                                                           | Reversible text placeholders within the original live session. No promise of anonymity or perfect detection.                                                                                                                                                                                                          |
| Email, phone, URL, IP, card, IBAN, UUID and supported secret patterns                                          | Core recognizers and validator tests                                                                                                                                                                                                                                           | Pattern checks, not detection of every possible secret format.                                                                                                                                                                                                                                                        |
| Person, organization and location detection                                                                    | `src-tauri/src/ner.rs`, actual ONNX inference tests; frontend active/off indicator                                                                                                                                                                                             | Local model-dependent name detection. Missing models gracefully disable it; names can be missed.                                                                                                                                                                                                                      |
| Draft review and temporary missed-phrase corrections                                                           | `src/App.tsx`, `protect_with_terms`; frontend corrections/copy/stale-result tests                                                                                                                                                                                              | Side-by-side review and explicit copy. Per-span highlighting remains planned.                                                                                                                                                                                                                                         |
| Always/never custom terms; opt-in amounts/dates                                                                | Core rules and settings UI; validation/save-failure tests                                                                                                                                                                                                                      | Built. Custom regex and policy presets are planned.                                                                                                                                                                                                                                                                   |
| Memory-only session map, reveal-on-demand, inactivity expiry, clear and quit                                   | Core TTL tests; frontend reveal, blur, navigation and clear tests; shell expiry wiring                                                                                                                                                                                         | Originals hidden by default, expire after 30 minutes without use. Saved rules/shortcuts are separate local preferences. Clipboard history/sync is controlled by the OS.                                                                                                                                               |
| Alt+C Protect, Alt+R Restore, Alt+J quick capture; rebind/conflict checks                                      | Native parsers, validation and shortcut wiring; settings recorder test                                                                                                                                                                                                         | Built for Windows, app compatibility still needs a broader matrix. Selection capture depends on app accessibility; explicit clipboard fallback exists.                                                                                                                                                                |
| Tray and optional launch at login                                                                              | Shell wiring; frontend autostart save-failure test                                                                                                                                                                                                                             | Built. OS/device behavior remains a release check. Closing hides the app to the tray; Quit ends the session.                                                                                                                                                                                                          |
| Screenshot paste/drop/file intake, optional OCR, manual drag/keyboard boxes, exclusions and actual PNG preview | `src/ScreenshotView.tsx`, `src/shots.ts`, screenshot and App workflow tests; `src-tauri/src/shots/{mod,ocr,boxes}.rs`                                                                                                                                                          | Built & verified on Windows with bounded synthetic evidence. Manual masking works without OCR and survives recognition errors or re-detection. Faces/objects require manual marking.                                                                                                                                  |
| Native image copy and explicit PNG save                                                                        | `src-tauri/src/shots/capture.rs`, asynchronous native commands and `tauri-plugin-dialog`; export failure/cancel tests and native pixel/file tests                                                                                                                              | Backend generates redacted pixels again before every export. No browser clipboard permission dependency or original sidecar. Full native GUI/destination-app matrix remains a release gate.                                                                                                                           |
| Bounded orientation-correct images                                                                             | Native normalization tests including PNG/JPEG/WebP/GIF/BMP, animated GIF first-frame, EXIF rotation, alpha handling, invalid base64, decoded-dimension caps, Unicode PNG overwrite, invalid export preservation and write failure; frontend unsupported/oversized intake tests | 20 MB compressed, 16 megapixels, 8192 pixels per side. Fresh PNG drops original metadata; GIF uses its first frame.                                                                                                                                                                                                   |
| Image draft privacy                                                                                            | Screenshot tests for blur, Start over and stale detection; App navigation/session-clear test                                                                                                                                                                                   | Drafts are in memory, visually hidden when unfocused and discarded on navigation or session clear. Clipboard history is an OS setting.                                                                                                                                                                                |
| Actual Windows image → OCR → detection → redacted PNG                                                          | `src-tauri/tests/screenshot_workflow.rs`, `fixtures/synthetic-note.png`; explicitly run ignored device test                                                                                                                                                                    | Passed for one clear English synthetic image containing an email and a reserved example IP address. Website before/after assets come from this check.                                                                                                                                                                 |
| Actual Windows native redacted image clipboard round-trip                                                      | Same integration suite; real native clipboard plugin inside a child process on an isolated Windows window station                                                                                                                                                              | Passed for OCR-derived and OCR-independent manual boxes: output dimensions and every RGBA pixel match backend redaction. A rejected unmasked export preserves the prior safe clipboard image. The isolated test never reads or replaces the user's clipboard; interactive destination-app compatibility remains open. |
| Opaque pixel replacement with surrounding pixels preserved                                                     | Integration test checks every output pixel and unchanged dimensions; re-runs actual OCR on the output                                                                                                                                                                          | Selected pixels are solid black, alpha 255. Email/IP are absent from the second OCR result; unrelated title remains readable. This is permanent image redaction, with no pixel restore.                                                                                                                               |
| Public installer and additional OS support                                                                     | TASKS SP-009/010/011/012/013/014 and release checklist                                                                                                                                                                                                                         | Not released. Signing, independent privacy review, performance and device checks remain open. macOS/Linux/Wayland support is not verified.                                                                                                                                                                            |

## Reproduce the image evidence

The committed fixture uses only `mira@example.com` and `192.0.2.42`. The optional
PowerShell script redraws it using local Segoe UI; font/OCR results can vary by
Windows environment. The committed PNG is the repeatable test input.

```powershell
powershell -NoProfile -File scripts/create-shot-fixture.ps1
# From src-tauri/, with a working MSVC/SDK environment:
$env:NYMKEEP_SHOT_EVIDENCE = 'D:\Nymkeep\site\assets\screenshot-redacted.png'
cargo test -j 2 --test screenshot_workflow -- --ignored --test-threads=1
```

Device tests are explicitly ignored during ordinary cross-device/CI test runs
because they require an installed Windows OCR language and use the Windows
clipboard. A normal `cargo test` passing does not establish real OCR availability.
The clipboard check runs in a child process on a noninteractive Windows window
station with a separate clipboard. It never reads or replaces the user's clipboard.
No user image was opened, uploaded or modified, and no network OCR was used.

Final explicit Windows invocation passed **2/2** device integration checks.
Unit suite: **65/65**. Frontend: **62/62** (21 App, 13 screenshot review,
12 screenshot helpers and 16 website tests). Production build and formatting pass.

## Screenshot checks before release

- Native GUI Detect → review → Copy → paste into destination apps, save-dialog
  cancellation/overwrite and clipboard contention require the real app matrix.
  Automated frontend mocks do not establish native dialog/device behavior.
- Windows availability now probes an OCR engine for installed profile languages.
  Recognition accuracy and language-specific failures still need device testing;
  the manual workflow remains usable when OCR is unavailable.
- EXIF orientation, bounds and export pixels have automated coverage. Small text,
  blur, non-English languages, real format/device variability and OCR accuracy
  still need broader checks. The clear English fixture is not an accuracy benchmark.
- Presets, custom regex, Office capture, auto-protect, history, licensing/trials,
  team policies and count-only audit logs remain planned; no shipped claims.

## Validation record

See `site/HANDOFF.md` for final test counts, browser checks, changed files,
commands, assumptions and current formatting/release risks.
See `docs/release/PLATFORM_STATUS.md` for Windows/macOS/Linux release dependencies.

## Desktop candidate follow-up (SP-033/034)

The clean Windows SDK run passes 69 Rust units plus two explicit native Windows
screenshot checks. Frontend passes 65 tests, including three Mac permission states;
release/repository tooling passes 12 staging, archive, strict PE comparison and
repository policy checks. Production build/fmt pass.
Windows NSIS candidate payload contains x64 app, verified NER resources and genuine
Microsoft C++ runtime DLLs; archive extraction does not install or execute it.
Mac AX capture and Swift/Vision implementation now exist. Hosted Apple Silicon
and Intel Rust/Swift/model checks and synthetic native Vision redaction fixtures
pass in CI run 37198309905 for PR #10. Real Mac permission, installer
and export device checks remain open.
Linux installed-resource lookup and fail-closed checksum validation are implemented;
hosted Ubuntu 24.04 Rust/model checks pass. Actual OCR/export and capture/compositor
evidence remain pending. Public releases remain deferred.
