Nymkeep license resources

NYMKEEP-LICENSE.txt: MIT license for Nymkeep itself.
TAURI-MIT.txt and APACHE-2.0.txt: shared Tauri terms from @tauri-apps/api.
APACHE-2.0.txt also provides the full declared Apache-2.0 model terms. Model
sources and hashes are recorded in models/manifest.json and ocr-manifest.json.

ONNX-RUNTIME-LICENSE.txt and ONNX-RUNTIME-NOTICES.txt are copied unchanged from
Microsoft's pinned ONNX Runtime 1.28.0 source revision
da9b5e364c465de65c49d91e696cd6485270757f:
https://github.com/microsoft/onnxruntime/tree/da9b5e364c465de65c49d91e696cd6485270757f

scripts/release/licenses.mjs generates DEPENDENCIES.json and DEPENDENCIES.txt
for the exact target from Cargo's resolved graph and production JavaScript.
It preserves package license files/copyrights and their SHA-256, includes
Rust build/test dependencies conservatively, and fails on missing license data.
Generated inventories belong inside each build artifact, not public source Git.

The inventory does not establish permission to redistribute every system library
inside an AppImage or Microsoft's runtime. Review extracted native dependencies
and applicable vendor terms before public binary distribution. It does not change
the license of those components or constitute an independent legal review.
