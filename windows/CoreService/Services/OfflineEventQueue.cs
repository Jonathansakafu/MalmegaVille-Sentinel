using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class OfflineEventQueue
{
    private readonly ILogger<OfflineEventQueue> _logger;
    private readonly string _queuePath;

    public OfflineEventQueue(ILogger<OfflineEventQueue> logger)
    {
        _logger = logger;
        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        Directory.CreateDirectory(basePath);
        _queuePath = Path.Combine(basePath, "eventQueue.dat");
    }

    public async Task EnqueueAsync(SecurityEvent securityEvent, CancellationToken cancellationToken)
    {
        var queue = await ReadQueueAsync(cancellationToken);
        queue.Add(securityEvent);
        await WriteQueueAsync(queue, cancellationToken);
        _logger.LogDebug("Queued event for offline sync: {EventType}", securityEvent.EventType);
    }

    public async Task<List<SecurityEvent>> PeekBatchAsync(int maxBatch, CancellationToken cancellationToken)
    {
        var queue = await ReadQueueAsync(cancellationToken);
        return queue.Take(maxBatch).ToList();
    }

    public async Task RemoveSyncedAsync(int count, CancellationToken cancellationToken)
    {
        var queue = await ReadQueueAsync(cancellationToken);
        if (count <= 0 || queue.Count == 0)
        {
            return;
        }

        queue.RemoveRange(0, Math.Min(count, queue.Count));

        if (queue.Count == 0)
        {
            if (File.Exists(_queuePath))
            {
                File.Delete(_queuePath);
            }

            _logger.LogDebug("All queued events synced and local queue cleared.");
            return;
        }

        await WriteQueueAsync(queue, cancellationToken);
        _logger.LogDebug("Removed {Count} synced events from offline queue.", count);
    }

    public async Task<bool> HasPendingEventsAsync(CancellationToken cancellationToken)
    {
        var queue = await ReadQueueAsync(cancellationToken);
        return queue.Count > 0;
    }

    private async Task<List<SecurityEvent>> ReadQueueAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_queuePath))
        {
            return new List<SecurityEvent>();
        }

        try
        {
            var encrypted = await File.ReadAllBytesAsync(_queuePath, cancellationToken);
            var bytes = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.LocalMachine);
            var json = Encoding.UTF8.GetString(bytes);
            return System.Text.Json.JsonSerializer.Deserialize<List<SecurityEvent>>(json) ?? new List<SecurityEvent>();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to read encrypted offline queue, starting with a fresh queue.");
            return new List<SecurityEvent>();
        }
    }

    private async Task WriteQueueAsync(List<SecurityEvent> queue, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(queue);
        var bytes = Encoding.UTF8.GetBytes(json);
        var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.LocalMachine);
        await File.WriteAllBytesAsync(_queuePath, encrypted, cancellationToken);
    }
}
