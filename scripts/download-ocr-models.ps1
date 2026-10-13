# Downloads the Linux-bundled OCR pack (PP-OCRv6 Small) and verifies SHA-256
# against src-tauri/models/ocr-manifest.json.
# Run from the Nymkeep/ directory: powershell -File scripts/download-ocr-models.ps1
$ErrorActionPreference = "Stop"
$modelsDir = Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri/models"
New-Item -ItemType Directory -Force -Path (Join-Path $modelsDir "ocr") | Out-Null
$manifest = Get-Content (Join-Path $modelsDir "ocr-manifest.json") | ConvertFrom-Json
foreach ($name in $manifest.files.PSObject.Properties.Name) {
    $entry = $manifest.files.$name
    $dest = Join-Path $modelsDir $name
    if ((Test-Path -LiteralPath $dest) -and (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -eq $entry.sha256 -and (Get-Item -LiteralPath $dest).Length -eq $entry.bytes) {
        Write-Output "OK $name (verified cache)"
        continue
    }
    Write-Output "Downloading $name ..."
    $temporary = "$dest.download"
    try {
        Invoke-WebRequest -Uri $entry.remote -OutFile $temporary
        if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $entry.sha256) { throw "SHA-256 mismatch for $name." }
        if ((Get-Item -LiteralPath $temporary).Length -ne $entry.bytes) { throw "Size mismatch for $name." }
        Move-Item -LiteralPath $temporary -Destination $dest -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
    Write-Output "OK $name"
}
# Development/native fixtures use the same directory layout as installed resources.
Copy-Item -LiteralPath (Join-Path $modelsDir 'ocr-manifest.json') -Destination (Join-Path $modelsDir 'ocr/ocr-manifest.json') -Force
Write-Output "All OCR model files verified."
