//! PP-OCR preprocessing/CTC rules, testable without native model files.

pub(super) fn detector_size(width: u32, height: u32) -> (u32, u32) {
    let scale = (960.0 / width.max(height).max(1) as f32).min(1.0);
    let align = |side: u32| ((side as f32 * scale / 32.0).round() as u32 * 32).max(32);
    (align(width), align(height))
}

pub(super) fn expansion(width: usize, height: usize) -> usize {
    // DB text regions cover glyph centers. Expand the rectangle using the
    // upstream area * 1.5 / perimeter unclip distance, plus a pixel of rounding.
    ((width * height) as f32 * 1.5 / (2 * (width + height)).max(1) as f32).ceil() as usize + 1
}

pub(super) fn decode_ctc(data: &[f32], dictionary: &[String]) -> Option<(String, f32)> {
    let classes = dictionary.len() + 1; // index zero is CTC blank
    if dictionary.is_empty() || data.is_empty() || data.len() % classes != 0 {
        return None;
    }
    let mut text = String::new();
    let mut probabilities = Vec::new();
    let mut previous = usize::MAX;
    for step in data.chunks_exact(classes) {
        if step
            .iter()
            .any(|probability| !probability.is_finite() || !(0.0..=1.0).contains(probability))
        {
            return None;
        }
        let (index, probability) = step.iter().enumerate().max_by(|a, b| a.1.total_cmp(b.1))?;
        if index != 0 && index != previous {
            text.push_str(dictionary.get(index - 1)?);
            // The verified model already returns probabilities, not logits.
            probabilities.push(*probability);
        }
        previous = index;
    }
    if text.trim().is_empty() {
        return None;
    }
    Some((
        text,
        probabilities.iter().sum::<f32>() / probabilities.len() as f32,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detector_sizes_follow_stride_and_keep_both_scaling_axes() {
        assert_eq!(detector_size(1120, 620), (960, 544));
        assert_eq!(detector_size(5, 7), (32, 32));
        assert_eq!(detector_size(620, 1120), (544, 960));
    }

    #[test]
    fn ctc_preserves_spaces_blank_separated_repeats_and_model_confidence() {
        let dictionary = vec!["a".into(), " ".into()];
        let values = [
            0.05, 0.9, 0.05, 0.05, 0.9, 0.05, 0.05, 0.05, 0.9, 0.9, 0.05, 0.05, 0.05, 0.9, 0.05,
            0.9, 0.05, 0.05, 0.05, 0.9, 0.05,
        ];
        let (text, confidence) = decode_ctc(&values, &dictionary).unwrap();
        assert_eq!(text, "a aa");
        assert!((confidence - 0.9).abs() < 0.00001);
        assert!(decode_ctc(&[0.1, f32::NAN, 0.9], &dictionary).is_none());
        assert!(decode_ctc(&[0.1, 2.0, 0.9], &dictionary).is_none());
        assert!(decode_ctc(&[0.1, 0.9], &dictionary).is_none());
    }

    #[test]
    fn text_region_expansion_covers_glyph_edges() {
        assert_eq!(expansion(100, 20), 14);
        assert_eq!(expansion(20, 100), 14);
        assert_eq!(expansion(0, 0), 1);
    }
}
