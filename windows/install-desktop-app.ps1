$appName = 'MalmegaVille Sentinel'
$exeName = 'MalmegaVille.Sentinel.Desktop.exe'
$projectPath = Join-Path -Path $PSScriptRoot -ChildPath 'DesktopApp\MalmegaVille.Sentinel.Desktop.csproj'
$publishDir = Join-Path -Path $PSScriptRoot -ChildPath 'DesktopApp\bin\Release\net8.0-windows\win-x64\publish'
$installDir = Join-Path -Path $env:LOCALAPPDATA -ChildPath "Programs\$appName"

Write-Host "Publishing $appName (Release, self-contained, single file)..."
dotnet publish $projectPath -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
if ($LASTEXITCODE -ne 0) {
    Write-Error 'dotnet publish failed.'
    exit 1
}

$publishedExe = Join-Path -Path $publishDir -ChildPath $exeName
if (-not (Test-Path $publishedExe)) {
    Write-Error "Published executable not found at:`n$publishedExe"
    exit 1
}

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

Write-Host "`n$appName installed successfully."
Write-Host "Launch it from the Start Menu, the desktop shortcut, or directly:`n$installedExe"
