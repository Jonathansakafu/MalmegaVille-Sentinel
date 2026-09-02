using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

namespace MalmegaVille.Sentinel.Desktop;

public sealed record LoginRequest(string Email, string Password);
public sealed record LoginUser(string Email, string Id);
public sealed record LoginResponse(string Token, LoginUser User);

public sealed record NotificationSettingsDto(string AlertEmailRecipient, string AlertPhoneNumber);

public sealed record NotificationChannelResult(bool Configured, bool Sent, string? Error);
public sealed record NotificationTestResult(
    NotificationChannelResult Email,
    NotificationChannelResult Push,
    NotificationChannelResult Sms,
    NotificationChannelResult MobileRelay);

public sealed record LostStatusResponse(string DeviceId, bool IsLost);

public class BackendApiException : Exception
{
    public BackendApiException(string message) : base(message) { }
}

// Thrown specifically for a 401 on a JWT-authenticated call, so callers can tell
// "session token is stale/invalid, sign the user out" apart from a transient failure.
public sealed class UnauthorizedApiException : BackendApiException
{
    public UnauthorizedApiException(string message) : base(message) { }
}

public sealed class BackendApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly string? _syncToken;

    public BackendApiClient()
    {
        var baseUrl = Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL")?.TrimEnd('/')
            ?? "http://localhost:4000/api";

        _httpClient = new HttpClient
        {
            BaseAddress = new Uri(baseUrl + "/"),
            Timeout = TimeSpan.FromSeconds(15)
        };

        // Same shared secret the CoreService uses - lets the covert capture path
        // authenticate independently of whether anyone is logged into the dashboard.
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    public async Task RegisterDeviceAsync(string token, string deviceId, string name, string operatingSystem)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "devices")
        {
            Content = JsonContent.Create(new { deviceId, name, operatingSystem }, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request);
        await EnsureSuccessOrThrowAsync(response);
    }

    public async Task<bool> CheckLostStatusAsync(string deviceId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, $"sync/lost-status?deviceId={Uri.EscapeDataString(deviceId)}");
        AddSyncToken(request);

        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            return false;
        }

        var result = await response.Content.ReadFromJsonAsync<LostStatusResponse>(JsonOptions);
        return result?.IsLost ?? false;
    }

    public async Task UploadCapturePhotoAsync(string deviceId, string triggerEvent, DateTime capturedAtUtc, byte[] jpegBytes)
    {
        using var form = new MultipartFormDataContent
        {
            { new StringContent(deviceId), "deviceId" },
            { new StringContent(triggerEvent), "triggerEvent" },
            { new StringContent(capturedAtUtc.ToString("O")), "capturedAtUtc" }
        };
        using var photoContent = new ByteArrayContent(jpegBytes);
        photoContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
        form.Add(photoContent, "photo", "capture.jpg");

        using var request = new HttpRequestMessage(HttpMethod.Post, "captures/photo") { Content = form };
        AddSyncToken(request);

        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new BackendApiException(await ExtractErrorAsync(response));
        }
    }

    public async Task UploadCaptureLocationAsync(string deviceId, string triggerEvent, DateTime capturedAtUtc, LocationFix? fix)
    {
        var payload = fix is null
            ? (object)new { deviceId, triggerEvent, capturedAtUtc }
            : new { deviceId, triggerEvent, capturedAtUtc, latitude = fix.Latitude, longitude = fix.Longitude, accuracyMeters = fix.AccuracyMeters };

        using var request = new HttpRequestMessage(HttpMethod.Post, "captures/location")
        {
            Content = JsonContent.Create(payload, options: JsonOptions)
        };
        AddSyncToken(request);

        var response = await _httpClient.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            throw new BackendApiException(await ExtractErrorAsync(response));
        }
    }

    private void AddSyncToken(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }
    }

    public async Task<LoginResponse> LoginAsync(string email, string password)
    {
        var response = await _httpClient.PostAsJsonAsync("auth/login", new LoginRequest(email, password), JsonOptions);
        if (!response.IsSuccessStatusCode)
        {
            throw new BackendApiException(await ExtractErrorAsync(response));
        }

        var result = await response.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);
        return result ?? throw new BackendApiException("Login response was empty.");
    }

    public async Task<NotificationSettingsDto> GetNotificationSettingsAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "settings/notifications");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request);
        await EnsureSuccessOrThrowAsync(response);

        var result = await response.Content.ReadFromJsonAsync<NotificationSettingsDto>(JsonOptions);
        return result ?? new NotificationSettingsDto("", "");
    }

    public async Task<NotificationSettingsDto> SaveNotificationSettingsAsync(string token, NotificationSettingsDto settings)
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, "settings/notifications")
        {
            Content = JsonContent.Create(settings, options: JsonOptions)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request);
        await EnsureSuccessOrThrowAsync(response);

        var result = await response.Content.ReadFromJsonAsync<NotificationSettingsDto>(JsonOptions);
        return result ?? settings;
    }

    public async Task<NotificationTestResult> SendTestAlertAsync(string token)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "settings/notifications/test");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _httpClient.SendAsync(request);
        await EnsureSuccessOrThrowAsync(response);

        var result = await response.Content.ReadFromJsonAsync<NotificationTestResult>(JsonOptions);
        var unconfigured = new NotificationChannelResult(false, false, null);
        return result ?? new NotificationTestResult(unconfigured, unconfigured, unconfigured, unconfigured);
    }

    private static async Task EnsureSuccessOrThrowAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var message = await ExtractErrorAsync(response);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            throw new UnauthorizedApiException(message);
        }

        throw new BackendApiException(message);
    }

    private static async Task<string> ExtractErrorAsync(HttpResponseMessage response)
    {
        try
        {
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            if (body.TryGetProperty("message", out var messageProp) && messageProp.ValueKind == JsonValueKind.String)
            {
                return messageProp.GetString() ?? $"Request failed with status {(int)response.StatusCode}.";
            }
        }
        catch
        {
            // Response body wasn't JSON with a message field; fall through to the generic message.
        }

        return $"Request failed with status {(int)response.StatusCode}.";
    }
}
