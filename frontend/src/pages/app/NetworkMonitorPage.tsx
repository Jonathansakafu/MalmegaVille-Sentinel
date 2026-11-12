import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Globe2,
  Network,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Server
} from 'lucide-react';
import {
  NetworkDestination,
  NetworkOverview,
  fetchNetworkOverview,
  setNetworkDestinationVerdict
} from '../../api';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { formatRelativeTime } from './format';
import type { DashboardContext } from './context';

const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

function destinationId(destination: NetworkDestination): string {
  return destination._id ?? destination.id ?? '';
}

function NetworkMonitorPage() {
  const { token, devices } = useOutletContext<DashboardContext>();
  const { showAlert } = useAlerts();
  const [data, setData] = useState<NetworkOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      fetchNetworkOverview(token)
        .then((overview) => {
          setData(overview);
          setError('');
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load network telemetry.'))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    const poller = window.setInterval(() => load(true), 30000);
    return () => window.clearInterval(poller);
  }, [load]);

  const deviceName = useCallback(
    (id: string) => devices.find((device) => device.deviceId === id)?.name ?? id.slice(0, 12),
    [devices]
  );

  const stats = data?.stats;
  const destinations = data?.destinations ?? [];
  const latest = data?.latest ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return destinations.filter((destination) => {
      if (onlyUnknown && destination.verdict === 'trusted') return false;
      if (!needle) return true;
      return [destination.remoteAddress, destination.processName, destination.label, destination.deviceId]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [destinations, onlyUnknown, query]);

  const decide = async (destination: NetworkDestination, verdict: 'unknown' | 'trusted') => {
    const id = destinationId(destination);
    if (!id) return;
    setBusy(id);
    try {
      const updated = await setNetworkDestinationVerdict(token, id, verdict, destination.label);
      setData((prev) => {
        if (!prev) return prev;
        const destinations = prev.destinations.map((entry) =>
          destinationId(entry) === id ? { ...entry, ...updated } : entry
        );
        return {
          ...prev,
          destinations,
          stats: {
            ...prev.stats,
            unknownDestinations: destinations.filter((entry) => entry.verdict === 'unknown').length,
            trustedDestinations: destinations.filter((entry) => entry.isPublic && entry.verdict === 'trusted').length
          }
        };
      });
      showAlert({
        kind: verdict === 'trusted' ? 'success' : 'threat',
        title: verdict === 'trusted' ? 'DESTINATION TRUSTED' : 'TRUST REVOKED',
        message:
          verdict === 'trusted'
            ? `${destination.remoteAddress} will no longer raise a first-contact alert.`
            : `${destination.remoteAddress} is back under observation.`
      });
    } catch (verdictError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The destination verdict could not be saved.',
        detail: verdictError instanceof Error ? verdictError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  const rename = async (destination: NetworkDestination) => {
    const id = destinationId(destination);
    if (!id) return;
    const next = window.prompt('Label this destination', destination.label ?? '');
    if (next === null) return;
    setBusy(id);
    try {
      const updated = await setNetworkDestinationVerdict(token, id, destination.verdict, next.trim() || undefined);
      setData((prev) =>
        prev
          ? { ...prev, destinations: prev.destinations.map((entry) => (destinationId(entry) === id ? { ...entry, ...updated } : entry)) }
          : prev
      );
      showAlert({ kind: 'success', title: 'DESTINATION LABELLED', message: `${destination.remoteAddress} → ${next.trim() || 'unlabelled'}` });
    } catch (renameError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The label could not be saved.',
        detail: renameError instanceof Error ? renameError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Outbound visibility</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Network monitor</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Each agent reports every established TCP connection with the process that opened it. Addresses you have
            approved stay quiet; any first-time public destination raises an alert with the owning process.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex min-h-[38px] items-center gap-2 border border-brand-green/30 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green/10 disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Open connections"
          value={loading ? '—' : stats?.connections ?? 0}
          icon={Network}
          tone="green"
          hint={`${stats?.activeDevices ?? 0} agents reporting`}
          onClick={() => document.getElementById('agent-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Public sockets"
          value={loading ? '—' : stats?.publicConnections ?? 0}
          icon={Globe2}
          tone="cyan"
          hint="Internet-facing sessions"
          onClick={() => document.getElementById('destinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Untrusted peers"
          value={loading ? '—' : stats?.unknownDestinations ?? 0}
          icon={ShieldAlert}
          tone={(stats?.unknownDestinations ?? 0) > 0 ? 'danger' : 'green'}
          hint={`${stats?.destinations ?? 0} known destinations`}
          onClick={() => {
            setOnlyUnknown(true);
            document.getElementById('destinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        <StatTile
          label="Approved peers"
          value={loading ? '—' : stats?.trustedDestinations ?? 0}
          icon={ShieldCheck}
          tone="amber"
          hint="Suppressed from alerts"
          onClick={() => document.getElementById('destinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </div>

      {error ? <div className="border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section id="destinations" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5">
          <PanelTitle
            icon={Globe2}
            title="Destination inventory"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{filtered.length} shown</span>}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by IP, process, label…"
                spellCheck={false}
                className="min-h-[38px] w-full border border-white/10 bg-black/40 pl-8 pr-2.5 font-mono text-xs text-slate-100 outline-none focus:border-brand-green/60"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyUnknown((value) => !value)}
              aria-pressed={onlyUnknown}
              className={`flex min-h-[38px] items-center justify-center gap-1.5 border px-3 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                onlyUnknown
                  ? 'border-brand-danger/50 bg-brand-danger/10 text-rose-300'
                  : 'border-white/10 text-slate-400 hover:border-brand-green/40 hover:text-brand-green'
              }`}
            >
              <ShieldAlert size={13} /> Untrusted only
            </button>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-16 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Radio}
              title={destinations.length === 0 ? 'No live connections' : 'Nothing matches the filter'}
              message={
                destinations.length === 0
                  ? 'Destinations appear the first time an agent reports an established TCP session. Local-only traffic stays off this list.'
                  : 'Clear the search or switch off the untrusted-only filter to see every peer.'
              }
            />
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {filtered.map((destination) => {
                const id = destinationId(destination);
                const trusted = destination.verdict === 'trusted';
                const fresh = now - new Date(destination.lastSeenUtc).getTime() < ACTIVE_WINDOW_MS;
                return (
                  <li key={id || destination.remoteAddress} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${fresh ? 'bg-brand-green' : 'bg-slate-600'}`} />
                          <p className="font-mono text-sm font-semibold text-slate-100">
                            {destination.remoteAddress}
                            {destination.remotePort ? <span className="text-slate-500">:{destination.remotePort}</span> : null}
                          </p>
                          <span
                            className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                              trusted
                                ? 'border-brand-green/40 bg-brand-green/10 text-brand-green'
                                : destination.isPublic
                                  ? 'border-brand-amber/40 bg-brand-amber/10 text-amber-300'
                                  : 'border-brand-cyan/30 bg-brand-cyan/10 text-cyan-300'
                            }`}
                          >
                            {trusted ? 'trusted' : destination.isPublic ? 'public' : 'private'}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {destination.processName ?? 'unknown process'} · {deviceName(destination.deviceId)} · {destination.label ?? 'unlabelled'}
                        </p>
                        <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600">
                          {destination.seenCount} sighting{destination.seenCount === 1 ? '' : 's'} · last{' '}
                          {formatRelativeTime(new Date(destination.lastSeenUtc).getTime(), now)} · first seen{' '}
                          {formatRelativeTime(new Date(destination.firstSeenUtc).getTime(), now)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => rename(destination)}
                          className="flex min-h-[30px] items-center gap-1 border border-white/10 px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400 transition hover:border-brand-cyan/50 hover:text-brand-cyan disabled:opacity-40"
                        >
                          Label
                        </button>
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => decide(destination, trusted ? 'unknown' : 'trusted')}
                          className={`flex min-h-[30px] items-center gap-1 border px-2 font-mono text-[9px] uppercase tracking-[0.12em] transition disabled:opacity-40 ${
                            trusted
                              ? 'border-brand-danger/40 text-rose-300 hover:bg-brand-danger/10'
                              : 'border-brand-green/40 text-brand-green hover:bg-brand-green/10'
                          }`}
                        >
                          {trusted ? <ShieldAlert size={11} /> : <ShieldCheck size={11} />}
                          {trusted ? 'Revoke' : 'Trust'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
            <ArrowUpRight size={11} /> alerts fire once per new public peer
          </p>
        </section>

        <section id="agent-activity" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5">
          <PanelTitle
            icon={Server}
            title="Agent activity"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{latest.length} reporters</span>}
          />
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-20 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : latest.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No snapshots yet"
              message="The Windows agent uploads a connection snapshot every 60 seconds. Install or restart it to start the feed."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {latest.map((snapshot) => {
                const age = now - new Date(snapshot.capturedAtUtc).getTime();
                const active = snapshot.active || age < ACTIVE_WINDOW_MS;
                return (
                  <li key={`${snapshot.deviceId}-${snapshot.capturedAtUtc}`} className="border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-100">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand-green' : 'bg-slate-600'}`} />
                        <span className="truncate">{snapshot.deviceName || deviceName(snapshot.deviceId)}</span>
                      </p>
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                        {formatRelativeTime(new Date(snapshot.capturedAtUtc).getTime(), now)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
                      <div>
                        <dt className="text-slate-500">open</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-200">{snapshot.connectionCount}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">public</dt>
                        <dd className="mt-0.5 text-sm font-bold text-brand-cyan">{snapshot.publicCount}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">unknown</dt>
                        <dd className={`mt-0.5 text-sm font-bold ${snapshot.unknownCount > 0 ? 'text-rose-300' : 'text-brand-green'}`}>
                          {snapshot.unknownCount}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-white/8 pt-3">
            <p className="hud-label">How it works</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              The agent reads the Windows TCP table for established sessions, resolves the owning process, and strips
              loopback and private LAN addresses. Only internet-facing peers are tracked as destinations.
            </p>
          </div>

          <Link
            to="/dashboard/timeline"
            className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white"
          >
            View event timeline
          </Link>
        </section>
      </div>
    </div>
  );
}

export default NetworkMonitorPage;
