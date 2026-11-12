import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Filter, Search, ShieldCheck, ShieldAlert } from 'lucide-react';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { formatRelativeTime, severityStyles } from './format';
import type { DashboardContext } from './context';

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low', 'informational'] as const;
type SeverityFilter = (typeof SEVERITIES)[number];

function ThreatsPage() {
  const { devices, incidents, loading } = useOutletContext<DashboardContext>();
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [deviceId, setDeviceId] = useState('all');
  const [query, setQuery] = useState('');
  const now = Date.now();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...incidents]
      .filter((incident) => (severity === 'all' ? true : incident.severity.toLowerCase() === severity))
      .filter((incident) => (deviceId === 'all' ? true : incident.deviceId === deviceId))
      .filter((incident) =>
        needle
          ? [incident.summary, incident.incidentType, incident.deviceId].some((value) => value.toLowerCase().includes(needle))
          : true
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [incidents, severity, deviceId, query]);

  const stats = useMemo(() => {
    const critical = incidents.filter((incident) => ['critical', 'high'].includes(incident.severity.toLowerCase())).length;
    const affected = new Set(incidents.map((incident) => incident.deviceId)).size;
    const avgScore = incidents.length
      ? Math.round(incidents.reduce((total, incident) => total + (Number(incident.threatScore) || 0), 0) / incidents.length)
      : 0;
    return { critical, affected, avgScore };
  }, [incidents]);

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Incident console</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Threats &amp; incidents</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Every incident reported by your agents. Severity, threat score, and the device it originated from — nothing is
          hidden or re-scored.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total incidents" value={incidents.length} icon={AlertTriangle} tone="green" hint="All time" />
        <StatTile label="High / critical" value={stats.critical} icon={ShieldAlert} tone="danger" hint="Needs review" />
        <StatTile label="Devices affected" value={stats.affected} icon={ShieldCheck} tone="cyan" hint={`${devices.length} registered`} />
        <StatTile label="Average threat score" value={stats.avgScore} icon={Filter} tone="amber" hint="Agent-computed" />
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5">
        <PanelTitle
          icon={AlertTriangle}
          title="Incident log"
          action={
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
              {filtered.length} / {incidents.length}
            </span>
          }
        />

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {SEVERITIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSeverity(option)}
                className={`min-h-[34px] border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                  severity === option
                    ? 'border-brand-green/50 bg-brand-green/15 text-brand-green'
                    : 'border-white/10 text-slate-400 hover:border-brand-green/30 hover:text-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              className="min-h-[38px] border border-brand-green/20 bg-black/40 px-2 font-mono text-[11px] text-slate-200 outline-none focus:border-brand-green/60"
            >
              <option value="all">All devices</option>
              {devices.map((device) => (
                <option key={device._id ?? device.deviceId} value={device.deviceId}>
                  {device.name}
                </option>
              ))}
            </select>
            <label className="flex min-h-[38px] items-center gap-2 border border-brand-green/20 bg-black/40 px-2.5">
              <Search size={13} className="text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search incidents"
                className="w-full bg-transparent py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 sm:w-44"
              />
            </label>
          </div>
        </div>

        {loading && incidents.length === 0 ? (
          <div className="mt-6 space-y-2">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-16 animate-pulse border border-white/5 bg-white/[0.02]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={incidents.length === 0 ? 'No incidents recorded' : 'No incidents match this filter'}
            message={
              incidents.length === 0
                ? 'When an agent reports a security event it will appear here with its full severity rating.'
                : 'Loosen the severity, device, or search filters to see more events.'
            }
          />
        ) : (
          <ul className="mt-4 space-y-2.5">
            {filtered.map((incident) => {
              const style = severityStyles(incident.severity);
              const device = devices.find((entry) => entry.deviceId === incident.deviceId);
              const score = Math.max(0, Math.min(100, Number(incident.threatScore) || 0));
              return (
                <li
                  key={incident._id ?? `${incident.deviceId}-${incident.createdAt}-${incident.summary}`}
                  className="border border-white/8 bg-white/[0.02] p-3.5 transition hover:border-brand-green/25 sm:p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${style.badge}`}>
                          {incident.severity}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                          {incident.incidentType.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[10px] text-slate-600">
                          {formatRelativeTime(new Date(incident.createdAt).getTime(), now)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-100">{incident.summary}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <span className="truncate">{device?.name ?? incident.deviceId}</span>
                        <span>{new Date(incident.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden bg-white/5">
                          <div
                            className={`h-full ${score >= 70 ? 'bg-brand-danger' : score >= 40 ? 'bg-brand-amber' : 'bg-brand-green'}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">score {score}</span>
                      </div>
                    </div>
                    <Link
                      to={`/dashboard/devices/${encodeURIComponent(incident.deviceId)}`}
                      className="flex min-h-[34px] shrink-0 items-center gap-1.5 border border-brand-green/25 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/10"
                    >
                      Device <ArrowRight size={11} />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ThreatsPage;
