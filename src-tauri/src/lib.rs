pub mod core;
pub mod ner;
pub mod platform;
pub mod shots;

use core::{Core, Mapping, PrivacyRules, Protection, Restoration, SessionStatus};
use shots::boxes::PixelBox;
use shots::{detect_image, ocr_status, redact_image, DetectResult, OcrStatus};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppCore(pub Mutex<Core>);

fn default_quick() -> String {
    "Alt+J".to_string()
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct ShortcutStrings {
    protect: String,
    restore: String,
    #[serde(default = "default_quick")]
    quick: String,
}

impl Default for ShortcutStrings {
    fn default() -> Self {
        Self {
            protect: "Alt+C".to_string(),
            restore: "Alt+R".to_string(),
            quick: default_quick(),
        }
    }
}

pub struct ShortcutState(pub(crate) Mutex<ShortcutStrings>);

#[derive(Clone, serde::Serialize)]
struct ShortcutStatus {
    kind: &'static str,
    message: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutApplyResult {
    protect: String,
    restore: String,
    quick: String,
    message: String,
}

fn parse_key(token: &str) -> Option<tauri_plugin_global_shortcut::Code> {
    use tauri_plugin_global_shortcut::Code;
    let t = token.trim().to_ascii_uppercase();
    if t.len() == 1 {
        let c = t.chars().next().unwrap_or(' ');
        if c.is_ascii_alphabetic() {
            return Some(match c {
                'A' => Code::KeyA,
                'B' => Code::KeyB,
                'C' => Code::KeyC,
                'D' => Code::KeyD,
                'E' => Code::KeyE,
                'F' => Code::KeyF,
                'G' => Code::KeyG,
                'H' => Code::KeyH,
                'I' => Code::KeyI,
                'J' => Code::KeyJ,
                'K' => Code::KeyK,
                'L' => Code::KeyL,
                'M' => Code::KeyM,
                'N' => Code::KeyN,
                'O' => Code::KeyO,
                'P' => Code::KeyP,
                'Q' => Code::KeyQ,
                'R' => Code::KeyR,
                'S' => Code::KeyS,
                'T' => Code::KeyT,
                'U' => Code::KeyU,
                'V' => Code::KeyV,
                'W' => Code::KeyW,
                'X' => Code::KeyX,
                'Y' => Code::KeyY,
                _ => Code::KeyZ,
            });
        }
        if c.is_ascii_digit() {
            return Some(match c {
                '0' => Code::Digit0,
                '1' => Code::Digit1,
                '2' => Code::Digit2,
                '3' => Code::Digit3,
                '4' => Code::Digit4,
                '5' => Code::Digit5,
                '6' => Code::Digit6,
                '7' => Code::Digit7,
                '8' => Code::Digit8,
                _ => Code::Digit9,
            });
        }
        return Some(match c {
            ';' => Code::Semicolon,
            '\'' => Code::Quote,
            ',' => Code::Comma,
            '.' => Code::Period,
            '/' => Code::Slash,
            '\\' => Code::Backslash,
            '[' => Code::BracketLeft,
            ']' => Code::BracketRight,
            '-' => Code::Minus,
            '=' => Code::Equal,
            '`' => Code::Backquote,
            _ => return None,
        });
    }
    match t.as_str() {
        "SPACE" => Some(Code::Space),
        "TAB" => Some(Code::Tab),
        "ENTER" | "RETURN" => Some(Code::Enter),
        "SEMICOLON" => Some(Code::Semicolon),
        "QUOTE" => Some(Code::Quote),
        "COMMA" => Some(Code::Comma),
        "PERIOD" => Some(Code::Period),
        "SLASH" => Some(Code::Slash),
        "BACKSLASH" => Some(Code::Backslash),
        "MINUS" => Some(Code::Minus),
        "EQUAL" => Some(Code::Equal),
        _ if t.len() <= 3 && t.starts_with('F') => match t[1..].parse::<u8>() {
            Ok(1) => Some(Code::F1),
            Ok(2) => Some(Code::F2),
            Ok(3) => Some(Code::F3),
            Ok(4) => Some(Code::F4),
            Ok(5) => Some(Code::F5),
            Ok(6) => Some(Code::F6),
            Ok(7) => Some(Code::F7),
            Ok(8) => Some(Code::F8),
            Ok(9) => Some(Code::F9),
            Ok(10) => Some(Code::F10),
            Ok(11) => Some(Code::F11),
            Ok(12) => Some(Code::F12),
            _ => None,
        },
        _ => None,
    }
}

fn parse_shortcut(s: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    use tauri_plugin_global_shortcut::{Modifiers, Shortcut};
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    if parts.len() < 2 {
        return Err("use at least one modifier plus one key, for example Alt+C".to_string());
    }
    let key_token = parts[parts.len() - 1];
    let mut mods = Modifiers::empty();
    for m in &parts[..parts.len() - 1] {
        match m.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "win" | "windows" | "meta" | "cmd" | "command" => mods |= Modifiers::SUPER,
            _ => return Err("unknown modifier in shortcut".to_string()),
        }
    }
    if mods.is_empty() {
        return Err("use at least one modifier plus one key, for example Alt+C".to_string());
    }
    let code = parse_key(key_token).ok_or_else(|| "unknown key in shortcut".to_string())?;
    Ok(Shortcut::new(Some(mods), code))
}

fn shortcuts_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("shortcuts.json"))
}

