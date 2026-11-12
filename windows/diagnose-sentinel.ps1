#Requires -Version 5.1
<#
.SYNOPSIS
    Read-only diagnostic for MalmegaVille Sentinel lost-device capture on Windows.

.DESCRIPTION
    Walks the exact chain the desktop agent uses when it should be taking a
    lost-device photo/location and reports which stage is failing:

        device identity -> lost flag from backend -> tray app running
        -> camera/location permission -> upload reachability

    Nothing is changed unless -WriteProbe is passed, which posts one location
    record so the whole upload path can be proven end to end.

.PARAMETER BackendBase
    Override the backend API base URL (defaults to the machine env var, then
    the production cloud URL).

.PARAMETER WriteProbe
    POST one location record to /api/captures/location. This proves the device
    is registered and writable, and it creates a real (harmless) location
    entry on the dashboard that you can delete afterwards.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\diagnose-sentinel.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\diagnose-sentinel.ps1 -WriteProbe
#>
[CmdletBinding()]
param(
    [string]$BackendBase,
    [switch]$WriteProbe
)

$ErrorActionPreference = 'Continue'
$script:Problems = New-Object System.Collections.Generic.List[string]
$DefaultBackendBase = 'https://app-production-fd2d.up.railway.app/api'

function Write-Section([string]$Title) {
    Write-Host ''
    Write-Host ("=== {0} ===" -f $Title) -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host ("  [OK]   {0}" -f $Message) -ForegroundColor Green
}

function Write-Bad([string]$Message) {
    Write-Host ("  [FAIL] {0}" -f $Message) -ForegroundColor Red
    $script:Problems.Add($Message) | Out-Null
}

function Write-Warn([string]$Message) {
    Write-Host ("  [WARN] {0}" -f $Message) -ForegroundColor Yellow
}

function Write-Info([string]$Message) {
    Write-Host ("         {0}" -f $Message) -ForegroundColor Gray
}

function Mask-Id([string]$Id) {
    if ([string]::IsNullOrWhiteSpace($Id)) { return '(none)' }
    if ($Id.Length -le 12) { return $Id }
    return $Id.Substring(0, 8) + '...' + $Id.Substring($Id.Length - 4)
}

function Invoke-ApiProbe {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [string]$Body
    )

    try {
        $params = @{
            Uri             = $Uri
            Method          = $Method
            TimeoutSec      = 25
            UseBasicParsing = $true
        }
        if ($Body) {
            $params.ContentType = 'application/json'
            $params.Body = $Body
        }
        $response = Invoke-WebRequest @params
        return [pscustomobject]@{ Ok = $true; Status = [int]$response.StatusCode; Body = $response.Content }
    }
    catch {
        $response = $_.Exception.Response
        $status = 0
        $body = $_.Exception.Message
        if ($response) {
            try { $status = [int]$response.StatusCode } catch { $status = 0 }
            try {
                $stream = $response.GetResponseStream()
                if ($stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $body = $reader.ReadToEnd()
                    $reader.Dispose()
                }
            }
            catch { }
        }
        return [pscustomobject]@{ Ok = $false; Status = $status; Body = $body }
    }
}

$programDataDir = Join-Path $env:ProgramData 'MalmegaVille Sentinel'
$deviceIdPath = Join-Path $programDataDir 'deviceId.txt'
$installDir = Join-Path $env:ProgramFiles 'MalmegaVille Sentinel'
$desktopExe = Join-Path $installDir 'DesktopApp\MalmegaVille.Sentinel.Desktop.exe'
$desktopProcessName = 'MalmegaVille.Sentinel.Desktop'
$serviceName = 'MalmegaVille.Sentinel.CoreService'

Write-Section 'Environment'
Write-Info ("Computer: {0}" -f $env:COMPUTERNAME)
Write-Info ("User:     {0}" -f $env:USERNAME)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Info ("Admin:    {0}" -f $isAdmin)

if (-not $BackendBase) {
    $machineBase = [Environment]::GetEnvironmentVariable('SENTINEL_BACKEND_API_BASE_URL', 'Machine')
    $userBase = [Environment]::GetEnvironmentVariable('SENTINEL_BACKEND_API_BASE_URL', 'User')
    if ($machineBase) { $BackendBase = $machineBase }
    elseif ($userBase) { $BackendBase = $userBase }
    else { $BackendBase = $DefaultBackendBase }
}
$BackendBase = $BackendBase.TrimEnd('/')
Write-Info ("Backend:  {0}" -f $BackendBase)

Write-Section 'Device identity'
$deviceId = $null
if (Test-Path -LiteralPath $deviceIdPath) {
    try {
        $deviceId = (Get-Content -LiteralPath $deviceIdPath -Raw -ErrorAction Stop).Trim()
        if ($deviceId) {
            Write-Ok ("deviceId.txt present ({0})" -f (Mask-Id $deviceId))
        }
        else {
            Write-Bad 'deviceId.txt exists but is empty.'
        }
    }
    catch {
        Write-Bad ("Cannot read deviceId.txt: {0}. Re-run this script as Administrator." -f $_.Exception.Message)
    }
}
else {
    Write-Bad ("deviceId.txt is missing at {0} - the Core Service has never run on this machine." -f $deviceIdPath)
}

