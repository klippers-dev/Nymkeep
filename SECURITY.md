# Security policy

Nymkeep is pre-release. No platform has a certified public installer yet. The
current development branch and latest future supported release receive triage;
older preview candidates are not supported security releases.

## Report privately

Use [GitHub's private vulnerability form](https://github.com/klippers-dev/Nymkeep/security/advisories/new)
when private reporting is enabled. If the form is unavailable, contact
**contact.klippers@gmail.com** with a short description and ask for a suitable
disclosure channel before sending sensitive details. Do not disclose an exploit,
private screenshot, original text, session mappings or credentials in a public
issue. Use synthetic reproduction data.

Describe the affected commit/version and OS, reproduction steps, expected/actual
behavior and impact. Relevant risks include raw-content network transmission or
logging, restoration collisions, expired-session reuse, image export leaks,
unsafe resource loading and installer/update integrity.

Independent maintainers coordinate fixes and disclosure according to severity
and availability. Allow a response before public disclosure; no fixed response
SLA or bounty is promised. Credit is offered with the reporter's consent.

## Trust boundaries

Read [PRIVACY.md](docs/PRIVACY.md) and [THREAT_MODEL.md](THREAT_MODEL.md). The app
cannot protect content from a compromised OS, clipboard history, sync services,
destination apps or information the detector misses. Review before sharing.
Open source permits inspection; it is not proof of a completed audit.