fn load_shortcuts(app: &AppHandle) -> ShortcutStrings {
    let mut out = ShortcutStrings::default();
    let path = match shortcuts_file(app) {
        Some(p) => p,
        None => return out,
    };
    let data = std::fs::read_to_string(path).unwrap_or_default();
    if let Ok(saved) = serde_json::from_str::<ShortcutStrings>(&data) {
        if parse_shortcut(&saved.protect).is_ok() {
            out.protect = saved.protect.trim().to_string();
        }
        if parse_shortcut(&saved.restore).is_ok() {
            out.restore = saved.restore.trim().to_string();
        }
        if parse_shortcut(&saved.quick).is_ok() {
            out.quick = saved.quick.trim().to_string();
        }
        let a = parse_shortcut(&out.protect).ok();
        let b = parse_shortcut(&out.restore).ok();
        let c = parse_shortcut(&out.quick).ok();
        if a == b || a == c || b == c {
            return ShortcutStrings::default();
        }
    }
    out
}

fn validate_shortcuts(
    protect: &str,
    restore: &str,
    quick: &str,
) -> Result<ShortcutStrings, String> {
    let next = ShortcutStrings {
        protect: protect.trim().to_string(),
        restore: restore.trim().to_string(),
        quick: quick.trim().to_string(),
    };
    let parsed = [
        parse_shortcut(&next.protect)
            .map_err(|_| "protect shortcut needs one modifier plus one key, for example Alt+C")?,
        parse_shortcut(&next.restore)
            .map_err(|_| "restore shortcut needs one modifier plus one key, for example Alt+R")?,
        parse_shortcut(&next.quick)
            .map_err(|_| "quick shortcut needs one modifier plus one key, for example Alt+J")?,
    ];
    if parsed[0] == parsed[1] || parsed[0] == parsed[2] || parsed[1] == parsed[2] {
        return Err("all three shortcuts must be different".to_string());
    }
    Ok(next)
}

fn save_shortcuts(app: &AppHandle, s: &ShortcutStrings) -> Result<(), String> {
    save_settings(shortcuts_file(app), s)
}

fn register_one(app: &AppHandle, text: &str) -> bool {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    parse_shortcut(text)
        .map(|s| app.global_shortcut().register(s).is_ok())
        .unwrap_or(false)
}

