using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class ServiceRecoveryConfigurator
{
    private readonly ILogger<ServiceRecoveryConfigurator> _logger;

    public ServiceRecoveryConfigurator(ILogger<ServiceRecoveryConfigurator> logger)
    {
        _logger = logger;
    }

    public Task ConfigureRecoveryAsync()
    {
        try
        {
            _logger.LogInformation("Configuring Windows service recovery options.");
            var psi = new ProcessStartInfo("sc.exe", "failure \"MalmegaVille.Sentinel.CoreService\" reset= 86400 actions= restart/5000/restart/10000/restart/60000")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process.Start(psi)?.WaitForExit();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to configure service recovery options. This operation should be executed with administrative privileges.");
        }

        return Task.CompletedTask;
    }
}
