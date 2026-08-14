using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class EncryptedEventStore
{
    private readonly ILogger<EncryptedEventStore> _logger;
    private readonly string _storePath;

    public EncryptedEventStore(ILogger<EncryptedEventStore> logger)
    {
        _logger = logger;
        var basePath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel");
        Directory.CreateDirectory(basePath);
        _storePath = Path.Combine(basePath, "events.dat");
    }

    public async Task SaveEventAsync(SecurityEvent securityEvent, CancellationToken cancellationToken)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(securityEvent);
        var plainBytes = Encoding.UTF8.GetBytes(json);
        var cipherBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.LocalMachine);
        await File.WriteAllBytesAsync(_storePath, cipherBytes, cancellationToken);
        _logger.LogDebug("Security event saved to encrypted local cache.");
    }
}