fn apply_shortcuts(
    app: &AppHandle,
    next: &ShortcutStrings,
    prev: &ShortcutStrings,
) -> Result<ShortcutStrings, String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    app.global_shortcut()
        .unregister_all()
        .map_err(|_| "Could not release the previous shortcuts.")?;
    if register_one(app, &next.protect)
        && register_one(app, &next.restore)
        && register_one(app, &next.quick)
    {
        return Ok(next.clone());
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|_| "Could not roll back shortcuts. Restart Nymkeep and try again.")?;
    let protect_ok = register_one(app, &prev.protect);
    let restore_ok = register_one(app, &prev.restore);
    let quick_ok = register_one(app, &prev.quick);
    if !protect_ok || !restore_ok || !quick_ok {
        return Err("Could not restore all previous shortcuts. Restart Nymkeep; the tray actions remain available.".to_string());
    }
    Ok(prev.clone())
}

#[tauri::command]
fn get_shortcuts(state: State<ShortcutState>) -> Result<ShortcutStrings, String> {
    Ok(state
        .0
        .lock()
        .map_err(|_| "shortcut lock poisoned")?
        .clone())
}

#[tauri::command]
fn set_shortcuts(
    app: AppHandle,
    state: State<ShortcutState>,
    protect: &str,
    restore: &str,
    quick: &str,
) -> Result<ShortcutApplyResult, String> {
    let next = validate_shortcuts(protect, restore, quick)?;
    let prev = state
        .0
        .lock()
        .map_err(|_| "shortcut lock poisoned")?
        .clone();
    let applied = apply_shortcuts(&app, &next, &prev)?;
    if let Err(e) = save_shortcuts(&app, &applied) {
        let rolled_back = apply_shortcuts(&app, &prev, &applied)?;
        *state.0.lock().map_err(|_| "shortcut lock poisoned")? = rolled_back;
        return Err(e);
    }
    *state.0.lock().map_err(|_| "shortcut lock poisoned")? = applied.clone();
    let message = if applied.protect != next.protect
        || applied.restore != next.restore
        || applied.quick != next.quick
    {
        "A shortcut is unavailable. All previous shortcuts were kept; try another combination."
            .to_string()
    } else {
        "Shortcuts updated.".to_string()
    };
    Ok(ShortcutApplyResult {
        protect: applied.protect,
        restore: applied.restore,
        quick: applied.quick,
        message,
    })
}

#[tauri::command]
fn get_autostart(app: AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    if enabled {
        launcher.enable()
    } else {
        launcher.disable()
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn shots_status() -> Result<OcrStatus, String> {
    tauri::async_runtime::spawn_blocking(ocr_status)
        .await
        .map_err(|_| "Text recognition status is unavailable.".into())
}

#[tauri::command]
async fn capture_status() -> Result<platform::CaptureStatus, String> {
    tauri::async_runtime::spawn_blocking(platform::capture_status)
        .await
        .map_err(|_| "Selection capture status is unavailable.".into())
}

#[tauri::command]
async fn request_capture_permission() -> Result<platform::CaptureStatus, String> {
    tauri::async_runtime::spawn_blocking(platform::request_capture_permission)
        .await
        .map_err(|_| "Accessibility permission could not be requested.")?
}

#[tauri::command]
async fn shots_load(png_base64: String) -> Result<shots::ReviewImage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        shots::review_image(&shots::decode_base64(&png_base64)?)
    })
    .await
    .map_err(|_| "The image could not be opened.")?
}

#[tauri::command]
async fn shots_read_clipboard(app: AppHandle) -> Result<shots::ReviewImage, String> {
    tauri::async_runtime::spawn_blocking(move || shots::capture::read_clipboard(&app))
        .await
        .map_err(|_| "The clipboard image could not be read.")?
}

#[tauri::command]
async fn shots_copy(
    app: AppHandle,
    png_base64: String,
    boxes: Vec<PixelBox>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        shots::capture::copy_redacted(&app, &shots::decode_base64(&png_base64)?, &boxes)
    })
    .await
    .map_err(|_| "Image copy could not finish.")?
}

