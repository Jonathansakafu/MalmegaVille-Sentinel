import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Satellite, Map as MapIcon, Minus, Plus } from 'lucide-react';

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

// Esri's public World Imagery tiles resolve individual buildings at z19 in
// most cities, matching the depth people expect from Google's satellite view.
// Google's tile servers are not used directly (their terms forbid it); the
// Google tab below uses their own embeddable viewer instead.
const ESRI_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';
const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export type EmbeddedMapProvider = 'google' | 'console';
export type EmbeddedMapLayer = 'satellite' | 'street';

type EmbeddedMapProps = {
  lat: number;
  lon: number;
  label: string;
  zoom?: number;
  defaultProvider?: EmbeddedMapProvider;
  showToolbar?: boolean;
  className?: string;
};

// In-app map window. The Google tab is their standard embeddable viewer
// (`output=embed`), so it renders inside the dashboard/WebView and never
// hands the user off to an external Maps app. The console tab is a Leaflet
// fallback painted with Esri imagery, so deep zoom still reaches building
// level on networks where Google frames are blocked.
function EmbeddedMap({
  lat,
  lon,
  label,
  zoom = 19,
  defaultProvider = 'google',
  showToolbar = true,
  className
}: EmbeddedMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<EmbeddedMapProvider>(defaultProvider);
  const [layer, setLayer] = useState<EmbeddedMapLayer>('satellite');
  // Google's embeddable viewer only takes its zoom level from the URL, so
  // zooming means re-issuing the iframe with a new z value (3..20).
  const [googleZoom, setGoogleZoom] = useState(zoom);

  const googleSrc = `https://maps.google.com/maps?q=${lat},${lon}&hl=en&z=${googleZoom}&t=${
    layer === 'satellite' ? 'k' : 'm'
  }&output=embed`;

  useEffect(() => {
    if (provider !== 'console') return;
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, { scrollWheelZoom: true, zoomControl: true, attributionControl: true }).setView(
      [lat, lon],
      zoom
    );
    L.tileLayer(layer === 'satellite' ? ESRI_IMAGERY_URL : OSM_URL, {
      attribution: layer === 'satellite' ? ESRI_ATTRIBUTION : OSM_ATTRIBUTION,
      maxZoom: 19,
      maxNativeZoom: 19
    }).addTo(map);

    const pin = L.marker([lat, lon], { icon: marker }).addTo(map);
    // Built from DOM nodes rather than an HTML string so a device name can
    // never be interpreted as markup.
    const popup = document.createElement('div');
    popup.style.fontFamily = 'inherit';
    const name = document.createElement('strong');
    name.textContent = label;
    popup.appendChild(name);
    const coords = document.createElement('div');
    coords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    coords.style.opacity = '0.7';
    coords.style.fontSize = '11px';
    popup.appendChild(coords);
    pin.bindPopup(popup).openPopup();

    // The pane can animate in or be shown from `display:none`; Leaflet's
    // initial size would otherwise be stale and misplace its tiles.
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
    };
  }, [provider, layer, lat, lon, label, zoom]);

  return (
    <div className={`relative isolate h-full w-full overflow-hidden bg-[#020906] ${className ?? ''}`}>
      {provider === 'google' ? (
        <iframe
          key={`${googleSrc}`}
          src={googleSrc}
          title={`Google Maps view of ${label}`}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      )}

      {showToolbar ? (
        <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1">
          <div className="flex overflow-hidden border border-white/15 bg-black/80 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setProvider('google')}
              aria-pressed={provider === 'google'}
              className={`px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                provider === 'google' ? 'bg-brand-green/20 text-brand-green' : 'text-slate-400 hover:text-white'
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => setProvider('console')}
              aria-pressed={provider === 'console'}
              className={`border-l border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                provider === 'console' ? 'bg-brand-cyan/20 text-brand-cyan' : 'text-slate-400 hover:text-white'
              }`}
            >
              Console
            </button>
          </div>
          <div className="flex overflow-hidden border border-white/15 bg-black/80 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setLayer('satellite')}
              aria-pressed={layer === 'satellite'}
              aria-label="Satellite imagery"
              className={`flex items-center gap-1 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                layer === 'satellite' ? 'bg-brand-green/20 text-brand-green' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Satellite size={10} />
              Sat
            </button>
            <button
              type="button"
              onClick={() => setLayer('street')}
              aria-pressed={layer === 'street'}
              aria-label="Street map"
              className={`flex items-center gap-1 border-l border-white/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                layer === 'street' ? 'bg-brand-green/20 text-brand-green' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapIcon size={10} />
              Map
            </button>
          </div>
          {provider === 'google' ? (
            <div className="flex overflow-hidden border border-white/15 bg-black/80 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setGoogleZoom((value) => Math.max(3, value - 1))}
                aria-label="Zoom out of Google map"
                className="flex h-6 w-7 items-center justify-center text-slate-300 transition hover:bg-white/[0.08] hover:text-brand-green"
              >
                <Minus size={10} />
              </button>
              <span className="flex min-w-[28px] items-center justify-center border-x border-white/15 px-1 font-mono text-[9px] text-slate-400">
                {googleZoom}
              </span>
              <button
                type="button"
                onClick={() => setGoogleZoom((value) => Math.min(20, value + 1))}
                aria-label="Zoom into Google map"
                className="flex h-6 w-7 items-center justify-center text-slate-300 transition hover:bg-white/[0.08] hover:text-brand-green"
              >
                <Plus size={10} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default EmbeddedMap;
