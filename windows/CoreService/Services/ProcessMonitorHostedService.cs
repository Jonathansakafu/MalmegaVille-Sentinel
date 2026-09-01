using System.Management;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Watches Win32_Process creation via WMI and flags launches that match common
// living-off-the-land / intrusion patterns: known dual-use binaries (LOLBins)
// invoked with suspicious arguments, or any process executing from a
// non-installed, drop-and-run style location (Temp, Downloads, etc.).
public sealed class ProcessMonitorHostedService : BackgroundService
{
    private static readonly HashSet<string> LolBins = new(StringComparer.OrdinalIgnoreCase)
    {
        "powershell.exe", "pwsh.exe", "cmd.exe", "wscript.exe", "cscript.exe",
        "mshta.exe", "regsvr32.exe", "rundll32.exe", "certutil.exe",
        "bitsadmin.exe", "wmic.exe", "psexec.exe", "schtasks.exe"
    };

    private static readonly string[] SuspiciousCommandLineMarkers =
    {
        "-enc", "-encodedcommand", "-nop", "-noprofile", "-windowstyle hidden",
        "-w hidden", "bypass", "downloadstring", "downloadfile", "iex(",
        "invoke-expression", "frombase64string", "-noni"
    };

    private static readonly string[] SuspiciousPathFragments =
    {
        "\\temp\\", "\\appdata\\local\\temp\\", "\\downloads\\", "\\programdata\\",
        "\\public\\", "\\perflogs\\"
    };

    private readonly ILogger<ProcessMonitorHostedService> _logger;
    private readonly EncryptedEventStore _eventStore;
    private readonly OfflineEventQueue _offlineQueue;
    private readonly BackendSyncClient _syncClient;
    private ManagementEventWatcher? _watcher;

    public ProcessMonitorHostedService(
        ILogger<ProcessMonitorHostedService> logger,
        EncryptedEventStore eventStore,
        OfflineEventQueue offlineQueue,
        BackendSyncClient syncClient)
    {
        _logger = logger;
        _eventStore = eventStore;
        _offlineQueue = offlineQueue;
        _syncClient = syncClient;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            var query = new WqlEventQuery(
                "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_Process'");
            _watcher = new ManagementEventWatcher(query);
            _watcher.EventArrived += OnProcessCreated;
            _watcher.Start();
            _logger.LogInformation("Process monitoring watcher initialized.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize process monitoring watcher.");
        }

        try
        {
            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            // Expected during service shutdown.
        }
        finally
        {
            try
            {
                _watcher?.Stop();
                _watcher?.Dispose();
                _watcher = null;
                _logger.LogInformation("Process monitoring watcher disposed.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing process monitoring watcher.");
            }
        }
    }

    private void OnProcessCreated(object sender, EventArrivedEventArgs eventArgs)
    {
        try
        {
            var targetInstance = eventArgs.NewEvent["TargetInstance"] as ManagementBaseObject;
            if (targetInstance == null)
            {
                return;
            }

            var name = targetInstance["Name"]?.ToString() ?? "unknown";
            var executablePath = targetInstance["ExecutablePath"]?.ToString();
            var commandLine = targetInstance["CommandLine"]?.ToString() ?? string.Empty;
            var processId = targetInstance["ProcessId"]?.ToString();
            var parentProcessId = targetInstance["ParentProcessId"]?.ToString();
            var parentName = ResolveParentName(parentProcessId);

            var isLolBin = LolBins.Contains(name);
            var matchedMarkers = isLolBin
                ? SuspiciousCommandLineMarkers.Where(marker =>
                    commandLine.Contains(marker, StringComparison.OrdinalIgnoreCase)).ToList()
                : new List<string>();

            var pathToCheck = executablePath ?? commandLine;
            var suspiciousPath = !string.IsNullOrEmpty(pathToCheck) &&
                SuspiciousPathFragments.Any(fragment => pathToCheck.Contains(fragment, StringComparison.OrdinalIgnoreCase));

            // Only raise a security event for processes worth a human's attention:
            // a LOLBin with suspicious arguments, or anything (LOLBin or not)
            // launching from a drop-and-run style path.
            if (matchedMarkers.Count == 0 && !suspiciousPath)
            {
                return;
            }

            var threatScore = Math.Min(100, (matchedMarkers.Count * 25) + (suspiciousPath ? 30 : 0) + (isLolBin ? 15 : 0));
            var severity = threatScore >= 70 ? "Critical" : threatScore >= 40 ? "High" : "Medium";

            var description = isLolBin
                ? $"Suspicious use of {name} detected."
                : $"Process launched from a suspicious location: {name}.";

            var securityEvent = new SecurityEvent(
                "Suspicious Process Activity",
                DateTime.UtcNow,
                description,
                severity: severity,
                deviceId: DeviceIdentity.GetOrCreateDeviceId(),
                deviceName: "Local Host",
                threatScore: threatScore,
                recommendedAction: "Review the process, its command line, and parent process for signs of compromise.",
                metadata: new Dictionary<string, string>
                {
                    ["ProcessName"] = name,
                    ["ProcessId"] = processId ?? "Unknown",
                    ["ExecutablePath"] = executablePath ?? "Unknown",
                    ["CommandLine"] = commandLine,
                    ["ParentProcessId"] = parentProcessId ?? "Unknown",
                    ["ParentProcessName"] = parentName ?? "Unknown",
                    ["MatchedIndicators"] = matchedMarkers.Count > 0 ? string.Join(", ", matchedMarkers) : "None",
                    ["SuspiciousPath"] = suspiciousPath.ToString()
                });

            _logger.LogInformation("Detected suspicious process activity: {ProcessName} (score {Score})", name, threatScore);

            _ = Task.Run(async () =>
            {
                try
                {
                    await _eventStore.SaveEventAsync(securityEvent, CancellationToken.None);
                    await _offlineQueue.EnqueueAsync(securityEvent, CancellationToken.None);
                    await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, CancellationToken.None);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to queue suspicious process security event.");
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error handling process creation event.");
        }
    }

    private static string? ResolveParentName(string? parentProcessId)
    {
        if (string.IsNullOrEmpty(parentProcessId) || !int.TryParse(parentProcessId, out var pid))
        {
            return null;
        }

        try
        {
            using var parent = System.Diagnostics.Process.GetProcessById(pid);
            return parent.ProcessName + ".exe";
        }
        catch
        {
            // Parent may have already exited; not a failure worth logging.
            return null;
        }
    }
}
