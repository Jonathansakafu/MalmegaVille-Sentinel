using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class BackendSyncClient
{
    private readonly ILogger<BackendSyncClient> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _backendUrl;
    private readonly string? _syncToken;

    public BackendSyncClient(ILogger<BackendSyncClient> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        _backendUrl = Environment.GetEnvironmentVariable("SENTINEL_BACKEND_URL")?.TrimEnd('/') ?? "http://localhost:4000/api/sync/events";
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    public async Task<bool> TrySyncQueuedEventsAsync(OfflineEventQueue queue, CancellationToken cancellationToken)
    {
        if (!await queue.HasPendingEventsAsync(cancellationToken))
        {
            _logger.LogDebug("No pending offline events to sync.");
            return true;
        }

        var events = await queue.PeekBatchAsync(20, cancellationToken);
        if (events.Count == 0)
        {
            return true;
        }

        _logger.LogInformation("Attempting to sync {Count} queued events to backend.", events.Count);

        using var request = new HttpRequestMessage(HttpMethod.Post, _backendUrl)
        {
            Content = JsonContent.Create(events)
        };

        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }

        try
        {
            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Backend sync failed with status code {StatusCode}.", response.StatusCode);
                return false;
            }

            await queue.RemoveSyncedAsync(events.Count, cancellationToken);
            _logger.LogInformation("Successfully synced {Count} events to backend.", events.Count);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Backend sync request failed.");
            return false;
        }
    }
}
