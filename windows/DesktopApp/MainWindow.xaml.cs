using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using System.Windows.Threading;
using Microsoft.Win32;
using MessageBox = System.Windows.MessageBox;
using Application = System.Windows.Application;
using Cursors = System.Windows.Input.Cursors;

namespace MalmegaVille.Sentinel.Desktop;

public partial class MainWindow : Window
{
    private NotifyIcon? _trayIcon;
    private readonly string _queueFilePath;
    private readonly string _syncTriggerPath;
    private readonly BackendApiClient _apiClient = new();
    private string? _authToken;
    private string? _authEmail;
    private bool _isExiting;

    // Round-tripped on save even though this app has no UI field to edit it -
    // set from the dashboard's Settings panel instead. Without this, saving
    // email settings here would silently wipe the account's phone number,
    // since PUT /settings/notifications replaces the whole record.
    private string _lastKnownPhoneNumber = string.Empty;

    private readonly DispatcherTimer _usbPollTimer = new() { Interval = TimeSpan.FromSeconds(3) };
    private HashSet<string> _lastRemovableDrives = new();
    private bool _captureInProgress;

    public MainWindow()
    {
        InitializeComponent();
        InitializeTrayIcon();

        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        _queueFilePath = Path.Combine(basePath, "eventQueue.dat");
        _syncTriggerPath = Path.Combine(basePath, "requestSync.json");

        RefreshQueuedEvents();
        RestoreSession();

        SystemEvents.SessionSwitch += OnSessionSwitch;
        _usbPollTimer.Tick += OnUsbPollTick;
        _usbPollTimer.Start();

        // Covers "the device is powered on and someone signs in": this app only
        // runs because the all-users Startup folder shortcut just launched it
        // after that sign-in completed, so by the time OnSessionSwitch below
        // could observe a SessionLogon event, this app (and its subscription
        // to it) didn't exist yet to catch it. Attempting a capture on the
        // app's own startup covers that moment instead - and since the
        // Startup shortcut is all-users, this fires for any account that
        // signs in, including one a thief creates.
        _ = TryCaptureAsync("sign_in");
    }

    private async void OnSessionSwitch(object? sender, SessionSwitchEventArgs e)
    {
        // SessionUnlock: screen was locked, now unlocked. SessionLogon: a fast
        // user switch to a different account while this app was already
        // running under another session.
        if (e.Reason == SessionSwitchReason.SessionUnlock)
        {
            await TryCaptureAsync("login_unlock");
        }
        else if (e.Reason == SessionSwitchReason.SessionLogon)
        {
            await TryCaptureAsync("sign_in");
        }
    }

    private async void OnUsbPollTick(object? sender, EventArgs e)
    {
        var current = DriveInfo.GetDrives()
            .Where(d => d.DriveType == DriveType.Removable)
            .Select(d => d.Name)
            .ToHashSet();

        // Updated before the (potentially multi-second) capture runs, not after - the
        // timer keeps ticking every 3s regardless of whether the previous tick's async
        // handler has finished, so leaving this update until after the await let the
        // same still-inserted drive look "new" again on the next tick, firing a second
        // overlapping capture that opened the camera while the first one still had it,
        // producing degraded/black frames from at least one of them.
        var newDrives = current.Except(_lastRemovableDrives).Any();
        _lastRemovableDrives = current;

        if (newDrives)
        {
            await TryCaptureAsync("usb_insert");
        }
    }

