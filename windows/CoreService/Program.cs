using MalmegaVille.Sentinel.CoreService.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var host = Host.CreateDefaultBuilder(args)
    .UseWindowsService()
    .ConfigureServices((context, services) =>
    {
        services.AddSingleton<EncryptedEventStore>();
        services.AddSingleton<OfflineEventQueue>();
        services.AddSingleton<BackendSyncClient>();
        services.AddSingleton<SyncTriggerWatcher>();
        services.AddSingleton<ServiceRecoveryConfigurator>();
        services.AddSingleton<LostStatusClient>();
        services.AddSingleton<CaptureUploadClient>();
        services.AddSingleton<PendingCaptureQueue>();
        services.AddSingleton<UsbCaptureService>();
        services.AddSingleton<RemovableDriveWatcher>();
        services.AddSingleton<ConnectivityEngine>();
        services.AddSingleton<SmsAlertSender>();
        services.AddHostedService<SystemMonitoringHostedService>();
        services.AddHostedService<ProcessMonitorHostedService>();
        services.AddHostedService<StartupAppMonitorHostedService>();
        services.AddHostedService<SmsFallbackHostedService>();
    })
    .ConfigureLogging(logging =>
    {
        logging.ClearProviders();
        logging.AddConsole();
        logging.AddEventLog();
    })
    .Build();

var recovery = host.Services.GetRequiredService<ServiceRecoveryConfigurator>();
await recovery.ConfigureRecoveryAsync();
await host.RunAsync();
