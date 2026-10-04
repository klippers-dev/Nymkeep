# Installing Nymkeep

**There is no public installer release yet.** Windows has an unsigned internal
review candidate. macOS and Linux have separate build/device gates; see
[PLATFORM_STATUS.md](release/PLATFORM_STATUS.md).

## When the first verified release is published

1. Open the Nymkeep website's Download section or
   [GitHub Releases](https://github.com/klippers-dev/Nymkeep/releases).
2. Choose the published installer for your supported operating system and CPU.
   Windows will use an `.exe`; macOS an architecture-specific `.dmg`; Linux formats
   will be listed only when their support is verified.
3. Download the installer asset. GitHub's **Source code (zip/tar.gz)** links are
   developer source archives, rather than the app installer.
4. Follow the release's instructions and verify its publisher and published
   SHA-256 where applicable. Do not disable OS security checks for unsigned previews.
5. Start Nymkeep and review a fictional sample. macOS Accessibility consent is
   requested explicitly from Settings for selected-text capture; screenshot input
   is chosen/pasted manually.

Normal users will not need Git, Node.js, Rust, a compiler or a GitHub account.
The website will point directly to verified HTTPS installer assets with the
version, platform, CPU architecture and download size displayed.

Until release, developers can follow [CONTRIBUTING.md](../CONTRIBUTING.md).
Internal CI artifacts are unsigned review builds and do not establish public
support. Hosting and domain setup remain deferred.