    // Silently checks whether this device has been flagged lost/stolen and, if so,
    // captures a webcam photo and approximate location and uploads both. Touches no
    // UI element - that omission is what keeps this invisible to whoever is at the
    // keyboard. Uses the sync-token auth path (not the owner's JWT) so it works
    // regardless of who is currently signed into the dashboard, if anyone.
    private async Task TryCaptureAsync(string triggerEvent)
    {
        // Guards against the unlock and USB-poll triggers overlapping (or the USB poll
        // firing again mid-capture) and opening the camera device twice concurrently.
        if (_captureInProgress)
        {
            return;
        }
        _captureInProgress = true;

        try
        {
            var deviceId = DeviceIdentity.GetOrCreateDeviceId();

            bool isLost;
            try
            {
                isLost = await _apiClient.CheckLostStatusAsync(deviceId);
            }
            catch
            {
                return;
            }

            if (!isLost)
            {
                return;
            }

            var capturedAt = DateTime.UtcNow;

            var jpeg = await Task.Run(WebcamCapture.CaptureSingleFrameJpeg);
            if (jpeg is not null)
            {
                try
                {
                    await _apiClient.UploadCapturePhotoAsync(deviceId, triggerEvent, capturedAt, jpeg);
                }
                catch
                {
                    // Best effort - no local retry queue for photos, the next trigger will produce a fresh one.
                }
            }

            try
            {
                var locationFix = await LocationCapture.TryGetWifiLocationAsync();
                await _apiClient.UploadCaptureLocationAsync(deviceId, triggerEvent, capturedAt, locationFix);
            }
            catch
            {
                // Best effort - the backend still has an IP-based fallback path for the next attempt.
            }
        }
        finally
        {
            _captureInProgress = false;
        }
    }

    private async Task TryRegisterDeviceAsync(bool showFeedback = false)
    {
        if (_authToken is null)
        {
            if (showFeedback)
            {
                DeviceStatusText.Text = "Sign in first, then register this PC.";
            }
            return;
        }

        if (showFeedback)
        {
            RegisterDeviceButton.IsEnabled = false;
            DeviceStatusText.Text = "Registering...";
        }

        try
        {
            var deviceId = DeviceIdentity.GetOrCreateDeviceId();
            await _apiClient.RegisterDeviceAsync(_authToken, deviceId, Environment.MachineName, $"Windows {Environment.OSVersion.Version}");
            if (showFeedback)
            {
                DeviceStatusText.Text = $"Registered as \"{Environment.MachineName}\". It'll now show up in Device Inventory on the dashboard.";
            }
        }
        catch (UnauthorizedApiException)
        {
            // The stored token is stale/invalid for the backend we're actually talking to
            // (e.g. left over from testing against a different server) - force a clean
            // re-sign-in rather than silently failing every authenticated call from here on.
            SignOutDueToInvalidSession();
            if (showFeedback)
            {
                DeviceStatusText.Text = "Your session was invalid, so you've been signed out. Please sign in again and retry.";
            }
        }
        catch (Exception ex)
        {
            // Best-effort on the silent auto-register path; surfaced only when the user
            // explicitly clicked the button.
            if (showFeedback)
            {
                DeviceStatusText.Text = $"Registration failed: {ex.Message}";
            }
        }
        finally
        {
            if (showFeedback)
            {
                RegisterDeviceButton.IsEnabled = true;
            }
        }
    }

    private async void RegisterDevice_Click(object sender, RoutedEventArgs e)
    {
        await TryRegisterDeviceAsync(showFeedback: true);
    }

    private void SignOutDueToInvalidSession()
    {
        _authToken = null;
        _authEmail = null;
        AuthTokenStore.Clear();
        UpdateAccountUi();
        _trayIcon?.ShowBalloonTip(2000, "MalmegaVille Sentinel", "Your session expired or was invalid. Please sign in again.", ToolTipIcon.Warning);
    }

    private void InitializeTrayIcon()
    {
        _trayIcon = new NotifyIcon
        {
            Text = "MalmegaVille Sentinel",
            Icon = LoadTrayIcon(),
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };

        _trayIcon.ContextMenuStrip.Items.Add("Open", null, (_, _) => ShowWindow());
        _trayIcon.ContextMenuStrip.Items.Add("Exit", null, (_, _) => ExitApplication());
        _trayIcon.DoubleClick += (_, _) => ShowWindow();
    }

