import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  Cpu,
  Images,
  MonitorSmartphone,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff
} from 'lucide-react';
import { fetchNotificationSettings } from '../../api';
import HoloGlobe, { GlobePin } from '../../components/globe/HoloGlobe';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { getExperienceSettings } from '../../lib/experience';
import { formatRelativeTime, severityStyles } from './format';
import type { DashboardContext } from './context';

function OverviewPage() {
  const { token, devices, incidents, captures, loading, error, reload } = useOutletContext<DashboardContext>();
  const [alertConfigured, setAlertConfigured] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const experience = useRef(getExperienceSettings());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchNotificationSettings(token)
      .then((settings) => setAlertConfigured(Boolean(settings.alertEmailRecipient || settings.alertPhoneNumber)))
      .catch(() => setAlertConfigured(null));
  }, [token]);

  const online = devices.filter((device) => now - new Date(device.lastSeen).getTime() < 10 * 60 * 1000);
  const offline = devices.length - online.length;
  const criticalCount = incidents.filter((incident) => ['high', 'critical'].includes(incident.severity.toLowerCase())).length;
  const latestSync = devices.length
    ? Math.max(...devices.map((device) => new Date(device.lastSeen).getTime()))
    : 0;

  const pins = useMemo<GlobePin[]>(() => {
    const byDevice = new Map<string, GlobePin>();
    const ordered = [...captures]
      .filter((capture) => capture.captureType === 'location' && !capture.skipped)
      .sort((a, b) => new Date(b.capturedAtUtc).getTime() - new Date(a.capturedAtUtc).getTime());
    for (const capture of ordered) {
      const metadata = capture.metadata ?? {};
      const lat = typeof metadata.latitude === 'number' ? metadata.latitude : Number.NaN;
      const lon = typeof metadata.longitude === 'number' ? metadata.longitude : Number.NaN;
      if (Number.isNaN(lat) || Number.isNaN(lon) || byDevice.has(capture.deviceId)) continue;
      const device = devices.find((entry) => entry.deviceId === capture.deviceId);
      byDevice.set(capture.deviceId, {
        lat,
        lon,
        label: device?.name ?? capture.deviceId,
        critical: Boolean(device?.isLost)
      });
    }
    return [...byDevice.values()];
  }, [captures, devices]);

  const recentIncidents = useMemo(
    () => [...incidents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    [incidents]
  );

  const terminalLines = useMemo(() => {
    const events = [
      ...incidents.map((incident) => ({
        at: new Date(incident.createdAt).getTime(),
        text: `[${incident.severity.toUpperCase()}] ${incident.summary} · ${incident.deviceId}`
      })),
      ...captures.slice(0, 20).map((capture) => ({
        at: new Date(capture.capturedAtUtc).getTime(),
        text: `${capture.captureType.replace('_', ' ').toUpperCase()} · ${capture.deviceId}${capture.skipped ? ' (skipped)' : ''}`
      }))
    ];
    return events.sort((a, b) => b.at - a.at).slice(0, 7);
  }, [incidents, captures]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Command center</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Security overview</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" />
            {error ? 'Link degraded' : 'System online'}
          </span>
          <button
            type="button"
            onClick={reload}
            className="flex min-h-[38px] items-center gap-2 border border-brand-green/25 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-300 transition hover:border-brand-green hover:text-brand-green"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total devices" value={devices.length} icon={MonitorSmartphone} tone="green" hint={`${online.length} transmitting`} />
        <StatTile label="Online devices" value={online.length} icon={Wifi} tone="cyan" hint={`${offline} offline`} />
        <StatTile label="Offline devices" value={offline} icon={WifiOff} tone={offline > 0 ? 'danger' : 'green'} hint={offline > 0 ? 'Needs attention' : 'All reachable'} />
        <StatTile label="Threats detected" value={incidents.length} icon={AlertTriangle} tone="danger" hint={`${criticalCount} high or critical`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="holo-panel holo-corner min-h-[340px] p-4 sm:p-5">
          <PanelTitle
            icon={Radar}
            title="Global threat map"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{pins.length} located</span>}
          />
          <div className="relative mt-2 h-[300px] sm:h-[360px]">
            <div className="pointer-events-none absolute inset-0 grid-fade" />
            <HoloGlobe pins={pins} reducedMotion={experience.current.reducedMotion} />
            <div className="pointer-events-none absolute bottom-2 left-2 space-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-green" /> Safe device</p>
              <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-danger" /> Lost device</p>
            </div>
            {pins.length === 0 ? (
              <p className="absolute inset-x-0 bottom-12 text-center font-mono text-[11px] text-slate-500">
                No captured locations yet — pins appear once an agent reports one.
              </p>
            ) : null}
          </div>
        </section>

        <section className="holo-panel holo-corner p-4 sm:p-5">
          <PanelTitle icon={AlertTriangle} title="Threat activity" action={<span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" />Live</span>} />
          {recentIncidents.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No incidents" message="Nothing has been flagged on your devices yet." />
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {recentIncidents.map((incident) => {
                const style = severityStyles(incident.severity);
                return (
                  <li key={incident._id ?? incident.summary} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{incident.summary}</p>
                        <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          {formatRelativeTime(new Date(incident.createdAt).getTime(), now)} · {incident.deviceId}
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
          <Link to="/dashboard/threats" className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green hover:text-white">
            Open incident console <ArrowRight size={12} />
          </Link>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="holo-panel holo-corner p-4 sm:p-5 lg:col-span-2">
          <PanelTitle
            icon={MonitorSmartphone}
            title="Device agents"
            action={<Link to="/dashboard/devices" className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green hover:text-white">Manage all</Link>}
          />
          {devices.length === 0 ? (
            <EmptyState icon={Cpu} title="No agents registered" message="Install the Sentinel agent or pair a phone to see it here." />
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {devices.slice(0, 4).map((device) => {
                const isOnline = now - new Date(device.lastSeen).getTime() < 10 * 60 * 1000;
                return (
                  <Link
                    key={device._id ?? device.deviceId}
                    to={`/dashboard/devices/${encodeURIComponent(device.deviceId)}`}
                    className="group border border-white/8 bg-white/[0.02] p-3 transition hover:border-brand-green/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-white">{device.name}</span>
                      <span className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] ${isOnline ? 'text-brand-green' : 'text-brand-danger'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-brand-green' : 'bg-brand-danger'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{device.operatingSystem}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      Seen {formatRelativeTime(new Date(device.lastSeen).getTime(), now)}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="holo-panel holo-corner p-4 sm:p-5">
          <PanelTitle icon={ShieldAlert} title="System status" />
          <ul className="mt-3 space-y-2.5 text-sm">
            <StatusRow label="Core service sync" value={latestSync ? formatRelativeTime(latestSync, now) : 'No data'} ok={Boolean(latestSync)} />
            <StatusRow label="Agents reachable" value={`${online.length}/${devices.length}`} ok={online.length === devices.length && devices.length > 0} />
            <StatusRow label="Lost-device protocol" value={devices.some((device) => device.isLost) ? 'Armed' : 'Standby'} ok={!devices.some((device) => device.isLost)} />
            <StatusRow
              label="Alert channel"
              value={alertConfigured === null ? 'Unknown' : alertConfigured ? 'Configured' : 'Not configured'}
              ok={alertConfigured === true}
            />
            <StatusRow label="Evidence store" value={`${captures.length} records`} ok={captures.length > 0} />
          </ul>
        </section>
      </div>

      <section className="holo-panel p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <PanelTitle icon={BellRing} title="Live event stream" />
          <Link to="/dashboard/timeline" className="font-mono text-[10px] uppercase tracking-[0.18em] text-brand-green hover:text-white">
            Full timeline
          </Link>
        </div>
        <div className="terminal mt-3 max-h-56 overflow-y-auto p-3 text-[11px] leading-relaxed">
          {terminalLines.length === 0 ? (
            <p className="text-slate-500">&gt; awaiting telemetry from registered agents…</p>
          ) : (
            terminalLines.map((line) => (
              <p key={`${line.at}-${line.text}`} className="text-brand-green/90">
                <span className="text-slate-500">[{new Date(line.at).toLocaleTimeString([], { hour12: false })}]</span> {line.text}
              </p>
            ))
          )}
          <p className="mt-1 flex items-center gap-1 text-brand-green">
            <span className="text-slate-500">sentinel@core:~$</span>
            <span className="inline-block h-3 w-1.5 animate-flicker bg-brand-green" />
          </p>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-2 border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm text-rose-200">
          <AlertTriangle size={16} className="mt-0.5" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-slate-300">
        {ok ? <CheckCircle2 size={14} className="text-brand-green" /> : <AlertTriangle size={14} className="text-brand-amber" />}
        {label}
      </span>
      <span className={`font-mono text-[11px] uppercase tracking-[0.12em] ${ok ? 'text-brand-green' : 'text-slate-400'}`}>{value}</span>
    </li>
  );
}

export default OverviewPage;
