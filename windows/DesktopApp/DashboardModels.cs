using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Media;

namespace MalmegaVille.Sentinel.Desktop;

public sealed class DeviceDto
{
    [JsonPropertyName("_id")] public string? MongoId { get; set; }
    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = string.Empty;
    [JsonPropertyName("name")] public string Name { get; set; } = string.Empty;
    [JsonPropertyName("operatingSystem")] public string OperatingSystem { get; set; } = string.Empty;
    [JsonPropertyName("lastSeen")] public string LastSeen { get; set; } = string.Empty;
    [JsonPropertyName("securityStatus")] public string SecurityStatus { get; set; } = string.Empty;
    [JsonPropertyName("isLost")] public bool IsLost { get; set; }
}

public sealed class IncidentDto
{
    [JsonPropertyName("_id")] public string? MongoId { get; set; }
    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = string.Empty;
    [JsonPropertyName("incidentType")] public string IncidentType { get; set; } = string.Empty;
    [JsonPropertyName("threatScore")] public double ThreatScore { get; set; }
    [JsonPropertyName("severity")] public string Severity { get; set; } = "medium";
    [JsonPropertyName("summary")] public string Summary { get; set; } = string.Empty;
    [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = string.Empty;
}

public sealed class CaptureDto
{
    [JsonPropertyName("_id")] public string? MongoId { get; set; }
    [JsonPropertyName("id")] public string? Id { get; set; }
    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = string.Empty;
    [JsonPropertyName("captureType")] public string CaptureType { get; set; } = string.Empty;
    [JsonPropertyName("triggerEvent")] public string? TriggerEvent { get; set; }
    [JsonPropertyName("originalFileName")] public string? OriginalFileName { get; set; }
    [JsonPropertyName("sizeBytes")] public long SizeBytes { get; set; }
    [JsonPropertyName("skipped")] public bool Skipped { get; set; }
    [JsonPropertyName("skipReason")] public string? SkipReason { get; set; }
    [JsonPropertyName("capturedAtUtc")] public string CapturedAtUtc { get; set; } = string.Empty;
    [JsonPropertyName("metadata")] public Dictionary<string, JsonElement>? Metadata { get; set; }

    [JsonIgnore] public string CaptureId => !string.IsNullOrWhiteSpace(Id) ? Id! : MongoId ?? string.Empty;

    public double? Number(string key)
    {
        if (Metadata is null || !Metadata.TryGetValue(key, out var value) || value.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return value.GetDouble();
    }
}

public sealed class IncidentRowVm
{
    public IncidentRowVm(IncidentDto incident)
    {
        Summary = incident.Summary;
        Severity = incident.Severity;
        SeverityBrush = SeverityBrushes.For(incident.Severity);
        Meta = $"{FormatRelative(incident.CreatedAt)} · {incident.DeviceId}";
    }

    public string Summary { get; }
    public string Severity { get; }
    public Brush SeverityBrush { get; }
    public string Meta { get; }

    private static string FormatRelative(string isoUtc)
    {
        if (!DateTimeOffset.TryParse(isoUtc, out var at))
        {
            return isoUtc;
        }

        var delta = DateTimeOffset.UtcNow - at.ToUniversalTime();
        if (delta.TotalMinutes < 1) return "just now";
        if (delta.TotalHours < 1) return $"{(int)delta.TotalMinutes}m ago";
        if (delta.TotalDays < 1) return $"{(int)delta.TotalHours}h ago";
        return $"{(int)delta.TotalDays}d ago";
    }
}

public sealed class DeviceRowVm
{
    public DeviceRowVm(DeviceDto device, bool online)
    {
        MongoId = device.MongoId ?? string.Empty;
        DeviceId = device.DeviceId;
        Name = string.IsNullOrWhiteSpace(device.Name) ? device.DeviceId : device.Name;
        Os = device.OperatingSystem;
        IsLost = device.IsLost;
        StatusLabel = device.IsLost ? "LOST / STOLEN" : online ? "ONLINE" : "OFFLINE";
        StatusBrush = device.IsLost || !online ? SeverityBrushes.Danger : SeverityBrushes.Green;
        LastSeenLabel = $"Last seen: {FormatSeen(device.LastSeen)}";
        LostActionLabel = device.IsLost ? "CLEAR LOST FLAG" : "MARK AS LOST / STOLEN";
        LostActionBrush = device.IsLost ? SeverityBrushes.Green : SeverityBrushes.Danger;
    }

    public string MongoId { get; }
    public string DeviceId { get; }
    public string Name { get; }
    public string Os { get; }
    public bool IsLost { get; }
    public string StatusLabel { get; }
    public Brush StatusBrush { get; }
    public string LastSeenLabel { get; }
    public string LostActionLabel { get; }
    public Brush LostActionBrush { get; }

    private static string FormatSeen(string isoUtc)
    {
        if (!DateTimeOffset.TryParse(isoUtc, out var at))
        {
            return "unknown";
        }

        var delta = DateTimeOffset.UtcNow - at.ToUniversalTime();
        if (delta.TotalMinutes < 1) return "just now";
        if (delta.TotalHours < 1) return $"{(int)delta.TotalMinutes}m ago";
        if (delta.TotalDays < 1) return $"{(int)delta.TotalHours}h ago";
        return $"{(int)delta.TotalDays}d ago";
    }
}

public static class SeverityBrushes
{
    public static readonly Brush Green = Freeze(Color.FromRgb(0x00, 0xFF, 0x88));
    public static readonly Brush Cyan = Freeze(Color.FromRgb(0x00, 0xD9, 0xFF));
    public static readonly Brush Amber = Freeze(Color.FromRgb(0xFF, 0xB0, 0x20));
    public static readonly Brush Danger = Freeze(Color.FromRgb(0xFF, 0x17, 0x44));
    public static readonly Brush Muted = Freeze(Color.FromRgb(0xB8, 0xC9, 0xC1));

    public static Brush For(string? severity) => (severity ?? string.Empty).ToLowerInvariant() switch
    {
        "informational" => Muted,
        "low" => Cyan,
        "medium" => Amber,
        "high" or "critical" => Danger,
        _ => Amber
    };

    private static Brush Freeze(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }
}

public sealed class RelayCommand : System.Windows.Input.ICommand
{
    private readonly Action<object?> _execute;
    private readonly Func<object?, bool>? _canExecute;

    public RelayCommand(Action<object?> execute, Func<object?, bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public event EventHandler? CanExecuteChanged;

    public bool CanExecute(object? parameter) => _canExecute?.Invoke(parameter) ?? true;

    public void Execute(object? parameter) => _execute(parameter);

    public void RaiseCanExecuteChanged() => CanExecuteChanged?.Invoke(this, EventArgs.Empty);
}
