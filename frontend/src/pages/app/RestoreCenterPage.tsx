import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  FileArchive,
  FolderLock,
  HardDriveDownload,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  XCircle
} from 'lucide-react';
import {
  Capture,
  FileBackup,
  ProtectionStatus,
  RestoreJob,
  cancelRestoreJob,
  createRestoreJob,
  fetchFileBackups,
  fetchProtectionStatus,
  fetchRestoreJobs
} from '../../api';
import { EmptyState, PanelTitle, StatTile } from '../../components/shell/AppShell';
import { useAlerts } from '../../components/ui/Alerts';
import { formatBytes, formatRelativeTime, shortHash } from './format';
import type { DashboardContext } from './context';

const STATUS_STYLES: Record<RestoreJob['status'], string> = {
  queued: 'border-brand-cyan/40 bg-brand-cyan/10 text-cyan-300',
  downloading: 'border-brand-amber/40 bg-brand-amber/10 text-amber-300',
  completed: 'border-brand-green/40 bg-brand-green/10 text-brand-green',
  failed: 'border-brand-danger/40 bg-brand-danger/10 text-rose-300',
  cancelled: 'border-slate-600/60 bg-slate-800/40 text-slate-400'
};

const STATUS_ICONS: Record<RestoreJob['status'], typeof CheckCircle2> = {
  queued: Clock,
  downloading: ArrowDownToLine,
  completed: CheckCircle2,
  failed: ShieldX,
  cancelled: XCircle
};

function jobIdOf(job: RestoreJob): string {
  return job._id ?? job.id ?? '';
}

function captureIdOf(capture: Capture): string {
  return capture._id ?? capture.id ?? '';
}

type SourceKind = 'capture' | 'protected_file';

