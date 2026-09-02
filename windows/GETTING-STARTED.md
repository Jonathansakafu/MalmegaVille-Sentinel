# MalmegaVille Sentinel — Windows Agent

This package contains the source for the two Windows programs that protect a PC:

- **CoreService** — a background Windows Service that watches for USB and system events.
- **DesktopApp** — a tray app you sign in to; it handles notification settings and the
  webcam/location capture used for lost/stolen device recovery.

**Most people don't need this file.** The [Download page](https://app-production-fd2d.up.railway.app/download)
has a one-click `MalmegaVilleSentinelSetup.exe` installer — just run it as Administrator.
The rest of this document is for building from source instead (e.g. to make agent-side
code changes), which takes about 5 minutes with the right tools installed.

## Prerequisites

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- PowerShell (included with Windows)

## Install

Open PowerShell **as Administrator** in this folder and run:

```powershell
.\install-and-verify.ps1
```

This builds and registers the CoreService (background monitoring), then publishes and
installs the DesktopApp with Start Menu/Desktop shortcuts. A log of the run is written
to `install-run-log.txt` in this folder if anything needs troubleshooting.

If you only need one piece, `install-service.ps1` and `install-desktop-app.ps1` can be
run individually (the service script still requires an elevated/Administrator prompt).

## Configuration

Before installing, set these environment variables (System Properties → Environment
Variables) so the agent points at your MalmegaVille Sentinel account:

- `SENTINEL_BACKEND_API_BASE_URL` — your backend's API URL (e.g.
  `https://app-production-fd2d.up.railway.app/api`)
- `SENTINEL_SYNC_TOKEN` — only needed if your backend deployment has `SYNC_TOKEN` set
  (unset by default on the hosted deployment)

Then launch the Desktop App and sign in with your MalmegaVille Sentinel account — the
same one you use on the web dashboard.

To receive SMS alerts (High/Critical events texted directly through the PC's own
cellular modem whenever there's no internet route at all — only works on a laptop with
a built-in WWAN/eSIM modem and an active SIM), set an alert phone number at
registration or later from the dashboard's Settings panel. Nothing to configure on the
PC itself: the device fetches it from your account automatically. On a PC without
cellular hardware, this channel silently does nothing and events still queue normally
for HTTPS sync.

## Uninstall

```powershell
.\uninstall-service.ps1
.\uninstall-desktop-app.ps1
```
