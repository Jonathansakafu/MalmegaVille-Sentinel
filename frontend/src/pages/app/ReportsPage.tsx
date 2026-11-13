import { useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { BarChart3, Download, FileJson, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import type { DashboardContext } from './context';

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\r\n');
}

function ReportsPage() {
  const { devices, incidents, captures } = useOutletContext<DashboardContext>();
  const navigate = useNavigate();
  const { showAlert } = useAlerts();
  const [range, setRange] = useState(7);

  const since = Date.now() - range * 24 * 60 * 60 * 1000;

  const scopedIncidents = useMemo(
    () => incidents.filter((incident) => new Date(incident.createdAt).getTime() >= since),
    [incidents, since]
  );
  const scopedCaptures = useMemo(
    () => captures.filter((capture) => new Date(capture.capturedAtUtc).getTime() >= since),
    [captures, since]
  );

  const severityBreakdown = useMemo(() => {
    const buckets: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
    for (const incident of scopedIncidents) {
      const key = incident.severity.toLowerCase();
      buckets[key] = (buckets[key] ?? 0) + 1;
    }
    return buckets;
  }, [scopedIncidents]);

  const perDevice = useMemo(
    () =>
      devices
        .map((device) => {
          const deviceIncidents = scopedIncidents.filter((incident) => incident.deviceId === device.deviceId);
          const deviceCaptures = scopedCaptures.filter((capture) => capture.deviceId === device.deviceId);
          const highRisk = deviceIncidents.filter((incident) => ['high', 'critical'].includes(incident.severity.toLowerCase())).length;
          return { device, incidents: deviceIncidents.length, highRisk, captures: deviceCaptures.length };
        })
        .sort((a, b) => b.incidents - a.incidents),
    [devices, scopedIncidents, scopedCaptures]
  );

  const daily = useMemo(() => {
    const days: { label: string; incidents: number; captures: number }[] = [];
    for (let offset = range - 1; offset >= 0; offset -= 1) {
      const day = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const dayKey = day.toDateString();
      days.push({
        label: day.toLocaleDateString([], { weekday: 'short' }),
        incidents: scopedIncidents.filter((incident) => new Date(incident.createdAt).toDateString() === dayKey).length,
        captures: scopedCaptures.filter((capture) => new Date(capture.capturedAtUtc).toDateString() === dayKey).length
      });
    }
    return days;
  }, [range, scopedIncidents, scopedCaptures]);

  const peak = Math.max(1, ...daily.map((day) => Math.max(day.incidents, day.captures)));
  const highRisk = scopedIncidents.filter((incident) => ['high', 'critical'].includes(incident.severity.toLowerCase())).length;
  const skipped = scopedCaptures.filter((capture) => capture.skipped).length;

  const exportJson = () => {
    downloadFile(
      `sentinel-report-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          rangeDays: range,
          summary: { devices: devices.length, incidents: scopedIncidents.length, captures: scopedCaptures.length, highRisk },
          severityBreakdown,
          perDevice: perDevice.map((row) => ({
            deviceId: row.device.deviceId,
            name: row.device.name,
            operatingSystem: row.device.operatingSystem,
            incidents: row.incidents,
            highRisk: row.highRisk,
            captures: row.captures
          })),
          daily
        },
        null,
        2
      ),
      'application/json'
    );
    showAlert({ kind: 'success', title: 'EXPORT READY', message: 'JSON report downloaded to this device.' });
  };

  const exportDevicesCsv = () => {
    if (devices.length === 0) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'There are no devices to export yet.' });
      return;
    }
    downloadFile(
      `sentinel-devices-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        perDevice.map((row) => ({
          deviceId: row.device.deviceId,
          name: row.device.name,
          operatingSystem: row.device.operatingSystem,
          lastSeen: row.device.lastSeen,
          isLost: Boolean(row.device.isLost),
          incidents: row.incidents,
          highRisk: row.highRisk,
          captures: row.captures
        }))
      ),
      'text/csv'
    );
    showAlert({ kind: 'success', title: 'EXPORT READY', message: 'Device CSV downloaded to this device.' });
  };

  const exportIncidentsCsv = () => {
    if (scopedIncidents.length === 0) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'No incidents exist inside this range.' });
      return;
    }
    downloadFile(
      `sentinel-incidents-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        scopedIncidents.map((incident) => ({
          createdAt: incident.createdAt,
          deviceId: incident.deviceId,
          type: incident.incidentType,
          severity: incident.severity,
          threatScore: incident.threatScore,
          summary: incident.summary
        }))
      ),
      'text/csv'
    );
    showAlert({ kind: 'success', title: 'EXPORT READY', message: 'Incident CSV downloaded to this device.' });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">After-action analysis</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Reports</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Totals computed live from your own records for the selected range. Exports contain exactly what you see here.
          </p>
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRange(days)}
              className={`min-h-[34px] border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                range === days
                  ? 'border-brand-green/50 bg-brand-green/15 text-brand-green'
                  : 'border-white/10 text-slate-400 hover:border-brand-green/30 hover:text-slate-200'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Incidents · ${range}d`}
          value={scopedIncidents.length}
          icon={BarChart3}
          tone="amber"
          hint={`${highRisk} high or critical`}
          onClick={() => navigate('/dashboard/threats')}
        />
        <StatTile
          label={`Evidence · ${range}d`}
          value={scopedCaptures.length}
          icon={FileSpreadsheet}
          tone="green"
          hint={`${skipped} skipped`}
          onClick={() => navigate('/dashboard/evidence')}
        />
        <StatTile
          label="Registered agents"
          value={devices.length}
          icon={ShieldCheck}
          tone="cyan"
          hint="Current inventory"
          onClick={() => navigate('/dashboard/devices')}
        />
        <StatTile
          label="Evidence per incident"
          value={scopedIncidents.length === 0 ? '—' : (scopedCaptures.length / scopedIncidents.length).toFixed(1)}
          icon={FileJson}
          tone="cyan"
          hint="Collection density"
          onClick={() => navigate('/dashboard/evidence')}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
          <PanelTitle icon={BarChart3} title={`Activity · last ${range} days`} />
          {scopedIncidents.length === 0 && scopedCaptures.length === 0 ? (
            <EmptyState icon={BarChart3} title="No activity in range" message="Widen the range or wait for your agents to report again." />
          ) : (
            <div className="mt-4">
              <div className="flex h-40 items-end gap-1.5">
                {daily.map((day, index) => (
                  <div key={`${day.label}-${index}`} className="group flex flex-1 flex-col items-center justify-end gap-0.5">
                    <div
                      className="w-full bg-brand-danger/70 transition group-hover:bg-brand-danger"
                      style={{ height: `${(day.incidents / peak) * 100}%`, minHeight: day.incidents > 0 ? 3 : 0 }}
                      title={`${day.incidents} incidents`}
                    />
                    <div
                      className="w-full bg-brand-green/60 transition group-hover:bg-brand-green"
                      style={{ height: `${(day.captures / peak) * 100}%`, minHeight: day.captures > 0 ? 3 : 0 }}
                      title={`${day.captures} evidence records`}
                    />
                    <span className="mt-1 font-mono text-[8px] uppercase tracking-wider text-slate-600">{day.label.slice(0, 2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-brand-danger/70" /> Incidents</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-brand-green/60" /> Evidence</span>
                <span className="ml-auto text-slate-600">scale max {peak}</span>
              </div>
            </div>
          )}
        </section>

        <section className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
          <PanelTitle icon={ShieldCheck} title="Severity distribution" />
          <ul className="mt-4 space-y-2.5">
            {Object.entries(severityBreakdown).map(([severity, count]) => {
              const total = Math.max(1, scopedIncidents.length);
              const width = Math.round((count / total) * 100);
              const color =
                severity === 'critical' || severity === 'high'
                  ? 'bg-brand-danger'
                  : severity === 'medium'
                    ? 'bg-brand-amber'
                    : severity === 'low'
                      ? 'bg-brand-cyan'
                      : 'bg-slate-500';
              return (
                <li key={severity}>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                    <span className="text-slate-400">{severity}</span>
                    <span className="text-slate-300">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden bg-white/5">
                    <div className={`h-full ${color}`} style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
        <PanelTitle
          icon={FileSpreadsheet}
          title={`Agent breakdown · ${range}d`}
          action={
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={exportDevicesCsv}
                className="flex min-h-[32px] items-center gap-1.5 border border-brand-green/30 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/10"
              >
                <Download size={11} /> Devices CSV
              </button>
              <button
                type="button"
                onClick={exportIncidentsCsv}
                className="flex min-h-[32px] items-center gap-1.5 border border-brand-green/30 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/10"
              >
                <Download size={11} /> Incidents CSV
              </button>
              <button
                type="button"
                onClick={exportJson}
                className="flex min-h-[32px] items-center gap-1.5 border border-brand-cyan/30 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-cyan transition hover:bg-brand-cyan/10"
              >
                <FileJson size={11} /> Full JSON
              </button>
            </div>
          }
        />
        {perDevice.length === 0 ? (
          <EmptyState icon={BarChart3} title="No agents to report on" message="Register a device to generate this breakdown." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
                  <th className="pb-2 pr-3">Agent</th>
                  <th className="pb-2 pr-3">OS</th>
                  <th className="pb-2 pr-3">Incidents</th>
                  <th className="pb-2 pr-3">High risk</th>
                  <th className="pb-2">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {perDevice.map((row) => (
                  <tr key={row.device._id ?? row.device.deviceId} className="border-t border-white/5 transition hover:bg-white/[0.02]">
                    <td className="py-2 pr-3">
                      <Link
                        to={`/dashboard/devices/${encodeURIComponent(row.device.deviceId)}`}
                        className="text-slate-200 transition hover:text-brand-green"
                      >
                        {row.device.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-400">{row.device.operatingSystem}</td>
                    <td className="py-2 pr-3 font-mono text-slate-300">{row.incidents}</td>
                    <td className={`py-2 pr-3 font-mono ${row.highRisk > 0 ? 'text-rose-300' : 'text-slate-400'}`}>{row.highRisk}</td>
                    <td className="py-2 font-mono text-slate-300">{row.captures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default ReportsPage;
