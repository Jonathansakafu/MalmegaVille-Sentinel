import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Activity, AlertTriangle, Camera, Crosshair, ScrollText, Shield } from 'lucide-react';
import { AuditLogEntry, fetchAuditLogs } from '../../api';
import { EmptyState, PanelTitle } from '../../components/shell/AppShell';
import { formatRelativeTime } from './format';
import type { DashboardContext } from './context';

type TimelineEvent = {
  id: string;
  at: number;
  kind: 'incident' | 'capture' | 'audit';
  title: string;
  detail: string;
  tone: 'green' | 'cyan' | 'amber' | 'danger';
  meta?: string;
  to: string;
};

const FILTERS = ['all', 'incidents', 'evidence', 'system'] as const;
type Filter = (typeof FILTERS)[number];

function TimelinePage() {
  const { token, incidents, captures } = useOutletContext<DashboardContext>();
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [auditError, setAuditError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const now = Date.now();

  useEffect(() => {
    fetchAuditLogs(token)
      .then(setAudit)
      .catch((loadError) => setAuditError(loadError instanceof Error ? loadError.message : 'Audit log unavailable.'));
  }, [token]);

  const events = useMemo<TimelineEvent[]>(() => {
    const merged: TimelineEvent[] = [
      ...incidents.map((incident) => ({
        id: `incident-${incident._id ?? `${incident.deviceId}-${incident.createdAt}`}`,
        at: new Date(incident.createdAt).getTime(),
        kind: 'incident' as const,
        title: incident.summary,
        detail: `${incident.deviceId} · ${incident.incidentType.replace(/_/g, ' ')} · threat score ${incident.threatScore}`,
        tone: ['high', 'critical'].includes(incident.severity.toLowerCase()) ? ('danger' as const) : ('amber' as const),
        meta: incident.severity,
        to: `/dashboard/threats?device=${encodeURIComponent(incident.deviceId)}`
      })),
      ...captures.map((capture) => ({
        id: `capture-${capture._id ?? capture.id ?? `${capture.deviceId}-${capture.capturedAtUtc}`}`,
        at: new Date(capture.capturedAtUtc).getTime(),
        kind: 'capture' as const,
        title:
          capture.captureType === 'webcam_photo'
            ? 'Webcam photo captured'
            : capture.captureType === 'location'
              ? 'Location captured'
              : `USB file ${capture.skipped ? 'skipped' : 'copied'}`,
        detail: `${capture.deviceId}${capture.originalFileName ? ` · ${capture.originalFileName}` : ''}${
          capture.triggerEvent ? ` · ${capture.triggerEvent === 'usb_insert' ? 'USB insertion' : 'screen unlock'}` : ''
        }`,
        tone: capture.skipped ? ('cyan' as const) : ('green' as const),
        meta: capture.captureType.replace(/_/g, ' '),
        to: `/dashboard/evidence?device=${encodeURIComponent(capture.deviceId)}&type=${
          capture.captureType === 'webcam_photo' ? 'webcam_photo' : capture.captureType === 'location' ? 'location' : 'usb'
        }`
      })),
      ...audit.map((entry) => ({
        id: `audit-${entry._id ?? `${entry.action}-${entry.createdAt}`}`,
        at: new Date(entry.createdAt).getTime(),
        kind: 'audit' as const,
        title: entry.description,
        detail: `${entry.actorType}${entry.targetType ? ` · ${entry.targetType}` : ''}${entry.targetId ? ` · ${entry.targetId}` : ''}`,
        tone: 'cyan' as const,
        meta: entry.action,
        to: '/dashboard/settings'
      }))
    ];
    return merged.sort((a, b) => b.at - a.at);
  }, [incidents, captures, audit]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events
      .filter((event) =>
        filter === 'all' ? true : filter === 'system' ? event.kind === 'audit' : event.kind === `${filter.slice(0, -1)}`
      )
      .filter((event) => (needle ? `${event.title} ${event.detail} ${event.meta ?? ''}`.toLowerCase().includes(needle) : true));
  }, [events, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of filtered) {
      const day = new Date(event.at).toDateString();
      const list = map.get(day);
      if (list) list.push(event);
      else map.set(day, [event]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Forensic record</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Event timeline</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Incidents, collected evidence, and account activity merged on one clock — the order things actually happened.
        </p>
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5">
        <PanelTitle
          icon={Activity}
          title="Chronological stream"
          action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{filtered.length} events</span>}
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`min-h-[34px] border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                  filter === option
                    ? 'border-brand-green/50 bg-brand-green/15 text-brand-green'
                    : 'border-white/10 text-slate-400 hover:border-brand-green/30 hover:text-slate-200'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter events"
            className="min-h-[36px] w-full border border-brand-green/20 bg-black/40 px-2.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 sm:w-56"
          />
        </div>

        {auditError ? (
          <p className="mt-3 border border-brand-amber/30 bg-brand-amber/[0.05] px-2.5 py-1.5 font-mono text-[10px] text-amber-300">
            Audit channel: {auditError} — showing incidents and evidence only.
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing on the record" message="Events appear here as your agents report incidents and collect evidence." />
        ) : (
          <div className="mt-5 space-y-6">
            {groups.map(([day, dayEvents]) => (
              <div key={day}>
                <p className="sticky top-14 z-10 mb-2 inline-block bg-ink-900/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green/80 backdrop-blur">
                  {day}
                </p>
                <ul className="relative space-y-2 border-l border-brand-green/15 pl-4">
                  {dayEvents.map((event) => {
                    const Icon = event.kind === 'incident' ? AlertTriangle : event.kind === 'capture' ? Camera : Shield;
                    const tone =
                      event.tone === 'danger'
                        ? 'text-brand-danger border-brand-danger/40'
                        : event.tone === 'amber'
                          ? 'text-brand-amber border-brand-amber/40'
                          : event.tone === 'cyan'
                            ? 'text-brand-cyan border-brand-cyan/30'
                            : 'text-brand-green border-brand-green/30';
                    return (
                      <li key={event.id} className="relative">
                        <span className={`absolute -left-[1.42rem] top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full border bg-ink-900 ${tone}`} />
                        <Link
                          to={event.to}
                          className="block border border-white/8 bg-white/[0.02] p-3 transition hover:border-brand-green/35 hover:bg-white/[0.04]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] ${tone.split(' ')[0]}`}>
                              <Icon size={11} /> {event.kind}
                            </p>
                            <span className="font-mono text-[10px] text-slate-500">
                              {new Date(event.at).toLocaleTimeString([], { hour12: false })} · {formatRelativeTime(event.at, now)}
                            </span>
                          </div>
                          <p className="mt-1.5 text-sm font-semibold text-slate-100">{event.title}</p>
                          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
                            {event.detail}
                            {event.meta ? ` · ${event.meta}` : ''}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">
          <Crosshair size={11} /> End of retained record
        </p>
      </section>
    </div>
  );
}

export default TimelinePage;
