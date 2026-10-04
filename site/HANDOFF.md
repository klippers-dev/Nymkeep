# Website final handoff: 2026-10-04, SP-032

SP-033/034 follow-up: platform copy now reports the genuine-SDK Windows installer
candidate and implemented Mac AX/Vision/permission paths. Public Windows signing
and installation/device gates, and unrun Mac builds/device verification, remain
explicit. Download links stay disabled; publishing is deferred. See the root
HANDOFF and `docs/release/BUILD_CANDIDATES.md` for the desktop evidence.

## Result and changed files

`index.html`, `styles.css`, `site.js`: Screenshot status is **Built & verified**
with bounded Windows evidence. Roadmap and FAQ agree; signed public installer
readiness stays separate. Local SVG icons share one stroke system, theme icons
describe the next action, and dynamic walkthrough/download updates retain icons.
Active section navigation, interruptible 220ms pointer motion and one-time
workflow/image arrival improve the flow. Keyboard actions are immediate;
reduced-motion changes cancel active animation. Content stays visible without JS.

`tests/Site.test.ts`, test-only native shot cases and current state/design/evidence
docs updated. Publishing/domain setup remains deferred by the user's instruction.

## Validation and commands

- `node .tooling/package/bin/npm-cli.js test`: 62/62 frontend checks.
- `node .tooling/package/bin/npm-cli.js run build`: TypeScript/build pass.
- `node node_modules/vitest/vitest.mjs run tests/Site.test.ts`: 16/16 final site checks.
- `cargo test -j 2 --offline --locked -- --include-ignored --test-threads=1`:
  65 units and 2 native Windows integrations pass. Five formats, GIF first-frame,
  alpha, Unicode PNG overwrite/write error, invalid export preservation and
  manual-only native clipboard verified. Tests use synthetic images only.
- `cargo fmt --check` and changed site/test Prettier checks: clean.
- Live browser: 360/768/1024/1366 widths, both themes, active navigation,
  menu/Escape/focus return/link-close, pointer/keyboard walkthrough, image
  comparison and keyboard FAQ pass. No overflow, missing SVG references or
  console errors. Light badge/body contrast 7.33:1 and 5.9:1 respectively.

## Assumptions, review and release limits

`http://127.0.0.1:4173/#screenshots` is open for review. Final desktop/mobile
proofs are in `../.preview/website-final-{desktop,mobile}-2026-10-04.png`.
No live user text/image inputs, storage, tracking or external services were added.
Native GUI/destination-app/device matrix, signed healthy-SDK packaging, independent
privacy review and performance gates are still documented for public release.
Mac/Linux/Wayland support needs real implementation/device evidence.

---

# Previous website polish handoff: 2026-10-04, SP-031

## Changed files and result

- `index.html`: hero links directly to image masking; clearer screenshot flow
  describes optional OCR, manual drag/keyboard boxes, actual preview, native image
  copy and PNG save. Real native OCR/clipboard verification is distinguished from
  broader release testing. Windows/macOS/Linux status has a flat, readable layout;
  no unsupported badge, invented date or public installer link.
- `styles.css`: subdued hero capability line, responsive platform status columns,
  and anchor offsets that land the content below the sticky header.
- `README.md`, `tests/Site.test.ts`: capability/release evidence updated. Fixed
  synthetic walkthrough and before/after PNGs retained; no private uploads/forms.
- Evidence and gates: `../docs/FEATURE_VERIFICATION.md`,
  `../docs/release/PLATFORM_STATUS.md`, `../HANDOFF.md`.

## Verification

- Full frontend **59/59**, app production build/TypeScript **pass**; final website
  test rerun covers all **13** site behaviors after verified capability copy.
- Native **61/61** units plus **2/2** explicit Windows integration checks pass:
  actual OCR → detection → black PNG → OCR reread, and native clipboard pixel
  round-trip on an isolated noninteractive window station. `cargo fmt --check`
  is clean; previous drift and Windows dead-code warnings are resolved.
- Website light/dark and 360/768/1024/1366 px layouts reviewed with no horizontal
  overflow. Comparison, keyboard FAQ, menu/Escape/link-close, local image loading
  and absence of console warnings/errors verified. Final proofs are saved under
  `../.preview/`; the review tab remains available at localhost:4173.
- Final proof files: `website-polish-review-2026-10-04.png`,
  `website-polish-mobile-2026-10-04.png` and `website-polish-full-2026-10-04.png`.
  Temporary viewport overrides are reset before handoff.
