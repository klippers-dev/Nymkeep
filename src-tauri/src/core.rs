use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub const MAX_INPUT_BYTES: usize = 100_000;
pub const MAX_MAPPINGS: usize = 10_000;
pub const SESSION_TTL: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KindCount {
    pub kind: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Protection {
    pub text: String,
    pub count: usize,
    pub mappings: Vec<Mapping>,
    pub kinds: Vec<KindCount>,
    pub ner_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Restoration {
    pub text: String,
    pub known: usize,
    pub unknown: usize,
    pub unknown_tokens: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyRules {
    #[serde(default)]
    pub always: Vec<String>,
    #[serde(default)]
    pub never: Vec<String>,
    #[serde(default)]
    pub money_dates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mapping {
    pub token: String,
    pub original: String,
    pub kind: String,
}

#[derive(Debug, Clone)]
struct Entry {
    token: String,
    original: String,
    kind: String,
    touched: Instant,
}

#[derive(Clone)]
struct Session {
    forward: HashMap<String, usize>,
    entries: Vec<Entry>,
    counters: HashMap<String, usize>,
}

impl Default for Session {
    fn default() -> Self {
        Self {
            forward: HashMap::new(),
            entries: Vec::new(),
            counters: HashMap::new(),
        }
    }
}

struct Span {
    start: usize,
    end: usize,
    kind: &'static str,
    priority: u8,
}

impl Session {
    fn token_for(&mut self, original: &str, kind: &str) -> Result<(String, bool), CoreError> {
        let key = original.to_string();
        if let Some(&idx) = self.forward.get(&key) {
            self.entries[idx].touched = Instant::now();
            return Ok((self.entries[idx].token.clone(), false));
        }
        if self.entries.len() >= MAX_MAPPINGS {
            return Err(CoreError::MappingLimitReached);
        }
        let n = self.counters.get(kind).copied().unwrap_or(0) + 1;
        self.counters.insert(kind.to_string(), n);
        let token = format!("{}_{}", kind.to_uppercase(), n);
        let idx = self.entries.len();
        self.entries.push(Entry {
            token: token.clone(),
            original: original.to_string(),
            kind: kind.to_string(),
            touched: Instant::now(),
        });
        self.forward.insert(key, idx);
        Ok((token, true))
    }

    fn original_for(&mut self, token: &str) -> Option<String> {
        let idx = self.entries.iter().position(|e| e.token == token)?;
        self.entries[idx].touched = Instant::now();
        Some(self.entries[idx].original.clone())
    }

    fn expire(&mut self) {
        let now = Instant::now();
        self.entries
            .retain(|e| now.duration_since(e.touched) < SESSION_TTL);
        self.forward = self
            .entries
            .iter()
            .enumerate()
            .map(|(idx, e)| (e.original.clone(), idx))
            .collect();
    }
}

#[derive(Debug)]
pub enum CoreError {
    InputTooLarge,
    MappingLimitReached,
    Collision,
    BadRule,
    ConflictingRule,
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CoreError::InputTooLarge => write!(f, "input exceeds maximum size"),
            CoreError::MappingLimitReached => write!(f, "session mapping limit reached"),
            CoreError::Collision => write!(
                f,
                "input contains placeholder-like text that would make restore ambiguous"
            ),
            CoreError::BadRule => write!(f, "Use 2–200 characters per term and at most 500 terms per list."),
            CoreError::ConflictingRule => write!(f, "A term cannot be in both Always protect and Never protect. Remove it from the other list first."),
        }
    }
}

struct NerCache {
    engine: Option<crate::ner::NerEngine>,
    attempted: bool,
    model_dir: Option<std::path::PathBuf>,
}

pub struct Core {
    session: Session,
    rules: PrivacyRules,
    ner: NerCache,
}

impl Default for Core {
    fn default() -> Self {
        Self::new()
    }
}

impl Core {
    pub fn new() -> Self {
        Self {
            session: Session::default(),
            rules: PrivacyRules::default(),
            ner: NerCache {
                engine: None,
                attempted: false,
                model_dir: None,
            },
        }
    }

    pub fn set_model_dir(&mut self, dir: std::path::PathBuf) {
        self.ner.model_dir = Some(dir);
        self.ner.attempted = false;
        self.ner.engine = None;
    }

    pub fn ner_active(&mut self) -> bool {
        self.ensure_ner();
        self.ner.engine.is_some()
    }

    fn ensure_ner(&mut self) {
        if self.ner.engine.is_some() || self.ner.attempted {
            return;
        }
        self.ner.attempted = true;
        let dir = match &self.ner.model_dir {
            Some(d) => Some(d.clone()),
            None => crate::ner::find_model_dir(),
        };
        if let Some(dir) = dir {
            if let Ok(engine) = crate::ner::NerEngine::load(&dir) {
                self.ner.engine = Some(engine);
            }
        }
    }

    fn ner_spans(&mut self, text: &str) -> Vec<Span> {
        self.ensure_ner();
        match &self.ner.engine {
            Some(engine) => engine
                .spans(text)
                .into_iter()
                .map(|(start, end, kind)| Span {
                    start,
                    end,
                    kind,
                    priority: 3,
                })
                .collect(),
            None => Vec::new(),
        }
    }

    pub fn rules(&self) -> PrivacyRules {
        self.rules.clone()
    }

    pub fn set_rules(&mut self, rules: PrivacyRules) -> Result<PrivacyRules, CoreError> {
        fn clean(list: Vec<String>) -> Result<Vec<String>, CoreError> {
            let mut out: Vec<String> = Vec::new();
            for t in list {
                let t = t.trim().to_string();
                if t.is_empty() {
                    continue;
                }
                if !(2..=200).contains(&t.chars().count()) {
                    return Err(CoreError::BadRule);
                }
                if out.len() >= 500 {
                    return Err(CoreError::BadRule);
                }
                if !out
                    .iter()
                    .any(|e: &String| e.to_lowercase() == t.to_lowercase())
                {
                    out.push(t);
                }
            }
            Ok(out)
        }
        let applied = PrivacyRules {
            always: clean(rules.always)?,
            never: clean(rules.never)?,
            money_dates: rules.money_dates,
        };
        if applied.always.iter().any(|a| {
            applied
                .never
                .iter()
                .any(|n| a.to_lowercase() == n.to_lowercase())
        }) {
            return Err(CoreError::ConflictingRule);
        }
        self.rules = applied.clone();
        Ok(applied)
    }

    pub fn protect(&mut self, text: &str) -> Result<Protection, CoreError> {
        self.protect_with_terms(text, &[])
    }

    pub fn protect_with_terms(
        &mut self,
        text: &str,
        terms: &[String],
    ) -> Result<Protection, CoreError> {
        if text.len() > MAX_INPUT_BYTES {
            return Err(CoreError::InputTooLarge);
        }
        if literal_token_present(text) {
            return Err(CoreError::Collision);
        }
        let mut rules = self.rules.clone();
        let mut validator = Core::new();
        let manual = validator.set_rules(PrivacyRules {
            always: terms.to_vec(),
            ..PrivacyRules::default()
        })?;
        rules.never.retain(|n| {
            !manual
                .always
                .iter()
                .any(|a| a.to_lowercase() == n.to_lowercase())
        });
        rules.always.extend(manual.always);
        self.session.expire();
        let mut all = collect_spans(text, &rules);
        all.extend(self.ner_spans(text));
        let accepted = resolve_spans(text, all, &rules);
        // A failed batch must not consume tokens or partially commit originals.
        let mut session = self.session.clone();
        let ner_active = self.ner.engine.is_some();
        let mut out = String::with_capacity(text.len());
        let mut new_mappings: Vec<Mapping> = Vec::new();
        let mut kind_counts: Vec<KindCount> = Vec::new();
        let mut total = 0usize;
        let mut last = 0usize;
        for span in accepted {
            let original = &text[span.start..span.end];
            out.push_str(&text[last..span.start]);
            let (token, is_new) = session.token_for(original, span.kind)?;
            if is_new {
                new_mappings.push(Mapping {
                    token: token.clone(),
                    original: original.to_string(),
                    kind: span.kind.to_string(),
                });
            }
            match kind_counts.iter_mut().find(|k| k.kind == span.kind) {
                Some(k) => k.count += 1,
                None => kind_counts.push(KindCount {
                    kind: span.kind.to_string(),
                    count: 1,
                }),
            }
            out.push_str(&token);
            total += 1;
            last = span.end;
        }
        out.push_str(&text[last..]);
        self.session = session;
        Ok(Protection {
            text: out,
            count: total,
            mappings: new_mappings,
            kinds: kind_counts,
            ner_active,
        })
    }

    pub fn restore(&mut self, text: &str) -> Result<Restoration, CoreError> {
        if text.len() > MAX_INPUT_BYTES {
            return Err(CoreError::InputTooLarge);
        }
        self.session.expire();
        let mut out = String::with_capacity(text.len());
        let mut known = 0usize;
        let mut unknown = 0usize;
        let mut unknown_tokens: Vec<String> = Vec::new();
        let mut last = 0usize;
        for m in token_like_re().find_iter(text) {
            let raw = &text[m.start()..m.end()];
            let key = raw.to_ascii_uppercase();
            match self.session.original_for(&key) {
                Some(orig) => {
                    out.push_str(&text[last..m.start()]);
                    out.push_str(&orig);
                    known += 1;
                    last = m.end();
                }
                None => {
                    unknown += 1;
                    if unknown_tokens.len() < 20 && !unknown_tokens.iter().any(|t| t == raw) {
                        unknown_tokens.push(raw.to_string());
                    }
                }
            }
        }
        out.push_str(&text[last..]);
        Ok(Restoration {
            text: out,
            known,
            unknown,
            unknown_tokens,
        })
    }

    pub fn clear(&mut self) {
        self.session.forward.clear();
        self.session.entries.clear();
    }

    pub fn session_status(&mut self) -> SessionStatus {
        self.session.expire();
        SessionStatus {
            count: self.session.entries.len(),
            expires_in_seconds: self
                .session
                .entries
                .iter()
                .map(|e| SESSION_TTL.saturating_sub(e.touched.elapsed()).as_secs())
                .min(),
        }
    }

    pub fn mappings(&mut self) -> Vec<Mapping> {
        self.session.expire();
        self.session
            .entries
            .iter()
            .map(|e| Mapping {
                token: e.token.clone(),
                original: e.original.clone(),
                kind: e.kind.clone(),
            })
            .collect()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub count: usize,
    pub expires_in_seconds: Option<u64>,
}

fn boundary_ok(bytes: &[u8], start: usize, end: usize) -> bool {
    let before_ok = start == 0
        || !(bytes[start - 1].is_ascii_alphanumeric()
            || bytes[start - 1] == b'@'
            || bytes[start - 1] == b'.');
    let after_ok = end >= bytes.len() || !(bytes[end].is_ascii_alphanumeric());
    before_ok && after_ok
}

fn literal_token_present(text: &str) -> bool {
    token_like_re().is_match(text)
}

fn email_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b").unwrap())
}

fn url_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r#"(?i)\b(?:https?://|www\.)[^\s<>""'`]+"#).unwrap())
}

fn ipv4_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").unwrap())
}

