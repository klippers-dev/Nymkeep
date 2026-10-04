# Synthetic fixture only. No user/customer screenshots or data.
Add-Type -AssemblyName System.Drawing
$fixturePath = Join-Path $PSScriptRoot '../src-tauri/tests/fixtures/synthetic-note.png'
$fixtureDir = Split-Path -Parent $fixturePath
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 1120, 620
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$titleFont = New-Object System.Drawing.Font 'Segoe UI', 40, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$valueFont = New-Object System.Drawing.Font 'Segoe UI', 38, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$labelFont = New-Object System.Drawing.Font 'Segoe UI', 23, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(21, 38, 46))
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(82, 99, 109))
try {
    $graphics.DrawString('Project note', $titleFont, $ink, 60, 50)
    $graphics.DrawString('Fictional data for a local redaction check', $labelFont, $muted, 60, 120)
    $graphics.DrawString('Contact', $labelFont, $muted, 60, 218)
    $graphics.DrawString('mira@example.com', $valueFont, $ink, 60, 254)
    $graphics.DrawString('Server address', $labelFont, $muted, 60, 350)
    $graphics.DrawString('192.0.2.42', $valueFont, $ink, 60, 386)
    $graphics.DrawString('Review before sharing.', $labelFont, $muted, 60, 516)
    $bitmap.Save([System.IO.Path]::GetFullPath($fixturePath), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $titleFont.Dispose()
    $valueFont.Dispose()
    $labelFont.Dispose()
    $ink.Dispose()
    $muted.Dispose()
}
