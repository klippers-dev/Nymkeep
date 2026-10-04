# DECISIONS.md (append-only)

## ADR-001: Tauri 2 + React + Rust core

System WebView keeps the bundle far below the 200 MB target (vs shipping Chromium).
One Rust core serves all platforms; UI complexity stays small in React.

## ADR-002: Hybrid detectors, deterministic first

Checksum/grammar-validated patterns (Luhn, IBAN mod-97, octet/IP parse) beat loose
regexes on precision. Overlaps resolve to the whole secret. NER covers only the
ambiguous classes (PERSON/ORGANIZATION/LOCATION).

## ADR-003: onnx-community bert-small-pii-detection (INT8, ~27 MB, Apache-2.0)

Verified live on HuggingFace: token-classification, 49 BIO labels, includes the
three target classes. `model_quantized.onnx` + `vocab.txt` + `config.json` ship as
resources; `scripts/download-model.ps1` + `models/manifest.json` enforce SHA-256.

## ADR-004: ort 2.0.0-rc.13 (pinned)

Only the 2.x line exposes the needed session API; no 2.x stable existed at build
time, so the exact rc is pinned. Re-evaluate when 2.x goes stable.

## ADR-005: Pure-Rust WordPiece, no `tokenizers` crate

`tokenizers` pulls C++ (esaxx/onig) that clashed at link time with the ORT static
build (CRT mismatch). `ner.rs` implements BERT uncased normalization + greedy
WordPiece over `vocab.txt` with exact original-byte offset mapping. Faster builds,
same model, same labels.

## ADR-006: Two-key default shortcuts (Alt+C / Alt+R), user-rebindable

Four-key chords are safe but nobody presses them. Two-key defaults with
registration-time collision detection, rollback to the previous binding, a
recorder, and a tray fallback. Never default to Win-logo, Cmd+Space, or Save-As
combos.

## ADR-007: Machine-local toolchain recovery (DO NOT SHIP)

A failed BuildTools update (exit 1603, SDK uninstalled, no UAC to reinstall)
deleted this machine's Windows SDK. Recovered locally, verified by a full
29/29 `cargo test` green run:

- `D:/Nymkeep/sdk-libs`: 66 import libs regenerated from System32 DLLs with
  dumpbin+lib.exe (forwarded-export parsing, case-sensitive dedupe for pairs
  like `_exit`/`_Exit`, `PathCch` aliased to kernelbase, 2 setup-class GUIDs).
- `D:/Nymkeep/sdk-headers`: minimal CRT headers (vcruntime-based) for ring.
- `D:/Nymkeep/sdk-tools/rc.exe`: windres-backed rc shim (x64 COFF); used via
  the `RC` env var that embed-resource honors.
- `patches/vswhom-sys`: pure-Rust ABI stub via `[patch.crates-io]`.
- `src-tauri/.cargo/config.toml`: explicit linker + `-L` paths (VS detection
  broke too). Build with MSVC bin on PATH, INCLUDE/LIB/RC set, `-j 1`.
  Release/CI builds must NOT include any of this; CI uses a healthy SDK. Remove
  the patch and config before release.

## ADR-008: Pseudonymization language, never "anonymous"

Reversible placeholders are pseudonymization, not anonymization. No perfect-
detection claims. Name detection reports on/off honestly in the UI.

## ADR-009: Review corrections and exact session restoration

Review can protect selected text for the current draft without persisting a rule.
These terms use the same offline detector pipeline; saved rules remain explicit.
Matching is case-insensitive, but differently cased originals get distinct tokens
so restoration preserves the original text exactly. Overlapping detections cover
their entire combined extent; never-protect terms apply to NER as well as patterns.
Conflicting always/never rules are rejected. Failed protection commits no mappings.
Clearing or expiring mappings never resets token counters within the process,
preventing an old answer from restoring to a different original. App restarts still
end the session; answers must be restored in the session that protected them.
Session metadata is exposed separately from originals. The UI requests originals
only after Reveal, hides them on blur/navigation, and clears drafts on session clear.
Background expiry removes idle mappings even while the window is closed; frontend
polling updates counts without extending their 30-minute inactivity lifetime.

## ADR-010: Explicit clipboard actions and persistent utility window

The review window uses native clipboard commands with visible failure states.
Input/output drafts remain in memory, are never logged or persisted, and stale
results cannot be copied after editing. Restored output is labeled sensitive.
Closing the window hides it to the tray; Quit ends the process and session.
Windows secure capture reads only TextPattern selections, never an entire
ValuePattern field. Tray Protect explicitly uses clipboard input. Shortcut changes
apply as a pair with rollback and dispatch against the current saved bindings.
Settings writes must succeed before reporting success. No runtime network access
is added to Protect/Restore; browser previews cannot process private text.

## ADR-011: Explicit offline image review and native redacted export

