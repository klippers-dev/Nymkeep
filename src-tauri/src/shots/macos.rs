//! Packaged native Vision helper. Image content travels only over local pipes.
use super::{macos_protocol::decode_response, ocr::OcrWord};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

const FAILURE: &str = "Text recognition failed. You can still draw manual boxes.";

fn wait_bounded(child: &mut Child, seconds: u64) -> Result<ExitStatus, String> {
    let deadline = Instant::now() + Duration::from_secs(seconds);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(FAILURE.into());
            }
        }
    }
}

fn helper_path() -> Option<PathBuf> {
    // No PATH/current-directory search: execute only the bundled or built helper.
    let bundled = std::env::current_exe().ok()?.parent()?.join("nymkeep-ocr");
    if bundled.is_file() {
        return Some(bundled);
    }
    let target = if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else {
        "x86_64-apple-darwin"
    };
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("nymkeep-ocr-{target}"));
    development.is_file().then_some(development)
}

pub fn available() -> bool {
    helper_path().is_some_and(|path| {
        Command::new(path)
            .arg("--probe")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()
            .and_then(|mut child| wait_bounded(&mut child, 5).ok())
            .is_some_and(|status| status.success())
    })
}

pub fn recognize(png: &[u8]) -> Result<Vec<OcrWord>, String> {
    let image = super::decode_image(png)?;
    let (width, height) = image.dimensions();
    drop(image);
    let path = helper_path()
        .ok_or("macOS text recognition is unavailable. You can still draw manual boxes.")?;
    let mut child = Command::new(path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| FAILURE)?;
    let (Some(mut input), Some(output)) = (child.stdin.take(), child.stdout.take()) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(FAILURE.into());
    };
    let png = png.to_vec();
    let writer = std::thread::spawn(move || input.write_all(&png));
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        output
            .take(4 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map(|_| bytes)
    });
    // Closing/killing the child also closes pipes, so neither IO thread can outlive the request.
    let status = wait_bounded(&mut child, 30);
    let written = writer.join().map_err(|_| FAILURE)?.map_err(|_| FAILURE)?;
    let output = reader.join().map_err(|_| FAILURE)?.map_err(|_| FAILURE)?;
    let _ = written;
    if !status?.success() || output.len() > 4 * 1024 * 1024 {
        return Err(FAILURE.into());
    }
    decode_response(&output, width, height)
}
