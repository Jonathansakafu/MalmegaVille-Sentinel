using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// When the connectivity engine reports there is no internet route at all but
// a direct-SMS-capable modem is present, texts the owner for any High/Critical
// severity events still sitting in the offline queue - the "no internet
// required" emergency channel from the architecture diagram. Events remain in
// the offline queue regardless (this never removes them); the normal HTTPS
// sync in SystemMonitoringHostedService still delivers them in full once
// internet returns. A small local dedupe cache keeps the same still-queued
// event from being texted again on every poll cycle.
public sealed class SmsFallbackHostedService : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);
    private const int MaxSmsPerCycle = 3;
    private const int MaxTrackedAlertedIds = 200;

    private readonly ILogger<SmsFallbackHostedService> _logger;
    private readonly ConnectivityEngine _connectivityEngine;
    private readonly OfflineEventQueue _offlineQueue;
    private readonly SmsAlertSender _smsAlertSender;
    private readonly LostStatusClient _lostStatusClient;
    private readonly string _alertedIdsPath;

    public SmsFallbackHostedService(
        ILogger<SmsFallbackHostedService> logger,
        ConnectivityEngine connectivityEngine,
        OfflineEventQueue offlineQueue,
        SmsAlertSender smsAlertSender,
        LostStatusClient lostStatusClient)
    {
        _logger = logger;
        _connectivityEngine = connectivityEngine;
        _offlineQueue = offlineQueue;
        _smsAlertSender = smsAlertSender;
        _lostStatusClient = lostStatusClient;

        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        Directory.CreateDirectory(basePath);
        _alertedIdsPath = Path.Combine(basePath, "smsAlertedEventIds.json");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCycleAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during SMS fallback cycle.");
            }

            await Task.Delay(PollInterval, stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken stoppingToken)
    {
        // The owner's phone number comes from their account Settings, learned
        // via LostStatusClient's own periodic poll (piggybacked on the same
        // request as the lost-status check) - not known until that poll has
        // run at least once, and simply absent if the owner never set one.
        var ownerPhoneNumber = _lostStatusClient.LastKnownOwnerPhoneNumber;
        if (string.IsNullOrWhiteSpace(ownerPhoneNumber))
        {
            return;
        }

        var channel = await _connectivityEngine.GetCurrentChannelAsync(stoppingToken);
        if (channel != ConnectivityChannel.SmsOnly)
        {
            return;
        }

        var pending = await _offlineQueue.PeekBatchAsync(50, stoppingToken);
        var alertWorthy = pending
            .Where(e => e.Severity.Equals("High", StringComparison.OrdinalIgnoreCase) ||
                        e.Severity.Equals("Critical", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (alertWorthy.Count == 0)
        {
            return;
        }

        var alertedIds = LoadAlertedIds();
        var sentThisCycle = 0;

        foreach (var securityEvent in alertWorthy)
        {
            if (sentThisCycle >= MaxSmsPerCycle)
            {
                break;
            }

            if (alertedIds.Contains(securityEvent.Id))
            {
                continue;
            }

            var sent = await _smsAlertSender.TrySendAsync(securityEvent, ownerPhoneNumber, stoppingToken);
            if (sent)
            {
                alertedIds.Add(securityEvent.Id);
                sentThisCycle++;
            }
        }

        if (sentThisCycle > 0)
        {
            SaveAlertedIds(alertedIds);
        }
    }

    private HashSet<Guid> LoadAlertedIds()
    {
        try
        {
            if (!File.Exists(_alertedIdsPath))
            {
                return new HashSet<Guid>();
            }

            var json = File.ReadAllText(_alertedIdsPath);
            return JsonSerializer.Deserialize<HashSet<Guid>>(json) ?? new HashSet<Guid>();
        }
        catch (Exception)
        {
            return new HashSet<Guid>();
        }
    }

    private void SaveAlertedIds(HashSet<Guid> ids)
    {
        try
        {
            var capped = ids.Count > MaxTrackedAlertedIds
                ? ids.Skip(ids.Count - MaxTrackedAlertedIds).ToHashSet()
                : ids;
            var json = JsonSerializer.Serialize(capped);
            File.WriteAllText(_alertedIdsPath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist SMS-alerted event id cache.");
        }
    }
}
