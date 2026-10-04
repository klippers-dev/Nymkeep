//! Explicit native image clipboard and redacted-only file output.
//! No background watching, raw sidecars, filenames in errors, or networking.
use super::{
    boxes::PixelBox, encode_png, redact_image, review_image, validate_dimensions, ReviewImage,
};
use tauri::{AppHandle, Runtime};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub fn read_clipboard<R: Runtime>(app: &AppHandle<R>) -> Result<ReviewImage, String> {
    let image = app
        .clipboard()
        .read_image()
        .map_err(|_| "There is no readable image on the clipboard. Copy a screenshot first.")?;
    validate_dimensions(image.width(), image.height())?;
    let image = image::RgbaImage::from_raw(image.width(), image.height(), image.rgba().to_vec())
        .ok_or("The clipboard image could not be read.")?;
    review_image(&encode_png(&image)?)
}

pub fn copy_redacted<R: Runtime>(
    app: &AppHandle<R>,
    png: &[u8],
    boxes: &[PixelBox],
) -> Result<(), String> {
    let output = redact_image(png, boxes)?;
    let image = super::decode_image(&output)?;
    let (width, height) = image.dimensions();
    let native = tauri::image::Image::new_owned(image.into_raw(), width, height);
    app.clipboard()
        .write_image(&native)
        .map_err(|_| "Image copy failed. Try again, or use Save redacted PNG.".into())
}

pub(crate) fn save_png(path: &std::path::Path, png: &[u8]) -> Result<(), String> {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("png"))
    {
        return Err("Choose a filename ending in .png.".into());
    }
    // Callers provide a fresh backend redaction, never the original image.
    std::fs::write(path, png).map_err(|_| {
        "The image could not be saved. Choose a writable location and try again.".into()
    })
}

pub fn save_redacted(path: &std::path::Path, png: &[u8], boxes: &[PixelBox]) -> Result<(), String> {
    save_png(path, &redact_image(png, boxes)?)
}
