//! Pure validation shared by the Linux adapter and synthetic contract tests.

pub(super) const MAX_BYTES: usize = 100_000;

pub(super) fn unix_address(address: &str) -> bool {
    // Never let an accessibility service or environment redirect capture to TCP.
    !address.contains(';')
        && (address.starts_with("unix:path=") || address.starts_with("unix:abstract="))
}

pub(super) fn focused_visible(states: &[u32]) -> bool {
    states.len() == 2
        && states[0] & (1 << 6) == 0 // DEFUNCT
        && [12, 25, 30].iter().all(|bit| states[0] & (1 << bit) != 0)
}

pub(super) fn selection_range(count: i32, start: i32, end: i32) -> bool {
    count == 1 && start >= 0 && end > start && (end - start) as usize <= MAX_BYTES
}

pub(super) fn valid_selection(text: &str, start: i32, end: i32) -> bool {
    selection_range(1, start, end)
        && !text.trim().is_empty()
        && !text.contains('\0')
        && text.len() <= MAX_BYTES
        && text.chars().count() == (end - start) as usize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_local_unix_bus_addresses_are_allowed() {
        assert!(unix_address("unix:path=/run/user/1000/bus,guid=synthetic"));
        assert!(unix_address("unix:abstract=/tmp/synthetic-a11y"));
        for address in [
            "tcp:host=example.com",
            "unix:path=/tmp/a;tcp:host=x",
            "autolaunch:",
        ] {
            assert!(!unix_address(address));
        }
    }

    #[test]
    fn capture_requires_live_visible_keyboard_focus() {
        let live = (1 << 12) | (1 << 25) | (1 << 30);
        assert!(focused_visible(&[live, 0]));
        assert!(!focused_visible(&[live | (1 << 6), 0]));
        assert!(!focused_visible(&[live & !(1 << 12), 0]));
        assert!(!focused_visible(&[live]));
    }

    #[test]
    fn rejects_multiple_empty_invalid_oversized_and_changed_selections() {
        assert!(valid_selection("नमस्ते", 4, 10));
        assert!(!selection_range(2, 0, 8));
        assert!(!selection_range(1, -1, 8));
        assert!(!selection_range(1, 8, 8));
        assert!(!selection_range(1, 0, 100_001));
        assert!(!valid_selection(" ", 0, 1));
        assert!(!valid_selection("a\0b", 0, 3));
        assert!(!valid_selection("changed", 0, 4));
        assert!(!valid_selection(&"é".repeat(50_001), 0, 50_001));
    }
}