fn ipv6_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b(?:[0-9A-F]{0,4}:){2,}[0-9A-F:.]+\b").unwrap())
}

fn uuid_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b",
        )
        .unwrap()
    })
}

fn card_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b(?:\d[ \-]?){13,19}\b").unwrap())
}

fn iban_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,28}\b").unwrap())
}

fn jwt_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b").unwrap()
    })
}

fn prefixed_key_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:sk-(?:live|test)-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|gh[op]_[A-Za-z0-9]{20,}|xox[bpas]-[A-Za-z0-9\-]{10,})").unwrap()
    })
}

fn bearer_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"Bearer\s+([A-Za-z0-9\-._~+/=]{16,})").unwrap())
}

fn apikey_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)api[_-]?key\s*[:=]\s*['"]?([A-Za-z0-9\-_]{16,})['"]?"#).unwrap()
    })
}

fn phone_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:\+\d[\d\s().\-]{6,18}\d|\(\d{3}\)\s?\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b|\b(?:91[6-9]\d{9}|0[6-9]\d{9}|[6-9]\d{9})\b)")
            .unwrap()
    })
}

fn token_like_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\b[A-Z][A-Z_]*_\d+\b").unwrap())
}

fn money_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"[$€£₹]\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*\.\d{2}\s?(?:USD|EUR|INR|GBP)\b")
            .unwrap()
    })
}

