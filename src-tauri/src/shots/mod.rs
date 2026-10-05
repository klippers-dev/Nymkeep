//! Screenshot redact mode (SP-027).
//!
//! Isolated component: it *calls* the detector core but never changes it.
//! Flow: PNG bytes -> OCR words -> joined text -> `core.protect` ->
//! placeholder tokens mapped back to pixel boxes -> UI previews ->
//! confirmed boxes rendered black -> PNG bytes out.
//!
//! Screenshot redaction is one-way. Pixels cannot be restored.

pub mod boxes;
pub mod capture;
#[cfg(any(target_os = "linux", test))]
mod linux_math;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(any(target_os = "macos", test))]
mod macos_protocol;
pub mod ocr;

use crate::core::{Core, KindCount};
use boxes::{join_words, map_to_boxes, PixelBox, Redaction};
use image::ImageDecoder;
use ocr::OcrCache;
use ocr::OcrWord;
use std::io::Cursor;

pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_IMAGE_PIXELS: u64 = 16_000_000;
pub const MAX_IMAGE_SIDE: u32 = 8192;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewImage {
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
}

pub fn validate_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_SIDE
        || height > MAX_IMAGE_SIDE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err("Use an image up to 16 megapixels and 8192 pixels per side.".into());
    }
    Ok(())
}

pub fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    if value.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err("Use an image smaller than 20 MB.".into());
    }
    STANDARD
        .decode(value)
        .map_err(|_| "The image could not be read.".into())
}

pub fn decode_image(bytes: &[u8]) -> Result<image::RgbaImage, String> {
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Use an image smaller than 20 MB.".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| "The image could not be read.")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_IMAGE_SIDE);
    limits.max_image_height = Some(MAX_IMAGE_SIDE);
    limits.max_alloc = Some(MAX_IMAGE_PIXELS * 8);
    reader.limits(limits);
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "Use a readable PNG, JPEG, WebP, GIF or BMP image within the size limits.")?;
    let (width, height) = decoder.dimensions();
    validate_dimensions(width, height)?;
    let orientation = decoder
        .orientation()
        .map_err(|_| "The image could not be read.")?;
    let mut image =
        image::DynamicImage::from_decoder(decoder).map_err(|_| "The image could not be read.")?;
    image.apply_orientation(orientation);
    Ok(image.to_rgba8())
}

pub fn encode_png(image: &image::RgbaImage) -> Result<Vec<u8>, String> {
    use image::ImageEncoder;
    validate_dimensions(image.width(), image.height())?;
    let mut png = Vec::new();
    image::codecs::png::PngEncoder::new(&mut png)
        .write_image(
            image.as_raw(),
            image.width(),
            image.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|_| "The PNG could not be created.")?;
    if png.len() > MAX_IMAGE_BYTES {
        return Err("The PNG is larger than 20 MB. Crop the image and try again.".into());
    }
    Ok(png)
}

