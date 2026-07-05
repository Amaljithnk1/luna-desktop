# Luna Windows Release Builder
# Run this script on a Windows machine from the project root.

$ErrorActionPreference = "Stop"

Write-Host "\n=== Luna Windows Release Builder ===" -ForegroundColor Cyan

if (-not (Test-Path "package.json")) {
  throw "Run this script from the Luna project root."
}

Write-Host "\n[1/6] Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "\n[2/6] Running preflight..." -ForegroundColor Yellow
npm run preflight

Write-Host "\n[3/6] Running production build..." -ForegroundColor Yellow
npm run build

Write-Host "\n[4/6] Building Windows installer/portable executable..." -ForegroundColor Yellow
npm run dist

Write-Host "\n[5/6] Creating release manifest..." -ForegroundColor Yellow
$releaseDir = "release"
$manifestPath = Join-Path $releaseDir "LUNA_RELEASE_MANIFEST.txt"
$files = Get-ChildItem $releaseDir -Recurse -File | Select-Object FullName, Length, LastWriteTime
$manifest = @()
$manifest += "Luna Release Manifest"
$manifest += "Generated: $(Get-Date -Format o)"
$manifest += ""
$manifest += "IMPORTANT: This is an unsigned hackathon build. Windows SmartScreen may show 'Windows protected your PC'. Click More info -> Run anyway."
$manifest += ""
$manifest += "Files:"
foreach ($file in $files) {
  $relative = Resolve-Path -Relative $file.FullName
  $manifest += "- $relative ($($file.Length) bytes)"
}
$manifest | Out-File -Encoding UTF8 $manifestPath

Write-Host "\n[6/6] Done." -ForegroundColor Green
Write-Host "Release files are in: $releaseDir" -ForegroundColor Green
Write-Host "Manifest: $manifestPath" -ForegroundColor Green
Write-Host "\nSmartScreen note: If Windows warns, click More info -> Run anyway." -ForegroundColor Magenta
