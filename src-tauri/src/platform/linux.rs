//! Bounded, selection-only capture over the local AT-SPI accessibility bus.
//! Never reads names, full values, documents, passwords or the clipboard.

use super::linux_selection::{focused_visible, selection_range, unix_address, valid_selection};
use std::collections::HashSet;
use std::time::Duration;
use zbus::zvariant::OwnedObjectPath;
use zbus::{Connection, Proxy};

type Object = (String, OwnedObjectPath);
const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";
const ROOT: &str = "/org/a11y/atspi/accessible/root";
const MAX_NODES: usize = 128;
const MAX_DEPTH: usize = 16;

async fn proxy<'a>(
    connection: &Connection,
    name: &'a str,
    path: &'a str,
    interface: &'a str,
) -> zbus::Result<Proxy<'a>> {
    // GetAll would also read accessible names/descriptions. Fetch no implicit properties.
    zbus::proxy::Builder::new(connection)
        .destination(name)?
        .path(path)?
        .interface(interface)?
        .cache_properties(zbus::proxy::CacheProperties::No)
        .build()
        .await
}

pub fn selected_text() -> Option<String> {
    futures_lite::future::block_on(futures_lite::future::or(capture(), async {
        async_io::Timer::after(Duration::from_millis(1500)).await;
        None
    }))
}

async fn capture() -> Option<String> {
    if std::env::var("DBUS_SESSION_BUS_ADDRESS").is_ok_and(|address| !unix_address(&address)) {
        return None;
    }
    let session = Connection::session().await.ok()?;
    let bus = proxy(&session, "org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus")
        .await
        .ok()?;
    let address: String = bus.call("GetAddress", &()).await.ok()?;
    if !unix_address(&address) {
        return None;
    }
    let connection = zbus::connection::Builder::address(address.as_str())
        .ok()?
        .build()
        .await
        .ok()?;
    let root = (
        "org.a11y.atspi.Registry".to_string(),
        OwnedObjectPath::try_from(ROOT).ok()?,
    );
    let mut pending = vec![(root, 0, None::<Object>)];
    let mut seen = HashSet::new();
    while let Some(((name, path), depth, mut active_window)) = pending.pop() {
        if depth > MAX_DEPTH || !seen.insert((name.clone(), path.clone())) {
            continue;
        }
        if seen.len() > MAX_NODES {
            return None;
        }
        let accessible = proxy(&connection, name.as_str(), path.as_str(), ACCESSIBLE)
            .await
            .ok()?;
        let states: Vec<u32> = accessible.call("GetState", &()).await.ok()?;
        // Background controls can retain FOCUSED. Root -> application -> window:
        // only descend into the currently ACTIVE, SHOWING top-level window.
        if depth == 2
            && (states.len() != 2 || states[0] & (1 << 1) == 0 || states[0] & (1 << 25) == 0)
        {
            continue;
        }
        if depth == 2 {
            active_window = Some((name.clone(), path.clone()));
        }
        if focused_visible(&states) {
            let role: u32 = accessible.call("GetRole", &()).await.ok()?;
            if role == 40 {
                // ATSPI_ROLE_PASSWORD_TEXT
                return None;
            }
            return read_selection(
                &connection,
                &accessible,
                &name,
                &path,
                active_window.as_ref()?,
            )
            .await;
        }
        let count: i32 = accessible.get_property("ChildCount").await.ok()?;
        if count < 0 || count as usize > MAX_NODES - seen.len() {
            return None;
        }
        for index in (0..count).rev() {
            let child: Object = accessible.call("GetChildAtIndex", &(index,)).await.ok()?;
            if child.0.starts_with(':') && child.1.as_str() != "/org/a11y/atspi/null" {
                pending.push((child, depth + 1, active_window.clone()));
            }
        }
    }
    None
}

async fn read_selection(
    connection: &Connection,
    accessible: &Proxy<'_>,
    name: &str,
    path: &OwnedObjectPath,
    active_window: &Object,
) -> Option<String> {
    let text = proxy(connection, name, path.as_str(), "org.a11y.atspi.Text")
        .await
        .ok()?;
    let count: i32 = text.call("GetNSelections", &()).await.ok()?;
    if count != 1 {
        return None;
    }
    let (start, end): (i32, i32) = text.call("GetSelection", &(0i32,)).await.ok()?;
    if !selection_range(count, start, end) {
        return None;
    }
    // GetText is restricted to the exact selected offsets. Never use -1/end-of-document.
    let selected: String = text.call("GetText", &(start, end)).await.ok()?;
    let states: Vec<u32> = accessible.call("GetState", &()).await.ok()?;
    let after_count: i32 = text.call("GetNSelections", &()).await.ok()?;
    let after: (i32, i32) = text.call("GetSelection", &(0i32,)).await.ok()?;
    let window = proxy(
        connection,
        active_window.0.as_str(),
        active_window.1.as_str(),
        ACCESSIBLE,
    )
    .await
    .ok()?;
    let window_states: Vec<u32> = window.call("GetState", &()).await.ok()?;
    (focused_visible(&states)
        && window_states.len() == 2
        && window_states[0] & (1 << 1) != 0
        && window_states[0] & (1 << 25) != 0
        && after_count == 1
        && after == (start, end)
        && valid_selection(&selected, start, end))
    .then_some(selected)
}
