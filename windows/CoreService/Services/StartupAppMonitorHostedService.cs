using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Periodically snapshots the well-known Windows autorun surfaces (Run/RunOnce
// registry keys for the machine and every loaded user profile, plus the
// per-user and all-users Startup folders) and diffs against the previous
// snapshot to detect new, changed, or removed autorun entries.
public sealed class StartupAppMonitorHostedService : BackgroundService
{
    private static readonly TimeSpan ScanInterval = TimeSpan.FromMinutes(2);

    private static readonly (RegistryHive Hive, string SubKey)[] MachineRunKeys =
    {
        (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
        (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"),
        (RegistryHive.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
    };

    private static readonly string[] UserRunSubKeys =
    {
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
        @"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
    };

    private readonly ILogger<StartupAppMonitorHostedService> _logger;
    private readonly EncryptedEventStore _eventStore;
    private readonly OfflineEventQueue _offlineQueue;
    private readonly BackendSyncClient _syncClient;
    private readonly string _baselinePath;

    public StartupAppMonitorHostedService(
        ILogger<StartupAppMonitorHostedService> logger,
        EncryptedEventStore eventStore,
        OfflineEventQueue offlineQueue,
        BackendSyncClient syncClient)
    {
        _logger = logger;
        _eventStore = eventStore;
        _offlineQueue = offlineQueue;
        _syncClient = syncClient;

        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        Directory.CreateDirectory(basePath);
        _baselinePath = Path.Combine(basePath, "startupBaseline.json");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Startup application monitor is starting.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ScanAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during startup application scan.");
            }

            await Task.Delay(ScanInterval, stoppingToken);
        }
    }

    private async Task ScanAsync(CancellationToken stoppingToken)
    {
        var current = CollectStartupEntries();
        var previous = LoadBaseline();

        if (previous == null)
        {
            // First run: capture the baseline silently so pre-existing, already
            // vetted startup entries don't generate a flood of alerts on install.
            SaveBaseline(current);
            _logger.LogInformation("Startup application baseline captured with {Count} entries.", current.Count);
            return;
        }

        foreach (var (key, command) in current)
        {
            if (!previous.TryGetValue(key, out var previousCommand))
            {
                await RaiseStartupEventAsync("Startup Entry Added", "High",
                    $"A new startup entry was created: {key}.", key, command, stoppingToken);
            }
            else if (!string.Equals(previousCommand, command, StringComparison.OrdinalIgnoreCase))
            {
                await RaiseStartupEventAsync("Startup Entry Modified", "High",
                    $"An existing startup entry was modified: {key}.", key, command, stoppingToken);
            }
        }

        foreach (var key in previous.Keys)
        {
            if (!current.ContainsKey(key))
            {
                await RaiseStartupEventAsync("Startup Entry Removed", "Informational",
                    $"A startup entry was removed: {key}.", key, previous[key], stoppingToken);
            }
        }

        SaveBaseline(current);
    }

    private async Task RaiseStartupEventAsync(string eventType, string severity, string description, string key, string command, CancellationToken stoppingToken)
    {
        var securityEvent = new SecurityEvent(
            eventType,
            DateTime.UtcNow,
            description,
            severity: severity,
            deviceId: DeviceIdentity.GetOrCreateDeviceId(),
            deviceName: "Local Host",
            threatScore: severity == "High" ? 55 : 10,
            recommendedAction: "Verify this startup entry was created by a trusted, known application.",
            metadata: new Dictionary<string, string>
            {
                ["EntryKey"] = key,
                ["Command"] = command
            });

        _logger.LogInformation("Startup application change detected: {EventType} - {Key}", eventType, key);

        await _eventStore.SaveEventAsync(securityEvent, stoppingToken);
        await _offlineQueue.EnqueueAsync(securityEvent, stoppingToken);
        await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, stoppingToken);
    }

    private static Dictionary<string, string> CollectStartupEntries()
    {
        var entries = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (hive, subKey) in MachineRunKeys)
        {
            CollectRegistryRunKey(RegistryKey.OpenBaseKey(hive, RegistryView.Registry64), subKey, "HKLM", entries);
        }

        CollectUserRunKeys(entries);
        CollectStartupFolder(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup)), "AllUsersStartupFolder", entries);

        var usersRoot = Path.Combine(Path.GetPathRoot(Environment.SystemDirectory) ?? @"C:\", "Users");
        if (Directory.Exists(usersRoot))
        {
            foreach (var userDir in Directory.EnumerateDirectories(usersRoot))
            {
                var startupFolder = Path.Combine(userDir, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
                CollectStartupFolder(startupFolder, $"UserStartupFolder:{Path.GetFileName(userDir)}", entries);
            }
        }

        return entries;
    }

    private static void CollectRegistryRunKey(RegistryKey baseKey, string subKeyPath, string sourceLabel, Dictionary<string, string> entries)
    {
        try
        {
            using var baseKeyHandle = baseKey;
            using var key = baseKeyHandle.OpenSubKey(subKeyPath);
            if (key == null)
            {
                return;
            }

            foreach (var valueName in key.GetValueNames())
            {
                var value = key.GetValue(valueName)?.ToString() ?? string.Empty;
                entries[$"{sourceLabel}\\{subKeyPath}\\{valueName}"] = value;
            }
        }
        catch (Exception)
        {
            // Key may not exist or may be inaccessible; skip rather than fail the whole scan.
        }
    }

    private static void CollectUserRunKeys(Dictionary<string, string> entries)
    {
        try
        {
            using var usersHive = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Registry64);
            foreach (var sid in usersHive.GetSubKeyNames())
            {
                if (sid.EndsWith("_Classes", StringComparison.OrdinalIgnoreCase) || sid.Equals(".DEFAULT", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                foreach (var subKey in UserRunSubKeys)
                {
                    try
                    {
                        using var runKey = usersHive.OpenSubKey($@"{sid}\{subKey}");
                        if (runKey == null)
                        {
                            continue;
                        }

                        foreach (var valueName in runKey.GetValueNames())
                        {
                            var value = runKey.GetValue(valueName)?.ToString() ?? string.Empty;
                            entries[$"HKU\\{sid}\\{subKey}\\{valueName}"] = value;
                        }
                    }
                    catch (Exception)
                    {
                        // Inaccessible or missing sub-key; skip.
                    }
                }
            }
        }
        catch (Exception)
        {
            // HKEY_USERS may be unavailable in constrained environments; skip.
        }
    }

    private static void CollectStartupFolder(string folderPath, string sourceLabel, Dictionary<string, string> entries)
    {
        try
        {
            if (!Directory.Exists(folderPath))
            {
                return;
            }

            foreach (var file in Directory.EnumerateFiles(folderPath))
            {
                entries[$"{sourceLabel}\\{Path.GetFileName(file)}"] = file;
            }
        }
        catch (Exception)
        {
            // Folder may be inaccessible (e.g. another profile's ACLs); skip.
        }
    }

    private Dictionary<string, string>? LoadBaseline()
    {
        if (!File.Exists(_baselinePath))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(_baselinePath);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json);
        }
        catch (Exception)
        {
            return null;
        }
    }

    private void SaveBaseline(Dictionary<string, string> entries)
    {
        try
        {
            var json = JsonSerializer.Serialize(entries);
            File.WriteAllText(_baselinePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist startup application baseline.");
        }
    }
}
