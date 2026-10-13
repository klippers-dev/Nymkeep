//! Cross-platform selected-text capture.
//!
//! Secure Capture reads the user's current selection through the OS
//! accessibility APIs so raw text never touches the clipboard first. Where the
//! focused control does not expose its selection, callers must fall back to
//! the clipboard flow and label it as such in the UI.

#[cfg(target_os = "linux")]
mod linux;
#[cfg(any(target_os = "linux", test))]
mod linux_selection;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::selected_text;
#[cfg(target_os = "macos")]
pub use macos::selected_text;
#[cfg(windows)]
pub use windows::selected_text;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub platform: &'static str,
    pub backend: &'static str,
    pub permission_required: bool,
    pub trusted: bool,
    pub implemented: bool,
}

pub fn capture_status() -> CaptureStatus {
    #[cfg(target_os = "macos")]
    return CaptureStatus {
        platform: "macos",
        backend: "macos-ax",
        permission_required: true,
        trusted: macos::trusted(),
        implemented: true,
    };
    #[cfg(not(target_os = "macos"))]
    CaptureStatus {
        platform: if cfg!(windows) { "windows" } else { "linux" },
        backend: if cfg!(windows) {
            "windows-uia"
        } else {
            "linux-atspi"
        },
        permission_required: false,
        trusted: cfg!(windows),
        implemented: cfg!(any(windows, target_os = "linux")),
    }
}

pub fn request_capture_permission() -> Result<CaptureStatus, String> {
    #[cfg(target_os = "macos")]
    {
        macos::request_permission();
        Ok(capture_status())
    }
    #[cfg(not(target_os = "macos"))]
    Err("Accessibility permission requests are available on macOS.".into())
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn selected_text() -> Option<String> {
    None
}
