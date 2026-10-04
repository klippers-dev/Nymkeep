# ROADMAP.md — prioritized improvement plan (multi-agent review doc)

## Why this file exists

This is the single review surface for all future product work. Any agent (human
or AI) who wants to opine on, refine, or implement an item below must read this
file first, then the linked context, then record their opinion in the Review log
at the bottom before writing code.

## 2026-09-21 product checkpoint

The desktop beta now has a complete four-view workflow: Protect, Restore,
Session, and Settings. Users can review original and protected text side by
side, correct a missed phrase from the source editor, copy the safe result, and
restore an AI reply while mappings remain active. Originals stay hidden in the
Session view and are removed from component state when the window loses focus.
The application now uses the Nymkeep identity: a geometric `N` built from source,
alias, and return segments, used consistently in the window, favicon, and OS icon
bundles. The coined name passed preliminary product, app-store, indexed trademark,
and domain screening; formal jurisdictional clearance remains a launch gate.

The next release gates remain SP-009 (privacy audit), SP-010 (Windows device and
application matrix plus performance), and SP-014 (signed package). After those
gates, finish the highlighted-span portion of SP-017 and the first-run guidance
portion of SP-018. SP-015 and SP-016 are the next large user-value features.
Platform expansion (SP-011 through SP-013) follows the Windows beta evidence;
commercial and team work (SP-021 through SP-023) stays later.

## Required reading order

1. `ARCHITECTURE.md` — components, data flow, public contracts.
2. `DECISIONS.md` — ADRs; architecture/privacy changes need a new ADR first.
3. `CURRENT_STATE.md` — what is verified today and what is Honest-gap.
4. `THREAT_MODEL.md` — prohibitions (no raw PII in logs/toasts/network, no
   perfect-detection claims, keys only in CI).
5. `AGENTS.md` — ownership rules: one task = one branch = one owner agent.

## How to review (protocol for agents)

- Do NOT edit two items at once. Claim exactly one SP id by appending your name
  and date to its line in `TASKS.md` (`open` -> `in_progress (owner, date)`).
- Opinions go in the Review log below, dated and signed, with reasoning — not
  drive-by edits to the plan itself. Plan edits need a second agent's ack.
- Every item ships with tests plus a HANDOFF note (changed files, commands run,
  assumptions, open risks), per `AGENTS.md`.
- Privacy-sensitive behavior (detection, restore, mapping lifetime, telemetry)
  needs a security-reviewer ack before merge.
- Synthetic fixtures only. Never paste real user/customer PII anywhere.

## Status legend

`open` = reviewed, unclaimed. `in_progress` = claimed. `done` = merged + tested.
`deferred` = explicitly postponed with reason.

---

## Tier 1 — direct user value (build first)

### SP-015 — Policy presets + custom regex builder

**Problem:** Office users (e.g. Klippers workflows) have their own ID formats
(`EMP-12345`, ticket codes, project codenames). Built-in detectors plus manual
custom terms are not enough; users need per-category control.
**Proposal:**

- Per-category switches (each detector class on/off) and per-category mode:
  `Placeholder` (reversible, e.g. `EMAIL_1`), `Generic` (one-way label such as
  "office user" / "the client", keeps AI context without restore), `Remove`
  (delete the span entirely).
- Custom regex builder in Settings: name + pattern + test-against-sample field,
  validated before save (reject catastrophic patterns, cap length/count).
- Named policy presets ("Office paste", "Support ticket") saved to app data,
  one-click switching; preset name shown in the review window and toast.
  **Scope hints:** `core.rs` (rules model, modes), `lib.rs` (commands, persistence),
  `src/` (policy editor UI). Persist alongside `PrivacyRules`.
  **Acceptance:** unit tests for each mode incl. roundtrip rules (Placeholder
  restores; Generic/Remove never restore); preset save/switch/rename covered;
  invalid regex rejected with a clear message; no raw PII in toasts.
  **Open questions:** max presets? Should Generic labels be user-editable per
  category? Team-shared presets now or in SP-022?

### SP-016 — Excel/Word COM capture (Windows)

**Problem:** Excel cells do not expose selection through UI Automation, so Excel
falls back to clipboard mode (`Ctrl+C` first). Word works; Excel is the gap,
and it is where the data-heavy work happens.
**Proposal:** When the foreground app is Excel/Word, read the selection through
Office COM automation (cell range / document selection) instead of the
clipboard. Clipboard fallback stays, stays labeled. Word keeps working as today.
**Scope hints:** `platform/windows.rs` (+ new `platform/office.rs`), no detector
changes, UI already labels modes.
**Acceptance:** integration tests with synthetic workbook/doc content; fallback
still triggers when COM is unavailable (app closed, permission denied) with the
labeled message; no clipboard writes in COM path; no COM objects leaked.
**Open questions:** minimum Office version to support? Handle password-protected
files by falling back (never prompt for secrets)?

