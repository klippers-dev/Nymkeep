fn main() {
    tauri_build::build();
    // Native dialogs use Common Controls v6. Tauri links its compiled manifest
    // into binaries; integration-test executables need that same resource so
    // Windows can load TaskDialogIndirect before the test harness starts.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        let resource =
            std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("resource.lib");
        println!("cargo:rustc-link-arg-tests={}", resource.display());
    }
}
