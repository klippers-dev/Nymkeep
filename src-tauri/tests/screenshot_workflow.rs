//! Native OCR integration check against fixed synthetic data.
//! Run explicitly on Windows with an OCR language or macOS with the built Vision helper:
//! cargo test --test screenshot_workflow -- --ignored

#[cfg(any(windows, target_os = "macos"))]
#[test]
#[ignore = "requires native OCR; run during platform verification"]
fn synthetic_note_is_detected_and_permanently_redacted() {
    use nymkeep_lib::core::Core;
    use nymkeep_lib::shots::{detect_image, ocr::OcrCache, redact_image};

    let png = include_bytes!("fixtures/synthetic-note.png");
    let mut core = Core::new();
    let mut ocr = OcrCache::new();
    let detected = detect_image(&mut core, &mut ocr, png).expect("Native OCR must work");
    assert!(detected.protected_text.contains("EMAIL_1"));
    assert!(detected.protected_text.contains("IP_1"));
    assert!(!detected.protected_text.contains("mira@example.com"));
    assert!(!detected.protected_text.contains("192.0.2.42"));

    let boxes: Vec<_> = detected
        .redactions
        .iter()
        .flat_map(|redaction| redaction.boxes.iter().cloned())
        .collect();
    assert!(!boxes.is_empty());
    let redacted = redact_image(png, &boxes).expect("PNG redaction must work");
    let original = image::load_from_memory(png).unwrap().to_rgba8();
    let result = image::load_from_memory(&redacted).unwrap().to_rgba8();
    assert_eq!(result.dimensions(), original.dimensions());
    for (x, y, pixel) in result.enumerate_pixels() {
        let masked = boxes.iter().any(|b| {
            x >= b.x && x < b.x.saturating_add(b.w) && y >= b.y && y < b.y.saturating_add(b.h)
        });
        if masked {
            assert_eq!(*pixel, image::Rgba([0, 0, 0, 255]));
        } else {
            assert_eq!(pixel, original.get_pixel(x, y));
        }
    }
    let reread = ocr
        .recognize(&redacted)
        .expect("redacted PNG must remain readable");
    let reread: String = reread.iter().map(|word| word.text.as_str()).collect();
    assert!(!reread.contains("mira@example.com"));
    assert!(!reread.contains("192.0.2.42"));
    assert!(reread.contains("Project"));

    // Optional local evidence output, never a default fixture overwrite.
    if let Ok(path) = std::env::var("NYMKEEP_SHOT_EVIDENCE") {
        std::fs::write(path, &redacted).expect("write synthetic evidence PNG");
    }
}

