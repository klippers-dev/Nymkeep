use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const NER_MIN_CONF: f32 = 0.80;
const NER_CONTINUE_CONF: f32 = 0.50;
const NER_WINDOW_CHARS: usize = 500;
const NER_WINDOW_OVERLAP: usize = 50;
const NER_MAX_TOKENS: usize = 510;

pub struct NerEngine {
    session: Mutex<ort::session::Session>,
    vocab: HashMap<String, u32>,
    labels: Vec<String>,
    cls_id: i64,
    sep_id: i64,
}

struct NormText {
    text: String,
    to_orig: Vec<usize>,
    orig_end: Vec<usize>,
}

fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}' | '\u{20000}'..='\u{2A6DF}'
        | '\u{2A600}'..='\u{2D7FF}' | '\u{2F800}'..='\u{2FA1F}' | '\u{3000}'..='\u{303F}'
        | '\u{3040}'..='\u{309F}' | '\u{30A0}'..='\u{30FF}' | '\u{3100}'..='\u{312F}'
        | '\u{3130}'..='\u{318F}' | '\u{3200}'..='\u{32FF}' | '\u{FF00}'..='\u{FFEF}')
}

fn is_punct(c: char) -> bool {
    c.is_ascii_punctuation()
}

fn push_mapped(
    out: &mut String,
    to_orig: &mut Vec<usize>,
    orig_end: &mut Vec<usize>,
    s: &str,
    os: usize,
    oe: usize,
) {
    for _ in 0..s.len() {
        to_orig.push(os);
        orig_end.push(oe);
    }
    out.push_str(s);
}

fn normalize(text: &str) -> NormText {
    use unicode_normalization::UnicodeNormalization;
    let mut out = String::new();
    let mut to_orig: Vec<usize> = Vec::new();
    let mut orig_end: Vec<usize> = Vec::new();
    let mut idx = 0usize;
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    while idx < chars.len() {
        let (os, c) = chars[idx];
        let oe = if idx + 1 < chars.len() {
            chars[idx + 1].0
        } else {
            text.len()
        };
        idx += 1;
        if c.is_control() && !c.is_whitespace() {
            continue;
        }
        if c.is_whitespace() {
            push_mapped(&mut out, &mut to_orig, &mut orig_end, " ", os, oe);
            continue;
        }
        if is_cjk(c) {
            push_mapped(&mut out, &mut to_orig, &mut orig_end, " ", os, oe);
            let mut buf = String::new();
            buf.push(c);
            push_mapped(&mut out, &mut to_orig, &mut orig_end, &buf, os, oe);
            push_mapped(&mut out, &mut to_orig, &mut orig_end, " ", os, oe);
            continue;
        }
        for lc in c.to_lowercase() {
            for d in lc.nfkd() {
                if unicode_normalization::char::is_combining_mark(d) {
                    continue;
                }
                let mut buf = String::new();
                buf.push(d);
                push_mapped(&mut out, &mut to_orig, &mut orig_end, &buf, os, oe);
            }
        }
    }
    NormText {
        text: out,
        to_orig,
        orig_end,
    }
}

fn basic_tokens(norm: &NormText) -> Vec<(usize, usize)> {
    let bytes = norm.text.as_bytes();
    let mut toks: Vec<(usize, usize)> = Vec::new();
    let mut i = 0usize;
    while i < bytes.len() {
        let c = norm.text[i..].chars().next().unwrap();
        if c.is_whitespace() {
            i += c.len_utf8();
            continue;
        }
        if is_punct(c) {
            toks.push((i, i + c.len_utf8()));
            i += c.len_utf8();
            continue;
        }
        let start = i;
        while i < bytes.len() {
            let d = norm.text[i..].chars().next().unwrap();
            if d.is_whitespace() || is_punct(d) {
                break;
            }
            i += d.len_utf8();
        }
        toks.push((start, i));
    }
    toks
}

fn hex_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.trim();
    if s.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let hi = (bytes[i] as char).to_digit(16)?;
        let lo = (bytes[i + 1] as char).to_digit(16)?;
        out.push((hi * 16 + lo) as u8);
        i += 2;
    }
    Some(out)
}

fn verify_file(path: &Path, sha_hex: &str) -> bool {
    use sha2::{Digest, Sha256};
    let data = match std::fs::read(path) {
        Ok(d) => d,
        Err(_) => return false,
    };
    let digest = Sha256::digest(&data);
    match hex_decode(sha_hex) {
        Some(h) => h.as_slice() == digest.as_slice(),
        None => false,
    }
}

