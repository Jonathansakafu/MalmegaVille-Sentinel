import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ShieldQuestion, LayoutGrid } from 'lucide-react';
import { Capture, Device, Incident, fetchCaptures, fetchDevices, fetchIncidents, setDeviceLostStatus } from './api';
import AuthCard from './components/AuthCard';
import Header, { TabKey } from './components/Header';
import DeviceCard from './components/DeviceCard';
import CapturesSection from './components/CapturesSection';
import SettingsPanel from './components/SettingsPanel';
import Spinner from './components/Spinner';
import StatusBadge from './components/StatusBadge';

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userEmail, setUserEmail] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [devices, setDevices] = useState<Device[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [capturesDeviceFilter, setCapturesDeviceFilter] = useState<string | undefined>(undefined);
  const [lostStatusPending, setLostStatusPending] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setDevices([]);
      setIncidents([]);
      return;
    }

    setDashboardLoading(true);
    Promise.all([fetchDevices(token), fetchIncidents(token)])
      .then(([deviceData, incidentData]) => {
        setDevices(deviceData);
        setIncidents(incidentData);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : 'Unable to load dashboard data.');
      })
      .finally(() => setDashboardLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || activeTab !== 'captures') {
      return;
    }

    fetchCaptures(token, capturesDeviceFilter)
      .then(setCaptures)
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load captures.'));
  }, [token, activeTab, capturesDeviceFilter]);

  const handleToggleLost = async (device: Device) => {
    if (!token || !device._id) {
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
      highSeverityIncidents: incidents.filter((incident) => incident.severity.toLowerCase() === 'high').length
    }),
    [devices, incidents]
  );

  const handleAuthSuccess = (authToken: string, emailAddress: string) => {
    localStorage.setItem('token', authToken);
    setToken(authToken);
    setUserEmail(emailAddress);
    setMessage('');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUserEmail('');
    setActiveTab('dashboard');
    setMessage('Signed out successfully.');
  };

  if (!token) {
    return <AuthCard onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <Header
          userEmail={userEmail}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          totalDevices={dashboardSummary.totalDevices}
          totalIncidents={dashboardSummary.totalIncidents}
          onLogout={handleLogout}
        />

        {activeTab === 'captures' ? (
          <CapturesSection
            captures={captures}
            devices={devices}
            token={token}
            deviceFilter={capturesDeviceFilter}
            onDeviceFilterChange={setCapturesDeviceFilter}
          />
        ) : activeTab === 'settings' ? (
          <SettingsPanel token={token} />
        ) : dashboardLoading ? (
          <div className="rounded-3xl bg-brand-panel p-6 shadow-lg shadow-black/30 sm:p-10">
            <Spinner label="Loading dashboard data..." />
          </div>
        ) : (
          <>
            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <Activity size={18} className="text-brand-green" />
                  Threat Overview
                </h2>
                <p className="mt-4 text-slate-300">Track devices and incidents for your personal endpoint security network.</p>
                <div className="mt-6 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between rounded-2xl bg-slate-950/50 p-4">
                    <span>Total devices</span>
                    <span className="font-semibold text-slate-100">{dashboardSummary.totalDevices}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-950/50 p-4">
                    <span>Total incidents</span>
                    <span className="font-semibold text-slate-100">{dashboardSummary.totalIncidents}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-950/50 p-4">
                    <span>High severity</span>
                    <span className="font-semibold text-slate-100">{dashboardSummary.highSeverityIncidents}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6 lg:col-span-2">
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <AlertTriangle size={18} className="text-brand-green" />
                  Recent Incidents
                </h2>
                {incidents.length === 0 ? (
                  <p className="mt-4 text-slate-400">No incidents have been recorded yet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {incidents.slice(0, 5).map((incident) => (
                      <div key={incident._id ?? incident.summary} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="text-sm text-slate-400">{new Date(incident.createdAt).toLocaleString()}</span>
                          <StatusBadge
                            label={incident.severity}
                            tone={incident.severity.toLowerCase() === 'high' ? 'danger' : incident.severity.toLowerCase() === 'informational' ? 'neutral' : 'warning'}
                          />
                        </div>
                        <h3 className="mt-3 text-lg font-semibold text-slate-100">{incident.summary}</h3>
                        <p className="mt-2 text-sm text-slate-300">Device: {incident.deviceId}</p>
                        <p className="mt-2 text-sm text-slate-300">Threat score: {incident.threatScore}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
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

export default App;
