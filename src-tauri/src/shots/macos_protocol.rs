//! Bounded native OCR response validation, also tested on non-Mac hosts.
use super::ocr::OcrWord;

const FAILURE: &str = "Text recognition failed. You can still draw manual boxes.";

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    width: u32,
    height: u32,
    words: Vec<OcrWord>,
}

pub fn decode_response(bytes: &[u8], width: u32, height: u32) -> Result<Vec<OcrWord>, String> {
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(FAILURE.into());
    }
    let response: Response = serde_json::from_slice(bytes).map_err(|_| FAILURE)?;
    if response.width != width || response.height != height || response.words.len() > 10_000 {
        return Err(FAILURE.into());
    }
    let mut text_bytes = 0usize;
    for word in &response.words {
        text_bytes = text_bytes.saturating_add(word.text.len() + 1);
        if word.text.trim().is_empty()
            || word.text.contains('\0')
            || text_bytes > 100_000
            || !word.conf.is_finite()
            || !(0.0..=1.0).contains(&word.conf)
            || word.w == 0
            || word.h == 0
            || word.x.saturating_add(word.w) > width
            || word.y.saturating_add(word.h) > height
        {
            return Err(FAILURE.into());
        }
    }
    Ok(response.words)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(words: serde_json::Value) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"width": 100, "height": 50, "words": words}))
            .unwrap()
    }
    #[test]
    fn preserves_sensitive_punctuation_and_pixel_coordinates() {
        let data = response(serde_json::json!([
            {"text":"mira@example.com", "x":5,"y":10,"w":80,"h":15,"conf":0.9},
            {"text":"192.0.2.42", "x":5,"y":30,"w":75,"h":15,"conf":1.0}
        ]));
        let words = decode_response(&data, 100, 50).unwrap();
        assert_eq!(words[0].text, "mira@example.com");
        assert_eq!(words[1].text, "192.0.2.42");
        assert_eq!(
            (words[0].x, words[0].y, words[0].w, words[0].h),
            (5, 10, 80, 15)
        );
        assert!(decode_response(&data, 101, 50).is_err());
    }
    #[test]
    fn rejects_invalid_geometry_confidence_and_text_without_echoing_content() {
        for word in [
            serde_json::json!({"text":"fictional@example.com","x":90,"y":0,"w":20,"h":5,"conf":1.0}),
            serde_json::json!({"text":"fictional@example.com","x":0,"y":0,"w":0,"h":5,"conf":1.0}),
            serde_json::json!({"text":"fictional@example.com","x":0,"y":0,"w":20,"h":5,"conf":1.1}),
            serde_json::json!({"text":" ","x":0,"y":0,"w":20,"h":5,"conf":1.0}),
        ] {
            let error = decode_response(&response(serde_json::json!([word])), 100, 50).unwrap_err();
            assert!(!error.contains("fictional"));
        }
    }
    #[test]
    fn rejects_large_or_unknown_responses_and_accepts_no_matches() {
        assert!(decode_response(&vec![b'x'; 4 * 1024 * 1024 + 1], 100, 50).is_err());
        assert!(decode_response(
            br#"{"width":100,"height":50,"words":[],"unexpected":true}"#,
            100,
            50
        )
        .is_err());
        assert!(decode_response(&response(serde_json::json!([])), 100, 50)
            .unwrap()
            .is_empty());
    }
}