- Final proof files: `website-polish-review-2026-10-04.png`,
  `website-polish-mobile-2026-10-04.png` and `website-polish-full-2026-10-04.png`.
  Temporary viewport overrides are reset before handoff.

## Assumptions and release limits

Publishing/domain/hosting is explicitly deferred by the user. Signed installer
connection remains pending; `release.js` is unchanged. Windows is closest to
release. Mac/Linux implementation and real device/compositor checks remain, with
no reliable calendar ETA. Native GUI save-dialog, destination-app paste, language,
High-DPI, privacy/performance and signing checks still gate public release.

---

# Website capability handoff: 2026-10-04, SP-029

## Changed files

- `site/index.html`, `site/styles.css`, `site/site.js`: dedicated screenshot
  section, accessible Original/Redacted comparison, permanent-versus-reversible
  explanation, expanded detector/utility coverage, image FAQ, and dated
  built/testing/planned status. Existing design and release configuration retained.
- `site/assets/screenshot-original.png`, `screenshot-redacted.png`: fixed
  1120 × 620 synthetic input and actual Windows backend output (~53 KB combined).
- `src-tauri/tests/screenshot_workflow.rs`, `src-tauri/tests/fixtures/synthetic-note.png`:
  explicit Windows OCR integration test; checks email/IP detection, every opaque
  black pixel, unchanged dimensions/surrounding pixels, and real OCR reread.
- `scripts/create-shot-fixture.ps1`: optional local synthetic fixture generator.
- `scripts/preview-site.mjs`: adds exactly the two new public image assets.
- `tests/Site.test.ts`: two behavior/status checks added, now 13 website tests.
- `docs/FEATURE_VERIFICATION.md`, `CURRENT_STATE.md`, `TASKS.md`, `site/README.md`,
  root `HANDOFF.md` and this file: audit evidence, limits, corrected state and handoff.
- Generated `dist/` refreshed by the required app production build. Review images
  live under ignored `.preview/`. No native runtime implementation files changed.

## Commands and validation

- Read architecture, decisions, current state, AGENTS and SP-029 ticket before code.
- `powershell -NoProfile -File scripts/create-shot-fixture.ps1`: created only
  fictional email and reserved example IP input; no user/customer PII.
- `cargo test -j 2 --test screenshot_workflow -- --ignored`: **1/1 pass** with
  actual Windows OCR. Used `NYMKEEP_SHOT_EVIDENCE` to save the redacted website
  asset. Ran with the documented machine-local MSVC recovery environment.
- `cargo test -j 2`: **57/57 pass**, including actual NER inference. The new OCR
  test is ignored in ordinary runs because it needs an installed Windows language.
- `npm test` via `node .tooling/package/bin/npm-cli.js test`: **42/42 pass**.
- `node node_modules/vitest/vitest.mjs run tests/Site.test.ts`: **13/13 pass**
  after the final OCR-text copy description and HTML formatting update.
- `npm run build` via `node .tooling/package/bin/npm-cli.js run build`: **pass**.
- Prettier check on touched site JS/HTML/CSS, preview script and site tests: pass.
  `node --check` on changed scripts and `rustfmt --check` on new integration test: pass.
- `cargo fmt --check`: **fails on pre-existing drift** in native `lib.rs` and
  `shots/boxes.rs`. No unrelated formatting changed. Two existing OCR dead-code
  warnings remain.
- Browser reviewed at 360, 768, 1024 and 1366 CSS pixels: no horizontal overflow
  in checked layouts. Comparison buttons have 44 px touch targets. Original/
  Redacted states, keyboard selection, mobile menu/link close, native image FAQ
  keyboard expansion and both themes verified. Both image assets load; no browser
  console warnings/errors. Uses the existing checked semantic color tokens.
- Review proof: `.preview/website-image-review-2026-10-04.png` (desktop) and
  `.preview/website-image-mobile-2026-10-04.png` (mobile). Full page saved as
  `.preview/website-full-page-2026-10-04.png`. Preview refreshed and left open
  at the image section; viewport overrides reset before handoff.

## Assumptions and open risks

- Source and tests establish implementation, not broad platform or OCR accuracy.
  Only one clear English synthetic screenshot was tested through actual OCR.
  Website examples stay fixed and do not accept private uploads or text.
- No privacy/architecture behavior changed, so no ADR needed. Signing, license
  credentials and machine-local recovery files were not modified.