fn manifest_ok(dir: &Path) -> bool {
    let data = match std::fs::read_to_string(dir.join("manifest.json")) {
        Ok(data) => data,
        Err(_) => return false,
    };
    let manifest: serde_json::Value = match serde_json::from_str(&data) {
        Ok(value) => value,
        Err(_) => return false,
    };
    ["pii-model.onnx", "config.json", "vocab.txt"]
        .iter()
        .all(|name| {
            manifest
                .get("files")
                .and_then(|f| f.get(name))
                .and_then(|e| e.get("sha256"))
                .and_then(|s| s.as_str())
                .filter(|s| s.len() == 64)
                .map(|hash| verify_file(&dir.join(name), hash))
                .unwrap_or(false)
        })
}

pub fn find_model_dir() -> Option<PathBuf> {
    let mut cands: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("NYMKEEP_MODELS") {
        cands.push(PathBuf::from(p));
    }
    if let Ok(cwd) = std::env::current_dir() {
        cands.push(cwd.join("models"));
        cands.push(cwd.join("src-tauri").join("models"));
    }
    cands.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            cands.push(dir.join("models"));
        }
    }
    cands
        .into_iter()
        .find(|d| d.join("pii-model.onnx").exists())
}

fn load_labels(dir: &Path) -> Result<Vec<String>, String> {
    let data =
        std::fs::read_to_string(dir.join("config.json")).map_err(|_| "missing config.json")?;
    let v: serde_json::Value = serde_json::from_str(&data).map_err(|_| "unreadable config.json")?;
    let id2label = v
        .get("id2label")
        .and_then(|m| m.as_object())
        .ok_or_else(|| "config.json has no id2label".to_string())?;
    let mut labels: Vec<(usize, String)> = Vec::new();
    for (k, val) in id2label {
        let idx: usize = k.parse().map_err(|_| "bad label id".to_string())?;
        let name = val
            .as_str()
            .ok_or_else(|| "bad label name".to_string())?
            .to_string();
        labels.push((idx, name));
    }
    labels.sort_by_key(|(i, _)| *i);
    Ok(labels.into_iter().map(|(_, n)| n).collect())
}

fn map_label(name: &str) -> Option<&'static str> {
    match name {
        "PERSON" => Some("PERSON"),
        "ORGANIZATION" => Some("ORG"),
        "LOCATION" => Some("LOC"),
        _ => None,
    }
}

fn windows(text: &str) -> Vec<(usize, &str)> {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    if chars.is_empty() {
        return Vec::new();
    }
    let mut out: Vec<(usize, &str)> = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let mut end = (start + NER_WINDOW_CHARS).min(chars.len());
        // A WordPiece cannot outnumber normalized characters. Bound by normalized
        // length so punctuation-heavy and Unicode inputs never lose a token tail.
        while end > start + 1 {
            let byte_end = chars.get(end).map(|c| c.0).unwrap_or(text.len());
            if normalize(&text[chars[start].0..byte_end])
                .text
                .chars()
                .count()
                <= NER_MAX_TOKENS
            {
                break;
            }
            end = start + (end - start) / 2;
        }
        let bs = chars[start].0;
        let be = if end < chars.len() {
            chars[end].0
        } else {
            text.len()
        };
        out.push((bs, &text[bs..be]));
        if end >= chars.len() {
            break;
        }
        start = end.saturating_sub(NER_WINDOW_OVERLAP.min((end - start) / 2));
    }
    out
}

fn load_vocab(dir: &Path) -> Result<HashMap<String, u32>, String> {
    let data = std::fs::read_to_string(dir.join("vocab.txt")).map_err(|_| "missing vocab.txt")?;
    let mut vocab: HashMap<String, u32> = HashMap::new();
    for (i, line) in data.lines().enumerate() {
        let token = line.trim_end_matches(['\n', '\r']);
        vocab.insert(token.to_string(), i as u32);
    }
    if vocab.is_empty() {
        return Err("vocab.txt is empty".to_string());
    }
    Ok(vocab)
}

