$appName = 'MalmegaVille Sentinel'
$installDir = Join-Path -Path $env:LOCALAPPDATA -ChildPath "Programs\$appName"

Get-Process -Name 'MalmegaVille.Sentinel.Desktop' -ErrorAction SilentlyContinue | Stop-Process -Force

$startMenuShortcut = Join-Path -Path ([Environment]::GetFolderPath('StartMenu')) -ChildPath "Programs\$appName.lnk"
$desktopShortcut = Join-Path -Path ([Environment]::GetFolderPath('Desktop')) -ChildPath "$appName.lnk"
$startupShortcut = Join-Path -Path ([Environment]::GetFolderPath('Startup')) -ChildPath "$appName.lnk"

foreach ($shortcut in @($startMenuShortcut, $desktopShortcut, $startupShortcut)) {
    if (Test-Path $shortcut) {
        Remove-Item -Path $shortcut -Force
        Write-Host "Removed shortcut: $shortcut"
    }
}

if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force
    Write-Host "Removed installed application: $installDir"
} else {
    Write-Host "$appName is not installed at $installDir."
}

Write-Host "`n$appName has been uninstalled. Your session data at %LOCALAPPDATA%\MalmegaVille Sentinel (if any) was left in place."