fn date_re() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b").unwrap()
    })
}

fn trim_trailing_punct(s: &str) -> &str {
    s.trim_end_matches(['.', ',', ';', ':', '!', '?', ')', ']', '}', '\'', '"'])
}

fn trim_url(s: &str) -> &str {
    let mut t = s.trim_end_matches(['.', ',', ';', ':', '!', '?', ']', '}', '\'', '"']);
    loop {
        if t.ends_with(')') && t.matches('(').count() < t.matches(')').count() {
            t = t[..t.len() - 1]
                .trim_end_matches(['.', ',', ';', ':', '!', '?', ']', '}', '\'', '"']);
        } else {
            break;
        }
    }
    t
}

fn word_boundary(text: &str, start: usize, end: usize) -> bool {
    let before = text[..start]
        .chars()
        .next_back()
        .map(|c| c.is_alphanumeric())
        .unwrap_or(false);
    let after = text[end..]
        .chars()
        .next()
        .map(|c| c.is_alphanumeric())
        .unwrap_or(false);
    !before && !after
}

fn valid_date(s: &str) -> bool {
    let sep = if s.contains('-') { '-' } else { '/' };
    let parts: Vec<&str> = s.split(sep).collect();
    if parts.len() != 3 {
        return false;
    }
    let nums: Vec<u32> = parts.iter().filter_map(|p| p.parse::<u32>().ok()).collect();
    if nums.len() != 3 {
        return false;
    }
    let (month, day) = if parts[0].len() == 4 {
        (nums[1], nums[2])
    } else {
        (nums[0], nums[1])
    };
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn valid_ipv4(s: &str) -> bool {
    s.split('.')
        .filter(|p| !p.is_empty() && p.len() <= 3 && p.parse::<u8>().is_ok())
        .count()
        == 4
}

fn valid_ipv6(s: &str) -> bool {
    s.parse::<std::net::IpAddr>()
        .map(|a| a.is_ipv6())
        .unwrap_or(false)
}

fn valid_luhn(s: &str) -> bool {
    let digits: Vec<u32> = s
        .chars()
        .filter(|c| c.is_ascii_digit())
        .map(|c| c.to_digit(10).unwrap())
        .collect();
    if digits.len() < 13 || digits.len() > 19 {
        return false;
    }
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, d)| {
            if i % 2 == 1 {
                let x = d * 2;
                if x > 9 {
                    x - 9
                } else {
                    x
                }
            } else {
                *d
            }
        })
        .sum();
    sum % 10 == 0
}

