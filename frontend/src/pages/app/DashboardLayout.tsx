import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';
import {
  Capture,
  Device,
  Incident,
  deleteDevice,
  fetchCaptures,
  fetchDevices,
  fetchIncidents,
  setDeviceLostStatus
} from '../../api';
import AppShell from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { sound } from '../../lib/sound';
import type { DashboardContext } from './context';

function DashboardLayout({
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lostStatusPending, setLostStatusPending] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [booting, setBooting] = useState(() => sessionStorage.getItem('sentinel_booted') !== '1');
  const { showAlert } = useAlerts();

  const load = useCallback(
    (activeToken: string) => {
      setLoading(true);
      sound.startLoading();
      Promise.all([fetchDevices(activeToken), fetchIncidents(activeToken), fetchCaptures(activeToken)])
        .then(([deviceData, incidentData, captureData]) => {
          setDevices(deviceData);
          setIncidents(incidentData);
          setCaptures(captureData);
          setError('');
        })
        .catch((loadError) => {
          const message = loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.';
          setError(message);
          showAlert({
            kind: 'denied',
            title: 'ACCESS DENIED',
            message: 'The command center could not load your telemetry.',
            detail: message
          });
        })
        .finally(() => {
          setLoading(false);
          sound.stopLoading();
        });
    },
    [showAlert]
  );

  useEffect(() => {
    load(token);
  }, [token, load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Cinematic first-entry sequence. It is tied to the real fetch above: it can
  // only finish once telemetry has actually resolved (or failed), and the
  // minimum hold is just so the sequence is perceptible on a fast link.
  useEffect(() => {
    if (!booting || loading) return undefined;
    sound.play(error ? 'deny' : 'boot');
    const timer = window.setTimeout(() => {
      setBooting(false);
      sessionStorage.setItem('sentinel_booted', '1');
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [booting, loading, error]);

  const reloadCaptures = useCallback(() => {
    fetchCaptures(token)
      .then(setCaptures)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load captures.'));
  }, [token]);

  const toggleLost = useCallback(
    async (device: Device) => {
      if (!device._id) return;
      setLostStatusPending(device._id);
      try {
        const updated = await setDeviceLostStatus(token, device._id, !device.isLost);
        setDevices((prev) => prev.map((entry) => (entry._id === device._id ? { ...entry, ...updated } : entry)));
        if (updated.isLost) {
          showAlert({
            kind: 'threat',
            title: 'THREAT PROTOCOL ARMED',
            message: `${updated.name} is now flagged lost. Capture and location collection will trigger on its next check-in.`,
            detail: `device: ${updated.deviceId}`
          });
        } else {
          showAlert({
            kind: 'success',
            title: 'ACCESS RESTORED',
            message: `${updated.name} is marked safe. Lost-device collection has stopped.`
          });
        }
      } catch (toggleError) {
        showAlert({
          kind: 'denied',
          title: 'ACCESS DENIED',
          message: 'The device status change was rejected by the server.',
          detail: toggleError instanceof Error ? toggleError.message : undefined
        });
      } finally {
        setLostStatusPending(null);
      }
    },
    [token, showAlert]
  );

  const removeDevice = useCallback(
    async (device: Device) => {
      if (!device._id) return;
      try {
        await deleteDevice(token, device._id);
        setDevices((prev) => prev.filter((entry) => entry._id !== device._id));
        showAlert({
          kind: 'success',
          title: 'DEVICE REMOVED',
          message: `${device.name} was removed from the inventory. Its past captures are kept.`
        });
      } catch (removeError) {
        showAlert({
          kind: 'denied',
          title: 'ACCESS DENIED',
          message: 'The device could not be removed.',
          detail: removeError instanceof Error ? removeError.message : undefined
        });
      }
    },
    [token, showAlert]
  );

  const counters = useMemo(() => {
    const nowMs = now;
    const online = devices.filter((device) => nowMs - new Date(device.lastSeen).getTime() < 10 * 60 * 1000).length;
    const critical = incidents.filter((incident) => ['high', 'critical'].includes(incident.severity.toLowerCase())).length;
    return {
      devices: devices.length,
      online,
      incidents: incidents.length,
      critical,
      captures: captures.length
    };
  }, [devices, incidents, captures, now]);

  const context: DashboardContext = {
    token,
    devices,
    incidents,
    captures,
    loading,
    error,
    reload: () => load(token),
    reloadCaptures,
    toggleLost,
    removeDevice,
    lostStatusPending,
    userEmail,
    username,
    onUsernameChange,
    onLogout
  };

  return (
    <>
      {booting ? <BootOverlay failed={Boolean(error)} /> : null}
      <AppShell counters={counters} username={username} userEmail={userEmail} onLogout={onLogout}>
        <Outlet context={context} />
      </AppShell>
    </>
  );
}

function BootOverlay({ failed }: { failed: boolean }) {
  const lines = [
    '> handshake ................ ok',
    '> operator session ........ authenticated',
    '> telemetry channel ....... encrypted',
    failed ? '> telemetry sync .......... rejected' : '> telemetry sync .......... streaming'
  ];
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[#020604] px-6" role="status" aria-live="polite">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-60" />
      <div className="pointer-events-none absolute inset-0 scan-overlay" />
      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center border border-brand-green/50 bg-brand-green/10 text-brand-green">
          <Shield size={30} />
          <span className="absolute h-16 w-16 animate-pulse-ring border border-brand-green/40" />
        </div>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.34em] text-brand-green/80">MalmegaVille Sentinel</p>
        <h1 className={`mt-2 font-mono text-2xl font-bold tracking-[0.18em] ${failed ? 'text-brand-danger' : 'text-white neon-text'}`}>
          {failed ? 'ACCESS DENIED' : 'ACCESS GRANTED'}
        </h1>
        <div className="terminal mt-6 p-3 text-left font-mono text-[11px] leading-relaxed">
          {lines.map((line, index) => (
            <p key={line} className={line.includes('rejected') ? 'text-rose-300' : 'text-brand-green/90'} style={{ opacity: 0, animation: `flicker 0.4s ease-out ${index * 0.16}s forwards` }}>
              {line}
            </p>
          ))}
          <p className="mt-1 text-brand-green">
            <span className="text-slate-500">sentinel@core:~$</span>
            <span className="ml-1 inline-block h-3 w-1.5 animate-flicker bg-brand-green align-middle" />
          </p>
        </div>
        <div className="mt-5 h-0.5 w-full overflow-hidden bg-white/5">
          <div className={`h-full w-1/3 ${failed ? 'bg-brand-danger' : 'bg-brand-green'} animate-sweep-x`} />
        </div>
      </div>
    </div>
  );
}

export default DashboardLayout;
