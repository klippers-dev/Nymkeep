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

## Prepare a public website deployment

Only the allowlisted marketing files are deployed. Never upload the repository
root, desktop `dist/`, SDK recovery, models or local documents. ADR-019 records
the boundary. The builder uses Node built-ins; no dependency install/build of the
desktop application is needed by the hosting provider.

Run `npm run build:site -- --provider cloudflare --output .release-work/site-v1`
for Cloudflare, or replace the provider with `vercel`. Always choose a fresh
directory. Cloudflare receives its `public/` folder; Vercel receives the prepared
directory, whose config serves only `public/`. Headers, robots and a styled 404
are included. The inventory JSON stays outside the upload directory.

Use `--canonical-url https://your-verified-host/` only after the actual public
host is known; this also emits a sitemap. Verify the authenticated account and
matching project before deployment. Authentication belongs in the provider CLI
or dashboard, never source, chat or public environment files.

After publication, run `node scripts/site/verify.mjs <actual-HTTPS-root-URL>
<local-inventory-JSON>`. This checks reviewed asset hashes, public access,
security headers and absence of private/missing routes. Then check desktop/mobile,
theme, keyboard, fictional walkthrough and release fallback in a browser.
Domain purchase, paid plans and installer publication are separate actions.

For Cloudflare Pages, decide between Direct Upload and Git Integration when
creating the project: an existing Direct Upload project cannot later switch to
Git Integration. Repeat CLI/CI uploads remain possible. For Vercel, link/deploy
the isolated prepared directory, not the repository root. Reuse the verified
matching project for later updates; do not create a new project per deployment.
See the official [Pages Direct Upload guide](https://developers.cloudflare.com/pages/get-started/direct-upload/)
and [Vercel build configuration](https://vercel.com/docs/builds).

## Connect the desktop release later

1. Complete the signing, device and privacy gates in
   `docs/release/RELEASE_CHECKLIST.md`. Do not distribute the machine-local SDK
   recovery or point this website at a local development executable.
2. Verify the signed public installers and their versioned GitHub Releases URLs.
3. The publication workflow emits the reviewed platform catalog. `site/release.js`
   enables public GitHub discovery; `downloads.js` validates release state, target,
   filename, size and hash. No credentials belong in either file. Missing or invalid
   metadata retains the pending state and an always-visible Releases fallback.
4. Update the roadmap's pre-release wording and page description when the release
   actually ships. The script updates download buttons, release description,
   status, file metadata and availability FAQ together.
5. Run the site/tooling checks and build a fresh isolated deployment. Installer
   metadata is discovered per visit, so approved new app versions do not require
   republishing the unchanged website. See `docs/release/DOWNLOADS_AND_UPDATES.md`.

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
Website publishing was authorized on 2026-10-14; hosting account selection/access
is being verified. Domain purchase remains separate. Revalidate when
the desktop app changes; a green unit suite is not a complete device certification.

To refresh the actual image output, explicitly run the ignored Windows test
documented there, using only the committed synthetic fixture. Keep the original
asset synchronized with that fixture. Do not substitute private screenshots.