impl NerEngine {
    pub fn load(dir: &Path) -> Result<Self, String> {
        for f in ["pii-model.onnx", "vocab.txt", "config.json"] {
            if !dir.join(f).exists() {
                return Err(format!("model dir is missing {}", f));
            }
        }
        if !manifest_ok(dir) {
            return Err("model checksum mismatch".to_string());
        }
        let labels = load_labels(dir)?;
        if labels.is_empty() {
            return Err("model has no labels".to_string());
        }
        let vocab = load_vocab(dir)?;
        let get = |t: &str, fb: i64| vocab.get(t).map(|&v| v as i64).unwrap_or(fb);
        let cls_id = get("[CLS]", 101);
        let sep_id = get("[SEP]", 102);
        let session = ort::session::Session::builder()
            .map_err(|e| e.to_string())?
            .commit_from_file(dir.join("pii-model.onnx"))
            .map_err(|e| e.to_string())?;
        if session.inputs().len() != 3 {
            return Err("unexpected model inputs".to_string());
        }
        Ok(Self {
            session: Mutex::new(session),
            vocab,
            labels,
            cls_id,
            sep_id,
        })
    }

    pub fn label_count(&self) -> usize {
        self.labels.len()
    }

    fn wordpiece(&self, token: &str) -> Vec<(u32, usize, usize)> {
        let mut pieces: Vec<(u32, usize, usize)> = Vec::new();
        if token.chars().count() > 100 {
            if let Some(&id) = self.vocab.get("[UNK]") {
                pieces.push((id, 0, token.len()));
            }
            return pieces;
        }
        let bytes = token.as_bytes();
        let mut start = 0usize;
        while start < bytes.len() {
            let mut end = bytes.len();
            let mut found_id: Option<u32> = None;
            while end > start {
                if !token.is_char_boundary(end) {
                    end -= 1;
                    continue;
                }
                let mut cand = String::new();
                if start > 0 {
                    cand.push_str("##");
                }
                cand.push_str(&token[start..end]);
                if let Some(&id) = self.vocab.get(&cand) {
                    found_id = Some(id);
                    break;
                }
                end -= 1;
                while end > start && !token.is_char_boundary(end) {
                    end -= 1;
                }
            }
            match found_id {
                Some(id) => {
                    pieces.push((id, start, end));
                    start = end;
                }
                None => {
                    pieces.clear();
                    if let Some(&id) = self.vocab.get("[UNK]") {
                        pieces.push((id, 0, token.len()));
                    }
                    return pieces;
                }
            }
        }
        pieces
    }

