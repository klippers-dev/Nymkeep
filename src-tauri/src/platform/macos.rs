//! Selection-only macOS Accessibility capture. No AXValue, clipboard or logs.
//! Trust checks never prompt; only an explicit Settings command requests consent.
//! Implemented against Apple's API contract; real Mac verification is required.

use std::ffi::{c_char, c_void};
use std::ptr::null;

type CfRef = *const c_void;
const UTF8: u32 = 0x0800_0100;
const MAX_TEXT_BYTES: usize = 100_000;

#[repr(C)]
struct CfRange {
    location: isize,
    length: isize,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CfRef) -> u8;
    fn AXUIElementCreateSystemWide() -> CfRef;
    fn AXUIElementGetTypeID() -> usize;
    fn AXUIElementCopyAttributeValue(element: CfRef, attribute: CfRef, value: *mut CfRef) -> i32;
    fn AXUIElementSetMessagingTimeout(element: CfRef, seconds: f32) -> i32;
    static kAXTrustedCheckOptionPrompt: CfRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: CfRef);
    fn CFGetTypeID(value: CfRef) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFStringCreateWithCString(allocator: CfRef, value: *const c_char, encoding: u32) -> CfRef;
    fn CFStringGetLength(value: CfRef) -> isize;
    fn CFStringGetCharacters(value: CfRef, range: CfRange, buffer: *mut u16);
    fn CFDictionaryCreate(
        allocator: CfRef,
        keys: *const CfRef,
        values: *const CfRef,
        count: isize,
        key_callbacks: CfRef,
        value_callbacks: CfRef,
    ) -> CfRef;
    static kCFBooleanTrue: CfRef;
}

struct Owned(CfRef);
impl Owned {
    fn new(value: CfRef) -> Option<Self> {
        (!value.is_null()).then_some(Self(value))
    }
}
impl Drop for Owned {
    fn drop(&mut self) {
        // Create/Copy results follow Core Foundation ownership rules.
        unsafe { CFRelease(self.0) };
    }
}

pub fn trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

pub fn request_permission() {
    unsafe {
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        if let Some(options) = Owned::new(CFDictionaryCreate(
            null(),
            keys.as_ptr(),
            values.as_ptr(),
            1,
            null(),
            null(),
        )) {
            // Consent is asynchronous. Never report success based on this call.
            AXIsProcessTrustedWithOptions(options.0);
        }
    }
}

unsafe fn attribute(element: CfRef, key: &'static [u8], expected_type: usize) -> Option<Owned> {
    let name = Owned::new(CFStringCreateWithCString(null(), key.as_ptr().cast(), UTF8))?;
    let mut value = null();
    if AXUIElementCopyAttributeValue(element, name.0, &mut value) != 0 {
        // An error may still return a retained value; release it when present.
        drop(Owned::new(value));
        return None;
    }
    let value = Owned::new(value)?;
    (CFGetTypeID(value.0) == expected_type).then_some(value)
}

pub fn selected_text() -> Option<String> {
    if !trusted() {
        return None;
    }
    unsafe {
        let system = Owned::new(AXUIElementCreateSystemWide())?;
        AXUIElementSetMessagingTimeout(system.0, 0.3);
        let focused = attribute(system.0, b"AXFocusedUIElement\0", AXUIElementGetTypeID())?;
        AXUIElementSetMessagingTimeout(focused.0, 0.3);
        let selected = attribute(focused.0, b"AXSelectedText\0", CFStringGetTypeID())?;
        let length = CFStringGetLength(selected.0);
        if length <= 0 || length as usize > MAX_TEXT_BYTES {
            return None;
        }
        let mut buffer = vec![0u16; length as usize];
        CFStringGetCharacters(
            selected.0,
            CfRange {
                location: 0,
                length,
            },
            buffer.as_mut_ptr(),
        );
        let text = String::from_utf16(&buffer).ok()?;
        if text.trim().is_empty() || text.contains('\0') || text.len() > MAX_TEXT_BYTES {
            return None;
        }
        Some(text)
    }
}
