import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { agentLimiter, dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import { validateSyncToken } from './syncRoutes.js';
import ProtectedFolder from '../models/ProtectedFolder.js';
import FileManifest from '../models/FileManifest.js';
import FileBackup from '../models/FileBackup.js';
import Device from '../models/Device.js';
import { dblessTestMode, backupStorageDir, backupMaxFileBytes } from '../config.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { recordAuditLog } from '../services/auditLogService.js';
import {
  findDeviceByDeviceId,
  listProtectedFolders,
  findProtectedFolderByIdForUser,
  addProtectedFolder,
  updateProtectedFolder,
  removeProtectedFolder,
  findLatestManifestForFolder,
  addFileManifest,
  listManifestsForUser,
  listFileBackupsForFolder,
  findFileBackup,
  addFileBackup
} from '../services/inMemoryStore.js';

const router = Router();

fs.mkdirSync(backupStorageDir, { recursive: true });

const backupUpload = multer({
  storage: multer.diskStorage({
    destination: backupStorageDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname || '')}`)
  }),
  limits: { fileSize: backupMaxFileBytes }
});

const MAX_MANIFEST_ENTRIES = 5000;
const MAX_BACKUPS_PER_SCAN = 50;
const MAX_BACKUP_BYTES_PER_SCAN = 100 * 1024 * 1024;

const createFolderSchema = z.object({
  deviceId: z.string().trim().min(1),
  path: z.string().trim().min(3),
  label: z.string().trim().min(1).max(80)
});

const updateFolderSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional()
});

const manifestEntrySchema = z.object({
  relativePath: z.string().trim().min(1).max(500),
  sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  sizeBytes: z.number().int().nonnegative().optional(),
  lastModifiedUtc: z.string().optional()
});

const manifestSchema = z.object({
  deviceId: z.string().trim().min(1),
  folderId: z.string().trim().min(1),
  path: z.string().trim().min(1),
  label: z.string().trim().max(80).optional(),
  scannedAtUtc: z.string().optional(),
  entries: z.array(manifestEntrySchema).max(MAX_MANIFEST_ENTRIES)
});

function normalizeFolderPath(input: string): string {
  return input.trim().replace(/[\\/]+$/, '');
}

async function deviceOwnerUserId(deviceId: string): Promise<string | undefined> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.userId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.userId?.toString();
}

async function deviceDisplayName(deviceId: string): Promise<string> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.name ?? deviceId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.name ?? deviceId;
}

function diffManifests(
  previous: { relativePath: string; sha256: string; sizeBytes?: number }[],
  next: { relativePath: string; sha256: string; sizeBytes?: number }[]
) {
  const previousByPath = new Map(previous.map((entry) => [entry.relativePath, entry]));
  const nextByPath = new Map(next.map((entry) => [entry.relativePath, entry]));
  const changes: {
    type: 'added' | 'modified' | 'removed';
    relativePath: string;
    previousSha256?: string;
    sha256?: string;
    sizeBytes?: number;
  }[] = [];

  for (const entry of next) {
    const before = previousByPath.get(entry.relativePath);
    if (!before) {
      changes.push({ type: 'added', relativePath: entry.relativePath, sha256: entry.sha256, sizeBytes: entry.sizeBytes });
    } else if (before.sha256 !== entry.sha256) {
      changes.push({
        type: 'modified',
        relativePath: entry.relativePath,
        previousSha256: before.sha256,
        sha256: entry.sha256,
        sizeBytes: entry.sizeBytes
      });
    }
  }

  for (const entry of previous) {
    if (!nextByPath.has(entry.relativePath)) {
      changes.push({ type: 'removed', relativePath: entry.relativePath, previousSha256: entry.sha256 });
    }
  }

  return changes;
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('end', () => resolve(digest.digest('hex')));
    stream.on('error', reject);
  });
}

// GET /api/protection/folders/agent - sync-token authed, folder watch list
router.get('/folders/agent', agentLimiter, async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const deviceId = String(req.query.deviceId ?? '');
  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required.' });
  }

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const folders = dblessTestMode
    ? listProtectedFolders(userId, deviceId)
    : await ProtectedFolder.find({ userId, deviceId, enabled: true });

  res.json(
    folders
      .filter((folder) => folder.enabled)
      .map((folder) => ({
        id: '_id' in folder ? String(folder._id) : folder.id,
        path: folder.path,
        label: folder.label
      }))
  );
});

// POST /api/protection/manifests - sync-token authed. The agent posts a full
// SHA-256 snapshot of a protected folder; the diff against the previous
// snapshot is what actually becomes a file-integrity alert.
router.post('/manifests', agentLimiter, validateBody(manifestSchema), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, folderId, path: folderPath, label, scannedAtUtc, entries } = req.body;

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const previous = dblessTestMode
    ? findLatestManifestForFolder(userId, folderId)
    : await FileManifest.findOne({ userId, folderId }).sort({ scannedAtUtc: -1 });

  const changes = previous ? diffManifests(previous.entries, entries) : [];
  const totalBytes = entries.reduce((total: number, entry: { sizeBytes?: number }) => total + (entry.sizeBytes ?? 0), 0);
  const integrityStatus: 'baseline' | 'unchanged' | 'changed' = !previous
    ? 'baseline'
    : changes.length > 0
      ? 'changed'
      : 'unchanged';

  const manifestFields = {
    userId,
    deviceId,
    folderId,
    path: folderPath,
    label,
    entries: entries.map((entry: { relativePath: string; sha256: string; sizeBytes?: number; lastModifiedUtc?: string }) => ({
      relativePath: entry.relativePath,
      sha256: entry.sha256.toLowerCase(),
      sizeBytes: entry.sizeBytes ?? 0,
      lastModifiedUtc: entry.lastModifiedUtc ? new Date(entry.lastModifiedUtc) : undefined
    })),
    fileCount: entries.length,
    totalBytes,
    changes: changes.slice(0, 200),
    changeCount: changes.length,
    integrityStatus,
    scannedAtUtc: scannedAtUtc ? new Date(scannedAtUtc) : new Date()
  };

  const saved = dblessTestMode ? addFileManifest(manifestFields) : await FileManifest.create(manifestFields);

  if (previous && changes.length > 0) {
    const destructive = changes.filter((change) => change.type !== 'added').length;
    const severity = destructive > 0 ? 'High' : 'Medium';
    const sample = changes
      .slice(0, 5)
      .map((change) => `${change.type}: ${change.relativePath}`)
      .join('; ');

    notifySecurityEvent({
      userId,
      deviceId,
      deviceName: await deviceDisplayName(deviceId),
      eventType: 'File Integrity Change',
      timestampUtc: new Date(),
      severity,
      threatScore: destructive > 0 ? 78 : 52,
      description: `${changes.length} file change${changes.length === 1 ? '' : 's'} detected in protected folder "${label ?? folderPath}". ${sample}`,
      recommendedAction:
        destructive > 0
          ? 'Review the changed or removed files and restore the last verified copy if the change was not authorized.'
          : 'Confirm the new files were expected.',
      metadata: {
        folderId,
        folderPath,
        changes: changes.slice(0, 20)
      }
    }).catch((error) => console.error('File integrity notification failed', error));
  }

  // Restore points are hash-addressed: only files without a stored copy of
  // exactly this content are requested. Changed files go first so the copy
  // that matters most is secured on the very next agent poll.
  const changedPaths = new Set(changes.map((change) => change.relativePath));
  const candidates = (manifestFields.entries as { relativePath: string; sha256: string; sizeBytes: number }[])
    .filter((entry) => entry.sizeBytes <= backupMaxFileBytes)
    .sort(
      (a, b) =>
        Number(changedPaths.has(b.relativePath)) - Number(changedPaths.has(a.relativePath)) ||
        a.relativePath.localeCompare(b.relativePath)
    );

  const existing = new Set<string>();
  if (dblessTestMode) {
    for (const backup of listFileBackupsForFolder(userId, folderId)) {
      existing.add(`${backup.relativePath}\u0000${backup.sha256}`);
    }
  } else {
    const backups = await FileBackup.find({ userId, folderId }).select('relativePath sha256');
    for (const backup of backups) existing.add(`${backup.relativePath}\u0000${backup.sha256}`);
  }

  const filesToBackup: { relativePath: string; sha256: string; sizeBytes: number }[] = [];
  let backupBudget = MAX_BACKUP_BYTES_PER_SCAN;
  for (const entry of candidates) {
    if (filesToBackup.length >= MAX_BACKUPS_PER_SCAN) break;
    if (existing.has(`${entry.relativePath}\u0000${entry.sha256}`)) continue;
    if (entry.sizeBytes > backupBudget) continue;
    backupBudget -= entry.sizeBytes;
    filesToBackup.push({
      relativePath: entry.relativePath,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes
    });
  }

  res.status(201).json({
    id: '_id' in saved ? String(saved._id) : saved.id,
    integrityStatus,
    changeCount: changes.length,
    changes: changes.slice(0, 50),
    filesToBackup
  });
});

// POST /api/protection/backups - sync-token authed. The agent uploads the
// actual content of the files the previous manifest response asked for. The
// server re-hashes what it stored, so a backup is only recorded when the bytes
// on disk are exactly the bytes the manifest vouched for.
router.post('/backups', agentLimiter, backupUpload.single('file'), async (req, res) => {
  const removeUpload = () => {
    if (req.file) fs.unlink(req.file.path, () => {});
  };

  if (!validateSyncToken(req)) {
    removeUpload();
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const deviceId = typeof req.body.deviceId === 'string' ? req.body.deviceId.trim() : '';
  const folderId = typeof req.body.folderId === 'string' ? req.body.folderId.trim() : '';
  const relativePath = typeof req.body.relativePath === 'string' ? req.body.relativePath.trim() : '';
  const claimedHash = typeof req.body.sha256 === 'string' ? req.body.sha256.trim().toLowerCase() : '';

  if (!deviceId || !folderId || !relativePath || !req.file) {
    removeUpload();
    return res.status(400).json({ message: 'deviceId, folderId, relativePath and file are required.' });
  }
  if (!/^[a-f0-9]{64}$/.test(claimedHash)) {
    removeUpload();
    return res.status(400).json({ message: 'sha256 must be a 64-character hex digest.' });
  }

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    removeUpload();
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const folder = dblessTestMode
    ? findProtectedFolderByIdForUser(folderId, userId)
    : await ProtectedFolder.findOne({ _id: folderId, userId, deviceId });

  if (!folder) {
    removeUpload();
    return res.status(404).json({ message: 'Protected folder not found.' });
  }

  let actualHash: string;
  try {
    actualHash = await hashFile(req.file.path);
  } catch (error) {
    removeUpload();
    return res.status(500).json({ message: 'Could not verify the uploaded backup.' });
  }

  if (actualHash !== claimedHash) {
    removeUpload();
    return res.status(400).json({ message: 'Uploaded content does not match the manifest hash.' });
  }

  const fields = {
    userId,
    deviceId,
    folderId,
    relativePath,
    sha256: actualHash,
    sizeBytes: req.file.size,
    storagePath: path.basename(req.file.path)
  };

  const duplicate = dblessTestMode
    ? findFileBackup(userId, folderId, relativePath, actualHash)
    : await FileBackup.findOne({ userId, folderId, relativePath, sha256: actualHash });

  if (duplicate) {
    removeUpload();
    return res.json({ id: '_id' in duplicate ? String(duplicate._id) : duplicate.id, deduplicated: true });
  }

  const backup = dblessTestMode ? addFileBackup(fields) : await FileBackup.create(fields);
  res.status(201).json({
    id: '_id' in backup ? String(backup._id) : backup.id,
    relativePath,
    sha256: actualHash,
    sizeBytes: fields.sizeBytes
  });
});

// Everything below is the owner-facing dashboard surface.
router.use(authenticate);
router.use(dashboardLimiter);

router.get('/status', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const folders = listProtectedFolders(userId);
    const withLatest = folders.map((folder) => {
      const latest = findLatestManifestForFolder(userId, folder.id);
      return {
        ...folder,
        latestManifest: latest
          ? {
              id: latest.id,
              scannedAtUtc: latest.scannedAtUtc,
              fileCount: latest.fileCount,
              totalBytes: latest.totalBytes,
              changeCount: latest.changeCount,
              integrityStatus: latest.integrityStatus,
              changes: latest.changes.slice(0, 8)
            }
          : null
      };
    });
    return res.json(summarize(withLatest));
  }

  const folders = await ProtectedFolder.find({ userId }).sort({ createdAt: 1 });
  const withLatest = await Promise.all(
    folders.map(async (folder) => {
      const latest = await FileManifest.findOne({ userId, folderId: String(folder._id) })
        .sort({ scannedAtUtc: -1 })
        .select('-entries');
      return {
        ...folder.toObject(),
        latestManifest: latest
          ? {
              id: String(latest._id),
              scannedAtUtc: latest.scannedAtUtc,
              fileCount: latest.fileCount,
              totalBytes: latest.totalBytes,
              changeCount: latest.changeCount,
              integrityStatus: latest.integrityStatus,
              changes: (latest.changes ?? []).slice(0, 8)
            }
          : null
      };
    })
  );

  res.json(summarize(withLatest));
});

function summarize(
  folders: {
    path: string;
    enabled: boolean;
    latestManifest: {
      scannedAtUtc: Date;
      fileCount: number;
      totalBytes: number;
      changeCount: number;
      integrityStatus: string;
    } | null;
  }[]
) {
  let protectedFiles = 0;
  let totalBytes = 0;
  let changedFiles = 0;
  let foldersWithChanges = 0;
  let lastScanUtc: Date | undefined;

  for (const folder of folders) {
    if (!folder.latestManifest) continue;
    protectedFiles += folder.latestManifest.fileCount;
    totalBytes += folder.latestManifest.totalBytes;
    changedFiles += folder.latestManifest.changeCount;
    if (folder.latestManifest.integrityStatus === 'changed') foldersWithChanges += 1;
    const scanned = folder.latestManifest.scannedAtUtc;
    if (!lastScanUtc || scanned > lastScanUtc) lastScanUtc = scanned;
  }

  return {
    stats: {
      folders: folders.length,
      enabledFolders: folders.filter((folder) => folder.enabled).length,
      protectedFiles,
      totalBytes,
      changedFiles,
      foldersWithChanges,
      lastScanUtc: lastScanUtc ?? null
    },
    folders
  };
}

router.post('/folders', validateBody(createFolderSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, label } = req.body;
  const folderPath = normalizeFolderPath(req.body.path);
  if (folderPath.length < 3) {
    return res.status(400).json({ message: 'Enter a full folder path.' });
  }

  const owner = await deviceOwnerUserId(deviceId);
  if (owner !== userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  if (dblessTestMode) {
    const existing = listProtectedFolders(userId, deviceId).some(
      (folder) => folder.path.toLowerCase() === folderPath.toLowerCase()
    );
    if (existing) {
      return res.status(409).json({ message: 'This folder is already protected.' });
    }
    const folder = addProtectedFolder({ userId, deviceId, path: folderPath, label });
    recordAuditLog({
      userId,
      action: 'protection.folder.added',
      actorType: 'user',
      description: `Protected folder "${label}" on ${deviceId}.`,
      targetType: 'protectedFolder',
      targetId: folder.id
    });
    return res.status(201).json(folder);
  }

  const existing = await ProtectedFolder.findOne({
    userId,
    deviceId,
    path: { $regex: `^${folderPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }
  });
  if (existing) {
    return res.status(409).json({ message: 'This folder is already protected.' });
  }

  const folder = await ProtectedFolder.create({ userId, deviceId, path: folderPath, label });
  recordAuditLog({
    userId,
    action: 'protection.folder.added',
    actorType: 'user',
    description: `Protected folder "${label}" on ${deviceId}.`,
    targetType: 'protectedFolder',
    targetId: folder._id.toString()
  });
  res.status(201).json(folder);
});

