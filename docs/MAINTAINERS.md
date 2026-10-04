# Maintainer workflow

Nymkeep is independently maintained by Klippers. The repository owner
`@klippers-dev` is the current code owner. Contributors can fork and submit PRs;
upstream merge/release access is granted deliberately.

## Branches and promotion

| Branch | Purpose                 | Changes                                          |
| ------ | ----------------------- | ------------------------------------------------ |
| dev    | Contributor integration | Topic/fork PRs, owner review and required CI     |
| stage  | Release validation      | PR from dev, native checks and release checklist |
| main   | Public release baseline | PR from stage after recorded validation          |

Use merge commits for dev → stage → main promotions to preserve ancestry; topic
PRs may be squashed. Do not automatically delete these three long-lived branches.
Urgent fixes start as topic PRs, and are carried back through the same branches.

The committed configuration tool defines two separate branch rulesets. One
requires the **Required checks** CI result from the verified GitHub Actions app,
up-to-date validation, no force pushes and no deletion, with no bypass actors.
The other requires PRs, one fresh approval, code-owner review and resolved review
threads. Only the owner may bypass this second rule, through a PR, because the
sole maintainer cannot approve their own work. The separate CI rule still applies.
Version tags `v*` can be created/changed only by the owner.

These are configuration requirements. Check the repository's active rulesets
before calling them enforced; files alone do not activate GitHub protections.

## Bootstrap or verify settings

Use an already authenticated GitHub CLI owner/admin session. Never put tokens or
CI signing credentials in files or commands. Push the reviewed initial source and
create main/stage/dev before enabling protections. The first CI run must register
its app so the required check can be bound to the actual GitHub Actions app ID.

```sh
node scripts/repository/configure-github.mjs          # preview only
node scripts/repository/configure-github.mjs --apply  # apply and read back
```

The tool updates only its three named rulesets, preserves unrelated rules, enables
private vulnerability reporting, sets main as default and disables automatic
branch deletion. It does not touch visibility, collaborators or CI secrets.
Require approval for all outside collaborators' Actions runs in GitHub Settings
→ Actions. Keep workflow token permissions read-only; do not allow Actions to
create/approve PRs. Review dependency/bot PRs through the same required checks.

## Fork and CI trust

Contribution CI uses `pull_request`, no release secrets, read-only permissions and
checkout without persisted credentials. Never run fork code with
`pull_request_target` or `workflow_run` under a write token. Actions are pinned to
reviewed commits; Dependabot proposes updates into dev. Review workflow changes
before approving outside contributors' runs. Native checks cover four build
targets; compilation alone does not certify platform/device support.

## Publishing clean source from the recovered development machine

Ordinary contributors use a healthy SDK and their normal Git clone. The original
development workspace has ADR-007 local recovery and must be exported before
publication. Never stage its patched Cargo manifest or SDK files directly.

```sh
node scripts/repository/export.mjs .release-work/public-source-NEW
node scripts/repository/audit.mjs .release-work/public-source-NEW --all
```

The allowlist includes source, docs, licenses and CI; only Cargo manifest/lock are
sanitized. Downloads, credentials, recovery and build outputs are excluded.
Use a fresh destination and a real Git checkout to preserve remote history.
Review the diff, run checks and push a topic branch. Never force-push the public
branches. New source folders must be deliberately added to the export allowlist.

## Releases and website downloads

Complete [RELEASE_CHECKLIST.md](release/RELEASE_CHECKLIST.md) before a public
release. The manual candidate workflow produces unsigned CI review artifacts.
Version tags create release drafts; publication is a separate maintainer action.
OS signing/notarization and the complete third-party notices remain gates.

Publish installer assets and SHA-256 information on GitHub Releases. After hosting,
connect the same permanent HTTPS assets to the website with OS/CPU/version/size
labels and plain installation instructions. `docs/INSTALLATION.md` is for people
who do not use Git. Keep unavailable platforms clearly pending. Avoid linking to
source ZIPs or internal candidate artifacts as if they were public installers.
