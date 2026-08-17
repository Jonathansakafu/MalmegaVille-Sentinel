using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Staging area for USB file uploads that failed and need retry. Deliberately
// separate from OfflineEventQueue: that queue rewrites one DPAPI-encrypted
// JSON blob per call, which is fine for small event records but untenable
// for megabytes of file content. This queue keeps files as plain sidecar
// pairs on disk (the content isn't a credential, just data already destined
// for upload) and retries them a few files at a time each service tick.
public sealed class PendingCaptureQueue
{
    private sealed record PendingMeta(string DeviceId, string SessionId, string OriginalPath, string FileName, DateTime CapturedAtUtc);

    private readonly ILogger<PendingCaptureQueue> _logger;
    private readonly CaptureUploadClient _uploadClient;
    private readonly string _stagingDir;

    public PendingCaptureQueue(ILogger<PendingCaptureQueue> logger, CaptureUploadClient uploadClient)
    {
        _logger = logger;
        _uploadClient = uploadClient;
        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        _stagingDir = Path.Combine(basePath, "PendingCaptures");
        Directory.CreateDirectory(_stagingDir);
    }

    public async Task StageFileAsync(string deviceId, string sessionId, string originalPath, Stream content, DateTime capturedAtUtc, CancellationToken cancellationToken)
    {
        try
        {
            var id = Guid.NewGuid().ToString("N");
            var fileName = Path.GetFileName(originalPath);
            var stagedFilePath = Path.Combine(_stagingDir, $"{id}.bin");
            var metaPath = Path.Combine(_stagingDir, $"{id}.meta.json");

            await using (var fileStream = File.Create(stagedFilePath))
            {
                await content.CopyToAsync(fileStream, cancellationToken);
            }

            var meta = new PendingMeta(deviceId, sessionId, originalPath, fileName, capturedAtUtc);
            await File.WriteAllTextAsync(metaPath, JsonSerializer.Serialize(meta), cancellationToken);

            _logger.LogInformation("Staged failed USB file upload for retry: {FileName}", fileName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to stage USB file for retry; the file will be skipped.");
        }
    }

    public async Task FlushPendingAsync(CancellationToken cancellationToken)
    {
        string[] metaFiles;
        try
        {
            metaFiles = Directory.GetFiles(_stagingDir, "*.meta.json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to enumerate pending capture staging directory.");
            return;
        }

        // Retry a small batch per tick rather than the whole backlog, so a large
        // pending queue doesn't monopolize the 15s monitoring loop.
        foreach (var metaPath in metaFiles.Take(5))
        {
            cancellationToken.ThrowIfCancellationRequested();

            var id = Path.GetFileNameWithoutExtension(Path.GetFileNameWithoutExtension(metaPath));
            var stagedFilePath = Path.Combine(_stagingDir, $"{id}.bin");

            try
            {
                var meta = JsonSerializer.Deserialize<PendingMeta>(await File.ReadAllTextAsync(metaPath, cancellationToken));
                if (meta == null || !File.Exists(stagedFilePath))
                {
                    TryDelete(metaPath);
                    TryDelete(stagedFilePath);
                    continue;
                }

                await using var stream = File.OpenRead(stagedFilePath);
                var ok = await _uploadClient.UploadUsbFileAsync(meta.DeviceId, meta.SessionId, meta.OriginalPath, meta.FileName, stream, meta.CapturedAtUtc, cancellationToken);
                if (ok)
                {
                    stream.Close();
                    TryDelete(metaPath);
                    TryDelete(stagedFilePath);
                    _logger.LogInformation("Retried and delivered staged USB file: {FileName}", meta.FileName);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Retry attempt failed for staged capture {MetaPath}; will try again next cycle.", metaPath);
            }
        }
    }

    private void TryDelete(string path)
    {
        try { File.Delete(path); } catch { /* best effort cleanup */ }
    }
}
