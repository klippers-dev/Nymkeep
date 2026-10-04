# TEST_MATRIX.md

## Automated (this machine, Windows 11 x64)

- `cargo test -j 2 --offline --locked`: 65/65 pass (detectors, manual review terms, expiry and
  session correctness, atomic failures, restore contract, rules, shortcuts, NER
  with real model inference, graceful NER-off, screenshot mapping, bounded image
  normalization/EXIF orientation, all five supported formats, GIF first-frame,
  transparency, Unicode PNG overwrite, invalid export preservation and write errors).
- `cargo test -j 2 --offline --locked -- --include-ignored --test-threads=1`:
  65 units plus 2/2 Windows integration checks pass. Actual OCR → detect → pixel
  masking → OCR reread, and native clipboard round-trip in an isolated child
  window station, including manual-only export and rejection preserving the prior
  safe image. Ordinary cross-device/CI runs skip the integration checks.
- `vitest run`: 62/62 pass (21 App + 13 ScreenshotView + 12 image helpers +
  16 website tests). Manual-only export, OCR error/re-detect, stale results,
  copy failure/save cancellation, keyboard coordinates and draft privacy covered.
- Vite production build: passes; TypeScript `--noEmit`: passes.
- `cargo fmt --check`: clean.
- Prettier check for changed frontend, website, tests and workflow: clean.

## Manual app matrix (to run on a real device)

| OS                   | Apps                                                       | Shortcut path             | Selection path                 | Result  |
| -------------------- | ---------------------------------------------------------- | ------------------------- | ------------------------------ | ------- |
| Windows 11           | Notepad, Word, Chrome/Edge, VS Code, Slack/Teams, terminal | RegisterHotKey via plugin | UI Automation + fallback       | pending |
| macOS current        | TextEdit, Word, Chrome/Safari, VS Code, terminal           | global shortcut           | AX adapter pending -> fallback | pending |
| Ubuntu GNOME Wayland | editor, Chrome/Firefox, VS Code, terminal                  | portal adapter pending    | AT-SPI pending -> fallback     | pending |
| Ubuntu X11           | same set                                                   | native                    | AT-SPI pending -> fallback     | pending |
| KDE Plasma Wayland   | browser, editor, terminal                                  | portal adapter pending    | AT-SPI pending -> fallback     | pending |

## Wayland notes

Do not mark supported until XDG GlobalShortcuts bind + activation pass on real
GNOME and KDE compositors. Portal consent during onboarding is normal.

## Screenshot GUI and release matrix

Backend/native clipboard tests passed with synthetic data. Native application
automation was unavailable in this environment; no complete GUI device pass is
claimed. Check choose/drop/paste, recognition unavailable, manual-only boxes,
actual preview, Copy/paste into destination apps, Save dialog cancel/overwrite,
keyboard/screen-reader review, High-DPI, rotation, formats and supported languages.
Use fictional fixtures only. Mac/Linux native checks remain pending.

SP-033/034: 69 Rust units and both explicit native Windows checks pass on the
genuine SDK from clean staged source. Mac permission UI (deny/request/check and
no prompt on Settings open), bounded OCR response validation and fail-closed Linux
model pack verification pass on Windows. Standalone AX adapter Rust metadata checks
pass for Apple Silicon/Intel. Swift/app build, native Vision fixture, AX permission
and destination-app Mac tests are prepared for native CI/device runs, not executed here.
Windows NSIS payload extraction/model/runtime hashes are checked without installation;
installer GUI, clean-device launch, uninstall and signing remain device/release gates.

## Website review

Light/dark and 360/768/1024/1366 CSS-pixel layouts checked, with no horizontal
overflow. Image comparison, keyboard FAQ, mobile menu/Escape/link close and local
assets and SVG symbol references verified; no console warnings/errors.
Pointer walkthrough motion is interruptible, keyboard changes are instant, and
reduced-motion preference changes cancel active animation. Active section navigation
and one-time visible-content enhancements have automated coverage. Platform statuses distinguish built
Windows functionality from remaining Mac/Linux implementation and device work.
Publishing/domain setup is explicitly deferred. See `site/HANDOFF.md` for proof.
