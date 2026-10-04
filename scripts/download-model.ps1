# Downloads the Nymkeep NER model files and verifies SHA-256 against models/manifest.json.
# Run from the repository root: powershell -File scripts/download-model.ps1
$ErrorActionPreference = "Stop"
$modelsDir = Join-Path (Split-Path $PSScriptRoot -Parent) "src-tauri/models"
New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
$manifest = Get-Content (Join-Path $modelsDir "manifest.json") | ConvertFrom-Json
$base = "https://huggingface.co/onnx-community/bert-small-pii-detection-ONNX/resolve/main"
foreach ($name in $manifest.files.PSObject.Properties.Name) {
    $entry = $manifest.files.$name
    $dest = Join-Path $modelsDir $name
    if ((Test-Path -LiteralPath $dest) -and (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash -eq $entry.sha256) {
        Write-Output "OK $name (verified cache)"
        continue
    }
    Write-Output "Downloading $name ..."
    $temporary = "$dest.download"
    try {
        Invoke-WebRequest -Uri "$base/$($entry.remote)" -OutFile $temporary
        $hash = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash
        if ($hash -ne $entry.sha256) { throw "SHA-256 mismatch for $name." }
        Move-Item -LiteralPath $temporary -Destination $dest -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
    Write-Output "OK $name"
}
Write-Output "All model files verified."
