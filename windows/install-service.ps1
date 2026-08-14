$serviceName = 'MalmegaVille.Sentinel.CoreService'
$displayName = 'MalmegaVille Sentinel Core Service'
$exeName = 'MalmegaVille.Sentinel.CoreService.exe'
$publishPath = Join-Path -Path $PSScriptRoot -ChildPath "CoreService\bin\Release\net8.0-windows\win-x64\publish\$exeName"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'This installer must be run as Administrator.'
    exit 1
}

if (-not (Test-Path $publishPath)) {
    Write-Error "Unable to locate the published service executable at:`n$publishPath`nPublish the CoreService project first with dotnet publish -c Release -r win-x64 --self-contained true."
    exit 1
}

$existingService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Service '$serviceName' already exists. Stopping and removing existing registration."
    Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
}

$createArgs = @(
    'create',
    $serviceName,
    "binPath=`"$publishPath`"",
    "DisplayName=`"$displayName`"",
    'start= auto',
    'obj= LocalSystem'
)
$createProcess = Start-Process -FilePath sc.exe -ArgumentList $createArgs -NoNewWindow -Wait -PassThru
if ($createProcess.ExitCode -ne 0) {
    Write-Error "Service creation failed with exit code $($createProcess.ExitCode)."
    exit 1
}

$failureArgs = @('failure', $serviceName, 'reset= 86400', 'actions= restart/5000/restart/10000/restart/60000')
Start-Process -FilePath sc.exe -ArgumentList $failureArgs -NoNewWindow -Wait | Out-Null

Write-Host "Service '$serviceName' created successfully. Start it with:`nStart-Service -Name $serviceName"