function RestoreCenterPage() {
  const { token, devices, captures } = useOutletContext<DashboardContext>();
  const { showAlert } = useAlerts();
  const [jobs, setJobs] = useState<RestoreJob[]>([]);
  const [protection, setProtection] = useState<ProtectionStatus | null>(null);
  const [backups, setBackups] = useState<FileBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [sourceKind, setSourceKind] = useState<SourceKind>('capture');
  const [deviceId, setDeviceId] = useState('');
  const [captureId, setCaptureId] = useState('');
  const [folderId, setFolderId] = useState('');
  const [backupId, setBackupId] = useState('');
  const [restorePath, setRestorePath] = useState('');

  const loadJobs = useCallback(
    (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      fetchRestoreJobs(token)
        .then((records) => {
          setJobs(records);
          setError('');
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load restore jobs.'))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [token]
  );

  const loadProtection = useCallback(() => {
    fetchProtectionStatus(token)
      .then(setProtection)
      .catch(() => setProtection(null));
  }, [token]);

  useEffect(() => {
    loadJobs();
    loadProtection();
  }, [loadJobs, loadProtection]);

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    const poller = window.setInterval(() => loadJobs(true), 15000);
    return () => window.clearInterval(poller);
  }, [loadJobs]);

  useEffect(() => {
    if (!deviceId && devices.length > 0) setDeviceId(devices[0].deviceId);
  }, [deviceId, devices]);

  useEffect(() => {
    if (!folderId) {
      setBackups([]);
      return undefined;
    }
    let cancelled = false;
    setBackupsLoading(true);
    fetchFileBackups(token, folderId)
      .then((records) => {
        if (!cancelled) setBackups(records);
      })
      .catch(() => {
        if (!cancelled) setBackups([]);
      })
      .finally(() => {
        if (!cancelled) setBackupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderId, token]);

  const deviceName = useCallback(
    (id: string) => devices.find((device) => device.deviceId === id)?.name ?? id.slice(0, 12),
    [devices]
  );

  const deviceCaptures = useMemo(
    () => captures.filter((capture) => capture.deviceId === deviceId && !capture.skipped),
    [captures, deviceId]
  );
  const deviceFolders = useMemo(
    () => (protection?.folders ?? []).filter((folder) => folder.deviceId === deviceId),
    [protection, deviceId]
  );

  const stats = useMemo(
    () => ({
      queued: jobs.filter((job) => job.status === 'queued').length,
      inFlight: jobs.filter((job) => job.status === 'downloading').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length
    }),
    [jobs]
  );

  const selectDevice = (value: string) => {
    setDeviceId(value);
    setCaptureId('');
    setFolderId('');
    setBackupId('');
  };

  const selectKind = (kind: SourceKind) => {
    setSourceKind(kind);
    setRestorePath('');
  };

  const submit = async () => {
    if (!deviceId) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'Register a device before restoring.' });
      return;
    }
    if (sourceKind === 'capture' && !captureId) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'Select the evidence capture to restore.' });
      return;
    }
    if (sourceKind === 'protected_file' && !backupId) {
      showAlert({ kind: 'denied', title: 'ACCESS DENIED', message: 'Select a verified backup to restore.' });
      return;
    }

    setSubmitting(true);
    try {
      const input =
        sourceKind === 'capture'
          ? { deviceId, sourceKind: 'capture' as const, captureId, restorePath: restorePath.trim() || undefined }
          : { deviceId, sourceKind: 'protected_file' as const, backupId, restorePath: restorePath.trim() || undefined };
      const job = await createRestoreJob(token, input);
      showAlert({
        kind: 'success',
        title: 'RESTORE QUEUED',
        message: `${job.fileName} will be written on ${deviceName(job.deviceId)} at its next check-in.`,
        detail: job.verificationHash ? `verify sha256 ${shortHash(job.verificationHash)}` : undefined
      });
      setCaptureId('');
      setBackupId('');
      setRestorePath('');
      loadJobs(true);
    } catch (submitError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The restore job was rejected.',
        detail: submitError instanceof Error ? submitError.message : undefined
      });
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (job: RestoreJob) => {
    const id = jobIdOf(job);
    if (!id) return;
    setBusy(id);
    try {
      const updated = await cancelRestoreJob(token, id);
      setJobs((prev) => prev.map((entry) => (jobIdOf(entry) === id ? { ...entry, ...updated } : entry)));
      showAlert({ kind: 'success', title: 'RESTORE CANCELLED', message: `${job.fileName} will not be written.` });
    } catch (cancelError) {
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: 'The job could not be cancelled.',
        detail: cancelError instanceof Error ? cancelError.message : undefined
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-label">Recovery operations</p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Restore center</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Recover an evidence capture or push a hash-verified file back to a device. The agent writes to a recovery
            folder, re-hashes the new file, and refuses to report success if the digest does not match the approved copy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadJobs(true)}
          disabled={refreshing}
          className="flex min-h-[38px] items-center gap-2 border border-brand-green/30 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green/10 disabled:opacity-40"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Queued"
          value={loading ? '—' : stats.queued}
          icon={Clock}
          tone="cyan"
          hint="awaiting agent check-in"
          onClick={() => document.getElementById('restore-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="In flight"
          value={loading ? '—' : stats.inFlight}
          icon={Loader2}
          tone="amber"
          hint="streaming to device"
          onClick={() => document.getElementById('restore-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Verified"
          value={loading ? '—' : stats.completed}
          icon={ShieldCheck}
          tone="green"
          hint="hash matched on device"
          onClick={() => document.getElementById('restore-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <StatTile
          label="Failed"
          value={loading ? '—' : stats.failed}
          icon={ShieldX}
          tone={stats.failed > 0 ? 'danger' : 'green'}
          hint="integrity or transfer error"
          onClick={() => document.getElementById('restore-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </div>

      {error ? <div className="border border-brand-danger/40 bg-brand-danger/10 p-3 text-sm text-rose-200">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section id="new-restore" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5 min-w-0">
          <PanelTitle icon={HardDriveDownload} title="New restore job" />

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => selectKind('capture')}
              className={`flex min-h-[40px] items-center justify-center gap-1.5 border font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                sourceKind === 'capture'
                  ? 'border-brand-cyan/50 bg-brand-cyan/10 text-cyan-300'
                  : 'border-white/10 text-slate-400 hover:border-white/25'
              }`}
            >
              <FileArchive size={13} /> Evidence capture
            </button>
            <button
              type="button"
              onClick={() => selectKind('protected_file')}
              className={`flex min-h-[40px] items-center justify-center gap-1.5 border font-mono text-[10px] uppercase tracking-[0.12em] transition ${
                sourceKind === 'protected_file'
                  ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
                  : 'border-white/10 text-slate-400 hover:border-white/25'
              }`}
            >
              <FolderLock size={13} /> Verified backup
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="hud-label">Target device</span>
              <select
                value={deviceId}
                onChange={(event) => selectDevice(event.target.value)}
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

            {sourceKind === 'capture' ? (
              <label className="block">
                <span className="hud-label">Capture</span>
                <select
                  value={captureId}
                  onChange={(event) => setCaptureId(event.target.value)}
                  className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
                >
                  <option value="">Select captured evidence…</option>
                  {deviceCaptures.map((capture) => (
                    <option key={captureIdOf(capture)} value={captureIdOf(capture)}>
                      {capture.originalFileName ?? capture.captureType} ·{' '}
                      {formatRelativeTime(new Date(capture.capturedAtUtc).getTime(), now)}
                    </option>
                  ))}
                </select>
                {deviceCaptures.length === 0 ? (
                  <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">
                    No restorable captures on this device yet
                  </span>
                ) : null}
              </label>
            ) : (
              <>
                <label className="block">
                  <span className="hud-label">Protected folder</span>
                  <select
                    value={folderId}
                    onChange={(event) => {
                      setFolderId(event.target.value);
                      setBackupId('');
                    }}
                    className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60"
                  >
                    <option value="">Select a protected folder…</option>
                    {deviceFolders.map((folder) => (
                      <option key={folder._id ?? folder.id ?? folder.path} value={folder._id ?? folder.id ?? ''}>
                        {folder.label} · {folder.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="hud-label">Verified backup</span>
                  <select
                    value={backupId}
                    onChange={(event) => setBackupId(event.target.value)}
                    disabled={!folderId || backupsLoading}
                    className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 text-sm text-slate-100 outline-none focus:border-brand-green/60 disabled:opacity-50"
                  >
                    <option value="">{backupsLoading ? 'Loading backups…' : 'Select a stored backup…'}</option>
                    {backups.map((backup) => (
                      <option key={backup.id} value={backup.id}>
                        {backup.relativePath} · {formatBytes(backup.sizeBytes)} · {shortHash(backup.sha256)}
                      </option>
                    ))}
                  </select>
                  {folderId && !backupsLoading && backups.length === 0 ? (
                    <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">
                      No backups stored for this folder yet
                    </span>
                  ) : null}
                </label>
              </>
            )}

            <label className="block">
              <span className="hud-label">Restore path (optional)</span>
              <input
                value={restorePath}
                onChange={(event) => setRestorePath(event.target.value)}
                placeholder="Leave blank for the agent recovery folder"
                spellCheck={false}
                className="mt-1 min-h-[40px] w-full border border-white/10 bg-black/40 px-2.5 font-mono text-xs text-slate-100 outline-none focus:border-brand-green/60"
              />
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={submitting || devices.length === 0}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 border border-brand-green/40 bg-brand-green/10 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green/20 disabled:opacity-40"
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <HardDriveDownload size={13} />}
              {submitting ? 'Queuing…' : 'Queue restore'}
            </button>
          </div>

          <p className="mt-3 flex items-start gap-1.5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.1em] text-slate-500">
            <ShieldCheck size={11} className="mt-px shrink-0" />
            sha-256 re-checked on the device before success is reported
          </p>
        </section>

        <section id="restore-jobs" className="holo-panel holo-corner scroll-mt-24 p-4 sm:p-5 min-w-0">
          <PanelTitle
            icon={History}
            title="Restore history"
            action={<span className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{jobs.length} jobs</span>}
          />
          {loading ? (
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-20 animate-pulse border border-white/5 bg-white/[0.02]" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={HardDriveDownload}
              title="No restore jobs yet"
              message="Queue a restore on the left. Jobs are claimed by the target agent within 30 seconds and verified before completion."
            />
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {jobs.map((job) => {
                const id = jobIdOf(job);
                const Icon = STATUS_ICONS[job.status];
                const cancellable = job.status === 'queued' || job.status === 'downloading';
                return (
                  <li key={id || `${job.deviceId}-${job.requestedAtUtc}`} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-100">{job.fileName}</p>
                          <span
                            className={`flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${STATUS_STYLES[job.status]}`}
                          >
                            <Icon size={10} /> {job.status}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-500">
                          {job.sourceKind === 'capture' ? 'evidence capture' : 'verified backup'} · {deviceName(job.deviceId)} ·{' '}
                          {formatRelativeTime(new Date(job.requestedAtUtc).getTime(), now)}
                        </p>
                        {job.restoredPath ? (
                          <p className="mt-1 break-all font-mono text-[10px] text-brand-green/80" title={job.restoredPath}>
                            → {job.restoredPath}
                          </p>
                        ) : null}
                        {job.error ? (
                          <p className="mt-1 break-words font-mono text-[10px] text-rose-300/90">{job.error}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {job.verificationHash ? (
                          <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-slate-500">
                            <ShieldCheck size={10} className={job.status === 'completed' ? 'text-brand-green' : ''} />
                            {shortHash(job.verificationHash)}
                          </span>
                        ) : null}
                        {typeof job.sizeBytes === 'number' && job.sizeBytes > 0 ? (
                          <span className="font-mono text-[9px] text-slate-600">{formatBytes(job.sizeBytes)}</span>
                        ) : null}
                        {cancellable ? (
                          <button
                            type="button"
                            disabled={busy === id}
                            onClick={() => cancel(job)}
                            className="mt-0.5 flex min-h-[28px] items-center gap-1 border border-white/10 px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400 transition hover:border-brand-danger/50 hover:text-rose-300 disabled:opacity-40"
                          >
                            <XCircle size={11} /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-white/8 pt-3">
            <Link
              to="/dashboard/evidence"
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-green hover:text-white"
            >
              Open evidence
            </Link>
            <Link
              to="/dashboard/file-protection"
              className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-brand-cyan hover:text-white"
            >
              Manage backups
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export default RestoreCenterPage;
