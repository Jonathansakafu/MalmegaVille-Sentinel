import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { ExternalLink, MapPin, X } from 'lucide-react';

// Vite doesn't resolve Leaflet's default marker image URLs automatically -
// without this the default markers silently render as broken images.
const marker = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

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
  const containerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, { scrollWheelZoom: true }).setView([target.lat, target.lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const pin = L.marker([target.lat, target.lon], { icon: marker }).addTo(map);
    // Build the popup from DOM nodes rather than an HTML string so a device
    // name can never be interpreted as markup.
    const popup = document.createElement('div');
    popup.style.fontFamily = 'inherit';
    const name = document.createElement('strong');
    name.textContent = target.label;
    popup.appendChild(name);
    if (target.critical) {
      const warning = document.createElement('div');
      warning.textContent = 'Reported lost';
      warning.style.color = '#ff1744';
      popup.appendChild(warning);
    }
    pin.bindPopup(popup).openPopup();

    // The dialog animates in, so Leaflet's initial size can be stale.
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
    };
  }, [target.lat, target.lon, target.label, target.critical]);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lon}`;
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
          <div ref={containerRef} className="h-full w-full" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-green/15 px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">
            Street map · OpenStreetMap
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
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-h-[38px] items-center gap-1.5 border border-brand-cyan/40 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-cyan transition hover:bg-brand-cyan/15"
            >
              <ExternalLink size={12} />
              Google Maps
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LocationMapModal;
