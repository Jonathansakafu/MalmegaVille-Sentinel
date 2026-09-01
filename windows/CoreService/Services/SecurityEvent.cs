namespace MalmegaVille.Sentinel.CoreService.Services;

public sealed class SecurityEvent
{
    // Local-only identifier (never sent to nor expected by the backend) used to
    // dedupe which queued events have already gone out over the SMS fallback
    // channel, so the same still-unsynced event isn't texted on every poll cycle.
    public Guid Id { get; init; }
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
        Dictionary<string, string>? metadata = null,
        Guid? id = null)
    {
        Id = id ?? Guid.NewGuid();
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
