# Desktop release status — 2026-10-04

The shared Tauri/Rust application is implemented; this is not evidence of a
shipping build on every OS. Public website hosting and domain setup are deferred
at the user's request. No public installer URL is configured.

| Platform       | Current evidence                                                                                                                                                                                                                                                                                         | Work before a public release                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 11 x64 | Genuine-SDK x64 NSIS installer candidate built from clean staged source, with app-local Microsoft runtime and hash-verified bundled model. Actual synthetic Windows OCR, pixel and isolated native clipboard evidence.                                                                                   | OS signing/updater verification, installation/uninstallation/update and full GUI Copy/Save/paste checks, accessibility, complete license inventory, independent privacy review, performance and compatibility matrix. |
| macOS          | AXSelectedText capture, explicit Accessibility controls and bounded offline Swift/Vision helper implemented. Hosted Apple Silicon and Intel Rust/Swift/model checks and native Vision redaction fixtures pass (CI 37198309905). macOS 13.3 minimum; no interactive permission/installer device evidence. | Installable app/DMG builds, AX deny/grant/revoke and app compatibility, clipboard/save/shortcuts/tray, signed/notarized packaging and real Mac test pass.                                                             |
| Linux          | Hosted Ubuntu 24.04 Rust build/model tests pass. PP-OCR resources have fail-closed manifest/size/hash validation and deb/AppImage configuration. Capture adapters and Wayland shortcuts remain incomplete; no compositor/device evidence.                                                                | Installable packaging and actual Linux OCR/export checks, AT-SPI/X11 capture, GNOME/KDE portal shortcuts and real compositor tests.                                                                                   |

## Fastest release sequence

1. Finish Windows device and privacy checks, produce the signed candidate in CI,
   verify installation/update/uninstallation, then connect its verified HTTPS
   download to `site/release.js`.
2. Build and validate the implemented macOS path on a real Mac. Verify permissions, native image
   paths and signing/notarization before displaying a supported badge.
3. Validate Linux packaging/OCR on X11, then finish and test Wayland on GNOME and
   KDE. Report each environment separately rather than a blanket Linux claim.

No reliable calendar ETA can be established from the available Windows machine.
Mac builds/device access and remaining Linux adapters are material dependencies.
The website reports these gates directly and does not show unverified downloads.
See `BUILD_CANDIDATES.md` for the clean build path, unsigned candidate workflow
and protected CI signing path. Website publishing remains deferred.

## Screenshot release checklist

- Clear English synthetic fixture through Windows OCR/detection/pixel masking.
- Native image clipboard round-trip with every resulting pixel compared, using
  an isolated Windows clipboard so the user's clipboard is never touched.
- Native Save PNG: cancel, overwrite consent, writable/unwritable locations and
  output re-open; exported pixels match the backend preview.
- Paste exported images into the Windows app matrix; test clipboard contention.
- Manual-only flow with OCR unavailable, repeated detection, tiny boxes, pointer
  and keyboard controls, navigation/session clear and blur privacy.
- High-DPI and rotated images, all advertised formats, image-size limits, small or
  blurry text and supported OCR languages on real devices.
- Original image/recognized text never appears in logs, toasts, sidecar files or
  outbound requests. Review remains mandatory; faces/objects are manual.

Automated evidence and exact commands are recorded in `HANDOFF.md` and
`docs/FEATURE_VERIFICATION.md`. GUI and platform checks are separately tracked in
`TEST_MATRIX.md`; passing unit tests does not close those release gates.
