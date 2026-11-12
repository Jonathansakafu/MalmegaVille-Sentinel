import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, Copy, Images, MonitorSmartphone, Search, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Device } from '../../api';
import { EmptyState, PanelTitle } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { formatRelativeTime } from './format';
import type { DashboardContext } from './context';

function isOnline(device: Device, now: number) {
  return now - new Date(device.lastSeen).getTime() < 10 * 60 * 1000;
}

function DevicesPage() {
  const { devices, incidents, toggleLost, removeDevice, lostStatusPending } = useOutletContext<DashboardContext>();
  const { showAlert } = useAlerts();
  const [query, setQuery] = useState('');
  const now = Date.now();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return devices;
    return devices.filter((device) =>
      [device.name, device.deviceId, device.operatingSystem].some((value) => value.toLowerCase().includes(needle))
    );
  }, [devices, query]);

  const threatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const incident of incidents) counts.set(incident.deviceId, (counts.get(incident.deviceId) ?? 0) + 1);
    return counts;
  }, [incidents]);

  const copyId = async (deviceId: string) => {
    try {
      await navigator.clipboard.writeText(deviceId);
      showAlert({ kind: 'success', title: 'COPIED', message: 'Device ID copied to clipboard.' });
    } catch {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'The browser blocked clipboard access.', detail: deviceId });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Endpoint fleet</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Device agents</h1>
        </div>
        <label className="flex min-h-[40px] w-full items-center gap-2 border border-brand-green/20 bg-black/30 px-3 sm:w-72">
          <Search size={14} className="text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, ID or OS"
            className="w-full bg-transparent py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
        </label>
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5">
        <PanelTitle
          icon={MonitorSmartphone}
          title={`Registered agents · ${devices.length}`}
          action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{filtered.length} shown</span>}
        />
        {devices.length === 0 ? (
          <EmptyState icon={MonitorSmartphone} title="No agents yet" message="Install the desktop agent or pair the Android app to register a device." />
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filtered.map((device) => {
              const online = isOnline(device, now);
              const threats = threatCounts.get(device.deviceId) ?? 0;
              const pending = lostStatusPending === device._id;
              return (
                <article
                  key={device._id ?? device.deviceId}
                  className={`relative holo-panel holo-corner p-4 transition ${device.isLost ? 'holo-panel-danger' : 'hover:border-brand-green/35'}`}
                >
                  <Link
                    to={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                    aria-label={`Open ${device.name}`}
                    className="absolute inset-0 z-0"
                  />
                  <div className="pointer-events-none relative z-10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-white">{device.name}</h2>
                      <p className="mt-0.5 truncate text-xs text-slate-400">{device.operatingSystem}</p>
                    </div>
                    <span
                      className={`flex shrink-0 items-center gap-1.5 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] ${
                        online ? 'border-brand-green/40 bg-brand-green/10 text-brand-green' : 'border-brand-danger/40 bg-brand-danger/10 text-rose-300'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-brand-green' : 'bg-brand-danger'}`} />
                      {online ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyId(device.deviceId)}
                    className="mt-3 flex w-full items-center justify-between gap-2 border border-white/8 bg-black/30 px-2 py-1.5 text-left font-mono text-[10px] text-slate-400 transition hover:border-brand-green/40 hover:text-brand-green pointer-events-auto"
                  >
                    <span className="truncate">{device.deviceId}</span>
                    <Copy size={11} />
                  </button>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="hud-label">Last seen</dt>
                      <dd className="mt-0.5 text-slate-200">{formatRelativeTime(new Date(device.lastSeen).getTime(), now)}</dd>
                    </div>
                    <div>
                      <dt className="hud-label">Incidents</dt>
                      <dd className={`mt-0.5 font-mono ${threats > 0 ? 'text-brand-danger' : 'text-slate-200'}`}>{threats}</dd>
                    </div>
                    <div>
                      <dt className="hud-label">Status</dt>
                      <dd className={`mt-0.5 font-semibold ${device.isLost ? 'text-brand-danger' : 'text-brand-green'}`}>
                        {device.isLost ? 'Lost / stolen' : 'Safe'}
                      </dd>
                    </div>
                    <div>
                      <dt className="hud-label">Security</dt>
                      <dd className="mt-0.5 truncate text-slate-300">{device.securityStatus || 'Unknown'}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                      className="pointer-events-auto flex min-h-[38px] items-center gap-1.5 border border-brand-green/30 bg-brand-green/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/20"
                    >
                      Open agent <ArrowRight size={12} />
                    </Link>
                    <Link
                      to={`/dashboard/evidence?device=${encodeURIComponent(device.deviceId)}`}
                      className="pointer-events-auto flex min-h-[38px] items-center gap-1.5 border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-brand-green/40 hover:text-brand-green"
                    >
                      <Images size={12} /> Captures
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleLost(device)}
                      className={`pointer-events-auto flex min-h-[38px] items-center gap-1.5 border px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition disabled:opacity-40 ${
                        device.isLost
                          ? 'border-brand-green/40 text-brand-green hover:bg-brand-green/10'
                          : 'border-brand-danger/40 text-rose-300 hover:bg-brand-danger/10'
                      }`}
                    >
                      {device.isLost ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                      {device.isLost ? 'Clear lost' : 'Mark lost'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Remove "${device.name}" from your device inventory? Its past captures are kept.`)) {
                          removeDevice(device);
                        }
                      }}
                      className="pointer-events-auto flex min-h-[38px] items-center gap-1.5 border border-white/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400 transition hover:border-brand-danger/50 hover:text-rose-300"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default DevicesPage;