fn valid_iban(s: &str) -> bool {
    if s.len() < 15 || s.len() > 34 {
        return false;
    }
    let moved = format!("{}{}", &s[4..], &s[..4]);
    let mut rem = 0u32;
    for c in moved.chars() {
        if c.is_ascii_digit() {
            rem = (rem * 10 + c.to_digit(10).unwrap()) % 97;
        } else if c.is_ascii_uppercase() {
            let v = (c as u32 - 'A' as u32) + 10;
            rem = (rem * 100 + v) % 97;
        } else {
            return false;
        }
    }
    rem == 1
}

fn valid_phone(s: &str) -> bool {
    let digits = s.chars().filter(|c| c.is_ascii_digit()).count();
    digits >= 7 && digits <= 15
}

fn push_span(
    spans: &mut Vec<Span>,
    text: &str,
    start: usize,
    end: usize,
    kind: &'static str,
    priority: u8,
) {
    if start >= end
        || end > text.len()
        || !text.is_char_boundary(start)
        || !text.is_char_boundary(end)
    {
        return;
    }
    if boundary_ok(text.as_bytes(), start, end) {
        spans.push(Span {
            start,
            end,
            kind,
            priority,
        });
    }
}

fn collect_spans(text: &str, rules: &PrivacyRules) -> Vec<Span> {
    let mut spans: Vec<Span> = Vec::new();
    for m in url_re().find_iter(text) {
        let trimmed = trim_url(m.as_str());
        push_span(
            &mut spans,
            text,
            m.start(),
            m.start() + trimmed.len(),
            "URL",
            6,
        );
    }
    for m in email_re().find_iter(text) {
        push_span(&mut spans, text, m.start(), m.end(), "EMAIL", 5);
    }
    for m in jwt_re().find_iter(text) {
        push_span(&mut spans, text, m.start(), m.end(), "KEY", 5);
    }
    for m in prefixed_key_re().find_iter(text) {
        push_span(&mut spans, text, m.start(), m.end(), "KEY", 5);
    }
    for c in bearer_re().captures_iter(text) {
        if let Some(g) = c.get(1) {
            push_span(&mut spans, text, g.start(), g.end(), "KEY", 5);
        }
    }
    for c in apikey_re().captures_iter(text) {
        if let Some(g) = c.get(1) {
            push_span(&mut spans, text, g.start(), g.end(), "KEY", 5);
        }
    }
    for m in uuid_re().find_iter(text) {
        push_span(&mut spans, text, m.start(), m.end(), "UUID", 4);
    }
    for m in iban_re().find_iter(text) {
        if valid_iban(m.as_str()) {
            push_span(&mut spans, text, m.start(), m.end(), "IBAN", 4);
        }
    }
    for m in card_re().find_iter(text) {
        let trimmed = m.as_str().trim_end_matches([' ', '-']);
        if valid_luhn(trimmed) {
            push_span(
                &mut spans,
                text,
                m.start(),
                m.start() + trimmed.len(),
                "CARD",
                4,
            );
        }
    }
    for m in ipv4_re().find_iter(text) {
        if valid_ipv4(m.as_str()) {
            push_span(&mut spans, text, m.start(), m.end(), "IP", 3);
        }
    }
    for m in ipv6_re().find_iter(text) {
        let trimmed = trim_trailing_punct(m.as_str());
        if valid_ipv6(trimmed) {
            push_span(
                &mut spans,
                text,
                m.start(),
                m.start() + trimmed.len(),
                "IP",
                3,
            );
        }
    }
    for m in phone_re().find_iter(text) {
        if valid_phone(m.as_str()) {
            push_span(&mut spans, text, m.start(), m.end(), "PHONE", 2);
        }
    }
    if rules.money_dates {
        for m in money_re().find_iter(text) {
            push_span(&mut spans, text, m.start(), m.end(), "MONEY", 1);
        }
        for m in date_re().find_iter(text) {
            if valid_date(m.as_str()) {
                push_span(&mut spans, text, m.start(), m.end(), "DATE", 1);
            }
        }
    }
    if !rules.always.is_empty() {
        let mut terms = rules.always.clone();
        terms.sort_by(|a, b| b.len().cmp(&a.len()));
        let alts: Vec<String> = terms.iter().map(|t| regex::escape(t)).collect();
        if let Ok(re) = Regex::new(&format!("(?i){}", alts.join("|"))) {
            for m in re.find_iter(text) {
                if word_boundary(text, m.start(), m.end()) {
                    spans.push(Span {
                        start: m.start(),
                        end: m.end(),
                        kind: "TERM",
                        priority: 7,
                    });
                }
            }
        }
    }
    spans
}

