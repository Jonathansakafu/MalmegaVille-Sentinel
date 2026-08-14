using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class SyncTriggerWatcher
{
    private readonly ILogger<SyncTriggerWatcher> _logger;
    private readonly string _syncTriggerPath;

    public SyncTriggerWatcher(ILogger<SyncTriggerWatcher> logger)
    {
        _logger = logger;
        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        Directory.CreateDirectory(basePath);
        _syncTriggerPath = Path.Combine(basePath, "requestSync.json");
    }

    public async Task<bool> TryConsumeSyncTriggerAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_syncTriggerPath))
        {
            return false;
        }

        try
        {
            var json = await File.ReadAllTextAsync(_syncTriggerPath, cancellationToken);
            JsonSerializer.Deserialize<Dictionary<string, object>>(json);
            File.Delete(_syncTriggerPath);
            _logger.LogInformation("Consumed sync trigger file.");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to consume sync trigger file.");
            return false;
        }
    }
}
