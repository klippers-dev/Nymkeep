#!/usr/bin/env bash
set -euo pipefail
export GSETTINGS_BACKEND=memory
# Dedicated CI D-Bus/display. Never uses a developer's clipboard or app session.
if [[ "${NYMKEEP_CAPTURE_ISOLATED:-}" != "1" ]]; then
  exec dbus-run-session -- xvfb-run -a env NYMKEEP_CAPTURE_ISOLATED=1 \
    NO_AT_BRIDGE=0 GTK_MODULES=gail:atk-bridge bash "$0" "$@"
fi
openbox >/dev/null 2>&1 &
nymkeep_wm_pid=$!
trap 'kill "$nymkeep_wm_pid" 2>/dev/null || true' EXIT
gdbus call --session --dest org.a11y.Bus --object-path /org/a11y/bus \
  --method org.freedesktop.DBus.Properties.Set org.a11y.Status IsEnabled '<true>' >/dev/null
/usr/bin/python3 "$(dirname "$0")/verify-linux-capture.py" "$@"
