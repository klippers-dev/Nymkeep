//! OCR backends for screenshot mode.
//!
//! Windows uses the in-OS recognizer (no download). Linux uses the bundled
//! PP-OCRv6 Small ONNX pair through the already-linked ONNX Runtime.
//! macOS uses the packaged native Vision helper. Missing backends leave manual masking available.

#[cfg(any(target_os = "linux", test))]
use std::path::Path;
use std::path::PathBuf;
#[cfg(target_os = "linux")]
use std::sync::Mutex;
#[cfg(target_os = "linux")]
static RESOURCE_MODELS: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

#[cfg(target_os = "linux")]
pub fn set_resource_models(path: PathBuf) {
    let _ = RESOURCE_MODELS.set(path);
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct OcrWord {
    pub text: String,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub conf: f32,
}

pub fn backend_name() -> &'static str {
    if cfg!(windows) {
        "windows-ocr"
    } else if cfg!(target_os = "linux") {
        "linux-ort"
    } else if cfg!(target_os = "macos") {
        "macos-vision"
    } else {
        "unavailable"
    }
}

pub fn available() -> bool {
    #[cfg(target_os = "macos")]
    return super::macos::available();
    #[cfg(windows)]
    return windows::Media::Ocr::OcrEngine::TryCreateFromUserProfileLanguages().is_ok();
    #[cfg(target_os = "linux")]
    return find_ocr_dir().is_some_and(|dir| verify_manifest(&dir));
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    return false;
}

#[cfg(any(target_os = "linux", test))]
fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.len() % 2 != 0 {
        return None;
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(s.len() / 2);
    let mut i = 0;
    while i < bytes.len() {
        let hi = (bytes[i] as char).to_digit(16)?;
        let lo = (bytes[i + 1] as char).to_digit(16)?;
        out.push((hi * 16 + lo) as u8);
        i += 2;
    }
    Some(out)
}

#[cfg(any(target_os = "linux", test))]
fn verify_manifest(dir: &Path) -> bool {
    use sha2::{Digest, Sha256};
    let data = match std::fs::read_to_string(dir.join("ocr-manifest.json")) {
        Ok(d) => d,
        Err(_) => return false,
    };
    let v: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let files = match v.get("files").and_then(|f| f.as_object()) {
        Some(f) => f,
        None => return false,
    };
    let required = ["ocr/det.onnx", "ocr/rec.onnx", "ocr/dict.txt"];
    if files.len() != required.len() || required.iter().any(|name| !files.contains_key(*name)) {
        return false;
    }
    for (name, entry) in files {
        let sha = entry.get("sha256").and_then(|s| s.as_str()).unwrap_or("");
        if sha.len() != 64 {
            return false;
        }
        let data = match std::fs::read(dir.join(name.trim_start_matches("ocr/"))) {
            Ok(d) => d,
            Err(_) => return false,
        };
        if entry.get("bytes").and_then(|n| n.as_u64()) != Some(data.len() as u64) {
            return false;
        }
        let digest = Sha256::digest(&data);
        match hex_decode(sha) {
            Some(h) if h.as_slice() == digest.as_slice() => {}
            _ => return false,
        }
    }
    true
}

pub fn find_ocr_dir() -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "linux")]
    if let Some(path) = RESOURCE_MODELS.get() {
        cands.push(path.clone());
    }
    if let Ok(p) = std::env::var("NYMKEEP_OCR") {
        cands.push(PathBuf::from(p));
    }
    if let Ok(cwd) = std::env::current_dir() {
        cands.push(cwd.join("models").join("ocr"));
        cands.push(cwd.join("src-tauri").join("models").join("ocr"));
    }
    cands.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("models")
            .join("ocr"),
    );
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            cands.push(dir.join("models").join("ocr"));
        }
    }
    cands.into_iter().find(|d| {
        d.join("det.onnx").exists() && d.join("rec.onnx").exists() && d.join("dict.txt").exists()
    })
}

pub struct OcrCache {
    #[cfg(target_os = "linux")]
    linux: Option<LinuxOcr>,
    #[cfg(target_os = "linux")]
    attempted: bool,
}

