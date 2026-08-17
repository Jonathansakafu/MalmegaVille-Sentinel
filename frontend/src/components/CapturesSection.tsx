import { useEffect, useState } from 'react';
import { Camera, MapPin, FileArchive, ExternalLink, Download } from 'lucide-react';
import { Capture, Device, fetchCaptureBlobUrl } from '../api';
import StatusBadge from './StatusBadge';

function CapturesSection({
  captures,
  devices,
  token,
  deviceFilter,
  onDeviceFilterChange
}: {
  captures: Capture[];
  devices: Device[];
  token: string;
  deviceFilter?: string;
  onDeviceFilterChange: (deviceId: string | undefined) => void;
}) {
  const photos = captures.filter((c) => c.captureType === 'webcam_photo');
  const locations = captures.filter((c) => c.captureType === 'location');
  const files = captures.filter((c) => c.captureType === 'usb_file' || c.captureType === 'usb_manifest');

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
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo) => (
              <CapturePhoto key={photo._id ?? photo.id} capture={photo} token={token} />
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
          <div className="mt-4 space-y-3">
            {locations.map((location) => {
              const meta = location.metadata ?? {};
              const lat = meta.latitude as number | undefined;
              const lon = meta.longitude as number | undefined;
              return (
                <div key={location._id ?? location.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-400">{new Date(location.capturedAtUtc).toLocaleString()}</span>
                    <StatusBadge label={String(meta.source ?? 'unknown')} tone="neutral" />
                  </div>
                  {typeof lat === 'number' && typeof lon === 'number' ? (
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      {lat.toFixed(5)}, {lon.toFixed(5)}
                      {meta.city ? ` — ${meta.city}${meta.region ? `, ${meta.region}` : ''}` : ''}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-brand-green hover:underline"
                      >
                        View on map
                        <ExternalLink size={12} />
                      </a>
                    </p>
                  ) : (
                    <p className="mt-2 text-slate-500">Location unavailable for this attempt.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <FileArchive size={18} className="text-brand-green" />
            USB Files
          </h3>
          {/* Card layout below sm - a horizontally-scrolling table is a poor touch-UX pattern on phones. */}
          <div className="mt-4 space-y-3 sm:hidden">
            {files.map((file) => (
              <div key={file._id ?? file.id} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm">
                <p className="break-all font-semibold text-slate-100">{file.originalFileName ?? 'Unknown'}</p>
                {file.originalPath ? <p className="mt-1 break-all text-xs text-slate-400">{file.originalPath}</p> : null}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(1)} KB` : '—'} ·{' '}
                    {file.skipped ? `Skipped (${file.skipReason ?? 'unknown'})` : 'Copied'}
                  </span>
                  {!file.skipped && (file._id ?? file.id) ? (
                    <CaptureDownloadLink captureId={(file._id ?? file.id) as string} token={token} fileName={file.originalFileName} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-left text-sm text-slate-300">
              <thead>
                <tr className="text-slate-400">
                  <th className="pb-2 pr-4">File</th>
                  <th className="pb-2 pr-4">Path</th>
                  <th className="pb-2 pr-4">Size</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Content</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file._id ?? file.id} className="border-t border-slate-800">
                    <td className="py-2 pr-4">{file.originalFileName ?? 'Unknown'}</td>
                    <td className="py-2 pr-4 text-slate-400">{file.originalPath ?? '—'}</td>
                    <td className="py-2 pr-4">{file.sizeBytes ? `${(file.sizeBytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="py-2 pr-4">{file.skipped ? `Skipped (${file.skipReason ?? 'unknown'})` : 'Copied'}</td>
                    <td className="py-2">
                      {!file.skipped && (file._id ?? file.id) ? (
                        <CaptureDownloadLink captureId={(file._id ?? file.id) as string} token={token} fileName={file.originalFileName} />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CapturePhoto({ capture, token }: { capture: Capture; token: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const id = capture._id ?? capture.id;
    if (!id) return;

    fetchCaptureBlobUrl(token, id)
      .then((blobUrl) => {
        objectUrl = blobUrl;
        setUrl(blobUrl);
      })
      .catch(() => setUrl(null));

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [capture._id, capture.id, token]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80">
      {url ? (
        <img src={url} alt="Captured" className="aspect-square w-full object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center text-xs text-slate-500">Loading…</div>
      )}
      <p className="p-2 text-xs text-slate-400">{new Date(capture.capturedAtUtc).toLocaleString()}</p>
    </div>
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