    fn infer_window(&self, window: &str) -> Vec<(usize, usize, &'static str)> {
        let mut found: Vec<(usize, usize, &'static str)> = Vec::new();
        let norm = normalize(window);
        let map = |ns: usize, ne: usize| -> Option<(usize, usize)> {
            if ns >= ne || ne > norm.text.len() || norm.to_orig.len() != norm.text.len() {
                return None;
            }
            Some((norm.to_orig[ns], norm.orig_end[ne - 1]))
        };
        let mut ids: Vec<i64> = Vec::new();
        let mut offsets: Vec<(usize, usize)> = Vec::new();
        for (ns, ne) in basic_tokens(&norm) {
            let token = &norm.text[ns..ne];
            for (id, ps, pe) in self.wordpiece(token) {
                if ids.len() >= NER_MAX_TOKENS {
                    break;
                }
                ids.push(id as i64);
                if let Some((os, oe)) = map(ns + ps, ns + pe) {
                    offsets.push((os, oe));
                } else {
                    ids.pop();
                }
            }
            if ids.len() >= NER_MAX_TOKENS {
                break;
            }
        }
        if ids.is_empty() {
            return found;
        }
        let k = offsets.len().min(ids.len());
        ids.truncate(k);
        offsets.truncate(k);
        let mut full: Vec<i64> = Vec::with_capacity(k + 2);
        full.push(self.cls_id);
        full.extend_from_slice(&ids[..k]);
        full.push(self.sep_id);
        let n = full.len();
        let mask = vec![1i64; n];
        let types = vec![0i64; n];
        let ids_a = match ndarray::Array2::from_shape_vec((1, n), full) {
            Ok(a) => a,
            Err(_) => return found,
        };
        let mask_a = match ndarray::Array2::from_shape_vec((1, n), mask) {
            Ok(a) => a,
            Err(_) => return found,
        };
        let types_a = match ndarray::Array2::from_shape_vec((1, n), types) {
            Ok(a) => a,
            Err(_) => return found,
        };
        let t_ids = match ort::value::TensorRef::from_array_view(&ids_a) {
            Ok(t) => t,
            Err(_) => return found,
        };
        let t_mask = match ort::value::TensorRef::from_array_view(&mask_a) {
            Ok(t) => t,
            Err(_) => return found,
        };
        let t_types = match ort::value::TensorRef::from_array_view(&types_a) {
            Ok(t) => t,
            Err(_) => return found,
        };
        let inputs = vec![
            ("input_ids".to_string(), t_ids),
            ("attention_mask".to_string(), t_mask),
            ("token_type_ids".to_string(), t_types),
        ];
        let mut session = match self.session.lock() {
            Ok(g) => g,
            Err(_) => return found,
        };
        let outputs = match session.run(inputs) {
            Ok(o) => o,
            Err(_) => return found,
        };
        let value = match outputs.get("logits") {
            Some(v) => v,
            None => {
                if outputs.len() > 0 {
                    &outputs[0]
                } else {
                    return found;
                }
            }
        };
        let data: &[f32] = match value.try_extract_tensor::<f32>() {
            Ok((_, d)) => d,
            Err(_) => return found,
        };
        let nl = self.labels.len();
        if nl == 0 || data.len() % nl != 0 {
            return found;
        }
        let seq = data.len() / nl;
        let best = |row: usize| -> (usize, f32) {
            let off = row * nl;
            let mut m = data[off];
            for v in &data[off + 1..off + nl] {
                if *v > m {
                    m = *v;
                }
            }
            let mut sum = 0.0f32;
            for v in &data[off..off + nl] {
                sum += (*v - m).exp();
            }
            let mut bi = 0usize;
            let mut bp = 0.0f32;
            for (i, v) in data[off..off + nl].iter().enumerate() {
                let p = (*v - m).exp() / sum;
                if p > bp {
                    bp = p;
                    bi = i;
                }
            }
            (bi, bp)
        };
        let mut i = 1usize;
        while i <= k && i < seq {
            let (li, pi) = best(i);
            let name = self.labels.get(li).map(|s| s.as_str()).unwrap_or("O");
            if name.starts_with("B-") && pi >= NER_MIN_CONF {
                let typ = &name[2..];
                let mut j = i;
                while j + 1 <= k && j + 1 < seq {
                    let (lj, pj) = best(j + 1);
                    let want = format!("I-{}", typ);
                    if self.labels.get(lj).map(|s| s.as_str()) == Some(want.as_str())
                        && pj >= NER_CONTINUE_CONF
                    {
                        j += 1;
                    } else {
                        break;
                    }
                }
                let (s, _) = offsets[i - 1];
                let (_, e) = offsets[j - 1];
                if e > s && e <= window.len() {
                    let frag = &window[s..e];
                    let lead = frag.len() - frag.trim_start().len();
                    let trail = frag.len() - frag.trim_end().len();
                    let ns = s + lead;
                    let ne = e - trail;
                    if ne > ns && window[ns..ne].chars().count() >= 2 {
                        if let Some(kind) = map_label(typ) {
                            found.push((ns, ne, kind));
                        }
                    }
                }
                i = j + 1;
            } else {
                i += 1;
            }
        }
        found
    }

    pub fn spans(&self, text: &str) -> Vec<(usize, usize, &'static str)> {
        let mut out: Vec<(usize, usize, &'static str)> = Vec::new();
        for (base, window) in windows(text) {
            for (s, e, k) in self.infer_window(window) {
                out.push((base + s, base + e, k));
            }
        }
        out.sort();
        out.dedup();
        out
    }
}

#[cfg(test)]
mod coverage_tests {
    use super::*;
    #[test]
    fn windows_cover_long_and_dense_unicode_inputs() {
        for text in ["abc ".repeat(2500), "界! ".repeat(2500), "ﬃ".repeat(2500)] {
            let spans = windows(&text);
            assert!(spans.len() > 3);
            let mut covered = 0;
            for (start, window) in spans {
                assert!(start <= covered);
                assert!(normalize(window).text.chars().count() <= NER_MAX_TOKENS);
                covered = covered.max(start + window.len());
            }
            assert_eq!(covered, text.len());
        }
    }
    #[test]
    fn missing_or_empty_manifest_never_enables_model() {
        let dir =
            std::env::temp_dir().join(format!("nymkeep-manifest-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!manifest_ok(&dir));
        std::fs::write(dir.join("manifest.json"), "{}").unwrap();
        assert!(!manifest_ok(&dir));
        std::fs::remove_file(dir.join("manifest.json")).unwrap();
        std::fs::remove_dir(&dir).unwrap();
    }
}
