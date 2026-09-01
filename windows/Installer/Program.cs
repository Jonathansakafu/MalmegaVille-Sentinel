using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;
using Microsoft.Win32;

Console.Title = "MalmegaVille Sentinel Setup";

const string ServiceName = "MalmegaVille.Sentinel.CoreService";
const string ServiceDisplayName = "MalmegaVille Sentinel Core Service";
const string DefaultBackendApiBaseUrl = "https://app-production-fd2d.up.railway.app/api";

var installDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "MalmegaVille Sentinel");
var coreServiceDir = Path.Combine(installDir, "CoreService");
var desktopAppDir = Path.Combine(installDir, "DesktopApp");
var coreServiceExe = Path.Combine(coreServiceDir, "MalmegaVille.Sentinel.CoreService.exe");
var desktopAppExe = Path.Combine(desktopAppDir, "MalmegaVille.Sentinel.Desktop.exe");

try
{
    if (args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
    {
        Uninstall();
    }
    else
    {
        Install();
    }

    Console.WriteLine();
    Console.WriteLine("Done. Press any key to close this window...");
    Console.ReadKey();
    return 0;
}
catch (Exception ex)
{
    Console.ForegroundColor = ConsoleColor.Red;
    Console.WriteLine();
    Console.WriteLine($"Setup failed: {ex.Message}");
    Console.ResetColor();
    Console.WriteLine();
    Console.WriteLine("Press any key to close this window...");
    Console.ReadKey();
    return 1;
}

void Install()
{
    RequireAdministrator();

    Console.WriteLine("MalmegaVille Sentinel Setup");
    Console.WriteLine("===========================");
    Console.WriteLine();

    // A previous install's Core Service (running) and Desktop App (if open)
    // both hold their own .exe file open, which blocks overwriting them below
    // with "being used by another process" - stop/close them first so this
    // installer can also be used to upgrade an existing install in place.
    Console.WriteLine("Stopping any existing installation so it can be updated...");
    StopExistingInstallation();

    Console.WriteLine($"Installing to {installDir} ...");
    ExtractEmbeddedZip("CoreServicePayload.zip", coreServiceDir);
    ExtractEmbeddedZip("DesktopAppPayload.zip", desktopAppDir);

    // Only set a default if the user hasn't already pointed the agent at a
    // different backend (e.g. a self-hosted deployment) - never overwrite an
    // existing value.
    if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL", EnvironmentVariableTarget.Machine)))
    {
        Console.WriteLine("Setting SENTINEL_BACKEND_API_BASE_URL to the MalmegaVille Sentinel cloud backend...");
        Environment.SetEnvironmentVariable("SENTINEL_BACKEND_API_BASE_URL", DefaultBackendApiBaseUrl, EnvironmentVariableTarget.Machine);
    }

    Console.WriteLine("Enabling camera and location access for background apps...");
    GrantCameraAndLocationAccess();

    Console.WriteLine("Registering the Core Service (starts automatically at boot, runs as LocalSystem)...");
    RegisterService();

    Console.WriteLine("Creating shortcuts...");
    CreateShortcut(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "MalmegaVille Sentinel.lnk"),
        desktopAppExe, desktopAppDir, "MalmegaVille Sentinel");
    CreateShortcut(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), "MalmegaVille Sentinel.lnk"),
        desktopAppExe, desktopAppDir, "MalmegaVille Sentinel");
    // So the tray app is already running and ready to sign in to right after
    // the next login, with no manual step - matches the Core Service, which
    // is already protecting the machine in the background at that point.
    CreateShortcut(
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup), "MalmegaVille Sentinel.lnk"),
        desktopAppExe, desktopAppDir, "MalmegaVille Sentinel");

    Console.WriteLine();
    Console.WriteLine("Installation complete.");
    Console.WriteLine("Open \"MalmegaVille Sentinel\" from the Start Menu and sign in with your dashboard account to finish linking this device.");
}

void Uninstall()
{
    RequireAdministrator();

    Console.WriteLine("Removing the Core Service...");
    RunProcess("sc.exe", $"stop {ServiceName}", ignoreFailure: true);
    RunProcess("sc.exe", $"delete {ServiceName}", ignoreFailure: true);

    Console.WriteLine("Removing shortcuts...");
    TryDeleteFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms), "MalmegaVille Sentinel.lnk"));
    TryDeleteFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory), "MalmegaVille Sentinel.lnk"));
    TryDeleteFile(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonStartup), "MalmegaVille Sentinel.lnk"));

    Console.WriteLine($"Removing {installDir} ...");
    if (Directory.Exists(installDir))
    {
        Directory.Delete(installDir, recursive: true);
    }

    Console.WriteLine();
    Console.WriteLine("MalmegaVille Sentinel has been removed.");
}

void StopExistingInstallation()
{
    // Ignored if the service doesn't exist yet (first-ever install).
    RunProcess("sc.exe", $"stop {ServiceName}", ignoreFailure: true);

    // The tray app locks its own .exe while running.
    foreach (var process in Process.GetProcessesByName("MalmegaVille.Sentinel.Desktop"))
    {
        try
        {
            process.Kill();
            process.WaitForExit(5000);
        }
        catch
        {
            // Best effort - the retrying extraction below still catches a
            // file left locked, with a clearer error than a bare IOException.
        }
        finally
        {
            process.Dispose();
        }
    }
}

