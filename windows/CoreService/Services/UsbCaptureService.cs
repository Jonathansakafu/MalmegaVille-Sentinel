using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class UsbCaptureService
{
    private const long MaxFileBytes = 25L * 1024 * 1024;
    private const long MaxSessionBytes = 500L * 1024 * 1024;
    private const int MaxFilesPerSession = 5000;
    private const int InterFileDelayMs = 75; // throttles I/O so a large drive doesn't cause an obvious disk-activity spike

    private static readonly string[] SkipPathFragments = { "System Volume Information", "$RECYCLE.BIN" };

    private readonly ILogger<UsbCaptureService> _logger;
    private readonly CaptureUploadClient _uploadClient;
    private readonly PendingCaptureQueue _pendingQueue;

    public UsbCaptureService(ILogger<UsbCaptureService> logger, CaptureUploadClient uploadClient, PendingCaptureQueue pendingQueue)
    {
        _logger = logger;
        _uploadClient = uploadClient;
        _pendingQueue = pendingQueue;
    }

    public async Task CaptureSessionAsync(string driveLetter, string deviceId, CancellationToken cancellationToken)
    {
        var sessionId = Guid.NewGuid().ToString("N");
        long sessionBytes = 0;
        var manifest = new List<ManifestEntry>();

        _logger.LogInformation("Starting USB capture session {SessionId} for drive {DriveLetter}.", sessionId, driveLetter);

        foreach (var filePath in EnumerateFilesSafely(driveLetter))
        {
            cancellationToken.ThrowIfCancellationRequested();

            FileInfo info;
            try
            {
                info = new FileInfo(filePath);
            }
            catch
            {
                continue;
            }

            if (info.Length > MaxFileBytes)
            {
                manifest.Add(new ManifestEntry(info.Name, filePath, info.Length, "file_too_large"));
                continue;
            }

            if (sessionBytes + info.Length > MaxSessionBytes)
            {
                manifest.Add(new ManifestEntry(info.Name, filePath, info.Length, "session_cap_reached"));
                continue;
            }

            try
            {
                // Stream directly from the USB drive into the upload request rather than
                // copying to a local temp file first - halves disk I/O and avoids leaving
                // a lingering local copy of the thief's files.
                await using var stream = File.OpenRead(filePath);
                var uploaded = await _uploadClient.UploadUsbFileAsync(deviceId, sessionId, filePath, info.Name, stream, DateTime.UtcNow, cancellationToken);

                if (uploaded)
                {
                    sessionBytes += info.Length;
                }
                else
                {
                    stream.Close();
                    await using var retryStream = File.OpenRead(filePath);
                    await _pendingQueue.StageFileAsync(deviceId, sessionId, filePath, retryStream, DateTime.UtcNow, cancellationToken);
                    sessionBytes += info.Length;
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to copy or upload {FilePath}.", filePath);
                manifest.Add(new ManifestEntry(info.Name, filePath, info.Length, "copy_or_upload_failed"));
            }

            await Task.Delay(InterFileDelayMs, cancellationToken);
        }

        if (manifest.Count > 0)
        {
            await _uploadClient.UploadManifestAsync(deviceId, sessionId, manifest, cancellationToken);
        }

        _logger.LogInformation(
            "Finished USB capture session {SessionId}: {SessionBytes} bytes copied, {SkippedCount} entries skipped.",
            sessionId, sessionBytes, manifest.Count);
    }

    private static IEnumerable<string> EnumerateFilesSafely(string driveLetter)
    {
        var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true };
        var count = 0;

        IEnumerator<string>? enumerator = null;
        try
        {
            enumerator = Directory.EnumerateFiles(driveLetter, "*", options).GetEnumerator();
        }
        catch
        {
            yield break;
        }

        while (true)
        {
            string? current;
            try
            {
                if (!enumerator.MoveNext())
                {
                    break;
                }
                current = enumerator.Current;
            }
            catch
            {
                break;
            }

            if (SkipPathFragments.Any(fragment => current.Contains(fragment, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            if (++count > MaxFilesPerSession)
            {
                yield break;
            }

            yield return current;
        }
    }
}
