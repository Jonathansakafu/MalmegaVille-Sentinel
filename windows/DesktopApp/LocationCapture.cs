using Windows.Devices.Geolocation;

namespace MalmegaVille.Sentinel.Desktop;

public sealed record LocationFix(double Latitude, double Longitude, double? AccuracyMeters);

// Wi-Fi/GPS based positioning via the Windows Geolocation API. Unlike IP
// geolocation this needs the system-wide "Location" privacy setting enabled
// and (on some Windows versions) an access prompt the user must grant - a
// constraint of the OS location model, not something this code can bypass.
// Fails silently on denial/timeout/unavailability so the caller can fall back
// to the backend's IP-based location lookup instead.
public static class LocationCapture
{
    public static async Task<LocationFix?> TryGetWifiLocationAsync()
    {
        try
        {
            var accessStatus = await Geolocator.RequestAccessAsync();
            if (accessStatus != GeolocationAccessStatus.Allowed)
            {
                return null;
            }

            var geolocator = new Geolocator { DesiredAccuracy = PositionAccuracy.High };
            var position = await geolocator.GetGeopositionAsync(TimeSpan.FromMinutes(10), TimeSpan.FromSeconds(15));

            var point = position.Coordinate.Point.Position;
            return new LocationFix(point.Latitude, point.Longitude, position.Coordinate.Accuracy);
        }
        catch
        {
            return null;
        }
    }
}
