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
        services.AddHostedService<SystemMonitoringHostedService>();
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