impl OcrCache {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "linux")]
            linux: None,
            #[cfg(target_os = "linux")]
            attempted: false,
        }
    }

    pub fn recognize(&mut self, png: &[u8]) -> Result<Vec<OcrWord>, String> {
        #[cfg(target_os = "macos")]
        return super::macos::recognize(png);
        #[cfg(windows)]
        {
            return recognize_windows(png);
        }
        #[cfg(target_os = "linux")]
        {
            if self.linux.is_none() && !self.attempted {
                self.attempted = true;
                if let Some(dir) = find_ocr_dir() {
                    if let Ok(engine) = LinuxOcr::load(&dir) {
                        self.linux = Some(engine);
                    }
                }
            }
            return match &self.linux {
                Some(engine) => engine.recognize(png),
                None => Err("screenshot text models are missing".to_string()),
            };
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
        {
            let _ = png;
            return Err("screenshot text detection is unavailable here".to_string());
        }
    }
}

impl Default for OcrCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod manifest_tests {
    use super::verify_manifest;
    use sha2::{Digest, Sha256};

    #[test]
    fn linux_pack_requires_all_hashes_and_rejects_tampering() {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("nymkeep-ocr-pack-{}-{nonce}", std::process::id()));
        std::fs::create_dir(&dir).unwrap();
        let mut files = serde_json::Map::new();
        for name in ["det.onnx", "rec.onnx", "dict.txt"] {
            let data = b"synthetic model fixture";
            std::fs::write(dir.join(name), data).unwrap();
            files.insert(
                format!("ocr/{name}"),
                serde_json::json!({
                    "bytes": data.len(), "sha256": format!("{:x}", Sha256::digest(data))
                }),
            );
        }
        let path = dir.join("ocr-manifest.json");
        assert!(!verify_manifest(&dir));
        std::fs::write(&path, serde_json::json!({"files": files}).to_string()).unwrap();
        assert!(verify_manifest(&dir));
        std::fs::write(dir.join("rec.onnx"), b"tampered fixture").unwrap();
        assert!(!verify_manifest(&dir));
        std::fs::write(&path, "{\"files\":{}}").unwrap();
        assert!(!verify_manifest(&dir));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}

#[cfg(windows)]
fn await_op<T>(op: windows_future::IAsyncOperation<T>) -> Result<T, String>
where
    T: windows::core::RuntimeType + 'static,
{
    use std::sync::mpsc::channel;
    use windows_future::{AsyncOperationCompletedHandler, AsyncStatus, IAsyncOperation};
    let failed = |_| "text recognition failed".to_string();
    let (tx, rx) = channel::<()>();
    let query = op.clone();
    op.SetCompleted(&AsyncOperationCompletedHandler::new(
        move |_sender: windows::core::Ref<IAsyncOperation<T>>, _status: AsyncStatus| {
            let _ = tx.send(());
            Ok(())
        },
    ))
    .map_err(|_| "text recognition failed".to_string())?;
    rx.recv()
        .map_err(|_| "text recognition failed".to_string())?;
    query.GetResults().map_err(failed)
}

#[cfg(windows)]
fn recognize_windows(png: &[u8]) -> Result<Vec<OcrWord>, String> {
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    let err = |_: windows::core::Error| {
        "Text recognition failed. You can still draw manual boxes.".to_string()
    };
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|_| "Windows text recognition is unavailable. Add an OCR language in Windows Settings, or draw manual boxes.".to_string())?;
    let stream = InMemoryRandomAccessStream::new().map_err(err)?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(err)?;
    writer.WriteBytes(png).map_err(err)?;
    await_op(writer.StoreAsync().map_err(err)?)?;
    await_op(writer.FlushAsync().map_err(err)?)?;
    writer.DetachStream().map_err(err)?;
    stream.Seek(0).map_err(err)?;
    let decoder = await_op(BitmapDecoder::CreateAsync(&stream).map_err(err)?)?;
    let frame = await_op(decoder.GetFrameAsync(0).map_err(err)?)?;
    let bitmap = await_op(frame.GetSoftwareBitmapAsync().map_err(err)?)?;
    let result = await_op(engine.RecognizeAsync(&bitmap).map_err(err)?)?;
    let mut words = Vec::new();
    for line in result.Lines().map_err(err)? {
        for word in line.Words().map_err(err)? {
            let r = word.BoundingRect().map_err(err)?;
            let w = r.Width.max(0.0) as u32;
            let h = r.Height.max(0.0) as u32;
            if w == 0 || h == 0 {
                continue;
            }
            words.push(OcrWord {
                text: word.Text().map_err(err)?.to_string(),
                x: r.X.max(0.0) as u32,
                y: r.Y.max(0.0) as u32,
                w,
                h,
                conf: 1.0,
            });
        }
    }
    Ok(words)
}