fn resolve_spans(text: &str, mut spans: Vec<Span>, rules: &PrivacyRules) -> Vec<Span> {
    for term in &rules.never {
        if let Ok(re) = Regex::new(&format!("(?i){}", regex::escape(term))) {
            for m in re.find_iter(text) {
                if word_boundary(text, m.start(), m.end()) {
                    spans.retain(|s| !(s.start >= m.start() && s.end <= m.end()));
                }
            }
        }
    }
    spans.sort_by(|a, b| a.start.cmp(&b.start).then(b.priority.cmp(&a.priority)));
    let mut accepted: Vec<Span> = Vec::with_capacity(spans.len());
    for span in spans {
        if let Some(previous) = accepted.last_mut() {
            if span.start < previous.end {
                // Keep the enclosing entity's kind when a shorter custom term
                // is inside it, but cover the full union of crossing detections.
                if (span.start == previous.start && span.end > previous.end)
                    || (span.end > previous.end && span.priority > previous.priority)
                {
                    previous.kind = span.kind;
                    previous.priority = span.priority;
                }
                previous.end = previous.end.max(span.end);
                continue;
            }
        }
        accepted.push(span);
    }
    accepted
}

#[cfg(test)]
mod tests {
    use super::*;

    fn deterministic_core() -> Core {
        let mut core = Core::new();
        core.set_model_dir(std::path::PathBuf::from("missing-fixture-model"));
        core
    }

    #[test]
    fn protect_replaces_email_with_stable_token() {
        let mut core = deterministic_core();
        let p = core
            .protect("Contact alex@example.com or alex@example.com today")
            .unwrap();
        assert_eq!(p.text, "Contact EMAIL_1 or EMAIL_1 today");
        assert_eq!(p.count, 2);
        assert_eq!(p.mappings.len(), 1);
        assert_eq!(p.mappings[0].original, "alex@example.com");
    }

    #[test]
    fn restore_roundtrips_wrappers_and_boundaries() {
        let mut core = deterministic_core();
        let p = core.protect("mail: alex@example.com end").unwrap();
        let r = core
            .restore(&format!("[{}] plus `EMAIL_1`", p.text))
            .unwrap();
        assert_eq!(
            r.text,
            "[mail: alex@example.com end] plus `alex@example.com`"
        );
        assert_eq!(r.known, 2);
        assert_eq!(r.unknown, 0);
    }

    #[test]
    fn restore_leaves_unknown_tokens_and_counts_them() {
        let mut core = deterministic_core();
        core.protect("a@b.co").unwrap();
        let r = core.restore("PERSON_1 and EMAIL_1").unwrap();
        assert_eq!(r.text, "PERSON_1 and a@b.co");
        assert_eq!(r.known, 1);
        assert_eq!(r.unknown, 1);
    }

    #[test]
    fn clear_removes_all_mappings() {
        let mut core = deterministic_core();
        core.protect("x@y.zz").unwrap();
        core.clear();
        assert!(core.mappings().is_empty());
        let r = core.restore("EMAIL_1").unwrap();
        assert_eq!(r.known, 0);
        assert_eq!(r.unknown, 1);
    }

    #[test]
    fn input_size_limit_enforced() {
        let mut core = deterministic_core();
        let big = "a".repeat(MAX_INPUT_BYTES + 1);
        assert!(matches!(core.protect(&big), Err(CoreError::InputTooLarge)));
    }

    #[test]
    fn tokenizer_protects_email_with_symbol_prefix() {
        let mut core = deterministic_core();
        let p = core.protect("weird&alex@example.com,").unwrap();
        assert_eq!(p.text, "weird&EMAIL_1,");
        assert_eq!(p.count, 1);
    }

    #[test]
    fn protect_detects_phones_urls_and_ips() {
        let mut core = deterministic_core();
        let p = core
            .protect("call +1 415-555-0132 or visit https://example.com/x. host 10.0.0.8 ok")
            .unwrap();
        assert_eq!(p.text, "call PHONE_1 or visit URL_1. host IP_1 ok");
        assert_eq!(p.count, 3);
    }

