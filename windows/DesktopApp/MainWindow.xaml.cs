using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Forms;
using MessageBox = System.Windows.MessageBox;
using Application = System.Windows.Application;

namespace MalmegaVille.Sentinel.Desktop;

public partial class MainWindow : Window
{
    private NotifyIcon? _trayIcon;
    private readonly string _queueFilePath;
    private readonly string _syncTriggerPath;

    public MainWindow()
    {
        InitializeComponent();
        InitializeTrayIcon();

        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        _queueFilePath = Path.Combine(basePath, "eventQueue.dat");
        _syncTriggerPath = Path.Combine(basePath, "requestSync.json");

        RefreshQueuedEvents();
    }

    private void InitializeTrayIcon()
    {
        _trayIcon = new NotifyIcon
        {
            Text = "MalmegaVille Sentinel",
            Icon = System.Drawing.SystemIcons.Application,
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip()
        };

        _trayIcon.ContextMenuStrip.Items.Add("Open", null, (_, _) => ShowWindow());
        _trayIcon.ContextMenuStrip.Items.Add("Exit", null, (_, _) => ExitApplication());
        _trayIcon.DoubleClick += (_, _) => ShowWindow();
    }

    private void ShowWindow()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    private void ExitApplication()
    {
        _trayIcon?.Dispose();
        Application.Current.Shutdown();
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
        _trayIcon?.Dispose();
        base.OnClosed(e);
    }

    private sealed record QueuedEventItem(string EventType, string Severity, DateTime TimestampUtc, string Description);
}
