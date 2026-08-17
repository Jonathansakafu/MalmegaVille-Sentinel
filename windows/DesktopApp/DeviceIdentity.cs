using System;
using System.IO;

namespace MalmegaVille.Sentinel.Desktop;

// Reads the same %ProgramData%\MalmegaVille Sentinel\deviceId.txt the CoreService
// writes, so both processes agree on one stable identifier for this machine.
public static class DeviceIdentity
{
    private static readonly string BasePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "MalmegaVille Sentinel");

    private static readonly string DeviceIdPath = Path.Combine(BasePath, "deviceId.txt");

    private static string? _cachedDeviceId;

    public static string GetOrCreateDeviceId()
    {
        if (_cachedDeviceId != null)
        {
            return _cachedDeviceId;
        }

        Directory.CreateDirectory(BasePath);

        if (File.Exists(DeviceIdPath))
        {
            var existing = File.ReadAllText(DeviceIdPath).Trim();
            if (!string.IsNullOrEmpty(existing))
            {
                _cachedDeviceId = existing;
                return existing;
            }
        }

        var newId = Guid.NewGuid().ToString("N");
        File.WriteAllText(DeviceIdPath, newId);
        _cachedDeviceId = newId;
        return newId;
    }
}