Write-Section 'Installed build'
foreach ($exe in @(
        @{ Name = 'DesktopApp'; Path = $desktopExe },
        @{ Name = 'CoreService'; Path = (Join-Path $installDir 'CoreService\MalmegaVille.Sentinel.CoreService.exe') }
    )) {
    if (Test-Path -LiteralPath $exe.Path) {
        $item = Get-Item -LiteralPath $exe.Path
        $version = '(unknown)'
        try { $version = $item.VersionInfo.FileVersion } catch { }
        Write-Ok ("{0}: version {1}, built {2:yyyy-MM-dd HH:mm}" -f $exe.Name, $version, $item.LastWriteTime)
    }
    else {
        Write-Bad ("{0} not found at {1}" -f $exe.Name, $exe.Path)
    }
}

Write-Section 'Background components'
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -eq 'Running') {
        Write-Ok ("Core Service is running (start type: {0})" -f $service.StartType)
    }
    else {
        Write-Bad ("Core Service status is {0} (start type: {1})" -f $service.Status, $service.StartType)
    }
}
else {
    Write-Bad 'Core Service is not installed.'
}

$desktop = Get-Process -Name $desktopProcessName -ErrorAction SilentlyContinue
if ($desktop) {
    Write-Ok ("Tray app is running (PID {0}, started {1:yyyy-MM-dd HH:mm})" -f $desktop[0].Id, $desktop[0].StartTime)
}
else {
    Write-Bad 'Tray app is NOT running - nothing is taking photos or reading location.'
    Write-Info 'Start "MalmegaVille Sentinel" from the Start Menu (it should auto-start at login).'
}

$startupLnk = Join-Path ([Environment]::GetFolderPath('CommonStartup')) 'MalmegaVille Sentinel.lnk'
if (Test-Path -LiteralPath $startupLnk) {
    Write-Ok 'All-users Startup shortcut exists.'
}
else {
    Write-Bad ("Startup shortcut missing at {0} - the tray app will not return after sign-in." -f $startupLnk)
}

foreach ($scope in @('HKLM:', 'HKCU:')) {
    $approvedPath = '{0}\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder' -f $scope
    $approved = Get-ItemProperty -Path $approvedPath -ErrorAction SilentlyContinue
    if ($approved) {
        $prop = $approved.PSObject.Properties | Where-Object { $_.Name -like 'MalmegaVille*' } | Select-Object -First 1
        if ($prop) {
            $bytes = $prop.Value
            if ($bytes -is [byte[]] -and $bytes.Length -gt 0) {
                if ($bytes[0] -band 1) {
                    Write-Bad ("Startup entry is DISABLED in Task Manager ({0})" -f $scope)
                }
                else {
                    Write-Ok ("Startup entry is enabled ({0})" -f $scope)
                }
            }
        }
    }
}

Write-Section 'Backend lost-status for this device'
$isLost = $null
if ($deviceId) {
    $lostUrl = '{0}/sync/lost-status?deviceId={1}' -f $BackendBase, [uri]::EscapeDataString($deviceId)
    $lostResult = Invoke-ApiProbe -Uri $lostUrl
    if ($lostResult.Ok) {
        Write-Info ("HTTP {0}: {1}" -f $lostResult.Status, $lostResult.Body)
        try {
            $parsed = $lostResult.Body | ConvertFrom-Json
            $isLost = [bool]$parsed.isLost
            if ($isLost) {
                Write-Ok 'Backend reports this device as LOST - captures are armed.'
            }
            else {
                Write-Bad 'Backend reports this device as NOT lost - the agent will refuse to capture.'
                Write-Info 'Toggle Lost/Stolen on this device in the dashboard, then unlock the PC or insert a USB drive.'
            }
        }
        catch {
            Write-Bad 'Could not parse lost-status response as JSON.'
        }
    }
    else {
        Write-Bad ("Backend unreachable (status {0}): {1}" -f $lostResult.Status, $lostResult.Body)
    }
}
else {
    Write-Warn 'Skipped - no deviceId.'
}

