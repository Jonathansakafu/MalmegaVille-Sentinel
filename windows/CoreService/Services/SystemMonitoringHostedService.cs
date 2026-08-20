using System.Management;
using System.Security.Cryptography;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class SystemMonitoringHostedService : BackgroundService
{
    private readonly ILogger<SystemMonitoringHostedService> _logger;
    private readonly EncryptedEventStore _eventStore;
    private readonly OfflineEventQueue _offlineQueue;
    private readonly BackendSyncClient _syncClient;
    private readonly SyncTriggerWatcher _triggerWatcher;
    private readonly LostStatusClient _lostStatusClient;
    private readonly RemovableDriveWatcher _removableDriveWatcher;
    private readonly UsbCaptureService _usbCaptureService;
    private readonly PendingCaptureQueue _pendingCaptureQueue;
    private ManagementEventWatcher? _usbArrivalWatcher;
    private ManagementEventWatcher? _usbRemovalWatcher;
    private bool _usbWatchersInitialized;
    private readonly object _watcherLock = new();

    // A single physical USB stick insertion legitimately fires multiple
    // Win32_USBControllerDevice creation events - one per PnP tree node
    // (the device itself, its storage-class interface, the disk drive, ...).
    // Without this, one plug-in produced 2-3 separate "USB Device Connected"
    // alerts/records. Collapses events of the same type within this window
    // into a single one.
    private static readonly TimeSpan UsbEventDebounceWindow = TimeSpan.FromSeconds(3);
    private DateTime _lastUsbArrivalUtc = DateTime.MinValue;
    private DateTime _lastUsbRemovalUtc = DateTime.MinValue;
    private readonly object _usbDebounceLock = new();

    public SystemMonitoringHostedService(
        ILogger<SystemMonitoringHostedService> logger,
        EncryptedEventStore eventStore,
        OfflineEventQueue offlineQueue,
        BackendSyncClient syncClient,
        SyncTriggerWatcher triggerWatcher,
        LostStatusClient lostStatusClient,
        RemovableDriveWatcher removableDriveWatcher,
        UsbCaptureService usbCaptureService,
        PendingCaptureQueue pendingCaptureQueue)
    {
        _logger = logger;
        _eventStore = eventStore;
        _offlineQueue = offlineQueue;
        _syncClient = syncClient;
        _triggerWatcher = triggerWatcher;
        _lostStatusClient = lostStatusClient;
        _removableDriveWatcher = removableDriveWatcher;
        _usbCaptureService = usbCaptureService;
        _pendingCaptureQueue = pendingCaptureQueue;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("MalmegaVille Sentinel Core Service is starting.");

        InitializeUsbWatchers();

        var deviceId = DeviceIdentity.GetOrCreateDeviceId();
        _removableDriveWatcher.DriveArrived += (driveLetter) => HandleRemovableDriveArrived(driveLetter, deviceId);
        _removableDriveWatcher.Start();

        var startupEvent = new SecurityEvent(
            "Service Startup",
            DateTime.UtcNow,
            "Core service has started.",
            severity: "Informational",
            deviceId: deviceId,
            deviceName: "Local Host",
            recommendedAction: "Monitor service status.");

        await _eventStore.SaveEventAsync(startupEvent, stoppingToken);
        await _offlineQueue.EnqueueAsync(startupEvent, stoppingToken);
        await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (await _triggerWatcher.TryConsumeSyncTriggerAsync(stoppingToken))
                {
                    _logger.LogInformation("Sync request trigger detected.");
                    await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, stoppingToken);
                }

                await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, stoppingToken);
                await _lostStatusClient.RefreshAsync(deviceId, stoppingToken);
                await _pendingCaptureQueue.FlushPendingAsync(stoppingToken);
                _logger.LogDebug("Running security monitoring cycle.");

                var heartbeatEvent = new SecurityEvent(
                    "Heartbeat",
                    DateTime.UtcNow,
                    "Core service heartbeat.",
                    severity: "Informational",
                    deviceId: deviceId,
                    deviceName: "Local Host");

                await _eventStore.SaveEventAsync(heartbeatEvent, stoppingToken);
                await _offlineQueue.EnqueueAsync(heartbeatEvent, stoppingToken);
                await _syncClient.TrySyncQueuedEventsAsync(_offlineQueue, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during monitoring cycle.");
            }

            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }

        _logger.LogInformation("MalmegaVille Sentinel Core Service is stopping.");
        DisposeUsbWatchers();
        _removableDriveWatcher.Dispose();
    }

    private void HandleRemovableDriveArrived(string driveLetter, string deviceId)
    {
        if (!_lostStatusClient.LastKnownLost)
        {
            return;
        }

        _ = Task.Run(async () =>
        {
            try
            {
                await _usbCaptureService.CaptureSessionAsync(driveLetter, deviceId, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "USB capture session failed for drive {DriveLetter}.", driveLetter);
            }
        });
    }

    private void InitializeUsbWatchers()
    {
        lock (_watcherLock)
        {
            if (_usbWatchersInitialized)
            {
                return;
            }

            try
            {
                var arrivalQuery = new WqlEventQuery(
                    "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBControllerDevice'");
                _usbArrivalWatcher = new ManagementEventWatcher(arrivalQuery);
                _usbArrivalWatcher.EventArrived += (sender, args) => HandleUsbEvent(args, "USB Device Connected", "A USB device has been connected.");
                _usbArrivalWatcher.Start();

                var removalQuery = new WqlEventQuery(
                    "SELECT * FROM __InstanceDeletionEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_USBControllerDevice'");
                _usbRemovalWatcher = new ManagementEventWatcher(removalQuery);
                _usbRemovalWatcher.EventArrived += (sender, args) => HandleUsbEvent(args, "USB Device Removed", "A USB device has been disconnected.");
                _usbRemovalWatcher.Start();

                _usbWatchersInitialized = true;
                _logger.LogInformation("USB monitoring watchers initialized.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to initialize USB monitoring watchers.");
            }
        }
    }

    private void DisposeUsbWatchers()
    {
        lock (_watcherLock)
        {
            try
            {
                _usbArrivalWatcher?.Stop();
                _usbArrivalWatcher?.Dispose();
                _usbArrivalWatcher = null;

                _usbRemovalWatcher?.Stop();
                _usbRemovalWatcher?.Dispose();
                _usbRemovalWatcher = null;

                _logger.LogInformation("USB monitoring watchers disposed.");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing USB watchers.");
            }
        }
    }

    private void HandleUsbEvent(EventArrivedEventArgs eventArgs, string eventType, string description)
    {
        lock (_usbDebounceLock)
        {
            var now = DateTime.UtcNow;
            ref var lastUtc = ref (eventType == "USB Device Connected" ? ref _lastUsbArrivalUtc : ref _lastUsbRemovalUtc);
            if (now - lastUtc < UsbEventDebounceWindow)
            {
                return;
            }
            lastUtc = now;
        }

        var targetInstance = eventArgs.NewEvent? ["TargetInstance"] as ManagementBaseObject;
        var usbDeviceName = GetUsbDeviceName(targetInstance);
        var message = usbDeviceName != null
            ? $"{description} Device: {usbDeviceName}."
            : description;

        var securityEvent = new SecurityEvent(
            eventType,
            DateTime.UtcNow,
            message,
            severity: "High",
            deviceName: usbDeviceName ?? "USB Device",
            recommendedAction: "Review attached USB device for unauthorized access.",
            metadata: new Dictionary<string, string>
            {
                ["WMIEventClass"] = eventArgs.NewEvent?.ClassPath?.ClassName ?? "Unknown",
                ["TargetInstance"] = targetInstance?.ClassPath?.Path ?? "Unknown"
            });

        _logger.LogInformation("Detected USB event: {EventType} - {DeviceName}", eventType, securityEvent.DeviceName);

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
                _logger.LogWarning(ex, "Failed to queue USB security event.");
            }
        });
    }

    private static string? GetUsbDeviceName(ManagementBaseObject? targetInstance)
    {
        if (targetInstance == null)
        {
            return null;
        }

        var dependent = targetInstance["Dependent"]?.ToString();
        if (string.IsNullOrWhiteSpace(dependent))
        {
            return null;
        }

        const string prefix = "Win32_PnPEntity.DeviceID=\"";
        var start = dependent.IndexOf(prefix, StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            return dependent;
        }

        start += prefix.Length;
        var end = dependent.IndexOf('"', start);
        if (end <= start)
        {
            return dependent;
        }

        var deviceId = dependent[start..end]?.Replace("\\\\", "\\");
        return deviceId;
    }
}