#[tauri::command]
async fn shots_save(
    app: AppHandle,
    window: tauri::WebviewWindow,
    png_base64: String,
    boxes: Vec<PixelBox>,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let png = redact_image(&shots::decode_base64(&png_base64)?, &boxes)?;
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Save redacted image")
            .set_file_name("nymkeep-redacted.png")
            .add_filter("PNG image", &["png"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected
            .into_path()
            .map_err(|_| "Choose a local PNG file.")?;
        shots::capture::save_png(&path, &png)?;
        Ok(true)
    })
    .await
    .map_err(|_| "Image save could not finish.")?
}

#[tauri::command]
async fn shots_detect(app: AppHandle, png_base64: String) -> Result<DetectResult, String> {
    let bytes = shots::decode_base64(&png_base64)?;
    tauri::async_runtime::spawn_blocking(move || {
        let core_state = app.state::<AppCore>();
        let mut core = core_state.0.lock().map_err(|_| "core lock poisoned")?;
        let shot_state = app.state::<Mutex<shots::ShotState>>();
        let mut guard = shot_state.lock().map_err(|_| "ocr busy")?;
        detect_image(&mut core, &mut guard.ocr, &bytes)
    })
    .await
    .map_err(|_| "Detection could not finish.")?
}

#[tauri::command]
async fn shots_redact(png_base64: String, boxes: Vec<PixelBox>) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    tauri::async_runtime::spawn_blocking(move || {
        let out = redact_image(&shots::decode_base64(&png_base64)?, &boxes)?;
        Ok(STANDARD.encode(out))
    })
    .await
    .map_err(|_| "Image preview could not finish.")?
}

#[tauri::command]
async fn protect_text(
    app: AppHandle,
    text: String,
    manual_terms: Option<Vec<String>>,
) -> Result<Protection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .protect_with_terms(&text, &manual_terms.unwrap_or_default())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "Protection could not finish.")?
}

#[tauri::command]
async fn restore_text(app: AppHandle, text: String) -> Result<Restoration, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .restore(&text)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "Restoration could not finish.")?
}

#[tauri::command]
fn get_rules(state: State<AppCore>) -> Result<PrivacyRules, String> {
    Ok(state.0.lock().map_err(|_| "core lock poisoned")?.rules())
}

#[tauri::command]
fn set_rules(
    app: AppHandle,
    state: State<AppCore>,
    rules: PrivacyRules,
) -> Result<PrivacyRules, String> {
    let mut core = state.0.lock().map_err(|_| "core lock poisoned")?;
    let previous = core.rules();
    let applied = core.set_rules(rules).map_err(|e| e.to_string())?;
    if let Err(e) = save_rules(&app, &applied) {
        let _ = core.set_rules(previous);
        return Err(e);
    }
    Ok(applied)
}

fn rules_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("rules.json"))
}

fn load_rules(app: &AppHandle) -> PrivacyRules {
    let path = match rules_file(app) {
        Some(p) => p,
        None => return PrivacyRules::default(),
    };
    let data = std::fs::read_to_string(path).unwrap_or_default();
    let mut core = Core::new();
    serde_json::from_str::<PrivacyRules>(&data)
        .ok()
        .and_then(|r| core.set_rules(r).ok())
        .unwrap_or_default()
}

fn save_rules(app: &AppHandle, rules: &PrivacyRules) -> Result<(), String> {
    save_settings(rules_file(app), rules)
}

fn save_settings<T: serde::Serialize>(
    path: Option<std::path::PathBuf>,
    value: &T,
) -> Result<(), String> {
    let path = path.ok_or("Settings folder is unavailable.")?;
    let parent = path.parent().ok_or("Settings folder is unavailable.")?;
    std::fs::create_dir_all(parent).map_err(|_| "Could not create the settings folder.")?;
    let data = serde_json::to_string(value).map_err(|_| "Could not prepare settings.")?;
    std::fs::write(path, data).map_err(|_| "Could not save settings to this device.".to_string())
}

#[tauri::command]
async fn ner_status(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app
            .state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .ner_active())
    })
    .await
    .map_err(|_| "Could not check name detection.")?
}

