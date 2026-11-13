import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ArrowRight, Check, Plug, Plus, ShieldCheck, Trash2, Usb } from 'lucide-react';
import {
  TrustedUsbDevice,
  UnrecognizedUsbEvent,
  addTrustedUsbDevice,
  fetchTrustedUsbDevices,
  fetchUnrecognizedUsbEvents,
  removeTrustedUsbDevice
} from '../../api';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { formatRelativeTime } from './format';
import type { DashboardContext } from './context';

function UsbPage() {
  const { token, devices, captures } = useOutletContext<DashboardContext>();
  const navigate = useNavigate();
  const { showAlert } = useAlerts();
  const [trusted, setTrusted] = useState<TrustedUsbDevice[]>([]);
  const [unrecognized, setUnrecognized] = useState<UnrecognizedUsbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [manualId, setManualId] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const now = Date.now();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetchTrustedUsbDevices(token), fetchUnrecognizedUsbEvents(token)])
      .then(([trustedDevices, events]) => {
        setTrusted(trustedDevices);
        setUnrecognized(events);
        setError('');
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load USB intelligence.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  const trust = async (identifier: string, label: string, pendingKey: string) => {
    if (!label.trim()) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'Name the device before marking it trusted.' });
      return;
    }
    setBusy(pendingKey);
    try {
      await addTrustedUsbDevice(token, identifier, label.trim());
      showAlert({ kind: 'success', title: 'DEVICE TRUSTED', message: `${label.trim()} will no longer raise a USB alert.` });
      load();
    } catch (trustError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The device could not be trusted.',
        detail: trustError instanceof Error ? trustError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  const untrust = async (device: TrustedUsbDevice) => {
    const id = device._id ?? device.id;
    if (!id) return;
    setBusy(device.identifier);
    try {
      await removeTrustedUsbDevice(token, id);
      showAlert({ kind: 'success', title: 'TRUST REVOKED', message: `${device.label} will alert again on insertion.` });
      load();
    } catch (removeError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The trusted device could not be removed.',
        detail: removeError instanceof Error ? removeError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  const usbCaptures = useMemo(
    () => captures.filter((capture) => capture.captureType === 'usb_file' || capture.captureType === 'usb_manifest'),
    [captures]
  );
  const usbSessions = useMemo(() => {
    const sessions = new Set<string>();
    for (const capture of usbCaptures) sessions.add(capture.sessionId ?? `${capture.deviceId}-${capture.capturedAtUtc.slice(0, 16)}`);
    return sessions.size;
  }, [usbCaptures]);

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Physical access</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">USB intelligence</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Known drives stay silent. Everything else raises an alert and is logged with the files copied from it.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Trusted devices"
          value={trusted.length}
          icon={ShieldCheck}
          tone="green"
          hint="Silent on insert"
          onClick={() => document.getElementById('trusted-devices')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
        <StatTile
          label="Unknown drives seen"
          value={unrecognized.length}
          icon={Plug}
          tone={unrecognized.length > 0 ? 'danger' : 'cyan'}
          hint="Recent alerts"
          onClick={() => document.getElementById('unknown-drives')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
        <StatTile
          label="USB sessions"
          value={usbSessions}
          icon={Usb}
          tone="cyan"
          hint="Captured insertions"
          onClick={() => navigate('/dashboard/evidence?type=usb')}
        />
        <StatTile
          label="Files captured"
          value={usbCaptures.length}
          icon={Usb}
          tone="amber"
          hint={`Across ${devices.length} agents`}
          onClick={() => navigate('/dashboard/evidence?type=usb')}
        />
      </div>

      {error ? (
        <div className="border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm text-rose-200">{error}</div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section id="unknown-drives" className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
          <PanelTitle
            icon={Plug}
            title="Alerted, not yet trusted"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{unrecognized.length} pending</span>}
          />
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1].map((row) => (
                <div key={row} className="h-20 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : unrecognized.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No unknown drives" message="Drives that trigger an alert before you trust them will appear here." />
          ) : (
            <ul className="mt-4 space-y-2.5">
              {unrecognized.map((event) => (
                <li key={`${event.deviceName}-${event.timestampUtc}`} className="border border-brand-amber/25 bg-brand-amber/[0.04] p-3.5">
                  <p className="break-all font-mono text-[10px] text-slate-500">{event.deviceName}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-100">{event.description}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {formatRelativeTime(new Date(event.timestampUtc).getTime(), now)}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={drafts[event.deviceName] ?? ''}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [event.deviceName]: e.target.value }))}
                      placeholder="Name this drive"
                      className="min-h-[38px] flex-1 border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
                    />
                    <button
                      type="button"
                      disabled={busy === event.deviceName}
                      onClick={() => trust(event.deviceName, drafts[event.deviceName] ?? '', event.deviceName)}
                      className="flex min-h-[38px] items-center justify-center gap-1.5 border border-brand-green/40 bg-brand-green/10 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/20 disabled:opacity-40"
                    >
                      <ShieldCheck size={13} /> Trust
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="trusted-devices" className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
          <PanelTitle
            icon={ShieldCheck}
            title="Trusted devices"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{trusted.length} approved</span>}
          />
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1].map((row) => (
                <div key={row} className="h-14 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : trusted.length === 0 ? (
            <EmptyState icon={Usb} title="No trusted drives" message="Trust a drive from an alert, or add one manually below." />
          ) : (
            <ul className="mt-4 space-y-2">
              {trusted.map((device) => (
                <li key={device._id ?? device.id ?? device.identifier} className="flex items-center justify-between gap-3 border border-white/8 bg-white/[0.02] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{device.label}</p>
                    <p className="truncate font-mono text-[10px] text-slate-500">{device.identifier}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy === device.identifier}
                    onClick={() => untrust(device)}
                    className="flex min-h-[34px] shrink-0 items-center gap-1.5 border border-white/10 px-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400 transition hover:border-brand-danger/50 hover:text-rose-300 disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-white/8 pt-4">
            <p className="hud-label">Add manually</p>
            <div className="mt-2 flex flex-col gap-2">
              <input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Name"
                className="min-h-[38px] border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
              />
              <input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Device identifier (from alert email)"
                className="min-h-[38px] border border-white/10 bg-black/40 px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-brand-green/60"
              />
              <button
                type="button"
                disabled={!manualId.trim() || !manualLabel.trim() || busy === manualId.trim()}
                onClick={async () => {
                  await trust(manualId.trim(), manualLabel, manualId.trim());
                  setManualId('');
                  setManualLabel('');
                }}
                className="flex min-h-[38px] items-center justify-center gap-1.5 border border-brand-green/40 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-brand-green transition hover:bg-brand-green/10 disabled:opacity-40"
              >
                <Plus size={13} /> Add trusted device
              </button>
            </div>
          </div>
        </section>
      </div>

      <section className="holo-panel p-4 sm:p-5 min-w-0">
        <PanelTitle
          icon={Usb}
          title="Captured from USB"
          action={
            <Link to="/dashboard/evidence" className="font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white">
              Open evidence
            </Link>
          }
        />
        {usbCaptures.length === 0 ? (
          <EmptyState icon={Usb} title="No USB files captured" message="When a drive is inserted while a device is flagged lost, copied files are listed in Evidence." />
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {usbCaptures.slice(0, 8).map((capture) => (
              <li key={capture._id ?? capture.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{capture.originalFileName ?? 'Unknown file'}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                    {capture.deviceId} · {formatRelativeTime(new Date(capture.capturedAtUtc).getTime(), now)}
                  </p>
                </div>
                <span
                  className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${
                    capture.skipped ? 'border-white/10 text-slate-500' : 'border-brand-green/30 text-brand-green'
                  }`}
                >
                  {capture.skipped ? `skipped · ${capture.skipReason ?? 'unknown'}` : 'captured'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/dashboard/evidence"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white"
        >
          All evidence <ArrowRight size={11} />
        </Link>
      </section>
    </div>
  );
}

export default UsbPage;
