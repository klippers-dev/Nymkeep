# Release checklist (public beta candidate)

- [ ] Build from `scripts/release/prepare.mjs` allowlisted staging; verify the
      local vswhom-sys patch, recovery `.cargo/config.toml` and SDK folders are excluded.
      Keep the original machine-local recovery available only for local development.
- [ ] Generate the Tauri signing keypair OFFLINE; store the private key and
      password ONLY in CI secrets (`TAURI_SIGNING_PRIVATE_KEY*`). Never in repo.
- [ ] Set real **public** updater key/feed in CI repository variables
      `NYMKEEP_UPDATE_PUBLIC_KEY` / `NYMKEEP_UPDATE_ENDPOINT`. Public config generation
      rejects placeholders; unsigned candidates disable updater endpoints/artifacts.
- [ ] Tag `v*` to run `.github/workflows/release.yml` (tests + model SHA check
  - signed draft release). Verify signatures before publishing.
- [ ] Size gate: installed app under 200 MB per platform (model ~28 MB + ORT
      included in the budget). Never above 500 MB.
- [ ] Offline check: Protect/Restore with network disabled.
- [ ] Shortcut collision path: register failure shows notice + rebind works.
- [ ] No raw PII in logs, toasts, analytics, or crash reports (re-audit).
- [ ] Detection benchmark report by entity type published; no perfect-detection
      claims anywhere in UI or store copy.
- [ ] Third-party licenses bundled (Tauri, ORT, model Apache-2.0 attribution).
- [ ] Triage all dependency alerts. Resolve or record an independently reviewed
      reachability/remediation decision for the locked GTK/glib advisory
      [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
      before publishing a Linux GUI package; keep the alert visible until resolved.
- [ ] Triage all dependency alerts. Resolve or record an independently reviewed
      reachability/remediation decision for the locked GTK/glib advisory
      [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
      before publishing a Linux GUI package; keep the alert visible until resolved.
- [ ] Windows: SmartScreen/code-signing story decided before broad launch.
- [ ] macOS: Developer ID + notarization for Gatekeeper (paid program).
- [ ] macOS: build/sign the Vision helper for both architectures, run the native
      synthetic OCR/pixel fixture, then verify AX deny/grant/revoke, clipboard fallback
      and desktop GUI on a real Mac. Standalone Rust checks do not certify Mac support.
- [ ] Linux: verify installed OCR resource paths/hashes and separately test X11,
      GNOME Wayland and KDE Wayland; capture/portal adapters remain open.
