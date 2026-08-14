$log = Join-Path $PSScriptRoot 'install-run-log.txt'
"=== Install run started: $(Get-Date) ===" | Out-File $log

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    "ERROR: This script must be run as Administrator. Open PowerShell 'Run as administrator' and re-run this script." | Out-File -Append $log
    Write-Host "ERROR: Not running elevated. Please run this script as Administrator. Log written to $log"
    exit 1
}

try {
    Write-Output "Running install-service.ps1..." | Out-File -Append $log
    & "$PSScriptRoot\install-service.ps1" 2>&1 | Out-File -Append $log
} catch {
    "install-service.ps1 error: $_" | Out-File -Append $log
}

try {
    Write-Output "Attempting to start service..." | Out-File -Append $log
    Start-Service -Name MalmegaVille.Sentinel.CoreService -ErrorAction Stop 2>&1 | Out-File -Append $log
} catch {
    "Start-Service error: $_" | Out-File -Append $log
}

"Service status:" | Out-File -Append $log
Get-Service -Name MalmegaVille.Sentinel.CoreService -ErrorAction SilentlyContinue | Format-List * | Out-String | Out-File -Append $log

"sc query:" | Out-File -Append $log
sc.exe query "MalmegaVille.Sentinel.CoreService" 2>&1 | Out-File -Append $log

$publishExe = Join-Path $PSScriptRoot "CoreService\bin\Release\net8.0-windows\win-x64\publish\MalmegaVille.Sentinel.CoreService.exe"
"Publish exe exists: $(Test-Path $publishExe)" | Out-File -Append $log
if (Test-Path $publishExe) {
    Get-ChildItem (Split-Path $publishExe) | Select-Object Name,Length | Format-Table | Out-String | Out-File -Append $log
}

"Recent Service Control Manager events:" | Out-File -Append $log
Get-WinEvent -MaxEvents 50 -FilterHashtable @{LogName='System'; ProviderName='Service Control Manager'} | Select-Object TimeCreated,Id,LevelDisplayName,Message | Out-String | Out-File -Append $log

"Recent Application events referencing 'MalmegaVille':" | Out-File -Append $log
Get-WinEvent -MaxEvents 50 -FilterHashtable @{LogName='Application'} | Where-Object { $_.Message -like '*MalmegaVille*' } | Select TimeCreated,Id,LevelDisplayName,Message | Out-String | Out-File -Append $log

"Present PnP devices (short):" | Out-File -Append $log
Get-PnpDevice -PresentOnly | Select-Object InstanceId,Class,Status | Out-String | Out-File -Append $log

"=== Install run finished: $(Get-Date) ===" | Out-File -Append $log

Write-Host "Wrote log to: $log"