router.patch('/folders/:id', validateBody(updateFolderSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const folder = updateProtectedFolder(req.params.id, userId, req.body);
    if (!folder) return res.status(404).json({ message: 'Protected folder not found.' });
    return res.json(folder);
  }

  const folder = await ProtectedFolder.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: { ...req.body, updatedAt: new Date() } },
    { new: true }
  );
  if (!folder) return res.status(404).json({ message: 'Protected folder not found.' });
  res.json(folder);
});

router.delete('/folders/:id', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const folder = findProtectedFolderByIdForUser(req.params.id, userId);
    if (!folder) return res.status(404).json({ message: 'Protected folder not found.' });
    removeProtectedFolder(req.params.id, userId);
    recordAuditLog({
      userId,
      action: 'protection.folder.removed',
      actorType: 'user',
      description: `Stopped protecting folder "${folder.label}" on ${folder.deviceId}.`,
      targetType: 'protectedFolder',
      targetId: req.params.id
    });
    return res.status(204).send();
  }

  const folder = await ProtectedFolder.findOneAndDelete({ _id: req.params.id, userId });
  if (!folder) return res.status(404).json({ message: 'Protected folder not found.' });
  recordAuditLog({
    userId,
    action: 'protection.folder.removed',
    actorType: 'user',
    description: `Stopped protecting folder "${folder.label}" on ${folder.deviceId}.`,
    targetType: 'protectedFolder',
    targetId: req.params.id
  });
  res.status(204).send();
});

