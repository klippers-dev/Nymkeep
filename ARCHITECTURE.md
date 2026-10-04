# ARCHITECTURE.md

## Components
- **Review window** (`src/`): React + TypeScript. Protect/restore panes, kinds summary,
  unknown-token chips, session mappings (explicit Show only), custom-terms editor,
  shortcut recorder, autostart and money/dates toggles, name-detection indicator.
- **Commands** (`src-tauri/src/lib.rs`): `protect_text`, `restore_text`, `get_mappings`,
  `clear_mappings`, `get_rules`, `set_rules`, `get_shortcuts`, `set_shortcuts`,
  `get_autostart`, `set_autostart`, `ner_status`, `capture_status`,
  `request_capture_permission`. Shared `AppCore(Mutex<Core>)`.
- **Core** (`src-tauri/src/core.rs`): deterministic recognizers, overlap resolution,
  stable per-kind tokens (`EMAIL_1`, `PHONE_1`, `TERM_1`...), boundary-aware restore,
  custom always/never terms, opt-in money/dates, 100 KB cap, 10k mapping cap,
  30-minute TTL, collision rejection. No OS calls, no network.
- **NER** (`src-tauri/src/ner.rs`): quantized BERT-small token classifier (ONNX Runtime,
  CPU). Pure-Rust WordPiece over `vocab.txt`, BIO decode for PERSON/ORGANIZATION/
  LOCATION only, 0.80 open threshold, windowed long inputs, lazy load on first
  Protect, SHA-256 manifest check, graceful off when files are absent.
- **Platform** (`src-tauri/src/platform/`): selected-text capture. Windows uses UI
  Automation TextPattern selections. macOS reads only AXSelectedText from the focused
  control with explicit Accessibility consent; status checks never prompt. Linux
  capture remains a stub. Missing/unavailable selections use the labeled clipboard fallback.
- **Shell**: tray menu, global shortcuts (Ctrl+C-style two-key defaults, rebindable,
  persisted, collision rollback), clipboard read/write, OS toasts (counts only),
  autostart, signed-updater wiring.
- **Screenshot review** (`src/ScreenshotView.tsx`, `src/shots.ts`): explicit image
  file/drop/paste, optional OCR suggestions, manual drag or keyboard-coordinate
  boxes, exclusions, actual PNG preview and native Copy/Save. Manual masking
  works independently of OCR. Image drafts are memory-only, hidden on blur,
  discarded on navigation/session clear; stale asynchronous results are ignored.
- **Image backend** (`src-tauri/src/shots/`): bounded, orientation-correct image
  normalization; platform OCR; reuse of core detectors/rules; word-to-pixel
  mapping; opaque black pixel replacement into a freshly encoded PNG. Native
  clipboard and redacted-only file helpers live in `shots/capture.rs`. Commands
  run blocking image/native work off the WebView thread. Windows OCR checks for
  an installed language. macOS runs the bundled Swift/Vision helper over bounded
  local pipes with a 30-second deadline; it creates no image files or content logs.
  Linux OCR uses bundled ONNX resources from Tauri's resource directory and rejects
  missing/invalid manifests, sizes or hashes. Mac/Linux device validation remains pending.

- **Packaging** (`scripts/release/`, platform Tauri configs): allowlisted clean
  staging removes the machine-local Cargo patch and recovery config, restores the
  official locked dependency and keeps signing credentials out of source/artifacts.
  Windows NSIS installs per user; macOS app/DMG includes the native Vision helper;
  Linux deb/AppImage includes OCR resources. Candidate builds disable updater feeds.
  Signed draft builds require real public updater metadata and CI-owned signing.
  See ADR-012/013 and `docs/release/BUILD_CANDIDATES.md`.

## Data flow
Protect: selection/clipboard -> detectors + NER + rules -> stable tokens ->
clipboard (protected text only). Restore: token text -> originals from session map.
Mappings live in memory only and expire. Rules and shortcuts persist in app data
as JSON. Model files are read-only resources, verified by hash.

Image: explicit file/clipboard -> normalize locally -> optional OCR/core detection
-> editable pixel regions -> backend PNG preview -> explicit native clipboard or
native PNG save dialog. At least one selected region is required; no original
sidecar is saved. Limits are 20 MB compressed, 16 megapixels and 8192 pixels per
side. Image masking is permanent and has no Restore operation. No image/OCR
content is sent over the network. See ADR-011 for the privacy contract.

## Public contracts
- `Protection { text, count, mappings, kinds, nerActive }` (camelCase JSON).
- `Restoration { text, known, unknown, unknownTokens }`.
- `PrivacyRules { always, never, moneyDates }`.
- Tokens match `[A-Z][A-Z_]*_\d+` (restore is case-insensitive); collisions in
  input are rejected, never silently remapped.
