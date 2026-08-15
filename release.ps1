$Host.UI.RawUI.WindowTitle = "Kaleka Launcher - Release Tool"

Write-Host ""
Write-Host " ========================================"
Write-Host "   Kaleka Launcher - Release Tool"
Write-Host " ========================================"
Write-Host ""

# Get current version from package.json
$pkg = Get-Content "package.json" | ConvertFrom-Json
$currentVersion = $pkg.version

Write-Host " Current version: $currentVersion"
Write-Host ""
$newVersion = Read-Host " New version (leave empty to keep $currentVersion)"

if ([string]::IsNullOrWhiteSpace($newVersion)) {
    $releaseVersion = $currentVersion
    Write-Host " Version unchanged: $currentVersion"
} else {
    $content = Get-Content "package.json" -Raw
    $content = $content -replace "`"version`": `"$currentVersion`"", "`"version`": `"$newVersion`""
    Set-Content "package.json" $content -NoNewline
    $releaseVersion = $newVersion
    Write-Host " Version updated: $currentVersion -> $newVersion"
}

Write-Host ""
$releaseNotes = Read-Host " Release notes (what changed)"
if ([string]::IsNullOrWhiteSpace($releaseNotes)) {
    $releaseNotes = "Bug fixes and improvements"
}

# ---- STEP 1: Clean old builds ----
Write-Host ""
Write-Host " [1/5] Cleaning old builds..."
Write-Host " ----------------------------------------"
if (Test-Path "release") {
    Get-ChildItem "release" -File | Where-Object {
        $_.Extension -in @(".exe", ".blockmap", ".yml") -and
        $_.Name -notmatch "builder-"
    } | ForEach-Object {
        Write-Host "  Removing: $($_.Name)"
        Remove-Item $_.FullName -Force
    }
}
Write-Host "  Done."

# ---- STEP 2: Build ----
Write-Host ""
Write-Host " [2/5] Building project..."
Write-Host " ----------------------------------------"
npm run build:win
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host " BUILD FAILED!" -ForegroundColor Red
    Read-Host " Press Enter to exit"
    exit 1
}

# ---- STEP 3: Git commit & push ----
Write-Host ""
Write-Host " [3/5] Committing changes..."
Write-Host " ----------------------------------------"
git add .
git commit -m "Release v$releaseVersion"
git push origin main

# ---- STEP 4: GitHub Release ----
Write-Host ""
Write-Host " [4/5] Creating GitHub Release v$releaseVersion..."
Write-Host " ----------------------------------------"

$ghExists = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghExists) {
    Write-Host ""
    Write-Host " GitHub CLI (gh) not found!" -ForegroundColor Yellow
    Write-Host " Install from: https://cli.github.com"
    Write-Host ""
    Start-Process explorer "release"
    Read-Host " Press Enter to exit"
    exit 1
}

$exeFile    = "release\Kaleka Launcher-Setup-$releaseVersion.exe"
$blockmapFile = "release\Kaleka Launcher-Setup-$releaseVersion.exe.blockmap"
$ymlFile    = "release\latest.yml"

gh release create "v$releaseVersion" $exeFile $blockmapFile $ymlFile `
    --title "Kaleka Launcher v$releaseVersion" `
    --notes $releaseNotes

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host " Release failed. Try: gh auth login" -ForegroundColor Red
    Read-Host " Press Enter to exit"
    exit 1
}

# ---- STEP 5: Done ----
Write-Host ""
Write-Host " [5/5] Done!" -ForegroundColor Green
Write-Host ""
Write-Host " ========================================"
Write-Host "  Released: v$releaseVersion" -ForegroundColor Green
Write-Host "  https://github.com/jamshutbr-cmyk/kaleka-launcher/releases"
Write-Host " ========================================"
Write-Host ""
Read-Host " Press Enter to exit"
