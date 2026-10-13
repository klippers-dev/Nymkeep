# Public website hosting

Verified on 2026-10-14: **https://nymkeep.vercel.app/** is public on Vercel without
login. Cloudflare is not required. No domain purchase or paid-plan change was made.

## Deployment record

- Account scope: `karan-singhs-projects-b4d634ef`.
- Project: `nymkeep`, ID `prj_Izl55PueDbYnScZ6VkgNIMilQTm6`.
- Production deployment: `dpl_mBaZ6J9zumygRXE1P8QGG7cxDHya`.
- [Deployment details](https://vercel.com/karan-singhs-projects-b4d634ef/nymkeep/mBaZ6J9zumygRXE1P8QGG7cxDHya).
- Website source: `4b7aa111158fa2c43ede31d259ba62ab1435e1ac`, on PR #14.
  The builder adds the verified canonical URL, robots and sitemap.
- Vercel CLI 64.0.1 was used. The previous installed 42.3.0 was rejected by the
  deployment endpoint; no global CLI upgrade was made.

The production domain was checked with ordinary unauthenticated HTTPS requests,
not a Vercel authentication bypass. Twelve public files match the local SHA-256
inventory. Security headers pass and six private/missing routes are rejected.
Public browser checks pass at 360/390/768/1366 px, including both themes, keyboard
FAQ/menu/Escape/focus, fictional Protect/reply/Restore, image comparison,
reduced-motion behavior, pending installer fallback and styled HTTP 404. There
are no page errors, CSP violations or horizontal overflow.

## Updating the website

Normal source contributions still follow dev > stage > main with required review
and CI. The first website deployment was explicitly authorized from the
tested PR source above; it does not merge or promote that PR. This Vercel project is not
Git-connected. Repository pushes do not automatically republish it.

From the intended tested source revision, create a fresh static stage:

```sh
npm run build:site -- --provider vercel --output .release-work/site-NEXT --canonical-url https://nymkeep.vercel.app/
npx --yes vercel@64.0.1 link --yes --project nymkeep --scope karan-singhs-projects-b4d634ef --cwd .release-work/site-NEXT
npx --yes vercel@64.0.1 deploy --prod --yes --scope karan-singhs-projects-b4d634ef --cwd .release-work/site-NEXT
node scripts/site/verify.mjs https://nymkeep.vercel.app/ .release-work/site-NEXT.inventory.json
```

Replace `site-NEXT` with a new directory each time. Verify the authenticated owner
scope and existing project before uploading. Provider authentication stays in its
CLI/dashboard; never paste tokens into source or chat. The stage contains only
allowlisted public marketing assets and deployment config. Never deploy the
repository root or native desktop `dist/`. The inventory stays outside the stage.
Repeat browser checks after a production upload, and inspect the returned actual
URL. The production alias stays the same across deployments to this project.

Future automated site delivery must preserve this builder/inventory boundary and
the protected-source workflow. Do not enable repository-wide auto-deployment with
the desktop build command. For earlier deployment recovery use the existing
project's deployment history; never recreate the project to publish an update.

## Downloads, updates and privacy

Vercel hosts the marketing website. GitHub Releases will host approved installers,
catalogs and signed updater artifacts. The website currently displays release
status because no signed public installer is published. After a valid stable
catalog is published, the website discovers it per visit without a website rebuild.
See [downloads and updates](DOWNLOADS_AND_UPDATES.md).

The website has no private text/image input, OCR, detector, tracking or analytics.
Its browser requests are limited to its own assets and GitHub's public release
API. The hosts receive ordinary request metadata; Protect/Restore/screenshot
processing stays on the user's device. Custom domains and public app release
signing/device/review gates remain separate.

References: [Vercel static builds](https://vercel.com/docs/builds),
[deployment protection](https://vercel.com/docs/deployment-protection),
[deployment history and rollback](https://vercel.com/docs/instant-rollback).
