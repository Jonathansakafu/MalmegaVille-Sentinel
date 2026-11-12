import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Clock,
  Database,
  FileWarning,
  FolderLock,
  Hash,
  HardDriveDownload,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import {
  ManifestChange,
  ProtectedFolder,
  ProtectionStatus,
  addProtectedFolder,
  fetchProtectionStatus,
  removeProtectedFolder,
  updateProtectedFolder
} from '../../api';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { formatBytes, formatRelativeTime, shortHash } from './format';
import type { DashboardContext } from './context';

const CHANGE_STYLES: Record<ManifestChange['type'], string> = {
  added: 'border-brand-cyan/40 bg-brand-cyan/10 text-cyan-300',
  modified: 'border-brand-amber/40 bg-brand-amber/10 text-amber-300',
  removed: 'border-brand-danger/40 bg-brand-danger/10 text-rose-300'
};

function folderIdOf(folder: ProtectedFolder): string {
  return folder._id ?? folder.id ?? '';
}

function FolderStatusChip({ folder }: { folder: ProtectedFolder }) {
  const manifest = folder.latestManifest;
  if (!manifest) {
    return (
      <span className="border border-slate-600/60 bg-slate-800/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
        awaiting scan
      </span>
    );
  }
  if (manifest.integrityStatus === 'changed') {
    return (
      <span className="border border-brand-danger/40 bg-brand-danger/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-rose-300">
        {manifest.changeCount} change{manifest.changeCount === 1 ? '' : 's'}
      </span>
    );
  }
  if (manifest.integrityStatus === 'baseline') {
    return (
      <span className="border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-300">
        baseline
      </span>
    );
  }
  return (
    <span className="border border-brand-green/40 bg-brand-green/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green">
      verified
    </span>
  );
}