Screenshot input is normalized locally to an orientation-correct PNG before OCR
or review. Compressed input is capped at 20 MB; decoded images at 16 megapixels
and 8192 pixels per side. Unsupported images fail without logging content.
Manual boxes work without OCR and survive repeated detection or recognition
failure. Only selected nonempty pixel regions may be exported. Export replaces
pixels with opaque black and re-encodes PNG; originals are never saved as sidecars.
Image clipboard reads require an explicit Paste action. Copy uses the existing
native clipboard plugin after backend redaction, rather than WebView clipboard
permissions. Save uses a native PNG save dialog and writes only the generated
redacted image to the user-selected path. Cancellation is not reported as success.
Review images and OCR results live in memory; navigating away, clearing a session
or starting over invalidates pending results and discards image drafts. No image,
recognized text or selected filename is included in logs or toast messages. No
runtime network access or silent model download is added. Missing OCR leaves the
manual workflow available. Additional OS support still requires device evidence.

## ADR-012: Explicit macOS accessibility and native offline Vision helper

macOS secure capture reads only AXSelectedText from the focused accessibility
element after trust has been granted. It never reads AXValue or writes text.
Status reads never trigger permission prompts; an explicit Settings action may
request the standard macOS Accessibility consent. Clipboard fallback remains
labeled and usable without that permission. No screen-recording permission is
requested because screenshot input is explicitly chosen/pasted by the user.

macOS screenshot OCR uses a small native Swift/Vision helper packaged inside the
app, built for each target architecture and included in normal app signing.
Rust supplies normalized PNG bytes over a local stdin pipe, with bounded input
and output. Recognized text and boxes return over stdout; errors are generic.
No image/text files, command-line payloads, network, logs or runtime downloads.
Recognition preserves punctuation and maps each non-whitespace token's Vision
rectangle from lower-left normalized coordinates to top-left image pixels.
Manual masking remains available when the helper fails or is missing. This is
an implementation contract, not macOS device certification.

## ADR-013: Clean candidate staging separate from local toolchain recovery

Installer builds use an allowlisted source staging directory. The vswhom-sys
machine-local patch, .cargo/config.toml, recovered SDK folders, development
tooling, prior binaries and private files are excluded. The clean lockfile uses
the official registry dependency; hashed model resources are verified before
packaging. A local candidate may be unsigned and clearly identified for review,
but it must use genuine vendor SDK files. Signing/notarization remains CI-owned.
Windows per-user NSIS installation does not require administrator privileges.
macOS candidates include app/DMG builds for Apple Silicon and Intel. Linux
candidates remain separately labeled while adapter/compositor testing is open.
Candidate creation never activates website download links or publishes a release.

## ADR-014: Auditable public source and maintainer-controlled promotion

The project source remains MIT licensed, with third-party model/runtime licenses
kept separate. Public source is exported through a reviewed allowlist, using
the sanitized Cargo manifest/lock from ADR-013. Machine recovery, credentials,
generated models, build outputs and internal installer artifacts never enter Git.
Model provisioning remains an explicit development/CI step with SHA-256 checks;
Protect/Restore and screenshot processing gain no runtime network behavior.

Contributors work in forks/topic branches and target dev. Tested changes promote
dev → stage → main through pull requests. Main and stage require CI, resolved
review conversations and maintainer review; force pushes and deletion are blocked.
The sole owner may bypass the review requirement through a pull request while
still meeting a separate non-bypassable CI rule. This keeps an auditable path for
owner changes without requiring an impossible self-approval. GitHub configuration
is reported as active only after authenticated application and read-back.
During initial setup, when all three branches still share the bootstrap commit,
the first native CI repair may land on main through a PR after every required
target passes. Sync that verified baseline back to dev/stage through protected
PRs. This seeds the default branch's trusted runtime cache without bypassing CI
or changing the normal dev → stage → main contribution path.
Release tags are maintainer-controlled; CI creates drafts and unsigned candidates
remain internal. Website download URLs are enabled only for verified public
installers, with plain installation instructions for users who do not use Git.

## ADR-015: Pinned source runtime for Intel Mac builds

The pinned ort rc.13 distribution provides no x86_64-apple-darwin binary. Intel
Mac development/CI builds therefore compile Microsoft's ONNX Runtime 1.28.0
from verified commit da9b5e364c465de65c49d91e696cd6485270757f, using CPU static
libraries, release configuration and macOS 13.3 minimum. The existing Rust API,
model hashes and offline inference contract remain unchanged. Generated vendor
sources/libraries stay in ignored build workspace/cache and never enter public
source. CI binds the build cache to the source revision and build script.
No runtime fetch or substitute remote inference is added. Both Mac targets still
need native build/model/OCR evidence and real-device permission/export/signing
checks before a public support claim.
The Intel build omits upstream test binaries and combines runtime/dependency
archives with Apple's libtool, giving ort-sys a single static library rather than
its ambiguous Unix dependency-directory detection. Nymkeep's actual Rust/model
and native Vision checks remain required. No source dependency patch is used.
Static packaging includes the model-package library and explicitly builds RE2,
which upstream excludes from the default static build. FetchContent uses pinned
sources instead of installed libraries. Incremental cache restores reconfigure
the build when its recipe changes; Rust and Swift use the same 13.3 minimum.
Linux native CI/candidate builds use Ubuntu 24.04 so glibc/libstdc++ match the
current prebuilt runtime's ABI. Older Linux distributions are not inferred
supported; capture/compositor/device verification remains open.
