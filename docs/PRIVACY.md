# Privacy, implementation and limits

Nymkeep is a local review tool. Its source can be inspected and built by others;
an independent privacy audit remains a release gate.

## Text and images

Protect/Restore use local Rust rules and optional local ONNX NER. Screenshots use
local OCR to produce text and coordinates, then the same rules/NER to propose
sensitive regions. NER covers names, organizations and locations; deterministic
validators cover supported structured identifiers. Manual review remains needed.

Windows uses Windows OCR; macOS has an offline Swift/Vision implementation that
awaits native validation; Linux has a hash-checked local OCR pack while capture
adapters remain incomplete. See `FEATURE_VERIFICATION.md` for actual evidence.

No processing command uploads input, output, images or OCR text. Missing resources
disable their feature rather than downloading them at runtime. Explicit developer
provisioning contacts model hosts; installer/update delivery is separate network
activity. The static website shows fictional examples and has no live text/image
processing, analytics or upload form.

## Storage and lifecycle

- Drafts, OCR results and session mappings live in memory. Idle mappings expire
  after 30 minutes; Quit ends the session. Closing hides the app to the tray.
- Original values stay hidden until revealed. Blur/navigation hides sensitive
  review content; navigation/reset invalidates pending image work.
- Saved custom rules and preferences are plaintext on the device. Custom rules
  can themselves contain sensitive terms; use them intentionally.
- Copying and screenshot export are explicit actions. Clipboard history/sync and
  destination apps may retain copied results. Restore deliberately puts original
  details back in the restored text.
- PNG export replaces selected pixels with opaque black and re-encodes the image.
  It does not preserve an original sidecar. Unselected pixels remain visible.

## Review and threat boundaries

Reversible aliases are pseudonymization. A recipient may infer identities from
context; detection can miss information. Preserve the session while restoring a
reply. Unknown tokens stay unchanged. Image redaction is permanent in the export
and cannot be restored through the text session.

The project does not protect against a compromised OS, memory inspection, private
clipboard history, a malicious destination app or information left unmasked.
See `../THREAT_MODEL.md`, `../ARCHITECTURE.md` and `../src-tauri/src/`.

Tests use synthetic data. Raw originals, OCR text, images and chosen filenames
must not appear in logs/toasts or public reports. See `../SECURITY.md` for private
disclosure. Support/signing claims require actual evidence; source availability
alone does not establish them.
