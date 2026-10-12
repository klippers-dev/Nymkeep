import { useEffect, useRef, useState } from "react";
import { api, desktop } from "./api";
import type { UpdateStatus } from "./api";
import { openUrl } from "@tauri-apps/plugin-opener";

export default function UpdateSettings({
  beforeInstall,
  setInstalling,
}: {
  beforeInstall: () => void;
  setInstalling: (value: boolean) => void;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [busy, setBusy] = useState<"check" | "install" | "restart" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [installed, setInstalled] = useState(false);
  const active = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    if (desktop)
      void api
        .updateStatus()
        .then((value) => {
          if (active.current) {
            setStatus(value);
            setInstalled(value.restartRequired);
          }
        })
        .catch(() => {
          if (active.current) setError("Update settings could not be loaded.");
        });
    return () => {
      active.current = false;
    };
  }, []);
  async function action(kind: "check" | "install" | "restart") {
    if (running.current) return;
    running.current = true;
    setBusy(kind);
    setError("");
    try {
      if (kind === "check") {
        const next = await api.checkUpdate();
        if (active.current) {
          setStatus(next);
          setConfirm(false);
        }
      } else if (kind === "install") {
        setInstalling(true);
        beforeInstall();
        await api.installUpdate();
        if (active.current) {
          setInstalled(true);
          setConfirm(false);
        }
      } else {
        await api.restartUpdate();
      }
    } catch {
      if (active.current) {
        if (kind === "install")
          setStatus((previous) =>
            previous ? { ...previous, availableVersion: null } : previous,
          );
        setConfirm(false);
        setError(
          kind === "check"
            ? "Could not check for updates. Check your connection and try again."
            : "The update could not finish. Check again or download the installer from Releases.",
        );
      }
    } finally {
      running.current = false;
      if (kind === "install") setInstalling(false);
      if (active.current) setBusy(null);
    }
  }
  return (
    <section className="settings-section" aria-labelledby="updates-heading">
      <div className="section-description">
        <h2 id="updates-heading">Updates</h2>
        <p>New versions, when you choose.</p>
      </div>
      <div className="section-content">
        <p className="small muted">
          {status
            ? `Installed version ${status.currentVersion}`
            : desktop
              ? "Loading update settings…"
              : "Updates are available in the desktop app."}
        </p>
        <p role="status" aria-live="polite">
          {busy === "check"
            ? "Checking for a new version…"
            : busy === "install"
              ? "Downloading and verifying the update… Nymkeep may close to finish installation."
              : installed
                ? "Update installed. Restart Nymkeep to use the new version; restarting clears the current privacy session."
                : status?.message}
        </p>
        {status?.availableVersion && !installed && (
          <p>
            <strong>Nymkeep {status.availableVersion} is available.</strong>
          </p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          {!installed && (
            <button
              className="button secondary"
              disabled={
                !desktop || !status?.configured || status.manualOnly || !!busy
              }
              onClick={() => void action("check")}
            >
              {busy === "check" ? "Checking…" : "Check for updates"}
            </button>
          )}
          {status?.availableVersion && !confirm && !installed && (
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => setConfirm(true)}
            >
              Install update…
            </button>
          )}
          {installed && (
            <button
              className="button primary"
              disabled={!!busy}
              onClick={() => void action("restart")}
            >
              Restart now
            </button>
          )}
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() =>
              void openUrl(
                "https://github.com/klippers-dev/Nymkeep/releases",
              ).catch(() =>
                setError(
                  "Could not open Releases. Visit github.com/klippers-dev/Nymkeep/releases.",
                ),
              )
            }
          >
            View releases
          </button>
        </div>
        {confirm && !busy && (
          <div className="update-confirmation">
            <p>
              Save your work first. Installation clears this privacy session and
              its drafts. Nymkeep may close or restart.
            </p>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => void action("install")}
              >
                Install and clear session
              </button>
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                Keep current version
              </button>
            </div>
          </div>
        )}
        <p className="small muted">
          Update checks contact GitHub only when you choose. Text, screenshots
          and session mappings stay on this device. Downloads must pass a
          signature check before installation.
        </p>
      </div>
    </section>
  );
}