pub fn review_image(bytes: &[u8]) -> Result<ReviewImage, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let image = decode_image(bytes)?;
    Ok(ReviewImage {
        png_base64: STANDARD.encode(encode_png(&image)?),
        width: image.width(),
        height: image.height(),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShotWord {
    pub text: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub conf: f32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub protected_text: String,
    pub count: usize,
    pub words: Vec<ShotWord>,
    pub redactions: Vec<Redaction>,
    pub kinds: Vec<KindCount>,
    pub ner_active: bool,
}

pub struct ShotState {
    pub ocr: OcrCache,
}

impl ShotState {
    pub fn new() -> Self {
        Self {
            ocr: OcrCache::new(),
        }
    }
}

impl Default for ShotState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn ocr_status() -> OcrStatus {
    OcrStatus {
        available: ocr::available(),
        backend: ocr::backend_name().to_string(),
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrStatus {
    pub available: bool,
    pub backend: String,
}

pub fn detect_image(
    core: &mut Core,
    ocr: &mut OcrCache,
    png: &[u8],
) -> Result<DetectResult, String> {
    let normalized = encode_png(&decode_image(png)?)?;
    let words: Vec<OcrWord> = ocr.recognize(&normalized)?;
    let (text, joined) = join_words(&words);
    let protection = core.protect(&text).map_err(|e| e.to_string())?;
    let redactions = map_to_boxes(&text, &joined, &protection.mappings);
    Ok(DetectResult {
        protected_text: protection.text,
        count: protection.count,
        words: joined
            .into_iter()
            .map(|w| ShotWord {
                text: w.text,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                conf: w.conf,
            })
            .collect(),
        redactions,
        kinds: protection.kinds,
        ner_active: protection.ner_active,
    })
}

pub fn redact_image(png: &[u8], boxes: &[PixelBox]) -> Result<Vec<u8>, String> {
    if boxes.is_empty() || boxes.len() > 10_000 {
        return Err("Select between 1 and 10000 areas to redact.".into());
    }
    let mut img = decode_image(png)?;
    let (w, h) = (img.width(), img.height());
    let mut changed = false;
    for b in boxes {
        let x0 = b.x.min(w);
        let y0 = b.y.min(h);
        let x1 = (b.x.saturating_add(b.w)).min(w);
        let y1 = (b.y.saturating_add(b.h)).min(h);
        changed |= x1 > x0 && y1 > y0;
        for y in y0..y1 {
            for x in x0..x1 {
                img.put_pixel(x, y, image::Rgba([0, 0, 0, 255]));
            }
        }
    }
    if !changed {
        return Err("No selected area overlaps the image.".into());
    }
    encode_png(&img)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn white_png(w: u32, h: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(w, h, image::Rgba([255, 255, 255, 255]));
        let mut out = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut out);
        use image::ImageEncoder;
        encoder
            .write_image(img.as_raw(), w, h, image::ExtendedColorType::Rgba8)
            .unwrap();
        out
    }

    #[test]
    fn redact_blackens_only_the_box() {
        let png = white_png(10, 10);
        let out = redact_image(
            &png,
            &[PixelBox {
                x: 2,
                y: 2,
                w: 4,
                h: 4,
            }],
        )
        .unwrap();
        let img = image::load_from_memory(&out).unwrap().to_rgba8();
        assert_eq!(img.get_pixel(4, 4), &image::Rgba([0, 0, 0, 255]));
        assert_eq!(img.get_pixel(0, 0), &image::Rgba([255, 255, 255, 255]));
        assert_eq!(img.get_pixel(9, 9), &image::Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn redact_clamps_out_of_bounds_boxes() {
        let png = white_png(10, 10);
        let out = redact_image(
            &png,
            &[PixelBox {
                x: 8,
                y: 8,
                w: 100,
                h: 100,
            }],
        )
        .unwrap();
        let img = image::load_from_memory(&out).unwrap().to_rgba8();
        assert_eq!(img.get_pixel(9, 9), &image::Rgba([0, 0, 0, 255]));
        assert_eq!(img.get_pixel(0, 0), &image::Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn redact_rejects_garbage_and_oversize() {
        assert!(redact_image(&[0, 1, 2, 3], &[]).is_err());
        assert!(redact_image(&vec![0u8; 21 * 1024 * 1024], &[]).is_err());
    }

    #[test]
    fn detect_rejects_garbage_input() {
        use crate::shots::ocr::OcrCache;
        let mut core = Core::new();
        let mut ocr = OcrCache::new();
        assert!(detect_image(&mut core, &mut ocr, &[0, 1, 2, 3]).is_err());
    }

    #[test]
    fn ocr_status_reports_a_backend() {
        let status = ocr_status();
        assert!(!status.backend.is_empty());
    }

    #[test]
    fn refuses_unmasked_or_outside_export() {
        let png = white_png(10, 10);
        assert!(redact_image(&png, &[]).is_err());
        assert!(redact_image(
            &png,
            &[PixelBox {
                x: 15,
                y: 0,
                w: 4,
                h: 4
            }]
        )
        .is_err());
        assert!(redact_image(
            &png,
            &[PixelBox {
                x: 0,
                y: 0,
                w: 0,
                h: 4
            }]
        )
        .is_err());
    }

    #[test]
    fn normalization_produces_matching_bounded_png() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let png = white_png(20, 10);
        let image = review_image(&png).unwrap();
        assert_eq!((image.width, image.height), (20, 10));
        let decoded = decode_image(&STANDARD.decode(image.png_base64).unwrap()).unwrap();
        assert_eq!(decoded.dimensions(), (20, 10));
        assert!(validate_dimensions(8193, 10).is_err());
        assert!(validate_dimensions(5000, 5000).is_err());
        assert!(decode_base64(&"x".repeat(MAX_IMAGE_BYTES.div_ceil(3) * 4 + 1)).is_err());
    }

    #[test]
    fn jpeg_exif_orientation_is_applied_before_review() {
        let rgb = image::RgbImage::from_pixel(12, 6, image::Rgb([40, 100, 200]));
        let mut jpeg = Vec::new();
        image::codecs::jpeg::JpegEncoder::new(&mut jpeg)
            .encode_image(&rgb)
            .unwrap();
        // Little-endian EXIF orientation 6 (rotate 90 degrees clockwise).
        let exif = [
            b'E', b'x', b'i', b'f', 0, 0, b'I', b'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1,
            0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
        ];
        let mut rotated = jpeg[..2].to_vec();
        rotated.extend_from_slice(&[0xff, 0xe1, 0, (exif.len() + 2) as u8]);
        rotated.extend_from_slice(&exif);
        rotated.extend_from_slice(&jpeg[2..]);
        let normalized = review_image(&rotated).unwrap();
        assert_eq!((normalized.width, normalized.height), (6, 12));
    }

    #[test]
    fn file_export_writes_only_redacted_png_and_rejects_invalid_requests() {
        let path =
            std::env::temp_dir().join(format!("nymkeep-redact-test-{}.png", std::process::id()));
        let png = white_png(10, 10);
        let boxes = [PixelBox {
            x: 2,
            y: 2,
            w: 4,
            h: 4,
        }];
        capture::save_redacted(&path, &png, &boxes).unwrap();
        let output = std::fs::read(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        let decoded = decode_image(&output).unwrap();
        assert_eq!(decoded.get_pixel(3, 3), &image::Rgba([0, 0, 0, 255]));
        assert_eq!(decoded.get_pixel(0, 0), &image::Rgba([255, 255, 255, 255]));
        assert!(capture::save_redacted(&path.with_extension("txt"), &png, &boxes).is_err());
        assert!(capture::save_redacted(&path, &png, &[]).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn supported_formats_normalize_and_redact_without_ocr() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let source = image::RgbImage::from_fn(16, 12, |x, y| {
            image::Rgb([(x * 13) as u8, (y * 17) as u8, 140])
        });
        for format in [
            image::ImageFormat::Png,
            image::ImageFormat::Jpeg,
            image::ImageFormat::WebP,
            image::ImageFormat::Gif,
            image::ImageFormat::Bmp,
        ] {
            let mut encoded = Cursor::new(Vec::new());
            image::DynamicImage::ImageRgb8(source.clone())
                .write_to(&mut encoded, format)
                .unwrap();
            let review = review_image(encoded.get_ref()).unwrap();
            let png = STANDARD.decode(review.png_base64).unwrap();
            assert_eq!(image::guess_format(&png).unwrap(), image::ImageFormat::Png);
            let original = decode_image(&png).unwrap();
            let output = decode_image(
                &redact_image(
                    &png,
                    &[PixelBox {
                        x: 3,
                        y: 2,
                        w: 5,
                        h: 4,
                    }],
                )
                .unwrap(),
            )
            .unwrap();
            for (x, y, pixel) in output.enumerate_pixels() {
                let expected = if (3..8).contains(&x) && (2..6).contains(&y) {
                    image::Rgba([0, 0, 0, 255])
                } else {
                    *original.get_pixel(x, y)
                };
                assert_eq!(*pixel, expected, "{format:?} at {x},{y}");
            }
        }
    }

    #[test]
    fn animated_gif_review_and_export_use_only_first_frame() {
        let first = image::RgbaImage::from_pixel(12, 8, image::Rgba([20, 80, 140, 255]));
        let second = image::RgbaImage::from_pixel(12, 8, image::Rgba([240, 0, 0, 255]));
        let mut gif = Vec::new();
        image::codecs::gif::GifEncoder::new(&mut gif)
            .encode_frames(
                [image::Frame::new(first.clone()), image::Frame::new(second)].into_iter(),
            )
            .unwrap();
        let normalized = review_image(&gif).unwrap();
        let png = decode_base64(&normalized.png_base64).unwrap();
        assert_eq!(decode_image(&png).unwrap(), first);
        let output = redact_image(
            &png,
            &[PixelBox {
                x: 0,
                y: 0,
                w: 2,
                h: 2,
            }],
        )
        .unwrap();
        assert_eq!(
            image::guess_format(&output).unwrap(),
            image::ImageFormat::Png
        );
        assert_eq!(
            decode_image(&output).unwrap().get_pixel(10, 6),
            first.get_pixel(10, 6)
        );
    }

    #[test]
    fn transparent_regions_become_opaque_and_unselected_pixels_are_unchanged() {
        let original = image::RgbaImage::from_fn(10, 6, |x, y| {
            image::Rgba([90, 180, 220, ((x + y) * 12) as u8])
        });
        let png = encode_png(&original).unwrap();
        let output = decode_image(
            &redact_image(
                &png,
                &[PixelBox {
                    x: 2,
                    y: 1,
                    w: 4,
                    h: 3,
                }],
            )
            .unwrap(),
        )
        .unwrap();
        for (x, y, pixel) in output.enumerate_pixels() {
            if (2..6).contains(&x) && (1..4).contains(&y) {
                assert_eq!(*pixel, image::Rgba([0, 0, 0, 255]));
            } else {
                assert_eq!(pixel, original.get_pixel(x, y));
            }
        }
    }

    #[test]
    fn file_export_handles_unicode_png_overwrite_and_keeps_existing_file_on_invalid_export() {
        let path = std::env::temp_dir().join(format!("nymkeep-画像-{}.PNG", std::process::id()));
        let original = white_png(10, 10);
        std::fs::write(&path, &original).unwrap();
        assert!(capture::save_redacted(&path, &original, &[]).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        let boxes = [PixelBox {
            x: 0,
            y: 0,
            w: 10,
            h: 10,
        }];
        capture::save_redacted(&path, &original, &boxes).unwrap();
        let saved = std::fs::read(&path).unwrap();
        std::fs::remove_file(&path).unwrap();
        assert!(decode_image(&saved)
            .unwrap()
            .pixels()
            .all(|p| *p == image::Rgba([0, 0, 0, 255])));
        let missing = path.with_extension("missing").join("output.png");
        let error = capture::save_redacted(&missing, &original, &boxes).unwrap_err();
        assert!(!error.contains("画像"));
        assert!(!missing.exists());
    }
}
