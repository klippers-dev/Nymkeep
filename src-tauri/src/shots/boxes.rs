//! Word-to-pixel mapping for screenshot redaction.
//!
//! The OCR layer reports words with pixel boxes. The detector core reports
//! secret spans as byte ranges in the joined text. This module aligns the two
//! so each placeholder token knows exactly which pixels to redact. Pure logic,
//! no I/O, fully unit-tested.

use super::ocr::OcrWord;
use crate::core::Mapping;

#[derive(Debug, Clone)]
pub struct JoinedWord {
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
    pub conf: f32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixelBox {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Redaction {
    pub token: String,
    pub boxes: Vec<PixelBox>,
}

fn same_line(a: &OcrWord, b: &OcrWord) -> bool {
    a.y < b.y + b.h && b.y < a.y + a.h
}

fn fragment_gap(prev: &OcrWord, next: &OcrWord) -> Option<()> {
    if !same_line(prev, next) {
        return None;
    }
    let gap = next.x as i64 - (prev.x + prev.w) as i64;
    let limit = (prev.h.min(next.h) / 8).max(1) as i64;
    if gap <= limit {
        Some(())
    } else {
        None
    }
}

pub fn join_words(words: &[OcrWord]) -> (String, Vec<JoinedWord>) {
    let mut text = String::new();
    let mut out = Vec::with_capacity(words.len());
    for (i, word) in words.iter().enumerate() {
        if i > 0 && fragment_gap(&words[i - 1], word).is_none() {
            text.push(' ');
        }
        let start = text.len();
        text.push_str(&word.text);
        out.push(JoinedWord {
            text: word.text.clone(),
            start,
            end: text.len(),
            x: word.x,
            y: word.y,
            w: word.w,
            h: word.h,
            conf: word.conf,
        });
    }
    (text, out)
}

fn occurrences(haystack: &str, needle: &str) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    if needle.is_empty() {
        return out;
    }
    let mut from = 0usize;
    while from <= haystack.len() {
        match haystack[from..].find(needle) {
            Some(rel) => {
                let start = from + rel;
                let end = start + needle.len();
                out.push((start, end));
                from = end;
            }
            None => break,
        }
    }
    out
}

fn pad_box(x: u32, y: u32, w: u32, h: u32) -> PixelBox {
    let pad = (h / 10).max(2);
    PixelBox {
        x: x.saturating_sub(pad),
        y: y.saturating_sub(pad),
        w: w.saturating_add(pad * 2),
        h: h.saturating_add(pad * 2),
    }
}

pub fn map_to_boxes(text: &str, joined: &[JoinedWord], mappings: &[Mapping]) -> Vec<Redaction> {
    let mut redactions = Vec::new();
    for mapping in mappings {
        let mut boxes: Vec<PixelBox> = Vec::new();
        for (ms, me) in occurrences(text, &mapping.original) {
            for w in joined {
                if w.w == 0 || w.h == 0 {
                    continue;
                }
                if w.start < me && w.end > ms {
                    let padded = pad_box(w.x, w.y, w.w, w.h);
                    if !boxes.iter().any(|b: &PixelBox| {
                        b.x == padded.x && b.y == padded.y && b.w == padded.w && b.h == padded.h
                    }) {
                        boxes.push(padded);
                    }
                }
            }
        }
        if !boxes.is_empty() {
            redactions.push(Redaction {
                token: mapping.token.clone(),
                boxes,
            });
        }
    }
    redactions
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shots::ocr::OcrWord;

    fn word(text: &str, start: usize, x: u32) -> JoinedWord {
        JoinedWord {
            text: text.to_string(),
            start,
            end: start + text.len(),
            x,
            y: 0,
            w: 10,
            h: 10,
            conf: 1.0,
        }
    }

    fn mapping(token: &str, original: &str) -> Mapping {
        Mapping {
            token: token.to_string(),
            original: original.to_string(),
            kind: "EMAIL".to_string(),
        }
    }

    #[test]
    fn join_tracks_unicode_offsets() {
        let words = vec![
            OcrWord {
                text: "नमस्ते".to_string(),
                x: 0,
                y: 0,
                w: 10,
                h: 10,
                conf: 1.0,
            },
            OcrWord {
                text: "a@b.co".to_string(),
                x: 30,
                y: 0,
                w: 10,
                h: 10,
                conf: 1.0,
            },
        ];
        let (text, joined) = join_words(&words);
        assert_eq!(text, "नमस्ते a@b.co");
        assert_eq!((joined[0].start, joined[0].end), (0, "नमस्ते".len()));
        assert_eq!(&text[joined[1].start..joined[1].end], "a@b.co");
    }

    fn ocr_word(text: &str, x: u32, y: u32, w: u32, h: u32) -> OcrWord {
        OcrWord {
            text: text.to_string(),
            x,
            y,
            w,
            h,
            conf: 1.0,
        }
    }

    #[test]
    fn adjacent_fragments_join_without_space() {
        let words = vec![
            ocr_word("a", 0, 0, 8, 16),
            ocr_word("lex@b.co", 9, 0, 60, 16),
        ];
        let (text, joined) = join_words(&words);
        assert_eq!(text, "alex@b.co");
        assert_eq!(&text[joined[1].start..joined[1].end], "lex@b.co");
        let out = map_to_boxes(&text, &joined, &[mapping("EMAIL_1", "alex@b.co")]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].boxes.len(), 2);
    }

    #[test]
    fn spaced_words_keep_their_space() {
        let words = vec![
            ocr_word("mail", 0, 0, 30, 16),
            ocr_word("a@b.co", 40, 0, 50, 16),
        ];
        let (text, _) = join_words(&words);
        assert_eq!(text, "mail a@b.co");
    }

    #[test]
    fn different_lines_keep_their_space() {
        let words = vec![
            ocr_word("a", 0, 0, 8, 16),
            ocr_word("lex@b.co", 9, 40, 60, 16),
        ];
        let (text, _) = join_words(&words);
        assert_eq!(text, "a lex@b.co");
    }

    #[test]
    fn maps_every_occurrence_to_boxes() {
        let joined = vec![
            word("mail", 0, 0),
            word("a@b.co", 5, 20),
            word("and", 12, 40),
            word("a@b.co", 16, 60),
        ];
        let out = map_to_boxes(
            "mail a@b.co and a@b.co",
            &joined,
            &[mapping("EMAIL_1", "a@b.co")],
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].token, "EMAIL_1");
        let xs: Vec<u32> = out[0].boxes.iter().map(|b| b.x).collect();
        assert_eq!(xs, vec![18, 58]);
        for b in &out[0].boxes {
            assert_eq!((b.w, b.h), (14, 14));
        }
    }

    #[test]
    fn padding_covers_glyph_edges() {
        let joined = vec![word("a@b.co", 0, 0)];
        let out = map_to_boxes("a@b.co", &joined, &[mapping("EMAIL_1", "a@b.co")]);
        assert_eq!(out.len(), 1);
        let b = &out[0].boxes[0];
        assert_eq!((b.x, b.y, b.w, b.h), (0, 0, 14, 14));
    }

    #[test]
    fn skips_zero_area_words() {
        let mut w = word("a@b.co", 0, 5);
        w.w = 0;
        let out = map_to_boxes("a@b.co", &[w], &[mapping("EMAIL_1", "a@b.co")]);
        assert!(out.is_empty());
    }

    #[test]
    fn no_match_gives_no_redaction() {
        let joined = vec![word("hello", 0, 0)];
        let out = map_to_boxes("hello", &joined, &[mapping("EMAIL_1", "a@b.co")]);
        assert!(out.is_empty());
    }
}
