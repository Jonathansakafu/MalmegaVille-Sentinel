using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MalmegaVille.Sentinel.Desktop;

public sealed record StoredSession(string Token, string Email);

public static class AuthTokenStore
{
    private static readonly string BasePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MalmegaVille Sentinel");

    private static readonly string FilePath = Path.Combine(BasePath, "session.dat");

    public static void Save(StoredSession session)
    {
        Directory.CreateDirectory(BasePath);
        var json = JsonSerializer.Serialize(session);
        var bytes = Encoding.UTF8.GetBytes(json);
        var encrypted = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(FilePath, encrypted);
    }

    public static StoredSession? Load()
    {
        if (!File.Exists(FilePath))
        {
            return null;
        }

        try
        {
            var encrypted = File.ReadAllBytes(FilePath);
            var bytes = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
            var json = Encoding.UTF8.GetString(bytes);
            return JsonSerializer.Deserialize<StoredSession>(json);
        }
        catch
        {
            return null;
        }
    }

    public static void Clear()
    {
        if (File.Exists(FilePath))
        {
            File.Delete(FilePath);
        }
    }
}
