import { useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Camera, FileArchive, Images, MapPin } from 'lucide-react';
import CapturesSection from '../../components/CapturesSection';
import { PanelTitle, StatTile } from '../../components/shell/AppShell';
import type { DashboardContext } from './context';

const TYPES = [
  { key: 'all', label: 'All evidence' },
  { key: 'webcam_photo', label: 'Photos' },
  { key: 'location', label: 'Locations' },
  { key: 'usb', label: 'USB files' }
] as const;

type TypeKey = (typeof TYPES)[number]['key'];

function EvidencePage() {
  const { token, devices, captures, reloadCaptures } = useOutletContext<DashboardContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const deviceFilter = searchParams.get('device') ?? undefined;
  const typeFilter = (searchParams.get('type') as TypeKey | null) ?? 'all';

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const byDevice = deviceFilter ? captures.filter((capture) => capture.deviceId === deviceFilter) : captures;
    if (typeFilter === 'all') return byDevice;
    if (typeFilter === 'usb') {
      return byDevice.filter((capture) => capture.captureType === 'usb_file' || capture.captureType === 'usb_manifest');
    }
    return byDevice.filter((capture) => capture.captureType === typeFilter);
  }, [captures, deviceFilter, typeFilter]);

  const counts = useMemo(() => {
    const scoped = deviceFilter ? captures.filter((capture) => capture.deviceId === deviceFilter) : captures;
    return {
      photos: scoped.filter((capture) => capture.captureType === 'webcam_photo').length,
      locations: scoped.filter((capture) => capture.captureType === 'location').length,
      usb: scoped.filter((capture) => capture.captureType === 'usb_file' || capture.captureType === 'usb_manifest').length
    };
  }, [captures, deviceFilter]);

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Evidence locker</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Captured evidence</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Photos, location fixes, and USB file copies collected by your agents. Open any item for the full record and map.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Photos" value={counts.photos} icon={Camera} tone="green" hint="Webcam captures" />
        <StatTile label="Locations" value={counts.locations} icon={MapPin} tone="cyan" hint="Position fixes" />
        <StatTile label="USB files" value={counts.usb} icon={FileArchive} tone="amber" hint="Copied or skipped" />
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5">
        <PanelTitle
          icon={Images}
          title="Locker contents"
          action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{visible.length} records</span>}
        />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((type) => (
              <button
                key={type.key}
                type="button"
                onClick={() => setParam('type', type.key === 'all' ? undefined : type.key)}
                className={`min-h-[34px] border px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${
                  typeFilter === type.key
                    ? 'border-brand-green/50 bg-brand-green/15 text-brand-green'
                    : 'border-white/10 text-slate-400 hover:border-brand-green/30 hover:text-slate-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <select
            value={deviceFilter ?? ''}
            onChange={(event) => setParam('device', event.target.value || undefined)}
            className="min-h-[38px] border border-brand-green/20 bg-black/40 px-2 font-mono text-[11px] text-slate-200 outline-none focus:border-brand-green/60"
          >
            <option value="">All devices</option>
            {devices.map((device) => (
              <option key={device._id ?? device.deviceId} value={device.deviceId}>
                {device.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-600">
          {deviceFilter ? `scope: ${devices.find((d) => d.deviceId === deviceFilter)?.name ?? deviceFilter}` : 'scope: every agent'}
        </p>
      </section>

      <CapturesSection
        captures={visible}
        devices={devices}
        token={token}
        hideDeviceFilter
        onCaptureDeleted={() => reloadCaptures()}
      />
    </div>
  );
}

export default EvidencePage;