### SP-017 — Diff review view

**Problem:** Users do not trust what they cannot see. A counts-only result hides
whether the _right_ things were masked.
**Current:** The side-by-side review surface has shipped. Span highlighting and
its screen-reader equivalent remain.
**Proposal:** Side-by-side original vs protected text with changed spans
highlighted, in the review window only (never in toasts). Toggleable; keyboard
accessible; honors reduced-motion.
**Scope hints:** `src/` only. No core changes (spans already returned via
mappings; align by token positions).
**Acceptance:** highlights match actual replacements 1:1 on the test corpus;
large inputs stay responsive (cap highlighted spans, virtualize if needed);
screen-reader text alternative for the diff.
**Open questions:** show mapping table inline in diff, or keep separate?

### SP-027 — Screenshot redact mode (inside Nymkeep, not a separate app)

**Problem:** Screenshots shared on Slack/WhatsApp/Twitter leak emails, names,
keys, and account numbers. Users either risk it or black out boxes by hand in
Paint. macOS has a paid answer (CleanShot); Windows has no equivalent with
automatic PII redaction.
**Proposal:** A "Screenshot" mode in the existing window, reusing the tray,
shortcuts, and detector core. Flow: screenshot lands on the clipboard
(`Win+Shift+S`) or is pasted into Nymkeep -> Windows in-OS OCR extracts words
with bounding boxes -> existing detectors mark sensitive words -> preview shows
the image with redact boxes the user must confirm and can add/remove with a
manual brush -> redacted image copied back to the clipboard for pasting
anywhere. A second path extracts the OCR text into the normal Protect flow.
Honest rule, shown in UI: screenshot redaction is ONE-WAY (pixels cannot be
restored), unlike text placeholders.
**Scope hints:** isolated `shots` component, core untouched. Rust:
`src-tauri/src/shots/` with `capture.rs` (clipboard image in/out),
`ocr.rs` (trait + Windows impl + macOS impl, Linux impl behind a pack gate),
`boxes.rs` (word spans -> pixel boxes using `core` as a library). Frontend:
`src/shots/` (mode view, preview canvas, brush tools, download UI). Wiring
only in `lib.rs` (one shortcut + one tray item) and one mode tab in the
window. Contract: OCR emits (text + word boxes) -> `core.protect` returns
spans -> `boxes` maps spans to pixels -> UI renders. Each layer mockable and
tested alone.
**OCR backends (locked):** Windows in-OS OCR (0 MB), macOS Vision (0 MB),
Linux PP-OCRv6 Small det+rec+dict (~30 MB) from the official PaddlePaddle
HuggingFace ONNX repos. Runtime everywhere is the already-linked ONNX
Runtime; no second runtime. No direction classifier in v1 (screenshots are
upright).
**Packs (user decision changed):** the Linux base install BUNDLES PP-OCRv6
Small (~30 MB) so screenshot mode works out of the box; only the extra
language packs (V5 mobile: devanagari, arabic, cyrillic, ta, te) are
on-demand downloads. No silent downloads, ever: language packs download ONLY
when the user presses Download in Settings, with SHA-256 manifest
verification (same pattern as the NER `models/manifest.json` + download
script). Fully offline after download.
**Acceptance:** unit tests for box mapping (word -> pixels) on synthetic
images; OCR-miss cases keep the manual brush as the safety net; Hindi/Hinglish
accuracy measured and stated, never promised; redacted output contains no
recoverable text (verify by re-running OCR on the output in tests); toasts and
logs carry counts only; pack download starts only on explicit user action,
SHA mismatch rejects the pack, and everything works offline afterwards.
**Open questions:** v1 annotation scope (crop + arrow only, rest later)?
Free text-protect vs paid screenshot-redact paywall boundary (see SP-021)?

---

## Tier 2 — polish (fewer support questions, more trust)

### SP-018 — Better errors + onboarding

