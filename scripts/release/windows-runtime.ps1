# Build-time app-local redistributable runtime, never recovered System32 libraries.
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Windows runtime preparation requires Windows.' }
$repository = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (!(Test-Path -LiteralPath $vswhere)) { throw 'Microsoft Visual Studio tools are required.' }
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'No Microsoft C++ toolchain found.' }
$redist = Join-Path $installation 'VC/Redist/MSVC'
$candidates = Get-ChildItem -LiteralPath $redist -Directory | Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } | Sort-Object { [version]$_.Name } -Descending
$source = $null
foreach ($version in $candidates) {
    $found = Get-ChildItem -Path (Join-Path $version.FullName 'x64/Microsoft.VC*.CRT') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $source = $found.FullName; break }
}
if (!$source) { throw 'Official x64 Microsoft redistributable runtime is unavailable.' }
$destination = Join-Path $repository 'src-tauri/runtime/windows'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$files = @('msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
$manifest = @()
foreach ($name in $files) {
    $path = Join-Path $source $name
    if ((Get-AuthenticodeSignature -LiteralPath $path).Status -ne 'Valid') { throw "Microsoft runtime signature is invalid: $name" }
    $target = Join-Path $destination $name
    Copy-Item -LiteralPath $path -Destination $target -Force
    $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $hash) { throw "Runtime copy verification failed: $name" }
    $manifest += @{ name = $name; sha256 = $hash; bytes = (Get-Item -LiteralPath $target).Length }
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'manifest.json')
Write-Output 'Official Microsoft x64 runtime signatures and hashes verified.'