    private static System.Drawing.Icon LoadTrayIcon()
    {
        try
        {
            // Prefer deriving the tray icon from the real logo artwork rather than the
            // placeholder app.ico - Bitmap.GetHicon() rasterizes any image format into a
            // native icon handle, so no separate .ico conversion tooling is needed.
            var logoResource = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/logo.jpeg"));
            if (logoResource?.Stream is not null)
            {
                using var bitmap = new System.Drawing.Bitmap(logoResource.Stream);
                using var resized = new System.Drawing.Bitmap(bitmap, new System.Drawing.Size(32, 32));
                var handle = resized.GetHicon();
                return System.Drawing.Icon.FromHandle(handle);
            }
        }
        catch
        {
            // Fall through to app.ico, then the system default.
        }

        try
        {
            var resourceInfo = Application.GetResourceStream(new Uri("pack://application:,,,/Assets/app.ico"));
            if (resourceInfo?.Stream is not null)
            {
                return new System.Drawing.Icon(resourceInfo.Stream);
            }
        }
        catch
        {
            // Embedded icon resource couldn't be loaded; fall back to the default system icon.
        }

        return System.Drawing.SystemIcons.Application;
    }

    private void ShowWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void ExitApplication()
    {
        _isExiting = true;
        _trayIcon?.Dispose();
        Application.Current.Shutdown();
    }

