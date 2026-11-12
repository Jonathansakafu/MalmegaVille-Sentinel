using System;
using System.IO;
using System.Linq;
using System.Text;

namespace MalmegaVille.Sentinel.Desktop;

// The lost-device capture path deliberately fails silently so it stays invisible to
// whoever is at the keyboard - which also means a broken camera, a rejected upload,
// or a device that is no longer flagged lost leaves no trace anywhere. This writes
// a small local trail so that -diagnose-sentinel.ps1 (and support) can tell those
// cases apart without changing anything visible on screen.
public static class CaptureLog
{
    private const long MaxBytes = 512 * 1024;

    private static readonly object Gate = new();
    private static string? _resolvedPath;

    public static void Write(string message)
    {
        Append("INFO", message, null);
    }

    public static void Write(string message, Exception exception)
    {
        Append("ERROR", message, exception);
    }

    private static void Append(string level, string message, Exception? exception)
    {
        try
        {
            var line = new StringBuilder()
                .Append(DateTime.UtcNow.ToString("O"))
                .Append(" [")
                .Append(level)
                .Append("] ")
                .Append(message);

            if (exception is not null)
            {
                line.Append(" :: ").Append(exception.GetType().Name).Append(": ").Append(exception.Message);
            }

            line.AppendLine();

            lock (Gate)
            {
                var path = ResolvePath();
                File.AppendAllText(path, line.ToString());
                Trim(path);
            }
        }
        catch
        {
            // Logging must never interfere with the capture path itself.
        }
    }

    // Prefers the machine-wide folder the service uses; falls back to the current
    // user's profile when that folder isn't writable for a standard user account.
    private static string ResolvePath()
    {
        if (_resolvedPath is not null)
        {
            return _resolvedPath;
        }

        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "MalmegaVille Sentinel", "capture.log"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MalmegaVille Sentinel", "capture.log")
        };

        foreach (var candidate in candidates)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(candidate)!);
                using (File.Open(candidate, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
                {
                }

                _resolvedPath = candidate;
                return candidate;
            }
            catch
            {
                // Try the next candidate.
            }
        }

        throw new IOException("No writable capture log location was available.");
    }

    private static void Trim(string path)
    {
        var info = new FileInfo(path);
        if (!info.Exists || info.Length <= MaxBytes)
        {
            return;
        }

        var lines = File.ReadAllLines(path);
        File.WriteAllLines(path, lines.Skip(lines.Length / 2));
    }
}