    #[test]
    fn protect_rejects_bad_ip_and_keeps_good_ipv6() {
        let mut core = deterministic_core();
        let p = core.protect("bad 999.1.1.1 good 2001:db8::1 end").unwrap();
        assert_eq!(p.text, "bad 999.1.1.1 good IP_1 end");
    }

    #[test]
    fn protect_validates_cards_and_ibans() {
        let mut core = deterministic_core();
        let p = core
            .protect("card 4111 1111 1111 1111 bad 4111 1111 1111 1112 iban GB29NWBK60161331926819")
            .unwrap();
        assert_eq!(p.text, "card CARD_1 bad 4111 1111 1111 1112 iban IBAN_1");
    }

    #[test]
    fn protect_detects_keys_and_bearer() {
        let mut core = deterministic_core();
        let p = core
            .protect("key AKIAIOSFODNN7EXAMPLE and Bearer abcdefghijklmnop end")
            .unwrap();
        assert_eq!(p.text, "key KEY_1 and Bearer KEY_2 end");
        let r = core.restore("use KEY_1 then KEY_2").unwrap();
        assert_eq!(r.text, "use AKIAIOSFODNN7EXAMPLE then abcdefghijklmnop");
        assert_eq!(r.known, 2);
    }

    #[test]
    fn overlap_prefers_whole_url_over_inner_email() {
        let mut core = deterministic_core();
        let p = core
            .protect("see https://example.com/a@b.com/x end")
            .unwrap();
        assert_eq!(p.text, "see URL_1 end");
        assert_eq!(p.count, 1);
    }

    #[test]
    fn counters_are_per_kind_and_uuid_roundtrips() {
        let mut core = deterministic_core();
        let id = "123e4567-e89b-12d3-a456-426614174000";
        let p = core
            .protect(&format!("a@b.co 415-555-0100 {}", id))
            .unwrap();
        assert_eq!(p.text, "EMAIL_1 PHONE_1 UUID_1");
        let r = core.restore("id UUID_1 mail EMAIL_1 tel PHONE_1").unwrap();
        assert_eq!(r.text, format!("id {} mail a@b.co tel 415-555-0100", id));
    }

    #[test]
    fn restore_matches_lowercase_tokens() {
        let mut core = deterministic_core();
        core.protect("a@b.co").unwrap();
        let r = core.restore("mail email_1 end").unwrap();
        assert_eq!(r.text, "mail a@b.co end");
        assert_eq!(r.known, 1);
    }

    #[test]
    fn restore_never_restores_partial_tokens() {
        let mut core = deterministic_core();
        core.protect("a@b.co").unwrap();
        let r = core.restore("see EMAIL_12 here").unwrap();
        assert_eq!(r.text, "see EMAIL_12 here");
        assert_eq!(r.known, 0);
        assert_eq!(r.unknown, 1);
        assert_eq!(r.unknown_tokens, vec!["EMAIL_12".to_string()]);
    }

    #[test]
    fn restore_handles_possessive_and_bold_wrappers() {
        let mut core = deterministic_core();
        core.protect("a@b.co").unwrap();
        let r = core.restore("**EMAIL_1** and EMAIL_1's team").unwrap();
        assert_eq!(r.text, "**a@b.co** and a@b.co's team");
        assert_eq!(r.known, 2);
    }

    #[test]
    fn protect_handles_unicode_surroundings() {
        let mut core = deterministic_core();
        let p = core
            .protect("नमस्ते a@b.co 🎉 مرحبا 415-555-0100 done")
            .unwrap();
        assert_eq!(p.text, "नमस्ते EMAIL_1 🎉 مرحبا PHONE_1 done");
        let r = core.restore(&p.text).unwrap();
        assert_eq!(r.known, 2);
    }

    #[test]
    fn protect_accepts_empty_and_exact_limit() {
        let mut core = deterministic_core();
        let p = core.protect("").unwrap();
        assert_eq!(p.count, 0);
        assert_eq!(p.text, "");
        let exact = "a".repeat(MAX_INPUT_BYTES);
        assert!(core.protect(&exact).is_ok());
    }

    #[test]
    fn url_keeps_balanced_parens_and_trims_stray() {
        let mut core = deterministic_core();
        let p = core
            .protect("see https://en.wikipedia.org/wiki/X_(film) end https://example.com/a.")
            .unwrap();
        assert_eq!(p.text, "see URL_1 end URL_2.");
        let maps = core.mappings();
        assert!(maps
            .iter()
            .any(|m| m.original == "https://en.wikipedia.org/wiki/X_(film)"));
        assert!(maps.iter().any(|m| m.original == "https://example.com/a"));
    }

    #[test]
    fn email_ignores_trailing_dot_and_dotted_phones_work() {
        let mut core = deterministic_core();
        let p = core
            .protect("mail a@b.com. call 415.555.0100 or 12345")
            .unwrap();
        assert_eq!(p.text, "mail EMAIL_1. call PHONE_1 or 12345");
    }