    // The window's close button (X) would otherwise end the whole process (and with it,
    // the USB-poll timer and unlock listener that back the lost-device capture feature).
    // Redirect it to a tray-minimize instead; only the tray menu's "Exit" really quits.
    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_isExiting)
        {
            e.Cancel = true;
            Hide();
            _trayIcon?.ShowBalloonTip(1000, "MalmegaVille Sentinel", "Still running in the background. Right-click the tray icon to exit.", ToolTipIcon.Info);
            return;
        }

        base.OnClosing(e);
    }

    private void SyncNow_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var payload = JsonSerializer.Serialize(new { requestedAt = DateTime.UtcNow });
            File.WriteAllText(_syncTriggerPath, payload);
            QueueStatusText.Text = "Sync request created. Service will process it when active.";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, $"Failed to request sync: {ex.Message}", "Sync Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void RefreshQueue_Click(object sender, RoutedEventArgs e)
    {
        RefreshQueuedEvents();
    }

    private void RefreshQueuedEvents()
    {
        try
        {
            var events = ReadQueuedEvents();
            QueuedEventsList.ItemsSource = events.Select(e => $"[{e.TimestampUtc:O}] {e.EventType} ({e.Severity}) - {e.Description}").ToList();
            QueueStatusText.Text = events.Any() ? $"{events.Count} queued events found." : "No queued events found.";
        }
        catch (Exception ex)
        {
            QueueStatusText.Text = "Unable to read queued events.";
            QueuedEventsList.ItemsSource = new List<string> { ex.Message };
        }
    }

    private List<QueuedEventItem> ReadQueuedEvents()
    {
        if (!File.Exists(_queueFilePath))
        {
            return new List<QueuedEventItem>();
        }

        var encrypted = File.ReadAllBytes(_queueFilePath);
        var bytes = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.LocalMachine);
        var json = Encoding.UTF8.GetString(bytes);
        return JsonSerializer.Deserialize<List<QueuedEventItem>>(json) ?? new List<QueuedEventItem>();
    }

    private void RestoreSession()
    {
        var session = AuthTokenStore.Load();
        if (session is null)
        {
            return;
        }

        _authToken = session.Token;
        _authEmail = session.Email;
        UpdateAccountUi();
        _ = LoadNotificationSettingsAsync();
        _ = TryRegisterDeviceAsync();
    }

    private void UpdateAccountUi()
    {
        var signedIn = _authToken is not null;

        AccountStatusText.Text = signedIn ? $"Signed in as {_authEmail}" : "Not signed in.";
        AccountStatusDot.Fill = (System.Windows.Media.Brush)FindResource(signedIn ? "BrandGreenBrush" : "MutedTextBrush");
        SignInButton.Visibility = signedIn ? Visibility.Collapsed : Visibility.Visible;
        SignOutButton.Visibility = signedIn ? Visibility.Visible : Visibility.Collapsed;

        AlertEmailTextBox.IsEnabled = signedIn;
        SaveSettingsButton.IsEnabled = signedIn;
        SendTestAlertButton.IsEnabled = signedIn;
    }

    private void SignIn_Click(object sender, RoutedEventArgs e)
    {
        var loginWindow = new LoginWindow(_apiClient) { Owner = this };
        var result = loginWindow.ShowDialog();

        if (result != true || loginWindow.AuthToken is null || loginWindow.AuthEmail is null)
        {
            return;
        }

        _authToken = loginWindow.AuthToken;
        _authEmail = loginWindow.AuthEmail;
        AuthTokenStore.Save(new StoredSession(_authToken, _authEmail));
        UpdateAccountUi();
        _ = LoadNotificationSettingsAsync();
        _ = TryRegisterDeviceAsync();
    }

    private void SignOut_Click(object sender, RoutedEventArgs e)
    {
        _authToken = null;
        _authEmail = null;
        AuthTokenStore.Clear();

        AlertEmailTextBox.Text = string.Empty;
        _lastKnownPhoneNumber = string.Empty;
        SettingsStatusText.Text = string.Empty;

        UpdateAccountUi();
    }

    private async Task LoadNotificationSettingsAsync()
    {
        if (_authToken is null)
        {
            return;
        }

        SettingsStatusText.Text = "Loading notification settings...";

        try
        {
            var settings = await _apiClient.GetNotificationSettingsAsync(_authToken);
            AlertEmailTextBox.Text = settings.AlertEmailRecipient;
            _lastKnownPhoneNumber = settings.AlertPhoneNumber;
            SettingsStatusText.Text = string.Empty;
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            SettingsStatusText.Text = $"Failed to load notification settings: {ex.Message}";
        }
    }

    private async void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        if (_authToken is null)
        {
            return;
        }

        SaveSettingsButton.IsEnabled = false;
        SettingsStatusText.Text = "Saving...";
        Cursor = Cursors.Wait;

        try
        {
            var settings = new NotificationSettingsDto(AlertEmailTextBox.Text.Trim(), _lastKnownPhoneNumber);

            var saved = await _apiClient.SaveNotificationSettingsAsync(_authToken, settings);
            _lastKnownPhoneNumber = saved.AlertPhoneNumber;
            SettingsStatusText.Text = "Settings saved.";
        }
        catch (Exception ex)
        {
            SettingsStatusText.Text = $"Failed to save settings: {ex.Message}";
        }
        finally
        {
            SaveSettingsButton.IsEnabled = true;
            Cursor = Cursors.Arrow;
        }
    }

    private async void SendTestAlert_Click(object sender, RoutedEventArgs e)
    {
        if (_authToken is null)
        {
            return;
        }

        SendTestAlertButton.IsEnabled = false;
        SettingsStatusText.Text = "Sending test alert...";
        Cursor = Cursors.Wait;

        try
        {
            var result = await _apiClient.SendTestAlertAsync(_authToken);
            SettingsStatusText.Text = FormatTestResult(result);
        }
        catch (Exception ex)
        {
            SettingsStatusText.Text = $"Failed to send test alert: {ex.Message}";
        }
        finally
        {
            SendTestAlertButton.IsEnabled = true;
            Cursor = Cursors.Arrow;
        }
    }

    private static string FormatTestResult(NotificationTestResult result)
    {
        return $"{DescribeChannel("Email", result.Email)} · {DescribeChannel("Push", result.Push)} · {DescribeChannel("SMS", result.Sms)}";
    }

    private static string DescribeChannel(string name, NotificationChannelResult channel)
    {
        if (!channel.Configured)
        {
            return $"{name}: not configured";
        }

        return channel.Sent ? $"{name}: sent" : $"{name}: failed ({channel.Error})";
    }

    protected override void OnStateChanged(EventArgs e)
    {
        base.OnStateChanged(e);
        if (WindowState == WindowState.Minimized)
        {
            Hide();
            _trayIcon?.ShowBalloonTip(1000, "MalmegaVille Sentinel", "Application minimized to tray.", ToolTipIcon.Info);
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        _usbPollTimer.Stop();
        _trayIcon?.Dispose();
        base.OnClosed(e);
    }

    private sealed record QueuedEventItem(string EventType, string Severity, DateTime TimestampUtc, string Description);
}
