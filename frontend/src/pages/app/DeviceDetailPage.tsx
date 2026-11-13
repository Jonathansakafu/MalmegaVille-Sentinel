import { useMemo } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Copy,
  Cpu,
  Images,
  MapPin,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Usb
} from 'lucide-react';
import CapturesSection from '../../components/CapturesSection';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { useConfirm } from '../../components/ui/Confirm';
import { formatRelativeTime, severityStyles } from './format';
import type { DashboardContext } from './context';

function DeviceDetailPage() {
  const { deviceId: rawDeviceId } = useParams();
  const deviceId = rawDeviceId ? decodeURIComponent(rawDeviceId) : '';
  const { devices, incidents, captures, toggleLost, removeDevice, lostStatusPending, reloadCaptures, token } =
    useOutletContext<DashboardContext>();
  const { showAlert } = useAlerts();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const now = Date.now();
  const device = devices.find((entry) => entry.deviceId === deviceId);

  const deviceIncidents = useMemo(
    () =>
      incidents
        .filter((incident) => incident.deviceId === deviceId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [incidents, deviceId]
  );
  const deviceCaptures = useMemo(() => captures.filter((capture) => capture.deviceId === deviceId), [captures, deviceId]);
  const counts = useMemo(() => {
    const photos = deviceCaptures.filter((capture) => capture.captureType === 'webcam_photo').length;
    const locations = deviceCaptures.filter((capture) => capture.captureType === 'location').length;
    const usb = deviceCaptures.filter((capture) => capture.captureType === 'usb_file' || capture.captureType === 'usb_manifest').length;
    return { photos, locations, usb };
  }, [deviceCaptures]);

  if (!device) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/devices" className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white">
          <ArrowLeft size={12} /> Back to agents
        </Link>
        <div className="holo-panel holo-corner">
          <EmptyState icon={MonitorSmartphone} title="Agent not found" message="This device is not registered to your account, or it was removed." />
        </div>
      </div>
    );
  }

  const online = now - new Date(device.lastSeen).getTime() < 10 * 60 * 1000;
  const pending = lostStatusPending === device._id;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(device.deviceId);
      showAlert({ kind: 'success', title: 'COPIED', message: 'Device ID copied to clipboard.' });
    } catch {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'The browser blocked clipboard access.', detail: device.deviceId });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/dashboard/devices" className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white">
            <ArrowLeft size={12} /> All agents
          </Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold text-white sm:text-3xl">
            {device.name}
            {device.isLost ? (
              <span className="border border-brand-danger/50 bg-brand-danger/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-rose-300">
                lost protocol armed
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{device.operatingSystem}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyId}
            className="flex min-h-[38px] items-center gap-1.5 border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-brand-green/40 hover:text-brand-green"
          >
            <Copy size={12} /> Copy ID
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggleLost(device)}
            className={`flex min-h-[38px] items-center gap-1.5 border px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition disabled:opacity-40 ${
              device.isLost
                ? 'border-brand-green/40 text-brand-green hover:bg-brand-green/10'
                : 'border-brand-danger/40 text-rose-300 hover:bg-brand-danger/10'
            }`}
          >
            {device.isLost ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
            {device.isLost ? 'Clear lost flag' : 'Mark as lost'}
          </button>
          <button
            type="button"
            onClick={async () => {
              const accepted = await confirm({
                title: 'REMOVE DEVICE',
                message: `Remove "${device.name}" from your device inventory? Its past captures are kept.`,
                tone: 'danger',
                confirmLabel: 'Remove'
              });
              if (accepted) removeDevice(device).then(() => navigate('/dashboard/devices'));
            }}
            className="flex min-h-[38px] items-center gap-1.5 border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-brand-danger/50 hover:text-rose-300"
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Link status"
          value={online ? 'Online' : 'Offline'}
          icon={Cpu}
          tone={online ? 'green' : 'danger'}
          hint={`seen ${formatRelativeTime(new Date(device.lastSeen).getTime(), now)}`}
          onClick={() => navigate('/dashboard/devices')}
        />
        <StatTile
          label="Incidents"
          value={deviceIncidents.length}
          icon={ShieldAlert}
          tone={deviceIncidents.length > 0 ? 'amber' : 'green'}
          hint="Reported by this agent"
          onClick={() => navigate(`/dashboard/threats?device=${encodeURIComponent(device.deviceId)}`)}
        />
        <StatTile
          label="Photos"
          value={counts.photos}
          icon={Camera}
          tone="cyan"
          hint={`${counts.locations} locations`}
          onClick={() => navigate(`/dashboard/evidence?device=${encodeURIComponent(device.deviceId)}&type=webcam_photo`)}
        />
        <StatTile
          label="USB captures"
          value={counts.usb}
          icon={Usb}
          tone="cyan"
          hint="Files and manifests"
          onClick={() => navigate(`/dashboard/evidence?device=${encodeURIComponent(device.deviceId)}&type=usb`)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="holo-panel holo-corner p-4 sm:p-5">
          <PanelTitle icon={MonitorSmartphone} title="Agent profile" />
          <dl className="mt-4 space-y-3 text-sm">
            <Row label="Device ID" value={<span className="break-all font-mono text-xs text-slate-300">{device.deviceId}</span>} />
            <Row label="Operating system" value={device.operatingSystem} />
            <Row label="Last check-in" value={`${new Date(device.lastSeen).toLocaleString()} · ${formatRelativeTime(new Date(device.lastSeen).getTime(), now)}`} />
            <Row label="Security state" value={device.securityStatus || 'Unknown'} />
            <Row
              label="Lost protocol"
              value={<span className={device.isLost ? 'text-rose-300' : 'text-brand-green'}>{device.isLost ? 'Armed — collecting evidence' : 'Standby'}</span>}
            />
            <Row label="Evidence records" value={`${deviceCaptures.length} total`} />
          </dl>
          {device.isLost ? (
            <p className="mt-4 border border-brand-danger/30 bg-brand-danger/[0.06] p-2.5 text-xs text-rose-200">
              This device is flagged lost. On its next check-in the agent captures a webcam photo and location. Clear the flag when it
              is recovered.
            </p>
          ) : null}
        </section>

        <section className="holo-panel holo-corner p-4 sm:p-5">
          <PanelTitle
            icon={ShieldAlert}
            title="Incident history"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{deviceIncidents.length} entries</span>}
          />
          {deviceIncidents.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No incidents" message="This agent has not reported any security events." />
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {deviceIncidents.map((incident) => {
                const style = severityStyles(incident.severity);
                return (
                  <li key={incident._id ?? `${incident.createdAt}-${incident.summary}`} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">{incident.summary}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {new Date(incident.createdAt).toLocaleString()} · score {incident.threatScore}
                        </p>
                      </div>
                      <span className={`shrink-0 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${style.badge}`}>
                        {incident.severity}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PanelTitle icon={Images} title="Agent evidence" />
          <Link
            to={`/dashboard/evidence?device=${encodeURIComponent(device.deviceId)}`}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white"
          >
            Open in evidence
          </Link>
        </div>
        {deviceCaptures.length === 0 ? (
          <div className="holo-panel holo-corner">
            <EmptyState icon={MapPin} title="No evidence collected" message="Photos, locations, and copied files from this agent will appear here." />
          </div>
        ) : (
          <CapturesSection
            captures={deviceCaptures}
            devices={[device]}
            token={token}
            deviceFilter={device.deviceId}
            onDeviceFilterChange={() => undefined}
            onCaptureDeleted={() => reloadCaptures()}
            hideDeviceFilter
          />
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
      <dt className="hud-label pt-0.5">{label}</dt>
      <dd className="max-w-[62%] text-right text-slate-200">{value}</dd>
    </div>
  );
}

export default DeviceDetailPage;