    #[test]
    fn bare_digit_phones_need_mobile_structure() {
        let mut core = deterministic_core();
        let p = core
            .protect("call 9876543210 or 919876543210 or 09876543210")
            .unwrap();
        assert_eq!(p.text, "call PHONE_1 or PHONE_2 or PHONE_3");
        let q = core
            .protect("ids 1234567890 and 123456789012 and N159876543210")
            .unwrap();
        assert_eq!(q.text, "ids 1234567890 and 123456789012 and N159876543210");
    }

    #[test]
    fn money_and_dates_need_opt_in() {
        let mut core = deterministic_core();
        let p = core.protect("paid $1,234.56 on 2026-09-18 ok").unwrap();
        assert_eq!(p.text, "paid $1,234.56 on 2026-09-18 ok");
        core.set_rules(PrivacyRules {
            always: vec![],
            never: vec![],
            money_dates: true,
        })
        .unwrap();
        let p = core.protect("paid $1,234.56 on 2026-09-18 ok").unwrap();
        assert_eq!(p.text, "paid MONEY_1 on DATE_1 ok");
        let bad = core.protect("on 2026-99-99 ok").unwrap();
        assert_eq!(bad.text, "on 2026-99-99 ok");
    }

    #[test]
    fn always_terms_match_case_insensitive_and_stay_stable() {
        let mut core = deterministic_core();
        core.set_rules(PrivacyRules {
            always: vec!["Acme".to_string()],
            never: vec![],
            money_dates: false,
        })
        .unwrap();
        let p = core.protect("ACME hired bob@acme.com for Acme").unwrap();
        assert_eq!(p.text, "TERM_1 hired EMAIL_1 for TERM_2");
        assert_eq!(p.mappings.len(), 3);
        assert_eq!(
            core.restore(&p.text).unwrap().text,
            "ACME hired bob@acme.com for Acme"
        );
    }

    #[test]
    fn never_terms_suppress_detection() {
        let mut core = deterministic_core();
        core.set_rules(PrivacyRules {
            always: vec![],
            never: vec!["a@b.co".to_string()],
            money_dates: false,
        })
        .unwrap();
        let p = core.protect("mail a@b.co and x@y.zz").unwrap();
        assert_eq!(p.text, "mail a@b.co and EMAIL_1");
    }

    #[test]
    fn short_custom_terms_rejected() {
        let mut core = deterministic_core();
        assert!(core
            .set_rules(PrivacyRules {
                always: vec!["x".to_string()],
                never: vec![],
                money_dates: false,
            })
            .is_err());
    }

    #[test]
    fn ner_detects_person_and_location_when_model_present() {
        if crate::ner::find_model_dir().is_none() {
            return;
        }
        let mut core = Core::new();
        let p = core
            .protect("My name is Wolfgang and I live in Berlin")
            .unwrap();
        assert!(p.ner_active, "model files exist so NER must load");
        assert_eq!(p.text, "My name is PERSON_1 and I live in LOC_1");
        let r = core.restore("PERSON_1 lives in LOC_1").unwrap();
        assert_eq!(r.text, "Wolfgang lives in Berlin");
    }

    #[test]
    fn ner_missing_model_disables_gracefully() {
        let mut core = deterministic_core();
        core.set_model_dir(std::path::PathBuf::from("definitely-not-a-model-dir"));
        let p = core
            .protect("My name is Wolfgang and I live in Berlin")
            .unwrap();
        assert!(!p.ner_active);
        assert_eq!(p.text, "My name is Wolfgang and I live in Berlin");
        assert_eq!(p.count, 0);
    }

    #[test]
    fn protect_reports_per_kind_summary() {
        let mut core = deterministic_core();
        let p = core.protect("a@b.co x@y.zz 415-555-0100").unwrap();
        let summary: Vec<(String, usize)> =
            p.kinds.iter().map(|k| (k.kind.clone(), k.count)).collect();
        assert_eq!(
            summary,
            vec![("EMAIL".to_string(), 2), ("PHONE".to_string(), 1)]
        );
    }

    #[test]
    fn expiry_rebuilds_indices_without_reassigning_originals() {
        let mut core = deterministic_core();
        core.protect("old@example.com current@example.com third@example.com")
            .unwrap();
        core.session.entries[0].touched = Instant::now() - SESSION_TTL - Duration::from_secs(1);
        assert_eq!(core.session_status().count, 2);
        assert_eq!(
            core.protect("current@example.com third@example.com old@example.com")
                .unwrap()
                .text,
            "EMAIL_2 EMAIL_3 EMAIL_4"
        );
        assert_eq!(
            core.restore("EMAIL_1 EMAIL_2 EMAIL_3 EMAIL_4")
                .unwrap()
                .text,
            "EMAIL_1 current@example.com third@example.com old@example.com"
        );
    }