Write-Section 'Camera and location consent (HKLM ConsentStore)'
$consentKeys = @(
    'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam',
    'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\NonPackaged',
    'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location',
    'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location\NonPackaged'
)
foreach ($keyPath in $consentKeys) {
    $full = 'HKLM:\' + $keyPath
    $value = Get-ItemProperty -Path $full -Name 'Value' -ErrorAction SilentlyContinue
    $label = $keyPath.Split('\')[-1]
    $parent = $keyPath.Split('\')[-2]
    if ($value) {
        $state = [string]$value.Value
        if ($state -ieq 'Allow') { Write-Ok ("{0}\{1} = {2}" -f $parent, $label, $state) }
        else { Write-Bad ("{0}\{1} = {2}" -f $parent, $label, $state) }
    }
    else {
        Write-Warn ("{0}\{1} has no Value set" -f $parent, $label)
    }
}

$nonPackagedWebcam = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\NonPackaged'
$appEntries = Get-ChildItem -Path $nonPackagedWebcam -ErrorAction SilentlyContinue
if ($appEntries) {
    $matching = @()
    foreach ($entry in $appEntries) {
        if ($entry.PSChildName -like '*Sentinel*') {
            $appValue = Get-ItemProperty -Path $entry.PSPath -Name 'Value' -ErrorAction SilentlyContinue
            $state = if ($appValue) { [string]$appValue.Value } else { '(unset)' }
            if ($state -ieq 'Allow') { Write-Ok ("Per-app webcam entry: {0}" -f $state) }
            else { Write-Bad ("Per-app webcam entry for the tray app is {0}" -f $state) }
            $matching += $entry.PSChildName
        }
    }
    if ($matching.Count -eq 0) {
        Write-Warn 'No per-app webcam consent entry for MalmegaVille Sentinel exists yet (created on first camera use).'
    }
}

$cameraDevices = Get-PnpDevice -Class Camera -ErrorAction SilentlyContinue
if ($cameraDevices) {
    foreach ($camera in $cameraDevices) {
        if ($camera.Status -eq 'OK') { Write-Ok ("Camera: {0}" -f $camera.FriendlyName) }
        else { Write-Warn ("Camera {0} status: {1}" -f $camera.FriendlyName, $camera.Status) }
    }
}
else {
    Write-Warn 'No imaging camera device was reported by Windows.'
}

Write-Section 'Local logs'
$localAppDir = Join-Path $env:LOCALAPPDATA 'MalmegaVille Sentinel'
$crashLog = Join-Path $localAppDir 'crash.log'
if (Test-Path -LiteralPath $crashLog) {
    $crashTail = Get-Content -LiteralPath $crashLog -Tail 40 -ErrorAction SilentlyContinue
    if ($crashTail) {
        Write-Bad 'Tray app crash.log has entries (most recent last):'
        $crashTail | ForEach-Object { Write-Info $_ }
    }
}
else {
    Write-Ok 'No tray app crash.log entries.'
}

$captureLogs = @(
    (Join-Path $programDataDir 'capture.log'),
    (Join-Path $localAppDir 'capture.log')
)
$captureLogFound = $false
foreach ($captureLog in $captureLogs) {
    if (Test-Path -LiteralPath $captureLog) {
        $captureLogFound = $true
        Write-Info ("Recent capture.log lines from {0}:" -f $captureLog)
        Get-Content -LiteralPath $captureLog -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Write-Info $_ }
    }
}
if (-not $captureLogFound) {
    Write-Info 'No capture.log yet (the installed build predates capture-path logging, or no trigger has fired since upgrading).'
}

Write-Section 'Recent service errors'
$since = (Get-Date).AddDays(-7)
$events = Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $since } -MaxEvents 400 -ErrorAction SilentlyContinue |
    Where-Object { $_.ProviderName -like '*MalmegaVille*' -or $_.Message -like '*MalmegaVille Sentinel*' } |
    Select-Object -First 15
if ($events) {
    foreach ($event in $events) {
        Write-Info ("{0:yyyy-MM-dd HH:mm} {1}: {2}" -f $event.TimeCreated, $event.LevelDisplayName, ($event.Message -split "`n")[0])
    }
}
else {
    Write-Ok 'No MalmegaVille Sentinel service errors in the System log (last 7 days).'
}

if ($WriteProbe -and $deviceId) {
    Write-Section 'End-to-end upload probe'
    $probeBody = @{
        deviceId      = $deviceId
        triggerEvent  = 'sign_in'
        capturedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json -Compress

    $probeUrl = '{0}/captures/location' -f $BackendBase
    $probe = Invoke-ApiProbe -Uri $probeUrl -Method 'POST' -Body $probeBody
    if ($probe.Ok -and $probe.Status -eq 201) {
        Write-Ok 'Upload path works: backend accepted a location record for this device.'
        Write-Info 'Delete that test entry from the dashboard Captures list.'
    }
    elseif ($probe.Status -eq 404) {
        Write-Bad 'Backend does not know this deviceId ("Unknown device") - re-register the device from the tray app.'
    }
    else {
        Write-Bad ("Upload probe failed (HTTP {0}): {1}" -f $probe.Status, $probe.Body)
    }
}

Write-Section 'Summary'
if ($script:Problems.Count -eq 0) {
    Write-Host '  No blocking problems detected by this script.' -ForegroundColor Green
    Write-Host '  If captures still do not appear, trigger one: mark the device Lost,' -ForegroundColor Gray
    Write-Host '  then lock and unlock the PC (or insert a USB drive) and re-run with -WriteProbe.' -ForegroundColor Gray
}
else {
    Write-Host ("  {0} problem(s) found:" -f $script:Problems.Count) -ForegroundColor Red
    foreach ($problem in $script:Problems) { Write-Host ("   - {0}" -f $problem) -ForegroundColor Red }
}
Write-Host ''
