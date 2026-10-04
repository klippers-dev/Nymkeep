# AGENTS.md - non-negotiable rules for coding agents

## Start here
Read `ARCHITECTURE.md`, `DECISIONS.md`, `CURRENT_STATE.md`, and your task ticket
before touching code. End every task with tests plus a HANDOFF note (changed files,
commands run, assumptions, open risks).

## Commands
- Rust: `cargo test -j 2` and `cargo fmt --check` in `src-tauri/`.
- Frontend: `npm run build` in the repository root.
- Model files: `powershell -File scripts/download-model.ps1` (verifies SHA-256).

## Module ownership (one owner at a time)
- `src-tauri/src/core.rs`: detection, mapping, restore, rules. No OS code.
- `src-tauri/src/ner.rs`: ONNX model only. No UI, no network.
- `src-tauri/src/platform/*`: OS adapters only. No detector changes.
- `src-tauri/src/lib.rs`: commands, shortcuts, tray, wiring only.
- `src/`: review window only. Never display raw PII in toasts or logs.

## Prohibitions
- Never touch release signing keys, key passwords, or license credentials. They live
  only in CI secrets. Never ask for them, never print them.
- Never paste real user or customer PII into prompts. Synthetic fixtures only.
- Never weaken the placeholder contract: stable tokens, collision rejection,
  boundary-aware restore, no partial restores.
- Never send raw input or output text over the network. Protect/Restore are offline.
- Never mark Wayland/macOS supported without real compositor/device test evidence.
- Architecture or privacy behavior changes need a new ADR in DECISIONS.md first.
- The `[patch.crates-io] vswhom-sys` entry and `src-tauri/.cargo/config.toml` are
  machine-local recovery for a broken dev toolchain. Never ship them; CI builds
  without them.