    #[test]
    fn clear_never_reuses_old_tokens() {
        let mut core = deterministic_core();
        core.protect("old@example.com").unwrap();
        core.clear();
        assert_eq!(core.protect("new@example.com").unwrap().text, "EMAIL_2");
        assert_eq!(core.restore("EMAIL_1").unwrap().unknown, 1);
    }

    #[test]
    fn failed_batch_does_not_commit_partial_mappings() {
        let mut core = deterministic_core();
        for i in 0..MAX_MAPPINGS - 1 {
            core.session
                .token_for(&format!("item-{i}"), "TERM")
                .unwrap();
        }
        assert!(matches!(
            core.protect("one@example.com two@example.com"),
            Err(CoreError::MappingLimitReached)
        ));
        assert_eq!(core.session.entries.len(), MAX_MAPPINGS - 1);
        assert!(!core.session.counters.contains_key("EMAIL"));
        assert_eq!(core.protect("one@example.com").unwrap().text, "EMAIL_1");
    }

    #[test]
    fn manual_review_terms_are_temporary_and_roundtrip_case() {
        let mut core = deterministic_core();
        let input = "Project Aurora and PROJECT AURORA";
        let p = core
            .protect_with_terms(input, &["Project Aurora".into()])
            .unwrap();
        assert_eq!(p.text, "TERM_1 and TERM_2");
        assert_eq!(core.restore(&p.text).unwrap().text, input);
        assert!(core.rules().always.is_empty());
        assert_eq!(core.protect(input).unwrap().count, 0);
    }

    #[test]
    fn manual_review_can_override_a_saved_exception_for_one_draft() {
        let mut core = deterministic_core();
        core.set_rules(PrivacyRules {
            never: vec!["Aurora".into()],
            ..Default::default()
        })
        .unwrap();
        assert_eq!(
            core.protect_with_terms("Aurora", &["Aurora".into()])
                .unwrap()
                .text,
            "TERM_1"
        );
        assert_eq!(core.rules().never, vec!["Aurora"]);
    }

    #[test]
    fn never_rules_apply_to_ner_spans_and_whole_phrases() {
        let text = "New York City";
        let spans = vec![Span {
            start: 0,
            end: 8,
            kind: "LOC",
            priority: 3,
        }];
        let rules = PrivacyRules {
            never: vec![text.into()],
            ..Default::default()
        };
        assert!(resolve_spans(text, spans, &rules).is_empty());
    }

    #[test]
    fn overlapping_spans_cannot_expose_either_tail() {
        let mut core = deterministic_core();
        let input = "https://example.com/path and notes";
        let p = core
            .protect_with_terms(input, &["path and notes".into()])
            .unwrap();
        assert_eq!(p.count, 1);
        assert_eq!(core.restore(&p.text).unwrap().text, input);
        assert!(!p.text.contains("notes"));
    }

    #[test]
    fn invalid_rule_updates_keep_previous_rules() {
        let mut core = deterministic_core();
        core.set_rules(PrivacyRules {
            always: vec!["Acme".into()],
            ..Default::default()
        })
        .unwrap();
        assert!(matches!(
            core.set_rules(PrivacyRules {
                always: vec!["Acme".into()],
                never: vec!["ACME".into()],
                money_dates: false
            }),
            Err(CoreError::ConflictingRule)
        ));
        assert_eq!(core.rules().always, vec!["Acme"]);
        assert!(core.rules().never.is_empty());
        assert!(core
            .set_rules(PrivacyRules {
                always: vec!["x".repeat(201)],
                ..Default::default()
            })
            .is_err());
    }

    #[test]
    fn unicode_byte_limit_and_collision_fail_without_mutation() {
        let mut core = deterministic_core();
        assert!(matches!(
            core.protect(&"界".repeat(33_334)),
            Err(CoreError::InputTooLarge)
        ));
        assert!(matches!(
            core.protect("EMAIL_1 other@example.com"),
            Err(CoreError::Collision)
        ));
        assert_eq!(core.session_status().count, 0);
        assert!(matches!(
            core.restore(&"x".repeat(MAX_INPUT_BYTES + 1)),
            Err(CoreError::InputTooLarge)
        ));
    }

    #[test]
    fn session_metadata_does_not_extend_mapping_lifetime() {
        let mut core = deterministic_core();
        core.protect("one@example.com").unwrap();
        core.session.entries[0].touched = Instant::now() - Duration::from_secs(1700);
        let touched = core.session.entries[0].touched;
        assert!(core.session_status().expires_in_seconds.unwrap() <= 100);
        core.mappings();
        assert_eq!(core.session.entries[0].touched, touched);
    }
}
