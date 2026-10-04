//! Linux Secure Capture (not implemented yet).
//!
//! Planned path: read the active selection through AT-SPI (`atspi` Text
//! interface) on X11, and through the same interface under Wayland where the
//! compositor exposes it. Global shortcuts on Wayland must additionally go
//! through `org.freedesktop.portal.GlobalShortcuts` (see the Wayland notes in
//! TEST_MATRIX.md). Until those adapters land, this returns `None` and the app
//! uses the labeled clipboard fallback.

pub fn selected_text() -> Option<String> {
    None
}
