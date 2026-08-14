$serviceName = 'MalmegaVille.Sentinel.CoreService'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'This script must be run as Administrator.'
    exit 1
}

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $existingService) {
    Write-Host "Service '$serviceName' is not installed."
    exit 0
}

if ($existingService.Status -eq 'Running') {
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
}

sc.exe delete $serviceName | Out-Null
Write-Host "Service '$serviceName' has been uninstalled."
