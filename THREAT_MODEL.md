# THREAT_MODEL.md (owner: security reviewer)

## Assets
Session placeholder map (in memory), user text being protected, custom terms,
shortcuts/rules config, update channel.

## Assumptions
Endpoint itself is trusted. OS clipboard managers, sync, and nearby devices are
NOT trusted with raw text. Detectors are assistive, never complete.

## Risks and mitigations
- Clipboard persistence (history, sync, managers): Secure Capture first; fallback
  is labeled in UI and toast; clipboard overwritten immediately with safe text.
- Detection miss: hybrid layers + custom terms + review UI + unknown-token report.
  Never claim zero leaks.
- False positive: confidence threshold (0.80), validators, never-list, review UI.
- Mapping theft: memory-only, 30-minute TTL, explicit clear, no cloud sync.
- Logs/telemetry: structured IDs only, no content; diagnostics off; errors generic.
- Model tampering: SHA-256 manifest verified at load; mismatch disables NER.
- Update compromise: signed artifacts only; keys in CI secrets, never in repo or
  agent environments.
- Marketing overclaim: "pseudonymized" language; GDPR personal-data honesty.

## Open before public beta
Independent re-audit of SP-009; real-device matrix (SP-010); release signing run.
