using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class BackendSyncClient
{
    // The backend (syncRoutes.ts) reads camelCase field names (eventType, deviceName,
    // severity, ...). Without this, System.Text.Json's default PascalCase serialization
    // (EventType, DeviceName, Severity, ...) doesn't match any of them, so every field
    // silently falls back to its default - severity becomes "Informational" for every
    // event regardless of its real value, which means none of them ever alert.
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ILogger<BackendSyncClient> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _backendUrl;
    private readonly string? _syncToken;

    public BackendSyncClient(ILogger<BackendSyncClient> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        // Same env var name and base-path convention as CaptureUploadClient/LostStatusClient
        // (SENTINEL_BACKEND_API_BASE_URL) - this used to be a separate SENTINEL_BACKEND_URL
        // variable with the full endpoint baked in, which meant configuring the other two
        // clients correctly still silently left this one pointed at localhost.
        var apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _backendUrl = $"{apiBase}/sync/events";
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
            Content = JsonContent.Create(events, options: JsonOptions)
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
