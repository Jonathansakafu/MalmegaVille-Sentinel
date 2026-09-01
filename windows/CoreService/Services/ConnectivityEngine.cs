using System.Net.NetworkInformation;
using Microsoft.Extensions.Logging;
using Windows.Devices.Enumeration;
using Windows.Devices.Sms;

namespace MalmegaVille.Sentinel.CoreService.Services;

public enum ConnectivityChannel
{
    // Any internet route is up (Wi-Fi, Ethernet, or cellular data over a WWAN/eSIM
    // modem) - the OS routes HTTPS traffic over whichever is active, so
    // BackendSyncClient needs no special handling for which one it is.
    Internet,

    // No internet route, but a cellular modem capable of sending SMS directly is
    // present - the only channel left that needs no internet at all.
    SmsOnly,

    // Nothing available; events stay in the local offline queue.
    Offline
}

// Detects which communication channel is currently usable, in the priority
// order from the architecture diagram: Internet (Wi-Fi/Ethernet/cellular data)
// first, direct-modem SMS second, offline queue as the last resort.
public sealed class ConnectivityEngine
{
    private static readonly string[] ReachabilityProbeHosts = { "1.1.1.1", "8.8.8.8" };

    private readonly ILogger<ConnectivityEngine> _logger;

    public ConnectivityEngine(ILogger<ConnectivityEngine> logger)
    {
        _logger = logger;
    }

    public async Task<ConnectivityChannel> GetCurrentChannelAsync(CancellationToken cancellationToken)
    {
        if (await HasInternetRouteAsync(cancellationToken))
        {
            return ConnectivityChannel.Internet;
        }

        if (await HasSmsCapableModemAsync())
        {
            return ConnectivityChannel.SmsOnly;
        }

        return ConnectivityChannel.Offline;
    }

    private async Task<bool> HasInternetRouteAsync(CancellationToken cancellationToken)
    {
        if (!NetworkInterface.GetIsNetworkAvailable())
        {
            return false;
        }

        foreach (var host in ReachabilityProbeHosts)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return false;
            }

            try
            {
                using var ping = new Ping();
                var reply = await ping.SendPingAsync(host, 1500);
                if (reply.Status == IPStatus.Success)
                {
                    return true;
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Reachability probe to {Host} failed.", host);
            }
        }

        return false;
    }

    private async Task<bool> HasSmsCapableModemAsync()
    {
        try
        {
            var selector = SmsDevice.GetDeviceSelector();
            var devices = await DeviceInformation.FindAllAsync(selector);
            return devices.Count > 0;
        }
        catch (Exception ex)
        {
            // Expected on machines with no WWAN/eSIM hardware, and on some
            // configurations where this unpackaged process isn't granted the
            // restricted Sms device-access capability.
            _logger.LogDebug(ex, "SMS-capable modem enumeration failed or is unavailable on this device.");
            return false;
        }
    }
}
