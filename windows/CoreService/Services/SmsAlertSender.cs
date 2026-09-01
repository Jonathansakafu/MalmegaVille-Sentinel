using Microsoft.Extensions.Logging;
using Windows.Devices.Enumeration;
using Windows.Devices.Sms;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Sends a security alert as a text message directly through the device's own
// WWAN/eSIM cellular modem, bypassing the internet entirely. This is a
// restricted WinRT device-access API: it requires the PC to have a
// SMS-capable cellular modem with an active SIM, and this process to be
// granted access to it. On some Windows configurations that access is only
// granted to a packaged (MSIX) app declaring the cellular messaging
// capability - an unpackaged Worker Service like this one may need that
// packaging to actually be allowed to send, depending on OEM/driver policy.
public sealed class SmsAlertSender
{
    private const int MaxMessageLength = 320;

    private readonly ILogger<SmsAlertSender> _logger;
    private readonly string? _ownerPhoneNumber;

    public SmsAlertSender(ILogger<SmsAlertSender> logger)
    {
        _logger = logger;
        _ownerPhoneNumber = Environment.GetEnvironmentVariable("SENTINEL_OWNER_SMS_NUMBER");
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_ownerPhoneNumber);

    public async Task<bool> TrySendAsync(SecurityEvent securityEvent, CancellationToken cancellationToken)
    {
        if (!IsConfigured)
        {
            _logger.LogDebug("SMS fallback not configured; SENTINEL_OWNER_SMS_NUMBER is not set.");
            return false;
        }

        try
        {
            var selector = SmsDevice.GetDeviceSelector();
            var devices = await DeviceInformation.FindAllAsync(selector);
            if (devices.Count == 0)
            {
                _logger.LogDebug("No SMS-capable cellular modem found on this device.");
                return false;
            }

            var smsDevice = await SmsDevice.FromIdAsync(devices[0].Id);
            var message = new SmsTextMessage
            {
                To = _ownerPhoneNumber,
                Body = BuildMessageBody(securityEvent)
            };

            await smsDevice.SendMessageAsync(message);
            _logger.LogInformation("Sent SMS fallback alert for event {EventType}.", securityEvent.EventType);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex,
                "Failed to send SMS fallback alert for event {EventType}. This device may have no WWAN/eSIM modem, " +
                "no active SIM, or this process may lack the cellular messaging device-access capability.",
                securityEvent.EventType);
            return false;
        }
    }

    private static string BuildMessageBody(SecurityEvent securityEvent)
    {
        var text = $"MalmegaVille Sentinel [{securityEvent.Severity}]: {securityEvent.EventType} on " +
            $"{securityEvent.DeviceName ?? "your device"}. {securityEvent.Description}";
        return text.Length > MaxMessageLength ? text[..MaxMessageLength] : text;
    }
}
