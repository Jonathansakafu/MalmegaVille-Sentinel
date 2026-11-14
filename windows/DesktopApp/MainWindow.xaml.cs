using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Microsoft.Win32;
using Button = System.Windows.Controls.Button;
using MessageBox = System.Windows.MessageBox;
using Application = System.Windows.Application;
using Cursors = System.Windows.Input.Cursors;
using Orientation = System.Windows.Controls.Orientation;
using TextBlock = System.Windows.Controls.TextBlock;

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
    private int _captureInProgress;

    private readonly DispatcherTimer _clockTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _tickerTimer = new() { Interval = TimeSpan.FromSeconds(6) };

    private List<DeviceDto> _devices = new();
    private List<IncidentDto> _incidents = new();
    private List<CaptureDto> _captures = new();
    private int _onlineCount;
    private int _tickerIndex;
    private int _capturesGeneration;
    private CaptureDto? _overlayCapture;
    private bool _dashboardLoading;
    private bool _capturesLoading;

    // Camera warm-up alone can take ~1.5s, and the uploads have a 15s HTTP
    // timeout each - so this is deliberately generous, but still bounds the
    // whole sequence rather than trusting every awaited call to return.
    private static readonly TimeSpan CaptureTimeout = TimeSpan.FromSeconds(45);

    public ICommand ToggleLostCommand { get; }
    public ICommand RemoveDeviceCommand { get; }

    public MainWindow()
    {
        InitializeComponent();
        DataContext = this;

        ToggleLostCommand = new RelayCommand(parameter => _ = ToggleLostAsync(parameter as DeviceRowVm));
        RemoveDeviceCommand = new RelayCommand(parameter => _ = RemoveDeviceAsync(parameter as DeviceRowVm));

        InitializeTrayIcon();

        Loaded += MainWindow_Loaded;
        AddHandler(System.Windows.Controls.Primitives.ButtonBase.ClickEvent, new RoutedEventHandler((_, _) => SentinelSound.Click()));
        PreviewKeyDown += (_, _) => SentinelSound.Key();

        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        _queueFilePath = Path.Combine(basePath, "eventQueue.dat");
        _syncTriggerPath = Path.Combine(basePath, "requestSync.json");

        AgentDeviceIdText.Text = DeviceIdentity.GetOrCreateDeviceId();
        AgentMachineText.Text = Environment.MachineName;

        RefreshQueuedEvents();
        RestoreSession();
        UpdateClocks();
        UpdateTickerText();

        _clockTimer.Tick += (_, _) => UpdateClocks();
        _tickerTimer.Tick += (_, _) => RotateTicker();
        _clockTimer.Start();
        _tickerTimer.Start();

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
        CaptureLog.Write("tray app started");
        _ = TryCaptureAsync("sign_in");
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        SentinelSound.Boot();
        ShowSection("dashboard");
        await RefreshDashboardAsync();
    }

    private void Nav_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded || sender is not System.Windows.Controls.RadioButton nav)
        {
            return;
        }

        SentinelSound.Nav();
        ShowSection(nav.Tag as string ?? "dashboard");
    }

    private void ShowSection(string section)
    {
        DashboardView.Visibility = section == "dashboard" ? Visibility.Visible : Visibility.Collapsed;
        CapturesView.Visibility = section == "captures" ? Visibility.Visible : Visibility.Collapsed;
        SettingsView.Visibility = section == "settings" ? Visibility.Visible : Visibility.Collapsed;

        switch (section)
        {
            case "captures":
                _ = RefreshCapturesAsync();
                break;
            case "settings":
                if (_authToken is not null && string.IsNullOrEmpty(AlertEmailTextBox.Text))
                {
                    _ = LoadNotificationSettingsAsync();
                }
                break;
            default:
                _ = RefreshDashboardAsync();
                break;
        }
    }

    private void OperatorButton_Click(object sender, RoutedEventArgs e)
    {
        OperatorPopup.PlacementTarget = OperatorButton;
        OperatorPopup.IsOpen = true;
    }

    private void OpenWebConsole_Click(object sender, RoutedEventArgs e)
    {
        OpenDashboard();
    }

    private void RefreshDashboard_Click(object sender, RoutedEventArgs e)
    {
        _ = RefreshDashboardAsync();
    }

    private void RefreshCaptures_Click(object sender, RoutedEventArgs e)
    {
        _ = RefreshCapturesAsync();
    }

    private void CloseOverlay_Click(object sender, RoutedEventArgs e)
    {
        CloseOverlay();
    }

    private async void DeleteOverlayCapture_Click(object sender, RoutedEventArgs e)
    {
        var capture = _overlayCapture;
        if (capture is null)
        {
            return;
        }

        await DeleteCaptureAsync(capture);
    }

    private async Task RefreshDashboardAsync()
    {
        if (_dashboardLoading)
        {
            return;
        }

        if (_authToken is null)
        {
            ApplySignedOutState();
            return;
        }

        _dashboardLoading = true;
        DashboardStatusText.Text = "Syncing telemetry...";

        try
        {
            var devicesTask = _apiClient.GetDevicesAsync(_authToken);
            var incidentsTask = _apiClient.GetIncidentsAsync(_authToken);
            var capturesTask = _apiClient.GetCapturesAsync(_authToken);
            await Task.WhenAll(devicesTask, incidentsTask, capturesTask);

            _devices = await devicesTask;
            _incidents = await incidentsTask;
            _captures = await capturesTask;

            RenderDashboard();
            DashboardStatusText.Text =
                $"Telemetry synced {DateTime.Now:HH:mm:ss} · {_devices.Count} device(s) · {_incidents.Count} incident(s) · {_captures.Count} evidence record(s)";
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            DashboardStatusText.Text = $"Telemetry unavailable: {ex.Message}";
        }
        finally
        {
            _dashboardLoading = false;
        }
    }

    private void RenderDashboard()
    {
        var now = DateTimeOffset.UtcNow;
        var online = _devices.Count(device => now - ParseSeen(device.LastSeen) < TimeSpan.FromMinutes(10));
        _onlineCount = online;
        var offline = _devices.Count - online;
        var critical = _incidents.Count(incident =>
            string.Equals(incident.Severity, "critical", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(incident.Severity, "high", StringComparison.OrdinalIgnoreCase));

        DevicesValueText.Text = _devices.Count.ToString(CultureInfo.InvariantCulture);
        DevicesHintText.Text = _devices.Count == 0 ? "no telemetry yet" : "registered agents";
        OnlineValueText.Text = online.ToString(CultureInfo.InvariantCulture);
        OnlineHintText.Text = $"{offline} offline";
        OfflineValueText.Text = offline.ToString(CultureInfo.InvariantCulture);
        OfflineHintText.Text = offline > 0 ? "needs attention" : "all reachable";
        ThreatsValueText.Text = _incidents.Count.ToString(CultureInfo.InvariantCulture);
        ThreatsHintText.Text = $"{critical} critical";

        var incidentRows = _incidents
            .OrderByDescending(incident => ParseSeen(incident.CreatedAt))
            .Take(6)
            .Select(incident => new IncidentRowVm(incident))
            .ToList();
        IncidentsList.ItemsSource = incidentRows;
        IncidentsEmptyText.Visibility = incidentRows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        var deviceRows = _devices
            .OrderByDescending(device => device.IsLost)
            .ThenByDescending(device => ParseSeen(device.LastSeen))
            .Select(device => new DeviceRowVm(device, now - ParseSeen(device.LastSeen) < TimeSpan.FromMinutes(10)))
            .ToList();
        DevicesList.ItemsSource = deviceRows;
        DevicesEmptyText.Visibility = deviceRows.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        SidebarStatusText.Text = _devices.Count == 0
            ? "agent armed · awaiting telemetry"
            : $"{online} online · {offline} offline · {_captures.Count} evidence";

        UpdateTickerText();
    }

    private async Task ToggleLostAsync(DeviceRowVm? row)
    {
        if (row is null || string.IsNullOrWhiteSpace(row.MongoId) || _authToken is null)
        {
            return;
        }

        try
        {
            await _apiClient.SetDeviceLostStatusAsync(_authToken, row.MongoId, !row.IsLost);
            if (row.IsLost)
            {
                SentinelSound.Grant();
            }
            else
            {
                SentinelSound.Alert();
            }

            await RefreshDashboardAsync();
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            DashboardStatusText.Text = $"Could not update lost status: {ex.Message}";
            SentinelSound.Deny();
        }
    }

    private async Task RemoveDeviceAsync(DeviceRowVm? row)
    {
        if (row is null || string.IsNullOrWhiteSpace(row.MongoId) || _authToken is null)
        {
            return;
        }

        var confirmed = MessageBox.Show(
            this,
            $"Remove \"{row.Name}\" from your account? It will stop appearing in inventory; the agent itself keeps running.",
            "Remove device",
            MessageBoxButton.OKCancel,
            MessageBoxImage.Warning);
        if (confirmed != MessageBoxResult.OK)
        {
            return;
        }

        try
        {
            await _apiClient.DeleteDeviceAsync(_authToken, row.MongoId);
            SentinelSound.Grant();
            await RefreshDashboardAsync();
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            DashboardStatusText.Text = $"Could not remove device: {ex.Message}";
            SentinelSound.Deny();
        }
    }

    private async Task RefreshCapturesAsync()
    {
        if (_capturesLoading)
        {
            return;
        }

        if (_authToken is null)
        {
            RenderCaptures();
            CapturesStatusText.Text = "Sign in to load captured evidence.";
            return;
        }

        _capturesLoading = true;
        CapturesStatusText.Text = "Loading evidence...";

        try
        {
            _captures = await _apiClient.GetCapturesAsync(_authToken);
            RenderCaptures();
            CapturesStatusText.Text = $"{_captures.Count} evidence record(s) · synced {DateTime.Now:HH:mm:ss}";
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            CapturesStatusText.Text = $"Unable to load captures: {ex.Message}";
        }
        finally
        {
            _capturesLoading = false;
        }
    }

    private void RenderCaptures()
    {
        var generation = ++_capturesGeneration;

        PhotosPanel.Children.Clear();
        LocationsPanel.Children.Clear();
        UsbPanel.Children.Clear();

        var photos = _captures
            .Where(capture => capture.CaptureType == "webcam_photo")
            .OrderByDescending(capture => ParseSeen(capture.CapturedAtUtc))
            .ToList();
        var locations = _captures
            .Where(capture => capture.CaptureType == "location")
            .OrderByDescending(capture => ParseSeen(capture.CapturedAtUtc))
            .ToList();
        var files = _captures
            .Where(capture => capture.CaptureType is "usb_file" or "usb_manifest")
            .OrderByDescending(capture => ParseSeen(capture.CapturedAtUtc))
            .ToList();

        foreach (var photo in photos)
        {
            PhotosPanel.Children.Add(BuildPhotoTile(photo, generation));
        }

        foreach (var location in locations)
        {
            LocationsPanel.Children.Add(BuildLocationCard(location));
        }

        foreach (var group in files.GroupBy(FileSessionKey).OrderByDescending(group => group.Max(capture => ParseSeen(capture.CapturedAtUtc))))
        {
            var session = group.ToList();
            UsbPanel.Children.Add(BuildSessionHeader(session));
            foreach (var file in session)
            {
                UsbPanel.Children.Add(BuildFileCard(file));
            }
        }

        PhotosEmptyText.Visibility = photos.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        LocationsEmptyText.Visibility = locations.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        UsbEmptyText.Visibility = files.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

        UpdateTickerText();
    }

    private FrameworkElement BuildPhotoTile(CaptureDto capture, int generation)
    {
        var placeholder = new TextBlock
        {
            Text = "LOADING…",
            Style = (Style)FindResource("MonoHint"),
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        var image = new System.Windows.Controls.Image { Stretch = Stretch.UniformToFill };

        var stack = new System.Windows.Controls.Grid();
        stack.Children.Add(placeholder);
        stack.Children.Add(image);

        var tile = new Border
        {
            Width = 168,
            Height = 168,
            Margin = new Thickness(0, 0, 10, 10),
            Background = (Brush)FindResource("InputBrush"),
            BorderBrush = (Brush)FindResource("InputBorderBrush"),
            BorderThickness = new Thickness(1),
            Cursor = Cursors.Hand,
            ToolTip = $"{FormatLocal(capture.CapturedAtUtc)} · {capture.DeviceId}",
            Child = stack
        };
        tile.MouseLeftButtonUp += (_, _) => ShowOverlay(capture, image.Source);

        _ = LoadCaptureImageAsync(capture, image, placeholder, generation);
        return tile;
    }

    private async Task LoadCaptureImageAsync(CaptureDto capture, System.Windows.Controls.Image target, TextBlock placeholder, int generation)
    {
        if (_authToken is null || string.IsNullOrWhiteSpace(capture.CaptureId))
        {
            placeholder.Text = "UNAVAILABLE";
            return;
        }

        try
        {
            var bytes = await _apiClient.GetCaptureBytesAsync(_authToken, capture.CaptureId);
            if (generation != _capturesGeneration)
            {
                return;
            }

            target.Source = CreateBitmap(bytes);
            placeholder.Visibility = Visibility.Collapsed;
        }
        catch (Exception ex)
        {
            placeholder.Text = "UNAVAILABLE";
            CaptureLog.Write($"photo {capture.CaptureId} load failed", ex);
        }
    }

    private FrameworkElement BuildLocationCard(CaptureDto capture)
    {
        var card = CreateRecordCard();
        var grid = CreateRecordGrid();

        var text = new System.Windows.Controls.StackPanel();
        text.Children.Add(new TextBlock
        {
            Text = FormatLocal(capture.CapturedAtUtc),
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis
        });

        var latitude = capture.Number("latitude");
        var longitude = capture.Number("longitude");
        var source = MetaString(capture, "source");
        var detail = latitude.HasValue && longitude.HasValue
            ? $"{latitude.Value.ToString("0.#####", CultureInfo.InvariantCulture)}, {longitude.Value.ToString("0.#####", CultureInfo.InvariantCulture)}"
            : "Location unavailable";
        if (!string.IsNullOrWhiteSpace(source))
        {
            detail += source == "wifi" ? " · Wi-Fi positioning" : " · approximate (IP-based)";
        }

        text.Children.Add(new TextBlock
        {
            Text = $"{detail} · {capture.DeviceId}",
            Style = (Style)FindResource("MonoHint"),
            Margin = new Thickness(0, 4, 0, 0)
        });

        var buttons = new System.Windows.Controls.StackPanel
        {
            Orientation = Orientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Center
        };
        if (latitude.HasValue && longitude.HasValue)
        {
            var lat = latitude.Value;
            var lon = longitude.Value;
            buttons.Children.Add(CreateRowButton("OPEN MAP", false, (_, _) => OpenMap(lat, lon)));
        }

        buttons.Children.Add(CreateRowButton("DELETE", true, (_, _) => _ = DeleteCaptureAsync(capture)));

        System.Windows.Controls.Grid.SetColumn(text, 0);
        System.Windows.Controls.Grid.SetColumn(buttons, 1);
        grid.Children.Add(text);
        grid.Children.Add(buttons);
        card.Child = grid;
        return card;
    }

    private FrameworkElement BuildFileCard(CaptureDto capture)
    {
        var card = CreateRecordCard();
        var grid = CreateRecordGrid();

        var text = new System.Windows.Controls.StackPanel();
        text.Children.Add(new TextBlock
        {
            Text = capture.OriginalFileName ?? "Unknown file",
            FontSize = 12,
            FontWeight = FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis
        });

        var size = capture.SizeBytes > 0 ? $"{capture.SizeBytes / 1024.0:0.0} KB" : "—";
        var status = capture.Skipped ? $"Skipped ({capture.SkipReason ?? "unknown"})" : "Copied";
        text.Children.Add(new TextBlock
        {
            Text = $"{size} · {status} · {TriggerLabel(capture.TriggerEvent)}",
            Style = (Style)FindResource("MonoHint"),
            Margin = new Thickness(0, 4, 0, 0)
        });

        var buttons = new System.Windows.Controls.StackPanel
        {
            Orientation = Orientation.Horizontal,
            VerticalAlignment = VerticalAlignment.Center
        };
        if (!capture.Skipped && !string.IsNullOrWhiteSpace(capture.CaptureId))
        {
            buttons.Children.Add(CreateRowButton("SAVE", false, (_, _) => _ = SaveCaptureFileAsync(capture)));
        }

        buttons.Children.Add(CreateRowButton("DELETE", true, (_, _) => _ = DeleteCaptureAsync(capture)));

        System.Windows.Controls.Grid.SetColumn(text, 0);
        System.Windows.Controls.Grid.SetColumn(buttons, 1);
        grid.Children.Add(text);
        grid.Children.Add(buttons);
        card.Child = grid;
        return card;
    }

    private FrameworkElement BuildSessionHeader(List<CaptureDto> session)
    {
        var earliest = session.Min(capture => ParseSeen(capture.CapturedAtUtc));
        var label = earliest == DateTimeOffset.MinValue
            ? "USB session"
            : earliest.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss");
        return new TextBlock
        {
            Text = $"{label} · {session.Count} file{(session.Count == 1 ? string.Empty : "s")} · {session[0].DeviceId}",
            Style = (Style)FindResource("HudLabel"),
            Margin = new Thickness(0, 8, 0, 6)
        };
    }

    private Border CreateRecordCard() => new()
    {
        Background = (Brush)FindResource("InputBrush"),
        BorderBrush = (Brush)FindResource("InputBorderBrush"),
        BorderThickness = new Thickness(1),
        Padding = new Thickness(10),
        Margin = new Thickness(0, 0, 0, 8)
    };

    private static System.Windows.Controls.Grid CreateRecordGrid()
    {
        var grid = new System.Windows.Controls.Grid();
        grid.ColumnDefinitions.Add(new System.Windows.Controls.ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        grid.ColumnDefinitions.Add(new System.Windows.Controls.ColumnDefinition { Width = GridLength.Auto });
        return grid;
    }

    private Button CreateRowButton(string content, bool danger, RoutedEventHandler click)
    {
        var button = new Button
        {
            Content = content,
            Style = (Style)FindResource(danger ? "DangerButton" : "SecondaryButton"),
            FontSize = 9,
            Padding = new Thickness(9, 6, 9, 6),
            Margin = new Thickness(8, 0, 0, 0)
        };
        button.Click += click;
        return button;
    }

    private async void ShowOverlay(CaptureDto capture, ImageSource? knownSource)
    {
        _overlayCapture = capture;
        OverlayTitleText.Text = $"{capture.CaptureType.Replace('_', ' ').ToUpperInvariant()} · {capture.DeviceId}";
        OverlayMetaText.Text =
            $"{FormatLocal(capture.CapturedAtUtc)} · trigger: {TriggerLabel(capture.TriggerEvent)} · {(capture.Skipped ? $"skipped ({capture.SkipReason ?? "unknown"})" : "stored")}";
        OverlayDeleteButton.IsEnabled = !string.IsNullOrWhiteSpace(capture.CaptureId);
        OverlayImage.Source = knownSource;
        PhotoOverlay.Visibility = Visibility.Visible;

        if (knownSource is not null || _authToken is null || string.IsNullOrWhiteSpace(capture.CaptureId))
        {
            return;
        }

        try
        {
            var bytes = await _apiClient.GetCaptureBytesAsync(_authToken, capture.CaptureId);
            if (ReferenceEquals(_overlayCapture, capture))
            {
                OverlayImage.Source = CreateBitmap(bytes);
            }
        }
        catch (Exception ex)
        {
            CaptureLog.Write($"overlay {capture.CaptureId} load failed", ex);
        }
    }

    private void CloseOverlay()
    {
        PhotoOverlay.Visibility = Visibility.Collapsed;
        OverlayImage.Source = null;
        _overlayCapture = null;
    }

    private async Task DeleteCaptureAsync(CaptureDto capture)
    {
        if (_authToken is null || string.IsNullOrWhiteSpace(capture.CaptureId))
        {
            return;
        }

        var confirmed = MessageBox.Show(
            this,
            "Delete this capture permanently? This cannot be undone.",
            "Delete capture",
            MessageBoxButton.OKCancel,
            MessageBoxImage.Warning);
        if (confirmed != MessageBoxResult.OK)
        {
            return;
        }

        try
        {
            await _apiClient.DeleteCaptureAsync(_authToken, capture.CaptureId);
            if (ReferenceEquals(_overlayCapture, capture))
            {
                CloseOverlay();
            }

            SentinelSound.Grant();
            await RefreshCapturesAsync();
            await RefreshDashboardAsync();
        }
        catch (UnauthorizedApiException)
        {
            SignOutDueToInvalidSession();
        }
        catch (Exception ex)
        {
            CapturesStatusText.Text = $"Delete failed: {ex.Message}";
            SentinelSound.Deny();
        }
    }

    private async Task SaveCaptureFileAsync(CaptureDto capture)
    {
        if (_authToken is null || string.IsNullOrWhiteSpace(capture.CaptureId))
        {
            return;
        }

        var dialog = new Microsoft.Win32.SaveFileDialog
        {
            FileName = capture.OriginalFileName ?? "capture",
            Filter = "All files (*.*)|*.*"
        };
        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        try
        {
            var bytes = await _apiClient.GetCaptureBytesAsync(_authToken, capture.CaptureId);
            await File.WriteAllBytesAsync(dialog.FileName, bytes);
            CapturesStatusText.Text = $"Saved {Path.GetFileName(dialog.FileName)} ({bytes.Length / 1024} KB).";
            SentinelSound.Grant();
        }
        catch (Exception ex)
        {
            CapturesStatusText.Text = $"Download failed: {ex.Message}";
            SentinelSound.Deny();
        }
    }

    private void OpenMap(double latitude, double longitude)
    {
        var url = $"{ResolveDashboardUrl()}/map-viewer.html" +
            $"?lat={latitude.ToString("0.#####", CultureInfo.InvariantCulture)}" +
            $"&lon={longitude.ToString("0.#####", CultureInfo.InvariantCulture)}";

        try
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            CapturesStatusText.Text = "Opening location map in your browser.";
        }
        catch (Exception ex)
        {
            CapturesStatusText.Text = $"Couldn't open the map: {ex.Message}";
            SentinelSound.Deny();
        }
    }

    private void SignOutDueToInvalidSession()
    {
        _authToken = null;
        _authEmail = null;
        AuthTokenStore.Clear();
        UpdateAccountUi();
        ApplySignedOutState();
        _trayIcon?.ShowBalloonTip(2000, "MalmegaVille Sentinel", "Your session expired or was invalid. Please sign in again.", ToolTipIcon.Warning);
    }

    private static string FormatLocal(string isoUtc)
    {
        return DateTimeOffset.TryParse(isoUtc, out var at)
            ? at.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss")
            : isoUtc;
    }

    private static DateTimeOffset ParseSeen(string isoUtc)
    {
        return DateTimeOffset.TryParse(isoUtc, out var at) ? at.ToUniversalTime() : DateTimeOffset.MinValue;
    }

    private static string TriggerLabel(string? triggerEvent) => triggerEvent switch
    {
        "usb_insert" => "USB drive inserted",
        "login_unlock" => "screen unlocked",
        "sign_in" => "sign-in",
        null or "" => "manual",
        _ => triggerEvent
    };

    private static string FileSessionKey(CaptureDto capture)
    {
        var sessionId = MetaString(capture, "sessionId");
        return string.IsNullOrWhiteSpace(sessionId)
            ? $"{capture.DeviceId}-{capture.CaptureId}"
            : sessionId;
    }

    private static string? MetaString(CaptureDto capture, string key)
    {
        if (capture.Metadata is null ||
            !capture.Metadata.TryGetValue(key, out var value) ||
            value.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        return value.GetString();
    }

    private static BitmapImage CreateBitmap(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        var bitmap = new BitmapImage();
        bitmap.BeginInit();
        bitmap.CacheOption = BitmapCacheOption.OnLoad;
        bitmap.StreamSource = stream;
        bitmap.EndInit();
        bitmap.Freeze();
        return bitmap;
    }

    private void UpdateClocks()
    {
        TopClockText.Text = DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
        TickerClockText.Text = $"{DateTime.UtcNow:HH:mm:ss} UTC";
    }

    private void RotateTicker()
    {
        UpdateTickerText();
        _tickerIndex++;
    }

    private void UpdateTickerText()
    {
        var messages = new List<string>();

        if (_devices.Count == 0)
        {
            messages.Add("AWAITING AGENT TELEMETRY · PAIR A DEVICE TO BEGIN");
        }
        else
        {
            var offline = _devices.Count - _onlineCount;
            var critical = _incidents.Count(incident =>
                string.Equals(incident.Severity, "critical", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(incident.Severity, "high", StringComparison.OrdinalIgnoreCase));
            messages.Add($"{_devices.Count} AGENTS REGISTERED · {_onlineCount} ONLINE · {offline} OFFLINE");
            messages.Add($"{_incidents.Count} THREATS LOGGED · {critical} CRITICAL");
            messages.Add($"{_captures.Count} EVIDENCE RECORDS IN THE LOCKER");
            messages.Add(_devices.Any(device => device.IsLost)
                ? "LOST-DEVICE PROTOCOL ARMED · CAPTURE ON NEXT CHECK-IN"
                : "LOST-DEVICE PROTOCOL STANDBY · ALL AGENTS REPORTED SAFE");
        }

        messages.Add($"LINK {(_authToken is null ? "UNVERIFIED" : "SECURE")} · {DateTime.UtcNow:HH:mm:ss} UTC");
        TickerText.Text = messages[_tickerIndex % messages.Count];
    }

    private void ApplySignedOutState()
    {
        _devices = new List<DeviceDto>();
        _incidents = new List<IncidentDto>();
        _captures = new List<CaptureDto>();
        _onlineCount = 0;
        RenderDashboard();
        RenderCaptures();
        DashboardStatusText.Text = "Sign in to stream live telemetry from the web console account.";
        CapturesStatusText.Text = "Sign in to load captured evidence.";
        SidebarStatusText.Text = "agent armed · sign in for telemetry";
        UpdateTickerText();
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
        //
        // This used to be a plain bool set/reset in try/finally, which had one permanent
        // failure mode: a camera call that never returns (stuck driver, device held by
        // another app) left the flag set forever, so every later unlock/sign-in/USB
        // trigger returned immediately - captures stopped silently until the tray app
        // was restarted. A bounded wait guarantees the guard is released even then.
        if (Interlocked.Exchange(ref _captureInProgress, 1) == 1)
        {
            CaptureLog.Write($"{triggerEvent}: skipped, another capture is still running");
            return;
        }

        try
        {
            var captureTask = CaptureCoreAsync(triggerEvent);
            var completed = await Task.WhenAny(captureTask, Task.Delay(CaptureTimeout));
            if (completed != captureTask)
            {
                CaptureLog.Write($"{triggerEvent}: capture exceeded {CaptureTimeout.TotalSeconds:0}s, abandoning it");
                return;
            }

            await captureTask;
        }
        catch (Exception ex)
        {
            CaptureLog.Write($"{triggerEvent}: capture threw", ex);
        }
        finally
        {
            Interlocked.Exchange(ref _captureInProgress, 0);
        }
    }

    private async Task CaptureCoreAsync(string triggerEvent)
    {
        var deviceId = DeviceIdentity.GetOrCreateDeviceId();

        bool isLost;
        try
        {
            isLost = await _apiClient.CheckLostStatusAsync(deviceId);
        }
        catch (Exception ex)
        {
            // Still silent on screen - but a lost-status outage has to be
            // distinguishable from "device isn't flagged lost" in the log.
            CaptureLog.Write($"{triggerEvent}: lost-status check failed", ex);
            return;
        }

        if (!isLost)
        {
            CaptureLog.Write($"{triggerEvent}: device is not flagged lost, capture skipped");
            return;
        }

        var capturedAt = DateTime.UtcNow;

        var jpeg = await Task.Run(WebcamCapture.CaptureSingleFrameJpeg);
        if (jpeg is null)
        {
            CaptureLog.Write($"{triggerEvent}: camera returned no frame");
        }
        else
        {
            try
            {
                await _apiClient.UploadCapturePhotoAsync(deviceId, triggerEvent, capturedAt, jpeg);
                CaptureLog.Write($"{triggerEvent}: photo uploaded ({jpeg.Length} bytes)");
            }
            catch (Exception ex)
            {
                // Best effort - no local retry queue for photos, the next trigger will produce a fresh one.
                CaptureLog.Write($"{triggerEvent}: photo upload failed", ex);
            }
        }

        try
        {
            var locationFix = await LocationCapture.TryGetWifiLocationAsync();
            await _apiClient.UploadCaptureLocationAsync(deviceId, triggerEvent, capturedAt, locationFix);
            CaptureLog.Write($"{triggerEvent}: location uploaded ({(locationFix is null ? "backend IP fallback" : "wifi fix")})");
        }
        catch (Exception ex)
        {
            // Best effort - the backend still has an IP-based fallback path for the next attempt.
            CaptureLog.Write($"{triggerEvent}: location upload failed", ex);
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
                SentinelSound.Grant();
            }

            _ = RefreshDashboardAsync();
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
                SentinelSound.Deny();
            }
        }
        catch (Exception ex)
        {
            // Best-effort on the silent auto-register path; surfaced only when the user
            // explicitly clicked the button.
            if (showFeedback)
            {
                DeviceStatusText.Text = $"Registration failed: {ex.Message}";
                SentinelSound.Deny();
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

    private void InitializeTrayIcon()
    {
        _trayIcon = new NotifyIcon
        {
            Text = "MalmegaVille Sentinel",
            Icon = LoadTrayIcon(),
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };

        _trayIcon.ContextMenuStrip.Items.Add("Open Dashboard", null, (_, _) => OpenDashboard());
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

    private void OpenDashboard()
    {
        var url = ResolveDashboardUrl();

        try
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
            DashboardStatusText.Text = $"Opening {url} in your browser.";
            SentinelSound.Grant();
        }
        catch (Exception ex)
        {
            DashboardStatusText.Text = "Couldn't open the dashboard.";
            SentinelSound.Deny();
            MessageBox.Show(this, $"Couldn't open {url} in your browser: {ex.Message}", "Dashboard", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // The agent only knows the API base (SENTINEL_BACKEND_API_BASE_URL, e.g.
    // https://host/api); the dashboard is served from that deployment's site
    // root, so drop the /api segment. SENTINEL_DASHBOARD_URL overrides both
    // for split deployments.
    private static string ResolveDashboardUrl()
    {
        var explicitUrl = Environment.GetEnvironmentVariable("SENTINEL_DASHBOARD_URL")?.TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(explicitUrl))
        {
            return explicitUrl;
        }

        var apiBase = Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL")?.TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(apiBase))
        {
            return apiBase.EndsWith("/api", StringComparison.OrdinalIgnoreCase)
                ? apiBase[..^4]
                : apiBase;
        }

        return "https://app-production-fd2d.up.railway.app";
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
            SentinelSound.Grant();
        }
        catch (Exception ex)
        {
            SentinelSound.Deny();
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
            UpdateAccountUi();
            ApplySignedOutState();
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
        AccountStatusDot.Fill = (Brush)FindResource(signedIn ? "BrandGreenBrush" : "MutedTextBrush");
        SignInButton.Visibility = signedIn ? Visibility.Collapsed : Visibility.Visible;
        SignOutButton.Visibility = signedIn ? Visibility.Visible : Visibility.Collapsed;

        OperatorNameText.Text = signedIn ? _authEmail!.Split('@')[0] : "security operator";
        OperatorInitialText.Text = signedIn && _authEmail!.Length > 0
            ? char.ToUpperInvariant(_authEmail![0]).ToString()
            : "S";
        OperatorEmailText.Text = signedIn ? _authEmail! : "Not signed in.";

        AlertEmailTextBox.IsEnabled = signedIn;
        SaveSettingsButton.IsEnabled = signedIn;
        SendTestAlertButton.IsEnabled = signedIn;

        if (signedIn)
        {
            _ = RefreshDashboardAsync();
            _ = RefreshCapturesAsync();
        }
    }

    private void SignIn_Click(object sender, RoutedEventArgs e)
    {
        OperatorPopup.IsOpen = false;

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
        OperatorPopup.IsOpen = false;

        _authToken = null;
        _authEmail = null;
        AuthTokenStore.Clear();

        AlertEmailTextBox.Text = string.Empty;
        _lastKnownPhoneNumber = string.Empty;
        SettingsStatusText.Text = string.Empty;

        UpdateAccountUi();
        ApplySignedOutState();
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
            SentinelSound.Grant();
        }
        catch (Exception ex)
        {
            SentinelSound.Deny();
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
            SentinelSound.Alert();
        }
        catch (Exception ex)
        {
            SentinelSound.Deny();
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
        return $"{DescribeChannel("Email", result.Email)} · {DescribeChannel("Push", result.Push)} · " +
            $"{DescribeChannel("SMS", result.Sms)} · {DescribeChannel("Phone relay", result.MobileRelay)}";
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
        _clockTimer.Stop();
        _tickerTimer.Stop();
        _trayIcon?.Dispose();
        base.OnClosed(e);
    }

    private sealed record QueuedEventItem(string EventType, string Severity, DateTime TimestampUtc, string Description);
}
