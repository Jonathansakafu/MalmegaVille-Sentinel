import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldQuestion, ShieldAlert, RefreshCw, LayoutGrid } from 'lucide-react';
import { Capture, Device, Incident, fetchCaptures, fetchDevices, fetchIncidents, setDeviceLostStatus } from '../api';
import Header, { TabKey } from '../components/Header';
import DeviceCard from '../components/DeviceCard';
import CapturesSection from '../components/CapturesSection';
import SettingsPanel from '../components/SettingsPanel';
import Spinner from '../components/Spinner';
import StatusBadge, { severityTone } from '../components/StatusBadge';
import StatCard from '../components/StatCard';

function formatRelativeTime(fromMs: number, nowMs: number): string {
  const diffSeconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function DashboardPage({
  token,
  userEmail,
  username,
  onUsernameChange,
  onLogout
}: {
  token: string;
  userEmail: string;
  username: string;
  onUsernameChange: (username: string) => void;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [capturesDeviceFilter, setCapturesDeviceFilter] = useState<string | undefined>(undefined);
  const [lostStatusPending, setLostStatusPending] = useState<string | null>(null);
  const [showAllIncidents, setShowAllIncidents] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const devicesSectionRef = useRef<HTMLDivElement>(null);
  const incidentsSectionRef = useRef<HTMLDivElement>(null);

  const loadDashboardData = (activeToken: string) => {
    setDashboardLoading(true);
    Promise.all([fetchDevices(activeToken), fetchIncidents(activeToken)])
      .then(([deviceData, incidentData]) => {
        setDevices(deviceData);
        setIncidents(incidentData);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      })
      .finally(() => setDashboardLoading(false));
  };

  useEffect(() => {
    loadDashboardData(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Ticks every few seconds purely to force a re-render so the "Last Sync"
  // stat's relative time (e.g. "14s ago") stays live without a data refetch.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab !== 'captures') {
      return;
    }

    fetchCaptures(token, capturesDeviceFilter)
      .then(setCaptures)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load captures.'));
  }, [token, activeTab, capturesDeviceFilter]);

  const handleToggleLost = async (device: Device) => {
    if (!device._id) {
      return;
    }

    setLostStatusPending(device._id);
    try {
      const updated = await setDeviceLostStatus(token, device._id, !device.isLost);
      setDevices((prev) => prev.map((d) => (d._id === device._id ? { ...d, ...updated } : d)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update device status.');
    } finally {
      setLostStatusPending(null);
    }
  };

  const openCapturesForDevice = (deviceId?: string) => {
    setCapturesDeviceFilter(deviceId);
    setActiveTab('captures');
  };

  const dashboardSummary = useMemo(
    () => ({
      totalDevices: devices.length,
      totalIncidents: incidents.length,
      highSeverityIncidents: incidents.filter((incident) =>
        ['high', 'critical'].includes(incident.severity.toLowerCase())
      ).length
    }),
    [devices, incidents]
  );

  const lastSyncAtMs = useMemo(() => {
    if (devices.length === 0) return undefined;
    return devices.reduce((latest, device) => Math.max(latest, new Date(device.lastSeen).getTime()), 0);
  }, [devices]);

  const lastSyncLabel = lastSyncAtMs ? formatRelativeTime(lastSyncAtMs, now) : 'No data';

  const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <Header userEmail={userEmail} username={username} activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout} />

        {activeTab === 'captures' ? (
          <CapturesSection
            captures={captures}
            devices={devices}
            token={token}
            deviceFilter={capturesDeviceFilter}
            onDeviceFilterChange={setCapturesDeviceFilter}
            onCaptureDeleted={(id) => setCaptures((prev) => prev.filter((c) => (c._id ?? c.id) !== id))}
          />
        ) : activeTab === 'settings' ? (
          <SettingsPanel token={token} username={username} onUsernameChange={onUsernameChange} />
        ) : dashboardLoading ? (
          <div className="rounded-3xl bg-brand-panel p-6 shadow-lg shadow-black/30 sm:p-10">
            <Spinner label="Loading dashboard data..." />
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-white">Security Overview</h2>
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-green">
                  <span className="h-2 w-2 rounded-full bg-brand-green animate-pulse" />
                  System Online
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard
                  label="Devices"
                  value={dashboardSummary.totalDevices}
                  icon={ShieldQuestion}
                  accent="sky"
                  onClick={() => scrollToSection(devicesSectionRef)}
                />
                <StatCard
                  label="Incidents"
                  value={dashboardSummary.totalIncidents}
                  icon={AlertTriangle}
                  accent="amber"
                  onClick={() => scrollToSection(incidentsSectionRef)}
                />
                <StatCard
                  label="High Risk"
                  value={dashboardSummary.highSeverityIncidents}
                  icon={ShieldAlert}
                  accent="rose"
                  pulse={dashboardSummary.highSeverityIncidents > 0}
                  onClick={() => scrollToSection(incidentsSectionRef)}
                />
                <StatCard
                  label="Last Sync"
                  value={lastSyncLabel}
                  icon={RefreshCw}
                  accent="green"
                  onClick={() => loadDashboardData(token)}
                />
              </div>
            </section>

            <section ref={incidentsSectionRef} className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <AlertTriangle size={18} className="text-brand-green" />
                  Recent Incidents
                </h2>
                {incidents.length > 5 ? (
                  <button
                    onClick={() => setShowAllIncidents((show) => !show)}
                    type="button"
                    className="text-sm font-semibold text-brand-green transition hover:text-white"
                  >
                    {showAllIncidents ? 'Show less' : 'View all →'}
                  </button>
                ) : null}
              </div>
              {incidents.length === 0 ? (
                <p className="mt-4 text-slate-400">No incidents have been recorded yet.</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {(showAllIncidents ? incidents : incidents.slice(0, 5)).map((incident) => (
                    <div key={incident._id ?? incident.summary} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-slate-400">{new Date(incident.createdAt).toLocaleString()}</span>
                        <StatusBadge label={incident.severity} tone={severityTone(incident.severity)} />
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-100">{incident.summary}</h3>
                      <p className="mt-2 break-all text-sm text-slate-300">Device: {incident.deviceId}</p>
                      <p className="mt-2 text-sm text-slate-300">Threat score: {incident.threatScore}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div ref={devicesSectionRef} className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <ShieldQuestion size={18} className="text-brand-green" />
                  Device Inventory
                </h2>
                {devices.length === 0 ? (
                  <p className="mt-4 text-slate-400">No devices registered yet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {devices.map((device) => (
                      <DeviceCard
                        key={device._id ?? device.deviceId}
                        device={device}
                        pending={lostStatusPending === device._id}
                        onToggleLost={handleToggleLost}
                        onViewCaptures={openCapturesForDevice}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <LayoutGrid size={18} className="text-brand-green" />
                  Action Center
                </h2>
                <p className="mt-4 text-slate-300">Use the backend APIs to register devices and post incident reports from your sentinel agents.</p>
                <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400">
                  <p>
                    Backend status: <span className="font-semibold text-brand-green">Connected</span>
                  </p>
                  <p className="mt-3">Connected devices and incident history are visible once your agent posts data to the API.</p>
                </div>
              </div>
            </section>
          </>
        )}

        {message ? <div className="rounded-3xl border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-300">{message}</div> : null}
      </div>
    </div>
  );
}

export default DashboardPage;
