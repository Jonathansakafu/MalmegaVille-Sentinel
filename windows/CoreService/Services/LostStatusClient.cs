using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed record LostStatusResponse(string DeviceId, bool IsLost);

public sealed class LostStatusClient
{
    private readonly ILogger<LostStatusClient> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _apiBase;
    private readonly string? _syncToken;

    public bool LastKnownLost { get; private set; }

    public LostStatusClient(ILogger<LostStatusClient> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        _apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    public async Task RefreshAsync(string deviceId, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"{_apiBase}/sync/lost-status?deviceId={Uri.EscapeDataString(deviceId)}");

            if (!string.IsNullOrWhiteSpace(_syncToken))
            {
                request.Headers.Add("x-sync-token", _syncToken);
            }

            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Lost-status check failed with status code {StatusCode}.", response.StatusCode);
                return;
            }

            var body = await response.Content.ReadFromJsonAsync<LostStatusResponse>(cancellationToken: cancellationToken);
            if (body != null)
            {
                LastKnownLost = body.IsLost;
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Lost-status check request failed; keeping last known value.");
        }
    }
}