#[tauri::command]
async fn get_session_status(app: AppHandle) -> Result<SessionStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app
            .state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .session_status())
    })
    .await
    .map_err(|_| "Could not read session status.")?
}

#[tauri::command]
fn read_clipboard(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().read_text().map_err(|_| {
        "The clipboard does not contain readable text. Paste into the editor manually.".to_string()
    })
}

#[tauri::command]
fn write_clipboard(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard()
        .write_text(text)
        .map_err(|_| "Could not copy text. Select the result and copy it manually.".to_string())
}

#[tauri::command]
async fn get_mappings(app: AppHandle) -> Result<Vec<Mapping>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app
            .state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .mappings())
    })
    .await
    .map_err(|_| "Could not read mappings.")?
}

#[tauri::command]
async fn clear_mappings(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<AppCore>()
            .0
            .lock()
            .map_err(|_| "core lock poisoned")?
            .clear();
        Ok(())
    })
    .await
    .map_err(|_| "Could not clear the session.")?
}

fn protect_and_write(
    app: &AppHandle,
    raw: &str,
    mode: &'static str,
) -> Result<(usize, &'static str), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if raw.trim().is_empty() {
        return Err("The clipboard is empty. Select or copy some text first.".to_string());
    }
    let protection = app
        .state::<AppCore>()
        .0
        .lock()
        .map_err(|_| "core lock poisoned")?
        .protect(&raw)
        .map_err(|e| e.to_string())?;
    app.clipboard()
        .write_text(protection.text)
        .map_err(|_| "could not write protected text")?;
    Ok((protection.count, mode))
}

fn do_protect_clipboard(app: &AppHandle, selection: bool) -> Result<(usize, &'static str), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let (raw, mode): (String, &'static str) = match if selection {
        platform::selected_text()
    } else {
        None
    } {
        Some(text) => (text, "secure capture"),
        None => (
            app.clipboard()
                .read_text()
                .map_err(|_| "select text in any app first, then press the shortcut")?,
            "clipboard fallback",
        ),
    };
    protect_and_write(app, &raw, mode)
}

#[cfg(windows)]
fn send_ctrl_c() -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
        VIRTUAL_KEY, VK_C, VK_CONTROL,
    };
    fn key(down: bool, vk: VIRTUAL_KEY) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: if down {
                        KEYBD_EVENT_FLAGS(0)
                    } else {
                        KEYEVENTF_KEYUP
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }
    let inputs = [
        key(true, VK_CONTROL),
        key(true, VK_C),
        key(false, VK_C),
        key(false, VK_CONTROL),
    ];
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent as usize != inputs.len() {
        return Err(
            "quick capture could not copy. Select text, press Ctrl+C, then Alt+C.".to_string(),
        );
    }
    Ok(())
}

#[cfg(windows)]
fn clipboard_seq() -> u32 {
    unsafe { winapi::um::winuser::GetClipboardSequenceNumber() }
}

fn do_quick_capture(app: &AppHandle) -> Result<(usize, &'static str), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    if let Some(text) = platform::selected_text() {
        if !text.trim().is_empty() {
            return protect_and_write(app, &text, "secure capture");
        }
    }
    #[cfg(windows)]
    {
        use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
        for _ in 0..40 {
            let down = unsafe { GetAsyncKeyState(0x12) };
            if (down as u16 & 0x8000) == 0 {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        send_ctrl_c()?;
        let before = clipboard_seq();
        let mut changed = false;
        for _ in 0..30 {
            std::thread::sleep(std::time::Duration::from_millis(20));
            if clipboard_seq() != before {
                changed = true;
                break;
            }
        }
        if !changed {
            return Err(
                "quick capture found nothing new. Select text, press Ctrl+C, then Alt+C."
                    .to_string(),
            );
        }
        let raw = app.clipboard().read_text().map_err(|_| {
            "quick capture found nothing new. Select text, press Ctrl+C, then Alt+C.".to_string()
        })?;
        return protect_and_write(app, &raw, "quick capture");
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err(
            "quick capture runs on Windows for now. Select text, press Ctrl+C, then Alt+C."
                .to_string(),
        );
    }
}

fn do_restore_clipboard(app: &AppHandle) -> Result<(usize, usize), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let raw = app
        .clipboard()
        .read_text()
        .map_err(|_| "copy the AI answer first, then press the shortcut")?;
    let restoration = app
        .state::<AppCore>()
        .0
        .lock()
        .map_err(|_| "core lock poisoned")?
        .restore(&raw)
        .map_err(|e| e.to_string())?;
    app.clipboard()
        .write_text(restoration.text)
        .map_err(|_| "could not write restored text")?;
    Ok((restoration.known, restoration.unknown))
}

