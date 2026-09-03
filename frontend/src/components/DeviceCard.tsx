import { Images, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Device } from '../api';
import StatusBadge from './StatusBadge';

function DeviceCard({
  device,
  pending,
  onToggleLost,
  onViewCaptures,
  onDelete
}: {
  device: Device;
  pending: boolean;
  onToggleLost: (device: Device) => void;
  onViewCaptures: (deviceId: string) => void;
  onDelete: (device: Device) => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-slate-100">{device.name}</span>
        <span className="text-sm text-slate-400">{device.operatingSystem}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge label={device.isLost ? 'Lost / Stolen' : 'Safe'} tone={device.isLost ? 'high' : 'safe'} />
      </div>
      <p className="mt-2 text-sm text-slate-400">Last seen: {new Date(device.lastSeen).toLocaleString()}</p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <button
          onClick={() => onToggleLost(device)}
          disabled={pending}
          type="button"
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
            device.isLost ? 'bg-brand-green text-black hover:bg-white' : 'bg-rose-500 text-black hover:bg-rose-400'
          }`}
        >
          {device.isLost ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
          {device.isLost ? 'Clear Lost Flag' : 'Mark as Lost/Stolen'}
        </button>
        <button
          onClick={() => onViewCaptures(device.deviceId)}
          type="button"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:border-brand-green hover:text-brand-green"
        >
          <Images size={14} />
          View Captures
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Remove "${device.name}" from your device inventory? Its past captures are kept.`)) {
              onDelete(device);
            }
          }}
          type="button"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-400 transition hover:border-rose-500 hover:text-rose-400"
        >
          <Trash2 size={14} />
          Remove
        </button>
      </div>
    </div>
  );
}

export default DeviceCard;
