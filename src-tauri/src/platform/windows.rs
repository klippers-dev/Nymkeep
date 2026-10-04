//! Windows Secure Capture via Microsoft UI Automation.
//!
//! Reads only the focused element's TextPattern selection.
//! Returns `None` when the focused control exposes neither, in which case the
//! caller uses the labeled clipboard fallback.

pub fn selected_text() -> Option<String> {
    use uiautomation::patterns::UITextPattern;
    use uiautomation::UIAutomation;
    let automation = UIAutomation::new().ok()?;
    let focused = automation.get_focused_element().ok()?;
    if let Ok(pattern) = focused.get_pattern::<UITextPattern>() {
        if let Ok(selection) = pattern.get_selection() {
            let mut out = String::new();
            for range in selection.iter() {
                if let Ok(text) = range.get_text(-1) {
                    out.push_str(&text);
                }
            }
            if !out.trim().is_empty() {
                return Some(out);
            }
        }
    }
    None
}
