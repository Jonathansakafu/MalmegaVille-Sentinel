$appName = 'MalmegaVille Sentinel'
$exeName = 'MalmegaVille.Sentinel.Desktop.exe'
$projectPath = Join-Path -Path $PSScriptRoot -ChildPath 'DesktopApp\MalmegaVille.Sentinel.Desktop.csproj'
$binReleaseDir = Join-Path -Path $PSScriptRoot -ChildPath 'DesktopApp\bin\Release'
$installDir = Join-Path -Path $env:LOCALAPPDATA -ChildPath "Programs\$appName"

Write-Host "Publishing $appName (Release, self-contained, single file)..."
dotnet publish $projectPath -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
if ($LASTEXITCODE -ne 0) {
    Write-Error 'dotnet publish failed.'
    exit 1
}

# Resolved dynamically (rather than hardcoded) because the target-framework moniker
# folder name (e.g. net8.0-windows10.0.19041.0) depends on the installed Windows SDK
# and can drift from whatever a past build produced - a stale hardcoded path here
# would silently keep reinstalling an old build forever.
$publishedExe = Get-ChildItem -Path $binReleaseDir -Filter $exeName -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like '*\win-x64\publish\*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

if (-not $publishedExe -or -not (Test-Path $publishedExe)) {
    Write-Error "Published executable not found under:`n$binReleaseDir\*\win-x64\publish"
    exit 1
}

$publishDir = Split-Path -Path $publishedExe -Parent
Write-Host "Using freshly published build at: $publishedExe"

Write-Host "Installing to $installDir..."
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item -Path (Join-Path $publishDir '*') -Destination $installDir -Recurse -Force

$installedExe = Join-Path -Path $installDir -ChildPath $exeName

$shell = New-Object -ComObject WScript.Shell

$startMenuDir = Join-Path -Path ([Environment]::GetFolderPath('StartMenu')) -ChildPath 'Programs'
$startMenuShortcut = Join-Path -Path $startMenuDir -ChildPath "$appName.lnk"
$shortcut = $shell.CreateShortcut($startMenuShortcut)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $installedExe
$shortcut.Description = $appName
$shortcut.Save()
Write-Host "Start Menu shortcut created: $startMenuShortcut"

$desktopShortcut = Join-Path -Path ([Environment]::GetFolderPath('Desktop')) -ChildPath "$appName.lnk"
$shortcut = $shell.CreateShortcut($desktopShortcut)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $installedExe
$shortcut.Description = $appName
$shortcut.Save()
Write-Host "Desktop shortcut created: $desktopShortcut"

# Startup folder shortcut = the standard, no-admin-required way to auto-launch a
# per-user app on login (equivalent to an HKCU Run key, but easier to clean up).
$startupDir = [Environment]::GetFolderPath('Startup')
$startupShortcut = Join-Path -Path $startupDir -ChildPath "$appName.lnk"
$shortcut = $shell.CreateShortcut($startupShortcut)
$shortcut.TargetPath = $installedExe
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = $installedExe
$shortcut.Description = $appName
$shortcut.Save()
Write-Host "Startup shortcut created (auto-launches on login): $startupShortcut"

Write-Host "`n$appName installed successfully."
Write-Host "Launch it from the Start Menu, the desktop shortcut, or directly:`n$installedExe"
Write-Host "It will also start automatically the next time you log in to Windows."