function FileProtectionPage() {
  const { token, devices } = useOutletContext<DashboardContext>();
  const { showAlert } = useAlerts();
  const [data, setData] = useState<ProtectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [deviceId, setDeviceId] = useState('');
  const [path, setPath] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      fetchProtectionStatus(token)
        .then((status) => {
          setData(status);
          setError('');
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load file protection.'))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [token]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => load(true), 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].deviceId);
  }, [deviceId, devices]);

  const deviceName = useCallback(
    (id: string) => devices.find((device) => device.deviceId === id)?.name ?? id.slice(0, 12),
    [devices]
  );

  const stats = data?.stats;
  const folders = data?.folders ?? [];

  const feed = useMemo(
    () =>
      folders
        .flatMap((folder) =>
          (folder.latestManifest?.changes ?? []).map((change) => ({
            key: `${folderIdOf(folder)}-${change.type}-${change.relativePath}`,
            folder,
            change
          }))
        )
        .slice(0, 14),
    [folders]
  );

  const toggle = async (folder: ProtectedFolder) => {
    const id = folderIdOf(folder);
    if (!id) return;
    setBusy(id);
    try {
      await updateProtectedFolder(token, id, { enabled: !folder.enabled });
      showAlert({
        kind: 'success',
        title: folder.enabled ? 'SCANNING PAUSED' : 'SCANNING RESUMED',
        message: folder.enabled
          ? `${folder.label} will stop reporting integrity changes.`
          : `${folder.label} will be hashed again on the next agent cycle.`
      });
      load(true);
    } catch (toggleError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The folder state could not be changed.',
        detail: toggleError instanceof Error ? toggleError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (folder: ProtectedFolder) => {
    const id = folderIdOf(folder);
    if (!id) return;
    if (!window.confirm(`Stop protecting ${folder.label}? Existing manifests and backups are kept.`)) return;
    setBusy(id);
    try {
      await removeProtectedFolder(token, id);
      showAlert({ kind: 'success', title: 'PROTECTION REMOVED', message: `${folder.label} is no longer monitored.` });
      load(true);
    } catch (removeError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The folder could not be removed.',
        detail: removeError instanceof Error ? removeError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!deviceId) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'Install an agent before adding a protected folder.' });
      return;
    }
    if (!path.trim() || !label.trim()) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'A folder path and a label are both required.' });
      return;
    }
    setAdding(true);
    try {
      await addProtectedFolder(token, { deviceId, path: path.trim(), label: label.trim() });
      showAlert({
        kind: 'success',
        title: 'FOLDER ENROLLED',
        message: `${label.trim()} will be hashed on the agent's next cycle.`,
        detail: path.trim()
      });
      setPath('');
      setLabel('');
      load(true);
    } catch (addError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The folder could not be enrolled.',
        detail: addError instanceof Error ? addError.message : undefined
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Data integrity</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">File protection</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            The agent hashes every file in each protected folder with SHA-256 and reports the manifest. The server diffs
            each scan against the last baseline, raises an alert when bytes change, and keeps a verified copy of each
            changed file so you can restore the pristine version.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex min-h-[38px] items-center gap-2 border border-brand-green/30 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green/10 disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Protected folders"
          value={loading ? '—' : stats?.folders ?? 0}
          icon={FolderLock}
          tone="green"
          hint={`${stats?.enabledFolders ?? 0} actively scanning`}
          onClick={() => document.getElementById('protected-folders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Files hashed"
          value={loading ? '—' : (stats?.protectedFiles ?? 0).toLocaleString()}
          icon={Hash}
          tone="cyan"
          hint={formatBytes(stats?.totalBytes)}
          onClick={() => document.getElementById('protected-folders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Changes detected"
          value={loading ? '—' : stats?.changedFiles ?? 0}
          icon={FileWarning}
          tone={(stats?.changedFiles ?? 0) > 0 ? 'danger' : 'green'}
          hint={`${stats?.foldersWithChanges ?? 0} folders affected`}
          onClick={() => document.getElementById('integrity-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Last scan"
          value={stats?.lastScanUtc ? formatRelativeTime(new Date(stats.lastScanUtc).getTime(), now) : '—'}
          icon={Clock}
          tone="amber"
          hint="agents report every 5 min"
          onClick={() => document.getElementById('protected-folders')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </div>

      {error ? <div className="border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section id="protected-folders" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5">
          <PanelTitle
            icon={FolderLock}
            title="Watched folders"
            action={
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {folders.length} enrolled
              </span>
            }
          />
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-24 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : folders.length === 0 ? (
            <EmptyState
              icon={FolderLock}
              title="No folders protected yet"
              message="Enroll a folder below; the agent on that device will hash it and upload the first baseline within five minutes."
            />
          ) : (
            <ul className="mt-4 space-y-2.5">
              {folders.map((folder) => {
                const id = folderIdOf(folder);
                const manifest = folder.latestManifest;
                const changes = manifest?.changes ?? [];
                return (
                  <li
                    key={id || folder.path}
                    className={`border p-3.5 ${
                      folder.enabled ? 'border-white/8 bg-white/[0.02]' : 'border-white/5 bg-black/30 opacity-70'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-100">{folder.label}</p>
                          <FolderStatusChip folder={folder} />
                          {!folder.enabled ? (
                            <span className="border border-slate-600/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">
                              paused
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{folder.path}</p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {deviceName(folder.deviceId)} ·{' '}
                          {manifest
                            ? `${manifest.fileCount.toLocaleString()} files · ${formatBytes(manifest.totalBytes)} · scanned ${formatRelativeTime(
                                new Date(manifest.scannedAtUtc).getTime(),
                                now
                              )}`
                            : 'waiting for first baseline'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => toggle(folder)}
                          className="flex min-h-[32px] items-center gap-1.5 border border-white/10 px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-300 transition hover:border-brand-green/50 hover:text-brand-green disabled:opacity-40"
                        >
                          {folder.enabled ? <Pause size={12} /> : <Play size={12} />}
                          {folder.enabled ? 'Pause' : 'Resume'}
                        </button>
                        <Link
                          to="/dashboard/restore"
                          className="flex min-h-[32px] items-center gap-1.5 border border-brand-cyan/30 px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-brand-cyan transition hover:bg-brand-cyan/10"
                        >
                          <HardDriveDownload size={12} /> Restore
                        </Link>
                        <button
                          type="button"
                          disabled={busy === id}
                          onClick={() => remove(folder)}
                          aria-label={`Stop protecting ${folder.label}`}
                          className="flex min-h-[32px] items-center justify-center border border-white/10 px-2 text-slate-500 transition hover:border-brand-danger/50 hover:text-rose-300 disabled:opacity-40"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {changes.length > 0 ? (
                      <div className="mt-3 space-y-1.5 border-t border-white/5 pt-2.5">
                        {changes.slice(0, 3).map((change) => (
                          <div key={`${change.type}-${change.relativePath}`} className="flex items-start gap-2">
                            <span
                              className={`mt-px shrink-0 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${CHANGE_STYLES[change.type]}`}
                            >
                              {change.type}
                            </span>
                            <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400" title={change.relativePath}>
                              {change.relativePath}
                            </p>
                            <span className="hidden shrink-0 font-mono text-[9px] text-slate-600 sm:block">
                              {shortHash(change.sha256 ?? change.previousSha256)}
                            </span>
                          </div>
                        ))}
                        {changes.length > 3 ? (
                          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                            +{changes.length - 3} more in this scan
                          </p>
                        ) : null}
                      </div>
                    ) : manifest ? (
                      <p className="mt-3 flex items-center gap-1.5 border-t border-white/5 pt-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-brand-green/80">
                        <ShieldCheck size={12} /> content matches baseline
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <section id="integrity-feed" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5">
            <PanelTitle
              icon={FileWarning}
              title="Integrity feed"
              action={
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  latest scan
                </span>
              }
            />
            {loading ? (
              <div className="mt-4 space-y-2">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="h-12 animate-pulse border border-white/5 bg-white/[0.02]" />
                ))}
              </div>
            ) : feed.length === 0 ? (
              <EmptyState
                icon={ShieldCheck}
                title="No integrity changes"
                message="Added, modified, and deleted files show up here the moment a scan differs from the stored baseline."
              />
            ) : (
              <ul className="mt-3 divide-y divide-white/5">
                {feed.map(({ key, folder, change }) => (
                  <li key={key} className="flex items-start gap-2.5 py-2.5">
                    <span
                      className={`mt-0.5 shrink-0 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] ${CHANGE_STYLES[change.type]}`}
                    >
                      {change.type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-slate-300" title={change.relativePath}>
                        {change.relativePath}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
                        {folder.label} · {formatRelativeTime(new Date(folder.latestManifest?.scannedAtUtc ?? 0).getTime(), now)}
                      </p>
                    </div>
                    <span className="hidden shrink-0 font-mono text-[9px] text-slate-600 sm:block">
                      {shortHash(change.sha256 ?? change.previousSha256)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/dashboard/threats"
              className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white"
            >
              Open incident log
            </Link>
          </section>

          <section id="add-folder" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5">
            <PanelTitle icon={Plus} title="Protect a folder" />
            <p className="mt-3 text-xs text-slate-400">
              Use an absolute path on the agent machine. Changed files up to 25 MB are uploaded as hash-verified backups
              for one-click restore.
            </p>
            <div className="mt-3 space-y-2">
              <label className="block">
                <span className="hud-label">Device</span>
                <select
                  value={deviceId}
                  onChange={(event) => setDeviceId(event.target.value)}
                  className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
                >
                  {devices.length === 0 ? <option value="">No agents registered</option> : null}
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.name} ({device.operatingSystem || 'unknown'})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="hud-label">Folder path</span>
                <input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder="C:\Users\you\Documents\Contracts"
                  spellCheck={false}
                  className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-brand-green/60"
                />
              </label>
              <label className="block">
                <span className="hud-label">Label</span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="Legal contracts"
                  className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={adding || devices.length === 0}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 border border-brand-green/40 bg-brand-green/10 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green/20 disabled:opacity-40"
              >
                <Plus size={13} />
                {adding ? 'Enrolling…' : 'Enroll folder'}
              </button>
            </div>
            <p className="mt-3 flex items-start gap-1.5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-slate-500">
              <Database size={11} className="mt-px shrink-0" />
              SHA-256 manifest · first scan becomes the baseline
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default FileProtectionPage;
