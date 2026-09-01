# MalmegaVille Sentinel

MalmegaVille Sentinel is a personal endpoint security platform: it watches your Windows PC for security events (logins, USB activity, suspicious process behavior, startup persistence), alerts you by email and browser push (with a direct-cellular SMS fallback when there's no internet at all), and — if the device is ever lost or stolen — silently captures a webcam photo, an approximate location, and copies files from any USB drive that gets inserted, so you have evidence to help recover it.

**Live dashboard:** <https://app-production-fd2d.up.railway.app>

## How it works

1. Two Windows programs run on the protected PC: a background **Core Service** (Windows Service, starts automatically at boot and keeps running even if you sign out or close the desktop app) and a **Desktop App** (tray icon, handles login, notification settings, and — because it runs in your interactive session rather than as a background service — webcam/location capture).
2. Both talk to a central **backend** (Node/Express + MongoDB), which stores devices, incidents, and captures, and delivers alerts.
3. You manage everything from the **web dashboard** (React) — device inventory, incident history, notification settings, and a gallery of anything captured from a lost/stolen device.

### Monitoring & detection (Core Service)

- USB device connect/disconnect
- Suspicious process activity — known dual-use binaries (`powershell.exe`, `certutil.exe`, `mshta.exe`, etc.) invoked with encoded/hidden-window arguments, or anything launched from a drop-and-run location (Temp, Downloads)
- Startup persistence — new/changed/removed entries in the Run/RunOnce registry keys and Startup folders, for every loaded user profile
- Offline-first: every event is encrypted at rest and queued locally, then synced once connectivity returns — no event is lost for being offline

### Alerting channels

Delivered in priority order, matching whichever channel is actually available:

1. **Internet** (Wi-Fi, Ethernet, or cellular data) — full event sync to the backend, which emails and/or push-notifies you
2. **Direct SMS** — if there's no internet route at all but the PC has a built-in WWAN/eSIM cellular modem, High/Critical events are texted straight to your phone over the cellular network, no internet required (`SENTINEL_OWNER_SMS_NUMBER`)
3. **Offline queue** — nothing available at all; events stay encrypted on disk until connectivity returns

Push notifications use the browser's Web Push API (enabled per-browser from the dashboard's Settings panel) rather than a dedicated mobile app.

### Audit logging

Account-level actions — logins (including failed attempts), password/username changes, USB trust list changes, device lost/found toggles, notification settings changes — are written to an immutable audit log, visible via `GET /api/audit-logs`.

### Lost/stolen device recovery

Flip a device to "Lost/Stolen" from the dashboard. From that point, without any visible change on the device itself:

- A webcam photo and an approximate location (Wi-Fi positioning, falling back to IP-based geolocation) are captured whenever the device unlocks or a USB drive is inserted.
- Files copied from any inserted USB drive are uploaded (capped in size per-file/session to avoid an obvious disk-activity spike), with a manifest of anything skipped for being too large.

Clear the flag once the device is recovered and capture stops immediately.

## Architecture

| Component | Stack | Role |
|---|---|---|
| `backend/` | Node.js, Express, TypeScript, MongoDB (Mongoose) | REST API, auth, alert delivery, capture storage |
| `windows/CoreService/` | C# / .NET 8 Worker Service | USB/system monitoring, background sync, lost-device USB capture |
| `windows/DesktopApp/` | C# / .NET 8 WPF | Tray app, login, notification settings, webcam/location capture |
| `frontend/` | React, TypeScript, Vite, Tailwind CSS | Web dashboard |

In production, the backend also serves the built frontend as static files from a single service — see [Deployment](#deployment).

## Local development

### Backend

```bash
cd backend
cp .env.example .env   # fill in MongoDB URI, JWT secret, email config
npm install
npm run dev
```

For quick testing without MongoDB, set `DBLESS_TEST_MODE=true` in `.env` (data lives only for the life of the process).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`, proxying `/api` to the backend on `http://localhost:4000`.

### Windows agents

Both `windows/CoreService` and `windows/DesktopApp` are standard .NET 8 projects (`dotnet build` / `dotnet run`). Key environment variables:

- `SENTINEL_BACKEND_API_BASE_URL` — backend base URL (defaults to `http://localhost:4000/api`)
- `SENTINEL_SYNC_TOKEN` — shared secret matching the backend's `SYNC_TOKEN`; required for the agents to authenticate captures/sync in production
- `SENTINEL_OWNER_SMS_NUMBER` — optional; enables the direct-cellular-modem SMS fallback channel (see above). Only takes effect on a PC with a WWAN/eSIM modem and active SIM.

`windows/install-desktop-app.ps1` publishes and installs the desktop app with Start Menu/Desktop shortcuts.

## Deployment

The whole system (backend + frontend + MongoDB) deploys as a single Railway project, auto-deploying on every push to `main`. The root `package.json` builds the frontend, then the backend, and the backend serves the built frontend directly — no separate frontend host or CORS configuration needed. See `backend/.env.example` for the full list of production environment variables (`DASHBOARD_URL`, `SYNC_TOKEN`, `CAPTURE_STORAGE_DIR`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, etc.).

Push notifications (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) and the SMS fallback channel (`SENTINEL_OWNER_SMS_NUMBER`, set on the Windows agent, not the backend) are both optional — each is simply disabled, exactly like email with no recipient configured, until its keys/number are set.

The Windows agent (`windows/`) is distributed separately as a downloadable installer, not part of the Railway deploy — rebuild and re-publish it on Windows (`dotnet publish`) after agent-side changes, then update the packaged download.

### Known limitations on the current deployment

- **Gmail SMTP alerts don't send from Railway.** Gmail SMTP (both port 587 and 465) times out from Railway's network — several PaaS providers block outbound SMTP by default to prevent spam relaying. Production deployments must set `RESEND_API_KEY` (or another HTTP-API email provider) rather than relying on raw SMTP.
- **Capture storage isn't on a persistent volume yet.** The Railway CLI (`railway volume add`) crashed when attaching one during setup; captured photos/USB files currently live on the container's ephemeral disk and won't survive a redeploy. Attach a volume mounted at `/data` via the Railway dashboard and it'll be picked up automatically (`CAPTURE_STORAGE_DIR=/data/captures` is already set).
- **The SMS fallback channel is best-effort.** `Windows.Devices.Sms` is a restricted WinRT API; on some Windows configurations an unpackaged Worker Service may not be granted access to it even with compatible WWAN hardware. See `windows/GETTING-STARTED.md`.
