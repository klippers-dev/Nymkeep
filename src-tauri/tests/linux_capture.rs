//! Run only inside the isolated synthetic GTK/X11 fixture (no user session).
#![cfg(target_os = "linux")]

#[test]
#[ignore = "requires scripts/verify-linux-capture.sh and its isolated GTK session"]
fn selected_text_respects_native_focus_and_selection() {
    let expected = std::env::var("NYMKEEP_CAPTURE_CASE").expect("isolated fixture case");
    let start = std::time::Instant::now();
    let selected = nymkeep_lib::platform::selected_text();
    assert!(start.elapsed() < std::time::Duration::from_millis(2500));
    match expected.as_str() {
        "selected" => assert_eq!(selected.as_deref(), Some("mira@example.com")),
        "empty" | "password" | "background" => assert!(selected.is_none()),
        _ => panic!("unknown synthetic fixture case"),
    }
}