fn notify(app: &AppHandle, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title("Nymkeep")
        .body(body)
        .show();
}

fn emit_status(app: &AppHandle, kind: &'static str, message: String) {
    notify(app, message.clone());
    let _ = app.emit("nymkeep-status", ShortcutStatus { kind, message });
}

fn handle_protect(app: &AppHandle, selection: bool) {
    match do_protect_clipboard(app, selection) {
        Ok((n, mode)) => emit_status(
            app,
            "protect",
            format!(
                "{} items replaced via {}. Review before sharing; detection can miss details.",
                n, mode
            ),
        ),
        Err(e) => emit_status(app, "error", format!("Protect failed: {}", e)),
    }
}

fn handle_quick(app: &AppHandle) {
    match do_quick_capture(app) {
        Ok((n, mode)) => emit_status(
            app,
            "protect",
            format!(
                "{} items replaced via {}. Review before sharing; detection can miss details.",
                n, mode
            ),
        ),
        Err(e) => emit_status(app, "error", format!("Quick capture failed: {}", e)),
    }
}

fn handle_restore(app: &AppHandle) {
    match do_restore_clipboard(app) {
        Ok((known, unknown)) => emit_status(
            app,
            "restore",
            format!(
                "Restored {} items ({} unknown left untouched).",
                known, unknown
            ),
        ),
        Err(e) => emit_status(app, "error", format!("Restore failed: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(AppCore(Mutex::new(Core::new())))
        .manage(ShortcutState(Mutex::new(ShortcutStrings::default())))
        .manage(Mutex::new(shots::ShotState::new()))
        .invoke_handler(tauri::generate_handler![
            protect_text,
            restore_text,
            get_mappings,
            get_session_status,
            read_clipboard,
            write_clipboard,
            clear_mappings,
            get_rules,
            set_rules,
            ner_status,
            get_shortcuts,
            set_shortcuts,
            get_autostart,
            set_autostart,
            capture_status,
            request_capture_permission,
            shots_status,
            shots_detect,
            shots_redact,
            shots_load,
            shots_read_clipboard,
            shots_copy,
            shots_save
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::tray::TrayIconBuilder;
                use tauri_plugin_global_shortcut::ShortcutState as GSState;

                let initial = load_shortcuts(app.handle());
                if let Ok(mut guard) = app.state::<ShortcutState>().0.lock() {
                    *guard = initial.clone();
                }
                let saved_rules = load_rules(app.handle());
                if let Ok(mut core) = app.handle().state::<AppCore>().0.lock() {
                    let _ = core.set_rules(saved_rules);
                }
                if let Ok(models) = app.path().resource_dir().map(|d| d.join("models")) {
                    #[cfg(target_os = "linux")]
                    shots::ocr::set_resource_models(models.join("ocr"));
                    if models.join("pii-model.onnx").exists() {
                        if let Ok(mut core) = app.handle().state::<AppCore>().0.lock() {
                            core.set_model_dir(models);
                        }
                    }
                }
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state() != GSState::Pressed {
                                return;
                            }
                            let current = match app.state::<ShortcutState>().0.lock() {
                                Ok(s) => s.clone(),
                                Err(_) => return,
                            };
                            if parse_shortcut(&current.protect).ok().as_ref() == Some(shortcut) {
                                handle_protect(app, true);
                            } else if parse_shortcut(&current.restore).ok().as_ref()
                                == Some(shortcut)
                            {
                                handle_restore(app);
                            } else if parse_shortcut(&current.quick).ok().as_ref() == Some(shortcut)
                            {
                                handle_quick(app);
                            }
                        })
                        .build(),
                )?;
                if !register_one(app.handle(), &initial.protect) {
                    emit_status(
                        app.handle(),
                        "error",
                        "Protect shortcut is taken by another app. Change it in Settings."
                            .to_string(),
                    );
                }
                if !register_one(app.handle(), &initial.restore) {
                    emit_status(
                        app.handle(),
                        "error",
                        "Restore shortcut is taken by another app. Change it in Settings."
                            .to_string(),
                    );
                }
                if !register_one(app.handle(), &initial.quick) {
                    emit_status(
                        app.handle(),
                        "error",
                        "Quick capture shortcut is taken by another app. Change it in Settings."
                            .to_string(),
                    );
                }

                use tauri::menu::{Menu, MenuItem};
                let show = MenuItem::with_id(app, "show", "Show Nymkeep", true, None::<&str>)?;
                let protect_now = MenuItem::with_id(
                    app,
                    "protect-now",
                    "Protect clipboard now",
                    true,
                    None::<&str>,
                )?;
                let restore_now = MenuItem::with_id(
                    app,
                    "restore-now",
                    "Restore clipboard now",
                    true,
                    None::<&str>,
                )?;
                let quick_now =
                    MenuItem::with_id(app, "quick-now", "Quick capture now", true, None::<&str>)?;
                let clear = MenuItem::with_id(app, "clear", "Clear mappings", true, None::<&str>)?;
                let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[&show, &protect_now, &restore_now, &quick_now, &clear, &quit],
                )?;
                let icon = app.default_window_icon().cloned();
                let mut tray = TrayIconBuilder::new().menu(&menu);
                if let Some(icon) = icon {
                    tray = tray.icon(icon);
                }
                tray.show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "protect-now" => handle_protect(app, false),
                        "restore-now" => handle_restore(app),
                        "quick-now" => handle_quick(app),
                        "clear" => {
                            if let Some(core) = app.try_state::<AppCore>() {
                                if let Ok(mut core) = core.0.lock() {
                                    core.clear();
                                }
                            }
                            emit_status(app, "clear", "Mappings cleared.".to_string());
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)?;
            }
            let expiry_app = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(std::time::Duration::from_secs(15));
                if let Ok(mut core) = expiry_app.state::<AppCore>().0.lock() {
                    core.session_status();
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod shortcut_tests {
    use super::{parse_key, parse_shortcut};

    #[test]
    fn two_key_defaults_parse() {
        assert!(parse_shortcut("Alt+C").is_ok());
        assert!(parse_shortcut("Alt+R").is_ok());
    }

    #[test]
    fn three_key_combo_parses() {
        assert!(parse_shortcut("Ctrl+Shift+F9").is_ok());
        assert!(parse_shortcut("Ctrl+Alt+;").is_ok());
    }

    #[test]
    fn rejects_bare_key_and_unknown_modifier() {
        assert!(parse_shortcut("C").is_err());
        assert!(parse_shortcut("Hyper+C").is_err());
        assert!(parse_shortcut("Ctrl+").is_err());
        assert!(parse_key("F13").is_none());
    }

    #[test]
    fn quick_default_parses() {
        assert!(parse_shortcut("Alt+J").is_ok());
        assert!(parse_shortcut(super::ShortcutStrings::default().quick.as_str()).is_ok());
    }

    #[test]
    fn validate_rejects_duplicates() {
        assert!(super::validate_shortcuts("Alt+C", "Alt+R", "Alt+J").is_ok());
        assert!(super::validate_shortcuts("Alt+C", "Alt+C", "Alt+J").is_err());
        assert!(super::validate_shortcuts("Alt+C", "Alt+R", "Alt+C").is_err());
        assert!(super::validate_shortcuts("Alt+C", "Alt+R", "C").is_err());
    }
}
