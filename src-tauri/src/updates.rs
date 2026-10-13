//! Explicit release checks. No text/image/session content enters updater requests.
use base64::Engine;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

pub const ENDPOINT: &str =
    "https://github.com/klippers-dev/Nymkeep/releases/latest/download/latest.json";
pub const RELEASES: &str = "https://github.com/klippers-dev/Nymkeep/releases";

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<Update>>,
    installed: AtomicBool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub configured: bool,
    pub manual_only: bool,
    pub available_version: Option<String>,
    pub restart_required: bool,
    pub message: &'static str,
}

fn configured(value: Option<&Value>) -> bool {
    let Some(value) = value else { return false };
    if value.get("endpoints") != Some(&serde_json::json!([ENDPOINT])) {
        return false;
    }
    for name in [
        "dangerousInsecureTransportProtocol",
        "dangerousAcceptInvalidCerts",
        "dangerousAcceptInvalidHostnames",
    ] {
        if value.get(name).and_then(Value::as_bool).unwrap_or(false) {
            return false;
        }
    }
    let Some(key) = value.get("pubkey").and_then(Value::as_str) else {
        return false;
    };
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(key) else {
        return false;
    };
    let Ok(text) = std::str::from_utf8(&bytes) else {
        return false;
    };
    let Some(line) = text.lines().nth(1) else {
        return false;
    };
    let Ok(key) = base64::engine::general_purpose::STANDARD.decode(line) else {
        return false;
    };
    key.len() == 42 && &key[..2] == b"Ed" && key[10..].iter().any(|byte| *byte != 0)
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    let configured = configured(app.config().plugins.0.get("updater"));
    let manual_only = cfg!(target_os = "linux") && std::env::var_os("APPIMAGE").is_none();
    UpdateStatus {
        current_version: app.package_info().version.to_string(),
        configured,
        manual_only,
        available_version: None,
        restart_required: app
            .try_state::<UpdateState>()
            .is_some_and(|state| state.installed.load(Ordering::SeqCst)),
        message: if !configured {
            "Updates become available in a signed public release."
        } else if manual_only {
            "Download the next Debian package from Releases to update this installation."
        } else {
            "Check for a new version when you choose. Your work stays on this device."
        },
    }
}

struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
fn begin(state: &UpdateState) -> Result<Operation<'_>, String> {
    state
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "An update action is already running.".to_string())?;
    Ok(Operation(&state.busy))
}

fn release_url(url: &str, version: &str) -> bool {
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return false;
    }
    let prefix = format!("https://github.com/klippers-dev/Nymkeep/releases/download/v{version}/");
    let Some(name) = url.strip_prefix(&prefix) else {
        return false;
    };
    !name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
}

pub async fn check(app: &AppHandle, state: &UpdateState) -> Result<UpdateStatus, String> {
    let _operation = begin(state)?;
    let mut result = status(app);
    if !result.configured || result.manual_only {
        return Ok(result);
    }
    *state
        .pending
        .lock()
        .map_err(|_| "Update state is unavailable.")? = None;
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "Update checking is unavailable in this build.")?;
    let update = updater
        .check()
        .await
        .map_err(|_| "Could not check for updates. Check your connection and try again.")?;
    if let Some(mut update) = update {
        if !release_url(update.download_url.as_str(), &update.version)
            || update.signature.is_empty()
            || update.signature.len() > 16_384
        {
            return Err(
                "The update metadata could not be verified. Keep the current version.".into(),
            );
        }
        update.timeout = Some(Duration::from_secs(180));
        result.available_version = Some(update.version.clone());
        result.message = "A new version is available. Review your work before installing.";
        *state
            .pending
            .lock()
            .map_err(|_| "Update state is unavailable.")? = Some(update);
    } else {
        result.message = "You are using the latest published version.";
    }
    Ok(result)
}

pub async fn install(app: &AppHandle, state: &UpdateState) -> Result<(), String> {
    let _operation = begin(state)?;
    let status = status(app);
    if !status.configured || status.manual_only {
        return Err("In-app installation is unavailable for this build.".into());
    }
    let update = state
        .pending
        .lock()
        .map_err(|_| "Update state is unavailable.")?
        .take()
        .ok_or("Check for an update before installing.")?;
    let bytes = update.download(|_, _| {}, || {}).await
        .map_err(|_| "The update download or signature check failed. Your current installation is unchanged; check again to retry.")?;
    // Signature verification has completed. Clear mappings immediately before installation.
    app.state::<crate::AppCore>()
        .0
        .lock()
        .map_err(|_| "Could not clear the privacy session.")?
        .clear();
    use tauri::Emitter;
    let _ = app.emit("nymkeep-status", serde_json::json!({"kind":"clear", "message":"Installing the verified update. The privacy session was cleared."}));
    tauri::async_runtime::spawn_blocking(move || update.install(bytes))
        .await
        .map_err(|_| "Installation could not finish. Download the installer from Releases.")?
        .map_err(|_| "Installation could not finish. Download the installer from Releases.")?;
    state.installed.store(true, Ordering::SeqCst);
    Ok(())
}

pub fn restart(app: &AppHandle, state: &UpdateState) -> Result<(), String> {
    if !state.installed.load(Ordering::SeqCst) {
        return Err("No installed update is waiting for a restart.".into());
    }
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_stable_same_repository_versioned_assets_are_accepted() {
        assert!(release_url("https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3/Nymkeep_1.2.3_x64-setup.exe", "1.2.3"));
        for value in ["http://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3/app.exe", "https://example.com/app.exe", "https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.2/app.exe", "https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3/../app.exe", "https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3/app.exe?token=synthetic"] { assert!(!release_url(value, "1.2.3")); }
        assert!(!release_url(
            "https://github.com/klippers-dev/Nymkeep/releases/download/v1.2.3-beta/app.exe",
            "1.2.3-beta"
        ));
    }
    #[test]
    fn unsigned_and_insecure_configuration_never_enables_update_requests() {
        assert!(!configured(None));
        assert!(!configured(Some(
            &serde_json::json!({"endpoints":[ENDPOINT], "pubkey":"REPLACE_WITH_RELEASE_PUBLIC_KEY_FROM_CI"})
        )));
        let mut public = [0u8; 42];
        public[..2].copy_from_slice(b"Ed");
        public[10] = 1;
        let key = base64::engine::general_purpose::STANDARD.encode(format!(
            "untrusted comment: synthetic public key\n{}\n",
            base64::engine::general_purpose::STANDARD.encode(public)
        ));
        let mut config = serde_json::json!({"endpoints":[ENDPOINT], "pubkey":key});
        assert!(configured(Some(&config)));
        config["dangerousAcceptInvalidCerts"] = true.into();
        assert!(!configured(Some(&config)));
        config["dangerousAcceptInvalidCerts"] = false.into();
        config["endpoints"] = serde_json::json!(["https://example.com/feed"]);
        assert!(!configured(Some(&config)));
    }
    #[test]
    fn concurrent_update_actions_are_rejected_and_failures_release_the_guard() {
        let state = UpdateState::default();
        let operation = begin(&state).unwrap();
        assert!(begin(&state).is_err());
        drop(operation);
        assert!(begin(&state).is_ok());
    }
}
