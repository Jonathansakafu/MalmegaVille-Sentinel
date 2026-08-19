namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class SecurityEvent
{
    public string EventType { get; init; }
    public DateTime TimestampUtc { get; init; }
    public string Description { get; init; }
    public string Severity { get; init; }
    public string? DeviceId { get; init; }
    public string? DeviceName { get; init; }
    public double? ThreatScore { get; init; }
    public string? RecommendedAction { get; init; }
    public Dictionary<string, string>? Metadata { get; init; }

    public SecurityEvent(
        string eventType,
        DateTime timestampUtc,
        string description,
        string severity = "Informational",
        string? deviceId = null,
        string? deviceName = null,
        double? threatScore = null,
        string? recommendedAction = null,
        Dictionary<string, string>? metadata = null)
    {
        EventType = eventType;
        TimestampUtc = timestampUtc;
        Description = description;
        Severity = severity;
        DeviceId = deviceId;
        DeviceName = deviceName;
        ThreatScore = threatScore;
        RecommendedAction = recommendedAction;
        Metadata = metadata;
    }
}
