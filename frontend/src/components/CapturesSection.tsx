import { useEffect, useRef, useState } from 'react';
import { Camera, MapPin, FileArchive, Download, X, Navigation, Trash2 } from 'lucide-react';
import { Capture, Device, ReverseGeocodeResult, fetchCaptureBlobUrl, reverseGeocode, deleteCapture } from '../api';
import StatusBadge from './StatusBadge';
import RouteMap, { RouteOption, fetchRouteOptions } from './RouteMap';

// Finds the location capture from the same device closest in time to a given
// capture, so a photo card can show "captured near <street>" without the
// event stream having to bundle photo+location together itself.
function findNearestLocation(target: Capture, allCaptures: Capture[]): Capture | undefined {
  const targetTime = new Date(target.capturedAtUtc).getTime();
  return allCaptures
    .filter((c) => c.captureType === 'location' && c.deviceId === target.deviceId)
    .reduce<{ capture: Capture; diff: number } | undefined>((closest, candidate) => {
      const diff = Math.abs(new Date(candidate.capturedAtUtc).getTime() - targetTime);
      if (!closest || diff < closest.diff) return { capture: candidate, diff };
      return closest;
    }, undefined)?.capture;
}

// Groups usb_file/usb_manifest captures by their sessionId (one per physical
// USB drive insertion), sorted newest session first, so files from different
// plug-ins never appear mixed together in one flat list.
function groupFilesBySession(files: Capture[]): { sessionId: string; deviceId: string; capturedAtUtc: string; files: Capture[] }[] {
  const groups = new Map<string, Capture[]>();
  for (const file of files) {
    const key = file.sessionId ?? `${file.deviceId}-${file._id ?? file.id}`;
    const existing = groups.get(key);
    if (existing) existing.push(file);
    else groups.set(key, [file]);
  }

  return Array.from(groups.entries())
    .map(([sessionId, groupFiles]) => {
      const earliest = groupFiles.reduce((min, f) => (f.capturedAtUtc < min ? f.capturedAtUtc : min), groupFiles[0].capturedAtUtc);
      return { sessionId, deviceId: groupFiles[0].deviceId, capturedAtUtc: earliest, files: groupFiles };
    })
    .sort((a, b) => new Date(b.capturedAtUtc).getTime() - new Date(a.capturedAtUtc).getTime());
}

// Distance + compass direction from the viewer's current position to the
// capture, computed entirely client-side (Haversine + initial bearing) so no
// Google Maps API key (or leaving the app) is needed for "how far and which
// way" - the actual thing being asked for, versus turn-by-turn navigation.
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingCompass(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  return `${directions[Math.round(degrees / 45) % 8]} (${Math.round(degrees)}°)`;
}

// Recalculating routes is a network call, so it's only re-triggered once the
// live position has moved meaningfully - otherwise every GPS tick (which can
// jitter by tens of meters even standing still) would hammer the routing API.
const ROUTE_REFETCH_THRESHOLD_KM = 0.15;