#[cfg(windows)]
#[test]
#[ignore = "requires Windows OCR and an isolated native clipboard; run during device verification"]
fn native_image_clipboard_roundtrip_preserves_redacted_pixels() {
    use nymkeep_lib::{
        core::Core,
        shots::{self, ocr::OcrCache},
    };
    use std::ptr::{null, null_mut};
    use winapi::shared::minwindef::HWINSTA;
    use winapi::um::winuser::*;

    // Window stations have separate clipboards. Run this check in a child process
    // on a noninteractive station: never read, replace or back up the user's data.
    // https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setprocesswindowstation
    if std::env::var("NYMKEEP_SHOT_ISOLATED").as_deref() != Ok("1") {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "native_image_clipboard_roundtrip_preserves_redacted_pixels",
                "--ignored",
                "--test-threads=1",
            ])
            .env("NYMKEEP_SHOT_ISOLATED", "1")
            .output()
            .expect("start isolated clipboard test");
        assert!(
            output.status.success(),
            "isolated clipboard check failed:\n{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        return;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
    }
    struct IsolatedClipboard {
        previous_station: HWINSTA,
        previous_desktop: winapi::shared::windef::HDESK,
        station: HWINSTA,
        desktop: winapi::shared::windef::HDESK,
    }
    impl Drop for IsolatedClipboard {
        fn drop(&mut self) {
            unsafe {
                SetProcessWindowStation(self.previous_station);
                SetThreadDesktop(self.previous_desktop);
                if !self.desktop.is_null() {
                    CloseDesktop(self.desktop);
                }
                CloseWindowStation(self.station);
            }
        }
    }
    let mut isolated = unsafe {
        let previous_station = GetProcessWindowStation();
        let previous_desktop = GetThreadDesktop(GetCurrentThreadId());
        assert!(!previous_station.is_null() && !previous_desktop.is_null());
        let station = CreateWindowStationW(
            null(),
            CWF_CREATE_ONLY,
            WINSTA_CREATEDESKTOP
                | WINSTA_ACCESSCLIPBOARD
                | WINSTA_READATTRIBUTES
                | WINSTA_ACCESSGLOBALATOMS,
            null_mut(),
        );
        assert!(
            !station.is_null(),
            "cannot create isolated clipboard; no clipboard access performed"
        );
        IsolatedClipboard {
            previous_station,
            previous_desktop,
            station,
            desktop: null_mut(),
        }
    };
    unsafe {
        assert!(
            SetProcessWindowStation(isolated.station) != 0,
            "cannot isolate clipboard"
        );
        let name: Vec<u16> = "Nymkeep-test".encode_utf16().chain(Some(0)).collect();
        isolated.desktop = CreateDesktopW(
            name.as_ptr(),
            null(),
            null_mut(),
            0,
            DESKTOP_CREATEWINDOW | DESKTOP_READOBJECTS | DESKTOP_WRITEOBJECTS,
            null_mut(),
        );
        assert!(
            !isolated.desktop.is_null(),
            "cannot create isolated test desktop"
        );
        assert!(
            SetThreadDesktop(isolated.desktop) != 0,
            "cannot bind isolated test desktop"
        );
    }
    let app = tauri::test::mock_builder()
        .plugin(tauri_plugin_clipboard_manager::init())
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let png = include_bytes!("fixtures/synthetic-note.png");
    let result = shots::detect_image(&mut Core::new(), &mut OcrCache::new(), png).unwrap();
    let boxes: Vec<_> = result
        .redactions
        .iter()
        .flat_map(|r| r.boxes.iter().cloned())
        .collect();
    let expected = shots::decode_image(&shots::redact_image(png, &boxes).unwrap()).unwrap();
    shots::capture::copy_redacted(app.handle(), png, &boxes).expect("native image clipboard write");
    let clipboard =
        shots::capture::read_clipboard(app.handle()).expect("native image clipboard read");
    let received =
        shots::decode_image(&shots::decode_base64(&clipboard.png_base64).unwrap()).unwrap();
    assert_eq!(received.dimensions(), expected.dimensions());
    assert_eq!(received.as_raw(), expected.as_raw());
    // Rejecting an unmasked export must leave the previous safe image intact.
    assert!(shots::capture::copy_redacted(app.handle(), png, &[]).is_err());
    let unchanged = shots::capture::read_clipboard(app.handle()).unwrap();
    assert_eq!(
        shots::decode_image(&shots::decode_base64(&unchanged.png_base64).unwrap()).unwrap(),
        expected
    );
    // This path deliberately performs no OCR: manual masking remains usable
    // regardless of the installed language packs or model availability.
    let manual_boxes = [shots::boxes::PixelBox {
        x: 8,
        y: 12,
        w: 40,
        h: 24,
    }];
    let manual_expected =
        shots::decode_image(&shots::redact_image(png, &manual_boxes).unwrap()).unwrap();
    shots::capture::copy_redacted(app.handle(), png, &manual_boxes).unwrap();
    let manual = shots::capture::read_clipboard(app.handle()).unwrap();
    assert_eq!(
        shots::decode_image(&shots::decode_base64(&manual.png_base64).unwrap()).unwrap(),
        manual_expected
    );
    drop(app);
    drop(isolated);
}
