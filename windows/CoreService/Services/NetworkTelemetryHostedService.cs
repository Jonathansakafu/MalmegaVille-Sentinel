using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MalmegaVille.Sentinel.CoreService.Services;

// Reports established TCP connections once a minute, each attributed to the
// process that owns it. The backend keeps a per-device destination inventory
// and alerts the first time a public address is seen, so a persistent session
// does not re-alert on every snapshot.
public sealed class NetworkTelemetryHostedService : BackgroundService
{
    private const int AfInet = 2;
    private const int TcpTableOwnerPidConnections = 4;
    private const int ErrorInsufficientBuffer = 122;
    private const uint MibTcpStateEstablished = 5;
    private const int MaxConnectionsPerSnapshot = 500;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [StructLayout(LayoutKind.Sequential)]
    private struct MibTcpRowOwnerPid
    {
        public uint State;
        public uint LocalAddress;
        public uint LocalPort;
        public uint RemoteAddress;
        public uint RemotePort;
        public uint OwningPid;
    }

    [DllImport("iphlpapi.dll", SetLastError = true)]
    private static extern uint GetExtendedTcpTable(
        IntPtr tcpTable,
        ref int size,
        bool order,
        int addressFamily,
        int tableClass,
        uint reserved);

    private readonly ILogger<NetworkTelemetryHostedService> _logger;
    private readonly HttpClient _httpClient;
    private readonly string _apiBase;
    private readonly string? _syncToken;

    public NetworkTelemetryHostedService(ILogger<NetworkTelemetryHostedService> logger)
    {
        _logger = logger;
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        _apiBase = (Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL") ?? "http://localhost:4000/api").TrimEnd('/');
        _syncToken = Environment.GetEnvironmentVariable("SENTINEL_SYNC_TOKEN");
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var deviceId = DeviceIdentity.GetOrCreateDeviceId();

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var connections = CollectEstablishedConnections();
                if (connections.Count > 0)
                {
                    await PostSnapshotAsync(deviceId, connections, stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Network telemetry cycle failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private List<ConnectionSample> CollectEstablishedConnections()
    {
        var result = new List<ConnectionSample>();
        var processNames = new Dictionary<uint, string>();
        var rows = ReadOwnerPidTable();

        foreach (var row in rows)
        {
            var remoteAddress = ToAddress(row.RemoteAddress);
            if (remoteAddress == null || IPAddress.IsLoopback(remoteAddress) || remoteAddress.Equals(IPAddress.Any))
            {
                continue;
            }

            if (!processNames.TryGetValue(row.OwningPid, out var processName))
            {
                processName = ResolveProcessName(row.OwningPid);
                processNames[row.OwningPid] = processName;
            }

            result.Add(new ConnectionSample(
                remoteAddress.ToString(),
                ToPort(row.RemotePort),
                processName,
                "Established"));

            if (result.Count >= MaxConnectionsPerSnapshot)
            {
                break;
            }
        }

        return result;
    }

    private static List<MibTcpRowOwnerPid> ReadOwnerPidTable()
    {
        var rows = new List<MibTcpRowOwnerPid>();
        var size = 0;

        var first = GetExtendedTcpTable(IntPtr.Zero, ref size, false, AfInet, TcpTableOwnerPidConnections, 0);
        if (first != ErrorInsufficientBuffer || size <= 0)
        {
            return rows;
        }

        var buffer = Marshal.AllocHGlobal(size);
        try
        {
            var second = GetExtendedTcpTable(buffer, ref size, false, AfInet, TcpTableOwnerPidConnections, 0);
            if (second != 0)
            {
                return rows;
            }

            var count = Marshal.ReadInt32(buffer);
            var rowSize = Marshal.SizeOf<MibTcpRowOwnerPid>();
            var rowPtr = IntPtr.Add(buffer, sizeof(int));

            for (var index = 0; index < count; index++)
            {
                var row = Marshal.PtrToStructure<MibTcpRowOwnerPid>(IntPtr.Add(rowPtr, index * rowSize));
                if (row.State == MibTcpStateEstablished)
                {
                    rows.Add(row);
                }
            }
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }

        return rows;
    }

    private static IPAddress? ToAddress(uint networkOrderAddress)
    {
        var bytes = BitConverter.GetBytes(networkOrderAddress);
        if (BitConverter.IsLittleEndian)
        {
            Array.Reverse(bytes);
        }
        return new IPAddress(bytes);
    }

    private static int ToPort(uint networkOrderPort)
    {
        var port = (ushort)(networkOrderPort & 0xFFFF);
        return (ushort)IPAddress.NetworkToHostOrder((short)port);
    }

    private static string ResolveProcessName(uint pid)
    {
        try
        {
            using var process = Process.GetProcessById((int)pid);
            return process.ProcessName;
        }
        catch
        {
            return "unknown";
        }
    }

    private async Task PostSnapshotAsync(string deviceId, List<ConnectionSample> connections, CancellationToken cancellationToken)
    {
        var payload = new
        {
            deviceId,
            deviceName = Environment.MachineName,
            capturedAtUtc = DateTime.UtcNow.ToString("O"),
            connections
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_apiBase}/network/snapshots")
        {
            Content = JsonContent.Create(payload, options: JsonOptions)
        };
        AddSyncToken(request);

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogDebug("Network snapshot rejected with status {StatusCode}.", response.StatusCode);
        }
    }

    private void AddSyncToken(HttpRequestMessage request)
    {
        if (!string.IsNullOrWhiteSpace(_syncToken))
        {
            request.Headers.Add("x-sync-token", _syncToken);
        }
    }

    private sealed record ConnectionSample(string RemoteAddress, int RemotePort, string ProcessName, string State);
}
