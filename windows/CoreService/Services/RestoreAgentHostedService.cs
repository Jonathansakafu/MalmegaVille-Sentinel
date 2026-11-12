using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Executes restore jobs requested from the dashboard. Protected-file jobs copy
// from the device's own disk; capture jobs download the stored evidence from
// the API. Either way the written file is re-hashed on disk and the hash is
// reported back, so "restored" means "verified", not just "copied".
public sealed class RestoreAgentHostedService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ILogger<RestoreAgentHostedService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _apiBase;
    private readonly string? _syncToken;
    private readonly string _restoreRoot;

    public RestoreAgentHostedService(ILogger<RestoreAgentHostedService> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        _apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");

        var configuredRoot = Environment.GetEnvironmentVariable("SENTINEL_RESTORE_DIR");
        _restoreRoot = !string.IsNullOrWhiteSpace(configuredRoot)
            ? configuredRoot
            : Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "MalmegaVille Sentinel",
                "Restore");

        Directory.CreateDirectory(_restoreRoot);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var deviceId = DeviceIdentity.GetOrCreateDeviceId();

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var jobs = await FetchPendingJobsAsync(deviceId, stoppingToken);
                foreach (var job in jobs)
                {
                    if (stoppingToken.IsCancellationRequested) break;
                    await ExecuteJobAsync(job, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Restore polling cycle failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task<List<PendingRestoreJob>> FetchPendingJobsAsync(string deviceId, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_apiBase}/restore/pending?deviceId={Uri.EscapeDataString(deviceId)}");
        AddSyncToken(request);

        try
        {
            using var response = await _httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return new List<PendingRestoreJob>();
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            return await JsonSerializer.DeserializeAsync<List<PendingRestoreJob>>(stream, JsonOptions, cancellationToken)
                ?? new List<PendingRestoreJob>();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not fetch pending restore jobs.");
            return new List<PendingRestoreJob>();
        }
    }

    private async Task ExecuteJobAsync(PendingRestoreJob job, CancellationToken cancellationToken)
    {
        var safeName = Path.GetFileName(job.FileName);
        if (string.IsNullOrWhiteSpace(safeName))
        {
            safeName = "restored-file";
        }

        string targetPath;
        if (!string.IsNullOrWhiteSpace(job.RestorePath) && Path.IsPathFullyQualified(job.RestorePath))
        {
            // The operator chose the destination explicitly; the service runs
            // with the rights to write there. A relative path is ignored rather
            // than resolved against the service's working directory.
            targetPath = job.RestorePath;
            var parent = Path.GetDirectoryName(targetPath);
            if (!string.IsNullOrWhiteSpace(parent))
            {
                Directory.CreateDirectory(parent);
            }
        }
        else
        {
            var jobDirectory = Path.Combine(_restoreRoot, job.Id);
            Directory.CreateDirectory(jobDirectory);
            targetPath = Path.Combine(jobDirectory, safeName);
        }

        var temporaryPath = targetPath + ".part";

        try
        {
            if (job.SourceKind == "capture" || !string.IsNullOrWhiteSpace(job.BackupId))
            {
                await DownloadContentAsync(job.Id, temporaryPath, cancellationToken);
                File.Move(temporaryPath, targetPath, overwrite: true);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(job.SourcePath) || !File.Exists(job.SourcePath))
                {
                    throw new FileNotFoundException("The source file no longer exists on this device.", job.SourcePath);
                }
                File.Copy(job.SourcePath, targetPath, overwrite: true);
            }

            var verificationHash = await ComputeSha256Async(targetPath, cancellationToken);

            if (!string.IsNullOrWhiteSpace(job.VerificationHash) &&
                !string.Equals(verificationHash, job.VerificationHash, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Hash mismatch after restore: expected {job.VerificationHash}, wrote {verificationHash}.");
            }

            await ReportAsync(
                job.Id,
                new RestoreReport("completed", targetPath, verificationHash, null),
                cancellationToken);

            _logger.LogInformation("Restore job {JobId} completed and verified at {Path}.", job.Id, targetPath);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Restore job {JobId} failed.", job.Id);
            try
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            catch
            {
                // A leftover .part file is harmless; the job result matters more.
            }

            await ReportAsync(
                job.Id,
                new RestoreReport("failed", null, null, ex.Message),
                cancellationToken);
        }
    }

    private async Task DownloadContentAsync(string jobId, string destinationPath, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{_apiBase}/restore/jobs/{Uri.EscapeDataString(jobId)}/content");
        AddSyncToken(request);

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Restore download failed with status {(int)response.StatusCode}.");
        }

        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        await using var destination = new FileStream(
            destinationPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            64 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        await source.CopyToAsync(destination, cancellationToken);
    }

    private static async Task<string> ComputeSha256Async(string path, CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            64 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        var digest = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    private async Task ReportAsync(string jobId, RestoreReport payload, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(
                    HttpMethod.Post,
                    $"{_apiBase}/restore/jobs/{Uri.EscapeDataString(jobId)}/report")
                {
                    Content = JsonContent.Create(payload, options: JsonOptions)
                };
                AddSyncToken(request);

                using var response = await _httpClient.SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return;
                }

                _logger.LogWarning(
                    "Restore report for {JobId} rejected with status {StatusCode}.",
                    jobId,
                    response.StatusCode);
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Restore report attempt {Attempt} failed for {JobId}.", attempt + 1, jobId);
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private void AddSyncToken(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }
    }

    private sealed record PendingRestoreJob(
        string Id,
        string SourceKind,
        string? CaptureId,
        string? BackupId,
        string? SourcePath,
        string? RestorePath,
        string FileName,
        long? SizeBytes,
        string? VerificationHash);

    private sealed record RestoreReport(
        string Status,
        string? RestoredPath,
        string? VerificationHash,
        string? Error);
}
