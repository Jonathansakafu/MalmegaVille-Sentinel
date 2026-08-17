using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed record ManifestEntry(string? FileName, string? Path, long? SizeBytes, string Reason);

public sealed class CaptureUploadClient
{
    private readonly ILogger<CaptureUploadClient> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _apiBase;
    private readonly string? _syncToken;

    public CaptureUploadClient(ILogger<CaptureUploadClient> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(2) };
        _apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    public async Task<bool> UploadUsbFileAsync(
        string deviceId,
        string sessionId,
        string originalPath,
        string fileName,
        Stream content,
        DateTime capturedAtUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            using var form = new MultipartFormDataContent
            {
                { new StringContent(deviceId), "deviceId" },
                { new StringContent(sessionId), "sessionId" },
                { new StringContent(originalPath), "originalPath" },
                { new StringContent(capturedAtUtc.ToString("O")), "capturedAtUtc" }
            };
            using var streamContent = new StreamContent(content);
            form.Add(streamContent, "file", fileName);

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/captures/usb-file") { Content = form };
            AddSyncToken(request);

            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("USB file upload failed for {FileName} with status {StatusCode}.", fileName, response.StatusCode);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "USB file upload request failed for {FileName}.", fileName);
            return false;
        }
    }

    public async Task<bool> UploadManifestAsync(
        string deviceId,
        string sessionId,
        IReadOnlyList<ManifestEntry> entries,
        CancellationToken cancellationToken)
    {
        if (entries.Count == 0)
        {
            return true;
        }

        try
        {
            var payload = new
            {
                deviceId,
                sessionId,
                entries = entries.Select(e => new { fileName = e.FileName, path = e.Path, sizeBytes = e.SizeBytes, reason = e.Reason })
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/captures/usb-manifest")
            {
                Content = System.Net.Http.Json.JsonContent.Create(payload)
            };
            AddSyncToken(request);

            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("USB manifest upload failed with status {StatusCode}.", response.StatusCode);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "USB manifest upload request failed.");
            return false;
        }
    }

    private void AddSyncToken(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }
    }
}