router.get('/backups', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : '';
  if (!folderId) {
    return res.status(400).json({ message: 'folderId is required.' });
  }

  if (dblessTestMode) {
    return res.json(
      listFileBackupsForFolder(userId, folderId)
        .sort((a, b) => b.backedUpAtUtc.getTime() - a.backedUpAtUtc.getTime())
        .map((backup) => ({
          id: backup.id,
          folderId: backup.folderId,
          deviceId: backup.deviceId,
          relativePath: backup.relativePath,
          sha256: backup.sha256,
          sizeBytes: backup.sizeBytes,
          backedUpAtUtc: backup.backedUpAtUtc
        }))
    );
  }

  const backups = await FileBackup.find({ userId, folderId }).sort({ backedUpAtUtc: -1 }).limit(500);
  res.json(
    backups.map((backup) => ({
      id: String(backup._id),
      folderId: backup.folderId,
      deviceId: backup.deviceId,
      relativePath: backup.relativePath,
      sha256: backup.sha256,
      sizeBytes: backup.sizeBytes,
      backedUpAtUtc: backup.backedUpAtUtc
    }))
  );
});

router.get('/manifests', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  if (dblessTestMode) {
    return res.json(
      listManifestsForUser(userId, folderId, limit).map((manifest) => ({
        id: manifest.id,
        deviceId: manifest.deviceId,
        folderId: manifest.folderId,
        path: manifest.path,
        label: manifest.label,
        fileCount: manifest.fileCount,
        totalBytes: manifest.totalBytes,
        changeCount: manifest.changeCount,
        integrityStatus: manifest.integrityStatus,
        scannedAtUtc: manifest.scannedAtUtc
      }))
    );
  }

  const filter: Record<string, unknown> = { userId };
  if (folderId) filter.folderId = folderId;
  const manifests = await FileManifest.find(filter).sort({ scannedAtUtc: -1 }).limit(limit).select('-entries');
  res.json(manifests);
});

router.get('/manifests/:id', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const manifest = listManifestsForUser(userId, undefined, 200).find((entry) => entry.id === req.params.id);
    if (!manifest) return res.status(404).json({ message: 'Manifest not found.' });
    return res.json({ ...manifest, entries: manifest.entries.slice(0, 500) });
  }

  const manifest = await FileManifest.findOne({ _id: req.params.id, userId });
  if (!manifest) return res.status(404).json({ message: 'Manifest not found.' });
  res.json({ ...manifest.toObject(), entries: manifest.entries.slice(0, 500) });
});

export default router;
