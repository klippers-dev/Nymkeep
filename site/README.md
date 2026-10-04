# Nymkeep marketing website

Standalone static HTML/CSS/JavaScript. This is separate from the Tauri review
window in `src/`. All assets are local; there are no analytics, third-party fonts,
forms, clipboard permissions, AI calls or detector calls. The clickable example
uses fixed fictional fixtures and is explicitly labeled illustrative.

## Review locally

From the repository root, run `npm run preview:site` and open
`http://127.0.0.1:4173`. The preview is bound to loopback and serves only the
website's public assets. Keep this process running while reviewing.

The site follows the system light/dark preference. The header's theme button
provides a session-only override, without browser storage. At mobile widths, Menu opens
the section links; Escape closes it and returns focus. Native FAQ disclosures
work with the keyboard. Without JavaScript, the initial sample, page content,
release status, contact links and navigation remain available.

## Connect the desktop release later

1. Complete the signing, device and privacy gates in
   `docs/release/RELEASE_CHECKLIST.md`. Do not distribute the machine-local SDK
   recovery or point this website at a local development executable.
2. Verify the signed public installer and its permanent absolute HTTPS URL.
3. Set `url`, `version` and `fileLabel` in `site/release.js`. No credentials belong
   in this file. Until a valid URL and version are configured, the page keeps the
   coming-soon state and provides a contact email instead of a fake download.
4. Update the roadmap's pre-release wording and page description when the release
   actually ships. The script updates download buttons, release description,
   status, file metadata and availability FAQ together.
5. Run `npm test` and `npm run build`, review the website, then publish the contents
   of `site/` through the chosen hosting workflow. No hosting destination is
   configured in this checkout; the current task is a local design review.

Public source and contribution links point to `https://github.com/klippers-dev/Nymkeep`.
Future installer assets will be published on that repository's Releases page and
linked directly from this site. Normal users need no Git or developer tools; see
`../docs/INSTALLATION.md`. Show version, OS/architecture and download size next to
each verified asset. Keep pending platforms pending and never substitute a source
ZIP or unsigned CI artifact for a public installer.

`assets/shortcut-keys.jpg` is an AI-generated conceptual shortcut illustration,
not a photograph of shipped hardware. The canonical Nymkeep logo is unchanged.

## Capability evidence (SP-029/030/031)

The screenshot section compares two saved synthetic images; the website performs
no OCR, upload or masking. `screenshot-original.png` is a copy of the committed
native integration fixture and `screenshot-redacted.png` is its actual Windows
backend output. Both are 1120 × 620 PNGs; the pair totals about 53 KB. The visible
Original/Redacted buttons switch only these local assets.

Claims were checked against source and tests on 2026-10-04. Built controls and
detectors, screenshot testing, release gates and planned features have separate
wording. OCR-independent manual masking, native image copy, PNG save and actual
export preview are now implemented in the desktop app. See
`../docs/FEATURE_VERIFICATION.md` for the evidence table and
`../docs/release/PLATFORM_STATUS.md` for Windows/macOS/Linux release gates.
Publishing and domain setup are deferred at the user's request. Revalidate when
the desktop app changes; a green unit suite is not a complete device certification.

To refresh the actual image output, explicitly run the ignored Windows test
documented there, using only the committed synthetic fixture. Keep the original
asset synchronized with that fixture. Do not substitute private screenshots.