#[cfg(target_os = "linux")]
struct LinuxOcr {
    det: Mutex<ort::session::Session>,
    rec: Mutex<ort::session::Session>,
    dict: Vec<String>,
}

#[cfg(target_os = "linux")]
impl LinuxOcr {
    fn load(dir: &Path) -> Result<Self, String> {
        if !verify_manifest(dir) {
            return Err("model checksum mismatch".to_string());
        }
        let dict_data =
            std::fs::read_to_string(dir.join("dict.txt")).map_err(|_| "missing dict.txt")?;
        let dict: Vec<String> = dict_data.lines().map(|l| l.to_string()).collect();
        if dict.is_empty() {
            return Err("dict.txt is empty".to_string());
        }
        let mut det = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("det.onnx"))
            .map_err(|e| e.to_string())?;
        if det.inputs().len() != 1 {
            return Err("unexpected det inputs".to_string());
        }
        let mut rec = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("rec.onnx"))
            .map_err(|e| e.to_string())?;
        if rec.inputs().len() != 1 {
            return Err("unexpected rec inputs".to_string());
        }
        let _ = &mut det;
        let _ = &mut rec;
        Ok(Self {
            det: Mutex::new(det),
            rec: Mutex::new(rec),
            dict,
        })
    }

    fn det_tensor(
        &self,
        rgb: &[u8],
        w: u32,
        h: u32,
    ) -> Option<(ndarray::Array4<f32>, u32, u32, f32)> {
        let max_side = 960u32;
        let scale = (max_side as f32 / w.max(h) as f32).min(1.0);
        let dw = ((w as f32 * scale) as u32).max(32);
        let dh = ((h as f32 * scale) as u32).max(32);
        let img: image::RgbImage = image::imageops::resize(
            &image::RgbImage::from_raw(w, h, rgb.to_vec())?,
            dw,
            dh,
            image::imageops::FilterType::Triangle,
        );
        let mean = [0.485f32, 0.456, 0.406];
        let std = [0.229f32, 0.224, 0.225];
        let mut data = Vec::with_capacity((3 * dw * dh) as usize);
        for c in 0..3 {
            for y in 0..dh {
                for x in 0..dw {
                    let v = img.get_pixel(x, y)[c as usize] as f32 / 255.0;
                    data.push((v - mean[c]) / std[c]);
                }
            }
        }
        let arr = ndarray::Array4::from_shape_vec((1, 3, dh as usize, dw as usize), data).ok()?;
        Some((arr, dw, dh, scale))
    }

    fn recognize(&self, png: &[u8]) -> Result<Vec<OcrWord>, String> {
        let img = image::load_from_memory(png)
            .map_err(|_| "unreadable image")?
            .to_rgb8();
        let (w, h) = (img.width(), img.height());
        if w == 0 || h == 0 || w > 8000 || h > 8000 {
            return Err("unsupported image size".to_string());
        }
        let raw = img.into_raw();
        let (map, dw, dh, scale) = self.det_tensor(&raw, w, h).ok_or("bad image")?;
        let t = ort::value::TensorRef::from_array_view(&map).map_err(|_| "tensor failed")?;
        let mut det = self.det.lock().map_err(|_| "ocr busy")?;
        let outputs = det.run([t]).map_err(|_| "detection failed")?;
        drop(det);
        let value = if outputs.len() > 0 {
            &outputs[0]
        } else {
            return Err("detection failed".to_string());
        };
        let (_, data) = value
            .try_extract_tensor::<f32>()
            .map_err(|_| "detection failed")?;
        let boxes = det_boxes(data, dw, dh);
        let mut words = Vec::new();
        for (bx, by, bw, bh) in boxes.into_iter().take(200) {
            let fx = ((bx as f32 / scale) as u32).min(w.saturating_sub(1));
            let fy = ((by as f32 / scale) as u32).min(h.saturating_sub(1));
            let fw = ((bw as f32 / scale) as u32).max(4).min(w - fx);
            let fh = ((bh as f32 / scale) as u32).max(4).min(h - fy);
            if fw < 4 || fh < 4 {
                continue;
            }
            if let Some((text, conf)) = self.recognize_crop(&raw, w, h, fx, fy, fw, fh) {
                if text.chars().count() >= 1 {
                    words.push(OcrWord {
                        text,
                        x: fx,
                        y: fy,
                        w: fw,
                        h: fh,
                        conf,
                    });
                }
            }
        }
        Ok(words)
    }

    fn recognize_crop(
        &self,
        rgb: &[u8],
        w: u32,
        h: u32,
        x: u32,
        y: u32,
        cw: u32,
        ch: u32,
    ) -> Option<(String, f32)> {
        let full = image::RgbImage::from_raw(w, h, rgb.to_vec())?;
        let crop = image::imageops::crop_imm(&full, x, y, cw, ch).to_image();
        let rh = 48u32;
        let rw = ((48.0 * cw as f32 / ch.max(1) as f32) as u32).clamp(48, 960);
        let resized: image::RgbImage =
            image::imageops::resize(&crop, rw, rh, image::imageops::FilterType::Triangle);
        let mut data = Vec::with_capacity((3 * 48 * rw) as usize);
        for c in 0..3 {
            for yy in 0..48 {
                for xx in 0..rw {
                    let v = resized.get_pixel(xx, yy)[c as usize] as f32 / 255.0;
                    data.push((v - 0.5) / 0.5);
                }
            }
        }
        let arr = ndarray::Array4::from_shape_vec((1, 3, 48, rw as usize), data).ok()?;
        let t = ort::value::TensorRef::from_array_view(&arr).ok()?;
        let mut rec = self.rec.lock().ok()?;
        let outputs = rec.run([t]).ok()?;
        drop(rec);
        let value = if outputs.len() > 0 {
            &outputs[0]
        } else {
            return None;
        };
        let (_, data) = value.try_extract_tensor::<f32>().ok()?;
        let nl = self.dict.len() + 1;
        if data.len() % nl != 0 {
            return None;
        }
        let steps = data.len() / nl;
        let mut text = String::new();
        let mut probs: Vec<f32> = Vec::new();
        let mut prev = usize::MAX;
        for s in 0..steps {
            let off = s * nl;
            let mut bi = 0usize;
            let mut m = data[off];
            for (i, v) in data[off..off + nl].iter().enumerate() {
                if *v > m {
                    m = *v;
                    bi = i;
                }
            }
            if bi != 0 && bi != prev {
                if let Some(ch) = self.dict.get(bi - 1) {
                    text.push_str(ch);
                    let mut sum = 0.0f32;
                    for v in &data[off..off + nl] {
                        sum += (*v - m).exp();
                    }
                    probs.push(1.0 / sum);
                }
            }
            prev = bi;
        }
        if text.is_empty() {
            return None;
        }
        let conf = probs.iter().sum::<f32>() / probs.len() as f32;
        Some((text, conf))
    }
}