function LiveTracker({
  targetLat,
  targetLon,
  onOriginChange,
  onRoutesChange
}: {
  targetLat: number;
  targetLon: number;
  onOriginChange: (origin: { lat: number; lon: number } | null) => void;
  onRoutesChange: (routes: RouteOption[]) => void;
}) {
  const [tracking, setTracking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'locating' | 'error'>('idle');
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<{ lat: number; lon: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastRouteFetchPosRef = useRef<{ lat: number; lon: number } | null>(null);

  const handlePosition = (position: GeolocationPosition) => {
    const point = { lat: position.coords.latitude, lon: position.coords.longitude };
    setCurrent(point);
    onOriginChange(point);
    setStatus('idle');

    const last = lastRouteFetchPosRef.current;
    const moved = !last || haversineDistanceKm(last.lat, last.lon, point.lat, point.lon) > ROUTE_REFETCH_THRESHOLD_KM;
    if (moved) {
      lastRouteFetchPosRef.current = point;
      fetchRouteOptions(point.lat, point.lon, targetLat, targetLon).then(onRoutesChange);
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError("This browser doesn't support location.");
      return;
    }
    setStatus('locating');
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (err) => {
        setStatus('error');
        setError(err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get your location.');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    setTracking(true);
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
    setCurrent(null);
    lastRouteFetchPosRef.current = null;
    onOriginChange(null);
    onRoutesChange([]);
  };

  // Stop the GPS watch if the modal closes without an explicit "Stop" click.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const live = current
    ? {
        distanceKm: haversineDistanceKm(current.lat, current.lon, targetLat, targetLon),
        direction: bearingCompass(current.lat, current.lon, targetLat, targetLon)
      }
    : null;

  return (
    <div className="mt-3">
      <button
        onClick={tracking ? stopTracking : startTracking}
        disabled={status === 'locating' && !tracking}
        type="button"
        className={`flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
          tracking
            ? 'border-rose-500/60 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
            : 'border-slate-700 bg-slate-900 text-brand-green hover:border-brand-green'
        }`}
      >
        <Navigation size={14} className={tracking ? 'animate-pulse' : ''} />
        {tracking ? 'Stop live tracking' : status === 'locating' ? 'Finding your location…' : 'Track my location live'}
      </button>
      {live ? (
        <p className="mt-2 text-center text-sm text-slate-200">
          {live.distanceKm < 1 ? `${Math.round(live.distanceKm * 1000)} m` : `${live.distanceKm.toFixed(1)} km`} away, heading {live.direction}
        </p>
      ) : null}
      {status === 'error' ? <p className="mt-2 text-center text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}

function LocationSummary({ location, token }: { location: Capture; token: string }) {
  const meta = location.metadata ?? {};
  const lat = meta.latitude as number | undefined;
  const lon = meta.longitude as number | undefined;
  const [place, setPlace] = useState<ReverseGeocodeResult | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  useEffect(() => {
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    reverseGeocode(token, lat, lon)
      .then(setPlace)
      .catch(() => setPlace(null));
  }, [lat, lon, token]);

  const handleRoutesChange = (nextRoutes: RouteOption[]) => {
    setRoutes(nextRoutes);
    setSelectedRouteIndex(0);
  };

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return <p className="text-sm text-slate-500">Location unavailable for this attempt.</p>;
  }

  return (
    <div>
      <p className="text-sm text-slate-200">{place?.label ?? 'Resolving nearby street…'}</p>
      <p className="mt-1 text-xs text-slate-500">
        {lat.toFixed(5)}, {lon.toFixed(5)}
        {meta.source ? ` · ${String(meta.source) === 'wifi' ? 'Wi-Fi positioning' : 'Approximate (IP-based)'}` : ''}
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800">
        <RouteMap
          targetLat={lat}
          targetLon={lon}
          origin={origin}
          routes={routes}
          selectedRouteIndex={selectedRouteIndex}
          onSelectRoute={setSelectedRouteIndex}
        />
      </div>

      {routes.length > 1 ? (
        <div className="mt-3 space-y-2">
          {routes.map((route, index) => (
            <button
              key={index}
              onClick={() => setSelectedRouteIndex(index)}
              type="button"
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm transition ${
                index === selectedRouteIndex
                  ? 'border-brand-green bg-brand-green/10 text-brand-green'
                  : 'border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700'
              }`}
            >
              <span>Route {index + 1}</span>
              <span>
                {route.distanceKm.toFixed(1)} km · {Math.round(route.durationMin)} min
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <LiveTracker targetLat={lat} targetLon={lon} onOriginChange={setOrigin} onRoutesChange={handleRoutesChange} />
    </div>
  );
}

function CaptureDeleteButton({
  captureId,
  token,
  label = 'Delete',
  onDeleted
}: {
  captureId: string;
  token: string;
  label?: string;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm('Delete this capture permanently? This cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      await deleteCapture(token, captureId);
      onDeleted(captureId);
    } catch {
      // Best effort - leaves the item in place if it fails, no separate error UI needed here.
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      type="button"
      className="flex items-center gap-1 text-rose-400 transition hover:text-rose-300 disabled:opacity-50"
    >
      <Trash2 size={14} />
      {deleting ? 'Deleting…' : label}
    </button>
  );
}

function CaptureDetailModal({
  capture,
  imageUrl,
  nearestLocation,
  token,
  onClose,
  onDeleted
}: {
  capture: Capture;
  imageUrl: string | null;
  nearestLocation?: Capture;
  token: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const captureId = capture._id ?? capture.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-800 bg-brand-panel p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Capture details</h3>
          <div className="flex items-center gap-3">
            {captureId ? (
              <CaptureDeleteButton
                captureId={captureId}
                token={token}
                onDeleted={(id) => {
                  onDeleted(id);
                  onClose();
                }}
              />
            ) : null}
            <button onClick={onClose} type="button" className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {imageUrl ? (
          <img src={imageUrl} alt="Captured" className="mt-4 w-full rounded-2xl border border-slate-800 object-cover" />
        ) : null}

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Captured</dt>
            <dd className="text-slate-200">{new Date(capture.capturedAtUtc).toLocaleString()}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Device</dt>
            <dd className="text-slate-200">{capture.deviceId}</dd>
          </div>
          {capture.triggerEvent ? (
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Trigger</dt>
              <dd className="text-slate-200">{capture.triggerEvent === 'usb_insert' ? 'USB drive inserted' : 'Screen unlocked'}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 border-t border-slate-800 pt-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <MapPin size={14} className="text-brand-green" />
            Location at time of capture
          </p>
          {nearestLocation ? (
            <LocationSummary location={nearestLocation} token={token} />
          ) : (
            <p className="text-sm text-slate-500">No location was captured around this time.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CapturesSection({
  captures,
  devices,
  token,
  deviceFilter,
  onDeviceFilterChange,
  onCaptureDeleted
}: {
  captures: Capture[];
  devices: Device[];
  token: string;
  deviceFilter?: string;
  onDeviceFilterChange: (deviceId: string | undefined) => void;
  onCaptureDeleted: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Capture | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const photos = captures.filter((c) => c.captureType === 'webcam_photo');
  const locations = captures.filter((c) => c.captureType === 'location');
  const files = captures.filter((c) => c.captureType === 'usb_file' || c.captureType === 'usb_manifest');

  useEffect(() => {
    if (!selected) {
      setSelectedUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    const id = selected._id ?? selected.id;
    if (selected.captureType === 'webcam_photo' && id) {
      fetchCaptureBlobUrl(token, id)
        .then((blobUrl) => {
          objectUrl = blobUrl;
          setSelectedUrl(blobUrl);
        })
        .catch(() => setSelectedUrl(null));
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected, token]);

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Captures</h2>
          <select
            value={deviceFilter ?? ''}
            onChange={(event) => onDeviceFilterChange(event.target.value || undefined)}
            className="min-h-[44px] w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 sm:w-auto"
          >
            <option value="">All devices</option>
            {devices.map((device) => (
              <option key={device._id ?? device.deviceId} value={device.deviceId}>
                {device.name}
              </option>
            ))}
          </select>
        </div>
        {captures.length === 0 ? <p className="mt-4 text-slate-400">No captures recorded yet.</p> : null}
      </div>

      {photos.length > 0 ? (
        <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Camera size={18} className="text-brand-green" />
            Photos
          </h3>
          <p className="mt-1 text-xs text-slate-500">Tap a photo to see the full image, device, and location it was captured at.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <CapturePhoto key={photo._id ?? photo.id} capture={photo} token={token} onSelect={() => setSelected(photo)} />
            ))}
          </div>
        </div>
      ) : null}

      {locations.length > 0 ? (
        <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <MapPin size={18} className="text-brand-green" />
            Locations
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {locations.map((location) => (
              <button
                key={location._id ?? location.id}
                type="button"
                onClick={() => setSelected(location)}
                className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-left text-sm text-slate-300 transition hover:border-brand-green"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-slate-400">{new Date(location.capturedAtUtc).toLocaleString()}</span>
                  <StatusBadge label={String((location.metadata ?? {}).source ?? 'unknown')} tone="neutral" />
                </div>
                <p className="mt-2 text-brand-green">View location →</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FileArchive size={18} className="text-brand-green" />
            USB Files
          </h3>
          <p className="mt-1 text-xs text-slate-500">Grouped by USB drive insertion - each group is one plug-in session, not mixed together.</p>

          <div className="mt-4 space-y-5">
            {groupFilesBySession(files).map((group) => (
              <div key={group.sessionId} className="rounded-2xl border border-slate-800 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <span className="text-sm font-semibold text-slate-200">{new Date(group.capturedAtUtc).toLocaleString()}</span>
                  <span className="text-xs text-slate-500">
                    {group.files.length} file{group.files.length === 1 ? '' : 's'} · {group.deviceId}
                  </span>
                </div>

                {/* Card layout below sm - a horizontally-scrolling table is a poor touch-UX pattern on phones. */}
                <div className="mt-3 space-y-3 sm:hidden">
                  {group.files.map((file) => (
                    <div key={file._id ?? file.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm">
                      <p className="break-all font-semibold text-slate-100">{file.originalFileName ?? 'Unknown'}</p>
                      {file.originalPath ? <p className="mt-1 break-all text-xs text-slate-400">{file.originalPath}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-slate-400">
                          {file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(1)} KB` : '—'} ·{' '}
                          {file.skipped ? `Skipped (${file.skipReason ?? 'unknown'})` : 'Copied'}
                        </span>
                        <div className="flex items-center gap-3">
                          {!file.skipped && (file._id ?? file.id) ? (
                            <CaptureDownloadLink captureId={(file._id ?? file.id) as string} token={token} fileName={file.originalFileName} />
                          ) : null}
                          {file._id ?? file.id ? (
                            <CaptureDeleteButton captureId={(file._id ?? file.id) as string} token={token} onDeleted={onCaptureDeleted} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="pb-2 pr-4">File</th>
                        <th className="pb-2 pr-4">Path</th>
                        <th className="pb-2 pr-4">Size</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Content</th>
                        <th className="pb-2">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.files.map((file) => (
                        <tr key={file._id ?? file.id} className="border-t border-slate-800">
                          <td className="py-2 pr-4">{file.originalFileName ?? 'Unknown'}</td>
                          <td className="py-2 pr-4 text-slate-400">{file.originalPath ?? '—'}</td>
                          <td className="py-2 pr-4">{file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                          <td className="py-2 pr-4">{file.skipped ? `Skipped (${file.skipReason ?? 'unknown'})` : 'Copied'}</td>
                          <td className="py-2 pr-4">
                            {!file.skipped && (file._id ?? file.id) ? (
                              <CaptureDownloadLink captureId={(file._id ?? file.id) as string} token={token} fileName={file.originalFileName} />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2">
                            {file._id ?? file.id ? (
                              <CaptureDeleteButton captureId={(file._id ?? file.id) as string} token={token} label="" onDeleted={onCaptureDeleted} />
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selected ? (
        <CaptureDetailModal
          capture={selected}
          imageUrl={selectedUrl}
          nearestLocation={selected.captureType === 'location' ? selected : findNearestLocation(selected, captures)}
          token={token}
          onClose={() => setSelected(null)}
          onDeleted={onCaptureDeleted}
        />
      ) : null}
    </section>
  );
}

function CapturePhoto({ capture, token, onSelect }: { capture: Capture; token: string; onSelect: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    const id = capture._id ?? capture.id;
    if (!id) return;

    fetchCaptureBlobUrl(token, id)
      .then((blobUrl) => {
        objectUrl = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => setFailed(true));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [capture._id, capture.id, token]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 text-left transition hover:border-brand-green"
    >
      {url ? (
        <img src={url} alt="Captured" className="aspect-square w-full object-cover" />
      ) : failed ? (
        <div className="flex aspect-square w-full items-center justify-center px-2 text-center text-xs text-slate-500">Unavailable</div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center text-xs text-slate-500">Loading…</div>
      )}
      <p className="p-2 text-xs text-slate-400">{new Date(capture.capturedAtUtc).toLocaleString()}</p>
    </button>
  );
}

function CaptureDownloadLink({ captureId, token, fileName }: { captureId: string; token: string; fileName?: string }) {
  const handleDownload = async () => {
    try {
      const url = await fetchCaptureBlobUrl(token, captureId);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName ?? 'capture';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      // Best effort - the gallery listing already shows the file exists.
    }
  };

  return (
    <button onClick={handleDownload} type="button" className="flex items-center gap-1 text-brand-green hover:underline">
      <Download size={14} />
      Download
    </button>
  );
}

export default CapturesSection;
