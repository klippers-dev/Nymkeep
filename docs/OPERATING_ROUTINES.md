# Maintainer and social routines

Owner instructions, 2026-10-14: review the repository twice each week, create
tested fixes as pull requests, and let the owner review and merge. Publish two
daily educational Nymkeep posts on the verified Klippers X account: one static
image and one promotional animation. Use `contactklippers@gmail.com` everywhere.

## Repository review

Schedule: Monday and Thursday, 10:00 Asia/Kolkata. Read AGENTS.md, ARCHITECTURE.md,
DECISIONS.md, CURRENT_STATE.md and relevant task entries first. Fetch current
main/dev/stage and inspect open PRs, required CI, dependency/security notices,
privacy contracts, release/download behavior, docs and the live marketing site.
Investigate concrete findings rather than creating speculative refactors or
duplicate fixes already covered by open PRs.

Reproduce a real issue with synthetic fixtures, make a focused fix in a clean
isolated branch/worktree from dev, and run the checks appropriate to that change.
Open a PR into dev with the cause, resulting behavior, test evidence and remaining
risks, then attach it to this chat. The owner reviews and merges. Never enable
auto-merge, merge a PR, bypass branch protection or publish/deploy fixes before
owner approval. Do not publish installers or touch release signing credentials.
Keep private vulnerability details and real user content out of public outputs.
Record audit state locally, deduplicate findings and report only actionable new
findings/PRs or changed blockers. Unchanged healthy checks need no update.

## Daily social publishing

Schedule: static image at 11:00 and animation at 19:00 Asia/Kolkata. The account
must be confirmed by the owner and verified through an authenticated provider or
browser before publishing. An older Klippers workflow references @atklippers;
that is a candidate, not proof of current account access or confirmation here.
Preserve the owner's existing avatar/cover. No account/profile redesign is part
of this request. Other Klippers/Kwickly routines remain separate.

Read current source/release evidence before writing copy. Rotate topics: what
Nymkeep does, Protect/Restore, local OCR and manual redaction, screenshot review,
open-source verification, session lifetime, and the installer/update journey.
Use English public copy, the existing Nymkeep identity, readable mobile type,
short purposeful motion and accurate captions/alt text. Use only fictional
fixtures. Explain detection as assistive; do not promise perfect anonymity,
real-device certification or a download before a signed public release exists.
The public CTA is https://nymkeep.vercel.app/ with source at
https://github.com/klippers-dev/Nymkeep. Correct contact: contactklippers@gmail.com.

Store dated captions, PNG/MP4 assets and a publication ledger under output/social.
The ledger is `output/social/publication-ledger.json`; initial captions and assets
are in `output/social/2026-10-14-initial`. `output/social/render.cjs` is a local
deterministic typography/SVG renderer for PNG and MP4. Adapt its story for each
new topic and use a fresh dated edition; do not repeat the same creative daily.
Check existing provider posts/schedules and that ledger before posting. Coordinate
with existing Klippers activity by reading current schedules; do not delete or
change other campaigns. Publish each date/format once. Persist confirmed post
URLs/provider IDs; reconcile uncertain writes before retrying. A rendered file,
draft or failed request is not a published post. If access is missing, prepare
the day's assets and record the blocker without inventing posting success or
repeating the same login request each day. Do not buy plans, credits or ads.

## Runtime and current limits

These routines use scheduled follow-ups in this chat. Local repository/media
work needs this computer on, the app running and the workspace available.
See [official scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).
The schedule is not an always-on server service.

At setup, X posting access was not verified: Metricool was not connected, and
the browser-control runtime failed before opening any account page. Account
connection/confirmation is required before actual publication can be promised.
Maintenance and useful media preparation can continue independently.

All three follow-ups are ACTIVE in this chat: twice-weekly repository review,
daily X image, and daily X animation. At setup, the initial PNG and ten-second
1280x720 H.264/yuv420p MP4 were rendered, visually inspected and decoded. The
ledger records two drafts and zero published posts. Configuration of a follow-up
does not establish X account access or prove that a post was published.
