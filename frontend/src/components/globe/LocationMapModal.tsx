import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import EmbeddedMap from './EmbeddedMap';

export type LocationMapTarget = {
  lat: number;
  lon: number;
  label: string;
  critical?: boolean;
  capturedAtUtc?: string;
  source?: string;
  deviceId?: string;
};

function LocationMapModal({
  target,
  onClose,
  onOpenDevice,
  onOpenEvidence
}: {
  target: LocationMapTarget;
  onClose: () => void;
  onOpenDevice?: () => void;
  onOpenEvidence?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const capturedLabel = target.capturedAtUtc ? new Date(target.capturedAtUtc).toLocaleString() : null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Exact location for ${target.label}`}
    >
      <div
        className="holo-panel holo-corner w-full max-w-3xl overflow-hidden bg-[#020906]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-green/15 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-brand-green/80">
              <MapPin size={12} />
              Exact location
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-100">{target.label}</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {target.lat.toFixed(5)}, {target.lon.toFixed(5)}
              {target.source ? ` · ${target.source}` : ''}
              {capturedLabel ? ` · ${capturedLabel}` : ''}
              {target.critical ? ' · reported lost' : ''}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close location map"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/10 text-slate-400 transition hover:border-brand-green/50 hover:text-brand-green"
          >
            <X size={14} />
          </button>
        </div>

        <div className="relative z-0 isolate h-[45vh] min-h-[300px] w-full sm:h-[440px]">
          <EmbeddedMap lat={target.lat} lon={target.lon} label={target.label} zoom={19} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-green/15 px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
            Google Maps · embedded in-app · switch to Console if blocked
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenEvidence ? (
              <button
                type="button"
                onClick={onOpenEvidence}
                className="min-h-[38px] border border-white/15 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-300 transition hover:border-brand-green/50 hover:text-brand-green"
              >
                View evidence
              </button>
            ) : null}
            {onOpenDevice ? (
              <button
                type="button"
                onClick={onOpenDevice}
                className="min-h-[38px] border border-brand-green bg-brand-green/15 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green hover:text-black"
              >
                Open device
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LocationMapModal;