#[cfg(target_os = "linux")]
fn det_boxes(data: &[f32], dw: u32, dh: u32) -> Vec<(u32, u32, u32, u32)> {
    let w = dw as usize;
    let hgt = dh as usize;
    if data.len() < w * hgt {
        return Vec::new();
    }
    let mut seen = vec![false; w * hgt];
    let mut out = Vec::new();
    for y in 0..hgt {
        for x in 0..w {
            let i = y * w + x;
            if seen[i] || data[i] < 0.4 {
                continue;
            }
            let mut stack = vec![(x, y)];
            seen[i] = true;
            let (mut x0, mut y0, mut x1, mut y1) = (x, y, x, y);
            let mut area = 0usize;
            while let Some((cx, cy)) = stack.pop() {
                area += 1;
                x0 = x0.min(cx);
                y0 = y0.min(cy);
                x1 = x1.max(cx);
                y1 = y1.max(cy);
                for (nx, ny) in [
                    (cx.wrapping_sub(1), cy),
                    (cx + 1, cy),
                    (cx, cy.wrapping_sub(1)),
                    (cx, cy + 1),
                ] {
                    if nx < w && ny < hgt {
                        let ni = ny * w + nx;
                        if !seen[ni] && data[ni] >= 0.4 {
                            seen[ni] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            if area >= 20 {
                out.push((
                    x0.saturating_sub(1) as u32,
                    y0.saturating_sub(1) as u32,
                    ((x1 - x0 + 3).min(w - x0.saturating_sub(1))) as u32,
                    ((y1 - y0 + 3).min(hgt - y0.saturating_sub(1))) as u32,
                ));
            }
        }
    }
    out
}
