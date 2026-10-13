#![cfg(target_os = "linux")]

use glib::variant::ToVariant;

#[test]
fn string_variant_iteration_preserves_forward_and_backward_values() {
    let values = ["synthetic-one", "", "Unicode नमस्ते", "synthetic-last"];
    let variant = values.to_variant();
    let mut iter = variant.array_iter_str().unwrap();
    assert_eq!(iter.next(), Some(values[0]));
    assert_eq!(iter.next_back(), Some(values[3]));
    assert_eq!(iter.nth(1), Some(values[2]));
    assert_eq!(iter.next(), None);
    assert_eq!(variant.array_iter_str().unwrap().last(), Some(values[3]));
    assert_eq!(
        variant.array_iter_str().unwrap().nth_back(2),
        Some(values[1])
    );
    assert_eq!(
        variant.array_iter_str().unwrap().collect::<Vec<_>>(),
        values
    );
}
