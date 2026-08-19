using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;
using Application = System.Windows.Application;

namespace MalmegaVille.Sentinel.Desktop;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        DispatcherUnhandledException += OnDispatcherUnhandledException;
        base.OnStartup(e);
    }

    // Keeps the tray app alive (and the tray icon present) through an unexpected UI-thread
    // exception rather than the whole process silently disappearing, while still leaving a
    // trace for troubleshooting instead of failing completely silently.
    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        try
        {
            var basePath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MalmegaVille Sentinel");
            Directory.CreateDirectory(basePath);
            File.AppendAllText(Path.Combine(basePath, "crash.log"), $"{DateTime.UtcNow:O}\n{e.Exception}\n\n");
        }
        catch
        {
            // Best effort - don't let logging failures escalate the situation.
        }

        e.Handled = true;
    }
}
