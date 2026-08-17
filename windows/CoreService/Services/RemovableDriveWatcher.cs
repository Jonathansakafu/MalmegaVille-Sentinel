using System.Management;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class RemovableDriveWatcher : IDisposable
{
    private readonly ILogger<RemovableDriveWatcher> _logger;
    private ManagementEventWatcher? _watcher;

    public event Action<string>? DriveArrived;

    public RemovableDriveWatcher(ILogger<RemovableDriveWatcher> logger)
    {
        _logger = logger;
    }

    public void Start()
    {
        try
        {
            // EventType = 2 is drive-letter arrival (as opposed to 1 = config change, 3 = removal).
            var query = new WqlEventQuery("SELECT * FROM Win32_VolumeChangeEvent WHERE EventType = 2");
            _watcher = new ManagementEventWatcher(query);
            _watcher.EventArrived += OnDriveArrived;
            _watcher.Start();
            _logger.LogInformation("Removable drive watcher initialized.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize removable drive watcher.");
        }
    }

    private void OnDriveArrived(object sender, EventArrivedEventArgs e)
    {
        var driveName = e.NewEvent["DriveName"]?.ToString();
        if (string.IsNullOrEmpty(driveName))
        {
            return;
        }

        _logger.LogInformation("Removable drive arrived: {DriveName}", driveName);
        DriveArrived?.Invoke(driveName);
    }

    public void Dispose()
    {
        try
        {
            _watcher?.Stop();
            _watcher?.Dispose();
            _watcher = null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error disposing removable drive watcher.");
        }
    }
}
