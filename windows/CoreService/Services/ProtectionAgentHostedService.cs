using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Mirrors how the agent already treats device identity: the backend stores the
// watch list, the agent only hashes local files and reports snapshots. Every
// scan is a complete SHA-256 inventory of the folder; the backend diffs it
// against the previous snapshot, so a changed baseline is never re-learned
// silently.
public sealed class ProtectionAgentHostedService : BackgroundService
{
    private const int MaxEntriesPerFolder = 5000;
    private const int MaxScanDepthFiles = 25000;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly EnumerationOptions EnumerationOptions = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.ReparsePoint | FileAttributes.System
    };

    private readonly ILogger<ProtectionAgentHostedService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _apiBase;
    private readonly string? _syncToken;

    public ProtectionAgentHostedService(ILogger<ProtectionAgentHostedService> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        _apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var deviceId = DeviceIdentity.GetOrCreateDeviceId();

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ScanProtectedFoldersAsync(deviceId, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Protected folder scan cycle failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task ScanProtectedFoldersAsync(string deviceId, CancellationToken cancellationToken)
    {
        var folders = await FetchFoldersAsync(deviceId, cancellationToken);
        if (folders.Count == 0)
        {
            return;
        }

        foreach (var folder in folders)
        {
            if (!Directory.Exists(folder.Path))
            {
                _logger.LogDebug("Protected folder {Path} is not present on this device.", folder.Path);
                continue;
            }

            var entries = await BuildManifestAsync(folder.Path, cancellationToken);
            if (entries == null)
            {
                continue;
            }

            var payload = new
            {
                deviceId,
                folderId = folder.Id,
                path = folder.Path,
                label = folder.Label,
                scannedAtUtc = DateTime.UtcNow.ToString("O"),
                entries
            };

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/protection/manifests")
            {
                Content = JsonContent.Create(payload, options: JsonOptions)
            };
            AddSyncToken(request);

            var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Manifest upload for {Path} failed with status {StatusCode}.", folder.Path, response.StatusCode);
                continue;
            }

            _logger.LogInformation(
                "Uploaded manifest for {Path}: {Count} files hashed.",
                folder.Path,
                entries.Count);

            try
            {
                var result = await response.Content.ReadFromJsonAsync<ManifestUploadResult>(JsonOptions, cancellationToken);
                if (result?.FilesToBackup is { Count: > 0 })
                {
                    await UploadBackupsAsync(deviceId, folder, result.FilesToBackup, cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Could not read backup request list for {Path}.", folder.Path);
            }
        }
    }

    private async Task UploadBackupsAsync(
        string deviceId,
        FolderWatch folder,
        List<BackupRequest> requests,
        CancellationToken cancellationToken)
    {
        var folderRoot = Path.GetFullPath(folder.Path);

        foreach (var backup in requests)
        {
            if (cancellationToken.IsCancellationRequested) break;

            var absolutePath = Path.GetFullPath(
                Path.Combine(folderRoot, backup.RelativePath.Replace('/', Path.DirectorySeparatorChar)));

            // Defensive: the server supplies these paths, but a manifest entry
            // must never be able to pull a file from outside the watched folder.
            if (!absolutePath.StartsWith(folderRoot, StringComparison.OrdinalIgnoreCase) || !File.Exists(absolutePath))
            {
                continue;
            }

            try
            {
                await using var stream = new FileStream(
                    absolutePath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.ReadWrite,
                    64 * 1024,
                    FileOptions.Asynchronous | FileOptions.SequentialScan);

                using var form = new MultipartFormDataContent
                {
                    { new StringContent(deviceId), "deviceId" },
                    { new StringContent(folder.Id), "folderId" },
                    { new StringContent(backup.RelativePath), "relativePath" },
                    { new StringContent(backup.Sha256), "sha256" }
                };
                using var fileContent = new StreamContent(stream);
                form.Add(fileContent, "file", Path.GetFileName(absolutePath));

                using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/protection/backups")
                {
                    Content = form
                };
                AddSyncToken(request);

                using var response = await _httpClient.SendAsync(request, cancellationToken);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogDebug(
                        "Backup upload for {Path} rejected with status {StatusCode}.",
                        backup.RelativePath,
                        response.StatusCode);
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or HttpRequestException)
            {
                _logger.LogDebug(ex, "Backup upload failed for {Path}.", backup.RelativePath);
            }
        }
    }

    private async Task<List<FolderWatch>> FetchFoldersAsync(string deviceId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_apiBase}/protection/folders/agent?deviceId={Uri.EscapeDataString(deviceId)}");
        AddSyncToken(request);

        try
        {
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new List<FolderWatch>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonSerializer.DeserializeAsync<List<FolderWatch>>(stream, JsonOptions, cancellationToken)
                ?? new List<FolderWatch>();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not fetch protected folder watch list.");
            return new List<FolderWatch>();
        }
    }

    private async Task<List<ManifestFileEntry>?> BuildManifestAsync(string folderPath, CancellationToken cancellationToken)
    {
        var entries = new List<ManifestFileEntry>();
        var enumerated = 0;

        try
        {
            foreach (var filePath in Directory.EnumerateFiles(folderPath, "*", EnumerationOptions))
            {
                if (cancellationToken.IsCancellationRequested) break;
                if (entries.Count >= MaxEntriesPerFolder) break;
                if (++enumerated > MaxScanDepthFiles) break;

                try
                {
                    var info = new FileInfo(filePath);
                    if (!info.Exists) continue;

                    string hash;
                    await using (var stream = new FileStream(
                        filePath,
                        FileMode.Open,
                        FileAccess.Read,
                        FileShare.ReadWrite,
                        64 * 1024,
                        FileOptions.Asynchronous | FileOptions.SequentialScan))
                    {
                        var digest = await SHA256.HashDataAsync(stream, cancellationToken);
                        hash = Convert.ToHexString(digest).ToLowerInvariant();
                    }

                    entries.Add(new ManifestFileEntry(
                        Path.GetRelativePath(folderPath, filePath).Replace('\\', '/'),
                        hash,
                        info.Length,
                        info.LastWriteTimeUtc.ToString("O")));
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // A file can be locked or rotate between enumeration and
                    // read; skipping it is better than dropping the whole scan.
                    _logger.LogDebug(ex, "Skipped unreadable file {FilePath}.", filePath);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning(ex, "Could not enumerate protected folder {Path}.", folderPath);
            return null;
        }

        if (enumerated > MaxEntriesPerFolder)
        {
            _logger.LogWarning(
                "Protected folder {Path} has more than {Limit} files; manifest was truncated.",
                folderPath,
                MaxEntriesPerFolder);
        }

        return entries;
    }

    private void AddSyncToken(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }
    }

    private sealed record FolderWatch(string Id, string Path, string Label);

    private sealed record ManifestFileEntry(string RelativePath, string Sha256, long SizeBytes, string LastModifiedUtc);

    private sealed record ManifestUploadResult(List<BackupRequest>? FilesToBackup);

    private sealed record BackupRequest(string RelativePath, string Sha256, long SizeBytes);
}