**Problem:** Errors like "select text in any app first" confuse users who _did_
select text (real case: browser selection is unreadable + clipboard empty).
**Current:** Browser-preview, empty, collision, and desktop-runtime states are
distinct. The complete native error taxonomy and dismissible first-run guide
remain.
**Proposal:** Split failure reasons in messages: unreadable-selection (browsers,
some apps) -> "Couldn't read the selection here — press Ctrl+C first, then the
shortcut." Empty clipboard -> "Clipboard is empty." Collision case keeps its
message plus "remove or rename the conflicting text". Add a first-run 3-step
hint (already a static line; make it a dismissible onboarding card).
**Scope hints:** `lib.rs` error taxonomy (content-free strings), `src/` copy.
**Acceptance:** each failure path produces its specific message in tests;
messages reviewed for no-PII leakage.
**Open questions:** none; small, do it early.

### SP-019 — Auto-protect mode (opt-in, default OFF)

**Problem:** Power users forget the shortcut.
**Proposal:** Optional toggle: every clipboard copy is auto-protected in the
background. Strictly opt-in with a first-enable warning (clipboard is watched
by design here, so consent must be explicit). Tray shows active state.
**Scope hints:** clipboard watcher in `lib.rs`, settings toggle, tray indicator.
**Acceptance:** off by default; enabling shows warning + requires confirm; large
copies still respect the size cap; mappings/TTL unchanged; e2e test.
**Open questions:** exclude list (password managers)? Rate-limit toasts?

### SP-020 — Session history (safe text only)

**Problem:** Users lose a protected copy and must redo the flow.
**Proposal:** Session list of past protected outputs (safe text + counts + time),
re-copy on click. Never stores originals beyond the existing session map.
Cleared with mappings; never persisted.
**Scope hints:** `src/` + a lightweight in-memory store in `lib.rs` or frontend
state (prefer frontend state: no new Rust surface).
**Acceptance:** history holds safe text only (test asserts no originals leak
into it); cap length (e.g. 20); clears with mappings.

---

## Tier 3 — money and teams

### SP-021 — License + trial screen

**Problem:** No paywall, no conversion.
**Proposal:** 14-day full trial, then license-key unlock. Usage counter ("you
protected N items") on the paywall. Offline key validation (signed file) so the
offline-first promise survives. Keys issued externally; validation only in-app.
**Scope hints:** new license module (Rust) + `src/` paywall screen. No network
calls from the app for validation.
**Acceptance:** trial expiry enforced across restarts (clock-tamper resistant
enough for v1: first-run timestamp + monotonic usage counter); invalid keys
rejected with clear message; all detection features work identically in trial.
**Open questions:** trial length final? Seat vs user key?

### SP-022 — Team policies

**Problem:** Per-seat plan needs an admin story.
**Proposal:** Admin-authored policy file (detectors, modes, custom terms/regex,
presets) distributed by file/URL import; members get read-only policies with
local overrides clearly marked. Format versioned.
**Scope hints:** policy schema + import/validate in core, `src/` admin UI.
**Acceptance:** schema version check; invalid files rejected safely; member
overrides never silently widen exposure (overrides can only narrow or stay
equal — decide in review).
**Open questions:** distribution channel for v1 (file import is enough)?

### SP-023 — Audit log (counts only)

**Problem:** Compliance buyers need evidence.
**Proposal:** Local append-only log: timestamp, policy, counts by kind. Never
content, never originals, never tokens-to-original pairs. Export as CSV.
**Scope hints:** small Rust module + settings export button.
**Acceptance:** test asserts no sensitive strings can appear (property-style
test over the corpus); rotation/cap so the file cannot grow unbounded.

---

## Explicit non-goals (do NOT build)

- Browser extension as the core product (companion only, later).
- Cloud inference or any network path for Protect/Restore.
- "100% leak-proof" or "anonymous" claims — pseudonymization language only.
- Hindi/Hinglish NER promises: the model is English; Hinglish names are covered
  by custom terms (SP-015). Benchmarks must state this.

## Review log (append dated, signed opinions below)

- 2026-09-21 (Muse Spark): SP-027 spec added per user request; placed in Tier 1
  as an in-app mode, not a separate product. Reviewed the rename wave
  (HANDOFF.md 2026-09-21): rebrand is consistent (metadata, icons, docs);
  `platform/mod.rs` guard change is style-only (`#[cfg(windows)]` was already
  valid, behavior unchanged); no legacy SafePaste literals found in the plan
  docs. Not yet verified by me: the 41 Rust + 20 vitest tests were not re-run
  in this session, and the nymkeep.exe icon-pixel claim is taken from HANDOFF
  on trust. Suggest any agent re-running tests appends its result here.
