import { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchDevices, fetchIncidents, loginUser, registerUser } from './api';

type Device = {
  _id?: string;
  deviceId: string;
  name: string;
  operatingSystem: string;
  lastSeen: string;
  securityStatus: string;
};

type Incident = {
  _id?: string;
  deviceId: string;
  incidentType: string;
  threatScore: number;
  severity: string;
  summary: string;
  createdAt: string;
};

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userEmail, setUserEmail] = useState('');
  const [view, setView] = useState<'login' | 'register'>('login');
  const [devices, setDevices] = useState<Device[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setDevices([]);
      setIncidents([]);
      return;
    }

    Promise.all([fetchDevices(token), fetchIncidents(token)])
      .then(([deviceData, incidentData]) => {
        setDevices(deviceData);
        setIncidents(incidentData);
      })
      .catch((error) => {
        setMessage(error.message ?? 'Unable to load dashboard data.');
      });
  }, [token]);

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

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    try {
      const data = await loginUser(email, password);
      handleAuthSuccess(data.token, data.user.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    try {
      const data = await registerUser(email, password);
      handleAuthSuccess(data.token, data.user.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Registration failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setEmail('');
    setPassword('');
    setUserEmail('');
    setView('login');
    setMessage('Signed out successfully.');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-xl shadow-slate-950/20">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold">MalmegaVille Sentinel</h1>
            <p className="mt-2 text-slate-400">Secure your endpoints with device monitoring and incident reporting.</p>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'login' ? 'bg-slate-200 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              onClick={() => setView('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'register' ? 'bg-slate-200 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              onClick={() => setView('register')}
              type="button"
            >
              Register
            </button>
          </div>

          <form onSubmit={view === 'login' ? handleLogin : handleRegister} className="space-y-5">
            <label className="block text-sm font-medium text-slate-300">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500"
              />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                minLength={8}
                required
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-sky-500"
              />
            </label>

            {message ? <p className="text-sm text-rose-400">{message}</p> : null}

            <button
              type="submit"
              className="w-full rounded-2xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              {view === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-3xl bg-slate-900 p-8 shadow-xl shadow-slate-950/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-semibold">MalmegaVille Sentinel</h1>
            <p className="mt-2 text-slate-400">Welcome back, {userEmail || 'security operator'}.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-3xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
              Devices: <span className="font-semibold text-slate-100">{dashboardSummary.totalDevices}</span>
            </div>
            <div className="rounded-3xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
              Incidents: <span className="font-semibold text-slate-100">{dashboardSummary.totalIncidents}</span>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-3xl bg-rose-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-400"
              type="button"
            >
              Logout
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl bg-slate-900 p-6 shadow-lg shadow-slate-950/30">
            <h2 className="text-xl font-semibold">Threat Overview</h2>
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

          <div className="rounded-3xl bg-slate-900 p-6 shadow-lg shadow-slate-950/30 lg:col-span-2">
            <h2 className="text-xl font-semibold">Recent Incidents</h2>
            {incidents.length === 0 ? (
              <p className="mt-4 text-slate-400">No incidents have been recorded yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {incidents.slice(0, 5).map((incident) => (
                  <div key={incident._id ?? incident.summary} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm text-slate-400">{new Date(incident.createdAt).toLocaleString()}</span>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.16em] text-slate-300">
                        {incident.severity}
                      </span>
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
          <div className="rounded-3xl bg-slate-900 p-6 shadow-lg shadow-slate-950/30">
            <h2 className="text-xl font-semibold">Device Inventory</h2>
            {devices.length === 0 ? (
              <p className="mt-4 text-slate-400">No devices registered yet.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {devices.map((device) => (
                  <div key={device._id ?? device.deviceId} className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold text-slate-100">{device.name}</span>
                      <span className="text-sm text-slate-400">{device.operatingSystem}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">Status: {device.securityStatus}</p>
                    <p className="mt-2 text-sm text-slate-400">Last seen: {new Date(device.lastSeen).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-slate-900 p-6 shadow-lg shadow-slate-950/30">
            <h2 className="text-xl font-semibold">Action Center</h2>
            <p className="mt-4 text-slate-300">Use the backend APIs to register devices and post incident reports from your sentinel agents.</p>
            <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400">
              <p>Backend status: <span className="font-semibold text-slate-100">Connected</span></p>
              <p className="mt-3">Connected devices and incident history are visible once your agent posts data to the API.</p>
            </div>
          </div>
        </section>

        {message ? <div className="rounded-3xl border border-rose-500 bg-rose-500/10 p-4 text-sm text-rose-300">{message}</div> : null}
      </div>
    </div>
  );
}

export default App;