// Windows blocks unpackaged desktop apps (like the tray app) from the camera
// and location by default via two account-wide toggles under Settings ->
// Privacy & security, separate from any per-app manifest. There's no
// programmatic per-app consent prompt available to an unpackaged app the way
// there is for a Store app - the owner either flips these globally, or the
// feature silently never works. Since this installer only runs when the
// device's own owner elevates it specifically to set up monitoring, setting
// them here is the same one-time consent a Store app's install-time prompt
// would represent, not a covert bypass. Best-effort: never blocks the rest
// of setup if a registry write fails (e.g. a locked-down/managed machine).
void GrantCameraAndLocationAccess()
{
    TrySetConsentValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam");
    TrySetConsentValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\NonPackaged");
    TrySetConsentValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location");
    TrySetConsentValue(@"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location\NonPackaged");
}

void TrySetConsentValue(string subKeyPath)
{
    try
    {
        using var key = Registry.LocalMachine.CreateSubKey(subKeyPath, writable: true);
        key?.SetValue("Value", "Allow", RegistryValueKind.String);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  (Could not set {subKeyPath}: {ex.Message} - you may need to enable this manually in Settings > Privacy & security.)");
    }
}

void RequireAdministrator()
{
    using var identity = WindowsIdentity.GetCurrent();
    var principal = new WindowsPrincipal(identity);
    if (!principal.IsInRole(WindowsBuiltInRole.Administrator))
    {
        throw new InvalidOperationException("This setup must be run as Administrator.");
    }
}

void ExtractEmbeddedZip(string resourceName, string destinationDir)
{
    Directory.CreateDirectory(destinationDir);

    using var resourceStream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
        ?? throw new InvalidOperationException($"Embedded payload '{resourceName}' is missing from this installer.");
    using var archive = new ZipArchive(resourceStream, ZipArchiveMode.Read);

    foreach (var entry in archive.Entries)
    {
        var destinationPath = Path.Combine(destinationDir, entry.FullName);
        if (string.IsNullOrEmpty(entry.Name))
        {
            Directory.CreateDirectory(destinationPath);
            continue;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
        ExtractFileWithRetry(entry, destinationPath);
    }
}

void ExtractFileWithRetry(ZipArchiveEntry entry, string destinationPath)
{
    const int maxAttempts = 10;
    for (var attempt = 1; attempt <= maxAttempts; attempt++)
    {
        try
        {
            entry.ExtractToFile(destinationPath, overwrite: true);
            return;
        }
        catch (IOException) when (attempt < maxAttempts)
        {
            // sc.exe stop only requests a stop - it returns before the
            // process has actually exited and released its file handle, so
            // the previous version's .exe can still be locked for a moment.
            // Wait and retry rather than failing an otherwise-fine upgrade.
            Thread.Sleep(1000);
        }
    }
}

void RegisterService()
{
    // Replace any existing registration (e.g. from a previous install) so
    // re-running this installer to upgrade always ends up pointing at the
    // freshly-extracted binary.
    RunProcess("sc.exe", $"stop {ServiceName}", ignoreFailure: true);
    RunProcess("sc.exe", $"delete {ServiceName}", ignoreFailure: true);

    RunProcess("sc.exe", $"create {ServiceName} binPath= \"{coreServiceExe}\" DisplayName= \"{ServiceDisplayName}\" start= auto obj= LocalSystem");

    // Auto-restart on crash: after the 1st, 2nd, and every subsequent
    // failure within a 24h window, matching windows/install-service.ps1.
    RunProcess("sc.exe", $"failure {ServiceName} reset= 86400 actions= restart/5000/restart/10000/restart/60000");

    RunProcess("sc.exe", $"start {ServiceName}");
}

void RunProcess(string fileName, string arguments, bool ignoreFailure = false)
{
    var startInfo = new ProcessStartInfo(fileName, arguments)
    {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };

    using var process = Process.Start(startInfo) ?? throw new InvalidOperationException($"Failed to start {fileName}.");
    // Read both streams concurrently before waiting for exit - reading them
    // sequentially risks a deadlock if the child fills the other stream's
    // pipe buffer while this is blocked reading the first one to completion.
    var outputTask = process.StandardOutput.ReadToEndAsync();
    var errorTask = process.StandardError.ReadToEndAsync();
    process.WaitForExit();
    var output = outputTask.GetAwaiter().GetResult();
    var error = errorTask.GetAwaiter().GetResult();

    if (process.ExitCode != 0 && !ignoreFailure)
    {
        throw new InvalidOperationException($"{fileName} {arguments} failed (exit code {process.ExitCode}): {output}{error}");
    }
}

void TryDeleteFile(string path)
{
    if (File.Exists(path))
    {
        File.Delete(path);
    }
}

void CreateShortcut(string shortcutPath, string targetPath, string workingDirectory, string description)
{
    var link = (IShellLinkW)new ShellLink();
    link.SetPath(targetPath);
    link.SetWorkingDirectory(workingDirectory);
    link.SetDescription(description);

    var file = (IPersistFile)link;
    file.Save(shortcutPath, false);
}

// Minimal, well-known interop declarations for creating a .lnk shortcut
// without any external dependency - see CLSID_ShellLink / IShellLinkW /
// IPersistFile in the Windows SDK (shobjidl_core.h). Only the vtable slots
// up to the methods actually used need to be declared, in their real order.
[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
internal class ShellLink
{
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
internal interface IShellLinkW
{
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
}

[ComImport]
[Guid("0000010b-0000-0000-C000-000000000046")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPersistFile
{
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);
}
