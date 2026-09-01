# MalmegaVille Sentinel Setup

Builds `MalmegaVilleSentinelSetup.exe` - a single self-contained installer that extracts
the Core Service and Desktop App, registers the Windows Service, and creates shortcuts.
No .NET SDK or manual `dotnet publish` steps needed on the end user's machine.

## Rebuilding after an agent change

The `Payload/*.zip` files are pre-built, self-contained win-x64 output - they are **not**
regenerated automatically. After changing `CoreService/` or `DesktopApp/`, rebuild them:

```powershell
# From windows/CoreService
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true

# From windows/DesktopApp
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

Then re-zip each `bin/Release/<tfm>/win-x64/publish/` folder's contents (not the folder
itself) into `windows/Installer/Payload/coreservice-publish.zip` and
`desktopapp-publish.zip` respectively, and rebuild the installer:

```powershell
# From windows/Installer
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

The output is `windows/Installer/bin/Release/<tfm>/win-x64/publish/MalmegaVilleSentinelSetup.exe`.

## Distribution

The built installer (~150-200MB) is too large for a normal git push (GitHub rejects
files over 100MB) and isn't committed to this repo. It's published as a GitHub Release
asset instead, and the website's Download page links directly to that asset.

## Notes

- This installer is unsigned - Windows SmartScreen / Defender will likely flag it as
  from an unrecognized publisher until it's code-signed with a real certificate.
- `MalmegaVilleSentinelSetup.exe --uninstall` reverses the install (stops/removes the
  service, deletes shortcuts, removes the install directory).