- Actual native image Detect → review → Copy/paste, additional images/languages,
  and clipboard permissions/formats remain unverified. The current UI disables
  manual-only export until Detect succeeds; recorded under SP-027, not advertised
  as an OCR-independent workflow. See the detailed capability audit.
- Public signing, independent privacy review, performance, app/device matrix and
  additional platforms remain open. No installer URL or public hosting added.
- Preview server restarted to load its updated asset allowlist; stays loopback-only
  at `http://127.0.0.1:4173`. Previous SP-028 handoff follows for history.

# Website handoff: 2026-10-03, SP-028

## Changed files

- `site/index.html`, `site/styles.css`, `site/site.js`: redesigned existing page,
  preserving canonical identity and section anchors. Fixed fictional three-stage
  walkthrough, light/dark theme switch, responsive navigation and native FAQ.
- `site/release.js`: empty configuration keeps the public release pending. A
  verified signed HTTPS installer URL and version activate download entries and
  availability copy together. No desktop release was performed.
- `site/assets/shortcut-keys.jpg`: generated shortcut illustration, 224 KB JPEG,
  lazy loaded with reserved dimensions. Not a shipped hardware photograph.
- `scripts/preview-site.mjs`, `package.json`: loopback-only `preview:site` server,
  public-asset allowlist, CSP and no network connection from page scripts.
- `tests/Site.test.ts`: 11 behavior tests for walkthrough, theme, menu, valid/invalid
  release configuration, fallback content and local links/assets.
- `site/README.md`, `README.md`, `DESIGN.md`, `TASKS.md`, `.gitignore`,
  `HANDOFF.md`, `site/HANDOFF.md`: preview/release/design/task documentation.
- Generated `dist/` refreshed by required app build. Previous website backed up
  under ignored `.preview/site-before-2026-10-03/`; this checkout has no `.git`.
  Review screenshots are saved in ignored `.preview/`.

## Commands and validation

- Read architecture, decisions, current state, agent instructions and TASKS;
  added SP-028 before touching website code.
- `npm test` via `node .tooling/package/bin/npm-cli.js test`: **40/40 pass**,
  29 existing app/helper tests and 11 new website tests.
- `npm run build` via `node .tooling/package/bin/npm-cli.js run build`: **pass**.
- `cargo test -j 2` in `src-tauri/`, documented local recovery environment with
  `RUSTFLAGS=-C debuginfo=1`: **57/57 pass**, including real NER inference.
  Two pre-existing Windows OCR dead-code warnings remain.
- `cargo fmt --check`: **fails on existing formatting** in `src-tauri/src/lib.rs`
  and `src-tauri/src/shots/boxes.rs`. No native code changed for this task.
- `node --check` on website scripts and preview server: pass.
- Prettier on touched website, test, preview and package files: pass. Test file
  formatting was applied through the file tool because shell writes were denied.
- Browser reviewed at 360, 768, 1024 and 1366 CSS pixels. No horizontal overflow
  in checked headings/actions/surfaces. Laptop hero and CTA fit first viewport.
- Verified light/dark themes, Protect/reply/Restore/replay, mobile Menu/Escape,
  link-close and keyboard FAQ expansion. No browser console errors/warnings.
- All local assets resolve. Checked semantic text/accent contrast is at least
  **5.56:1** across both themes. The canonical brand mark is unchanged.
- `node scripts/preview-site.mjs`: running at `http://127.0.0.1:4173` for review.

## Assumptions

- Scope is website design and local review. Desktop release/signing and public
  hosting are later work. No installer, price, date or platform support invented.
- Website does not accept private text, access clipboard, call an AI/detector,
  load remote fonts/assets, or log/submit text. Demonstration is fixed fiction and
  visibly illustrative. No app architecture or privacy behavior changed; no ADR
  needed. Session-only theme override uses no browser storage.
- Set `site/release.js` only after verifying the public signed installer. Also
  update roadmap/SEO release wording at that time. See `site/README.md`.

## Open risks

- Signed packaging, real-device coverage and privacy review remain release gates.
  macOS/Linux/Wayland support remains unverified. Development-only SDK recovery
  was not touched or packaged into the website.
- Pre-existing Rust formatting drift remains open, outside the website scope.
- Lighthouse is not installed; audit scores and Core Web Vitals are unmeasured.
  Site has no remote runtime dependencies and only one lazy-loaded 224 KB raster.
- Preview requires its server to stay running. No public deployment was requested
  or created. Final visual approval remains with the user.
