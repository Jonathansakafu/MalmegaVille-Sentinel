import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { agentLimiter, dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import { validateSyncToken } from './syncRoutes.js';
import RestoreJob from '../models/RestoreJob.js';
import Capture from '../models/Capture.js';
import FileBackup from '../models/FileBackup.js';
import Device from '../models/Device.js';
import { dblessTestMode, captureStorageDir, backupStorageDir } from '../config.js';
import { recordAuditLog } from '../services/auditLogService.js';
import {
  findDeviceByDeviceId,
  findCaptureByIdForUser,
  findFileBackupByIdForUser,
  addRestoreJob,
  listRestoreJobsForUser,
  findRestoreJobByIdForUser,
  findRestoreJobById,
  findQueuedRestoreJobsForDevice,
  updateRestoreJob
} from '../services/inMemoryStore.js';

const router = Router();

const createJobSchema = z.object({
  deviceId: z.string().trim().min(1),
  sourceKind: z.enum(['capture', 'protected_file']),
  captureId: z.string().trim().min(1).optional(),
  backupId: z.string().trim().min(1).optional(),
  sourcePath: z.string().trim().min(2).max(1000).optional(),
  restorePath: z.string().trim().min(2).max(1000).optional(),
  fileName: z.string().trim().min(1).max(260).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  verificationHash: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional()
});

const reportSchema = z.object({
  status: z.enum(['completed', 'failed']),
  restoredPath: z.string().trim().max(1000).optional(),
  verificationHash: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
  error: z.string().trim().max(500).optional()
});

async function deviceOwnerUserId(deviceId: string): Promise<string | undefined> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.userId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.userId?.toString();
}

// GET /api/restore/pending - sync-token authed. Claims up to five queued jobs
// for the device. Claiming here (rather than just listing them) is what stops
// two agent instances - or a retry after a crash - from restoring the same
// file twice.
router.get('/pending', agentLimiter, async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const deviceId = String(req.query.deviceId ?? '');
  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required.' });
  }

  if (dblessTestMode) {
    const claimed = findQueuedRestoreJobsForDevice(deviceId)
      .slice(0, 5)
      .map((job) => updateRestoreJob(job.id, { status: 'downloading', startedAtUtc: new Date() }) ?? job);
    return res.json(claimed.map(toAgentJob));
  }

  const claimed: Record<string, unknown>[] = [];
  // A job claimed just before the agent crashed or the machine rebooted would
  // otherwise stay "downloading" forever, invisible to both the operator and
  // the agent. Give a live transfer 15 minutes, then make it claimable again.
  await RestoreJob.updateMany(
    { deviceId, status: 'downloading', startedAtUtc: { $lt: new Date(Date.now() - 15 * 60 * 1000) } },
    { $set: { status: 'queued' } }
  );
  for (let index = 0; index < 5; index += 1) {
    const job = await RestoreJob.findOneAndUpdate(
      { deviceId, status: 'queued' },
      { $set: { status: 'downloading', startedAtUtc: new Date() } },
      { new: true, sort: { requestedAtUtc: 1 } }
    );
    if (!job) break;
    claimed.push(toAgentJob(job));
  }
  res.json(claimed);
});

function toAgentJob(job: any) {
  return {
    id: String(job._id ?? job.id),
    sourceKind: job.sourceKind,
    captureId: job.captureId ?? undefined,
    backupId: job.backupId ?? undefined,
    sourcePath: job.sourcePath ?? undefined,
    restorePath: job.restorePath ?? undefined,
    fileName: job.fileName,
    sizeBytes: job.sizeBytes ?? undefined,
    verificationHash: job.verificationHash ?? undefined
  };
}

function jobId(job: { _id?: unknown; id?: string }): string {
  return String(job._id ?? job.id);
}

// GET /api/restore/jobs/:id/content - sync-token authed, streams the bytes a
// restore job refers to: stored evidence for a capture, or the hash-verified
// backup for a protected file.
router.get('/jobs/:id/content', agentLimiter, async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const job = dblessTestMode
    ? findRestoreJobByIdForUser(req.params.id, String(req.query.userId ?? '')) ??
      // Agents do not know the owner id; fall back to an unscoped lookup.
      findRestoreJobById(req.params.id)
    : await RestoreJob.findById(req.params.id);

  if (!job) return res.status(404).json({ message: 'Job not found.' });
  if (job.status === 'cancelled' || job.status === 'failed') {
    return res.status(409).json({ message: `Job is ${job.status}.` });
  }

  let absPath: string;
  let mimeType = 'application/octet-stream';

  if (job.sourceKind === 'capture') {
    if (!job.captureId) {
      return res.status(400).json({ message: 'This job has no downloadable content.' });
    }

    const capture = dblessTestMode
      ? findCaptureByIdForUser(job.captureId, String(job.userId))
      : await Capture.findOne({ _id: job.captureId, userId: job.userId });

    if (!capture || capture.skipped || !capture.storagePath) {
      return res.status(404).json({ message: 'Capture content is unavailable.' });
    }

    absPath = path.join(captureStorageDir, path.basename(capture.storagePath));
    mimeType = capture.mimeType ?? mimeType;
  } else if (job.backupId) {
    const backup = dblessTestMode
      ? findFileBackupByIdForUser(job.backupId, String(job.userId))
      : await FileBackup.findOne({ _id: job.backupId, userId: job.userId });

    if (!backup) {
      return res.status(404).json({ message: 'Backup content is unavailable.' });
    }

    absPath = path.join(backupStorageDir, path.basename(backup.storagePath));
  } else {
    return res.status(400).json({ message: 'This protected-file job has no backup to download.' });
  }

  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ message: 'Restore content is unavailable.' });
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${job.fileName.replace(/["\\\r\n]/g, '_')}"`);
  fs.createReadStream(absPath).pipe(res);
});

// POST /api/restore/jobs/:id/report - sync-token authed, agent reports the
// outcome after it wrote the file and re-hashed it on disk.
router.post('/jobs/:id/report', agentLimiter, validateBody(reportSchema), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { status, restoredPath, verificationHash, error } = req.body;

  const job = dblessTestMode
    ? findRestoreJobById(req.params.id)
    : await RestoreJob.findById(req.params.id);

  if (!job) return res.status(404).json({ message: 'Job not found.' });
  if (job.status === 'cancelled') {
    return res.status(409).json({ message: 'Job was cancelled.' });
  }

  const update = {
    status,
    restoredPath,
    verificationHash: verificationHash ? verificationHash.toLowerCase() : undefined,
    error,
    completedAtUtc: new Date()
  };

  const saved = dblessTestMode
    ? updateRestoreJob(req.params.id, update)
    : await RestoreJob.findByIdAndUpdate((job as any)._id, { $set: update }, { new: true });

  recordAuditLog({
    userId: String(job.userId),
    action: status === 'completed' ? 'restore.completed' : 'restore.failed',
    actorType: 'agent',
    description:
      status === 'completed'
        ? `Restored "${job.fileName}" to ${restoredPath ?? 'the recovery folder'} on ${job.deviceId}.`
        : `Restore of "${job.fileName}" on ${job.deviceId} failed: ${error ?? 'unknown error'}.`,
    targetType: 'restoreJob',
    targetId: req.params.id
  });

  res.json(saved);
});

router.use(authenticate);
router.use(dashboardLimiter);

router.get('/jobs', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(listRestoreJobsForUser(userId));
  }

  const jobs = await RestoreJob.find({ userId }).sort({ requestedAtUtc: -1 }).limit(200);
  res.json(jobs);
});

router.post('/jobs', validateBody(createJobSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, sourceKind, captureId, backupId, sourcePath, restorePath, verificationHash } = req.body;
  let { sizeBytes } = req.body;
  let fileName = req.body.fileName as string | undefined;
  let expectedHash: string | undefined = verificationHash ? verificationHash.toLowerCase() : undefined;

  const owner = await deviceOwnerUserId(deviceId);
  if (owner !== userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  if (sourceKind === 'capture') {
    if (!captureId) {
      return res.status(400).json({ message: 'captureId is required for a capture restore.' });
    }

    const capture = dblessTestMode
      ? findCaptureByIdForUser(captureId, userId)
      : await Capture.findOne({ _id: captureId, userId });

    if (!capture || capture.skipped || !capture.storagePath) {
      return res.status(404).json({ message: 'That capture has no restorable content.' });
    }
    fileName = fileName ?? capture.originalFileName ?? `capture-${captureId}`;
  } else if (backupId) {
    const backup = dblessTestMode
      ? findFileBackupByIdForUser(backupId, userId)
      : await FileBackup.findOne({ _id: backupId, userId });

    if (!backup || backup.deviceId !== deviceId) {
      return res.status(404).json({ message: 'That backup is not available for this device.' });
    }

    fileName = fileName ?? path.basename(backup.relativePath);
    expectedHash = expectedHash ?? backup.sha256;
    sizeBytes = sizeBytes ?? backup.sizeBytes;
  } else if (!sourcePath) {
    return res.status(400).json({ message: 'Choose a verified backup or a sourcePath for a protected-file restore.' });
  }

  if (!fileName) {
    fileName = path.basename(sourcePath ?? 'restored-file');
  }

  const fields = {
    userId,
    deviceId,
    sourceKind,
    captureId: sourceKind === 'capture' ? captureId : undefined,
    backupId: sourceKind === 'protected_file' ? backupId : undefined,
    sourcePath: sourceKind === 'protected_file' ? sourcePath : undefined,
    restorePath,
    fileName,
    sizeBytes,
    verificationHash: expectedHash
  };

  const job = dblessTestMode ? addRestoreJob(fields) : await RestoreJob.create(fields);

  recordAuditLog({
    userId,
    action: 'restore.requested',
    actorType: 'user',
    description: `Requested restore of "${fileName}" to ${deviceId}.`,
    targetType: 'restoreJob',
    targetId: jobId(job)
  });

  res.status(201).json(job);
});

router.post('/jobs/:id/cancel', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const job = findRestoreJobByIdForUser(req.params.id, userId);
    if (!job) return res.status(404).json({ message: 'Job not found.' });
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return res.status(409).json({ message: `Job is already ${job.status}.` });
    }
    const updated = updateRestoreJob(req.params.id, { status: 'cancelled', completedAtUtc: new Date() });
    recordAuditLog({
      userId,
      action: 'restore.cancelled',
      actorType: 'user',
      description: `Cancelled restore of "${job.fileName}".`,
      targetType: 'restoreJob',
      targetId: req.params.id
    });
    return res.json(updated);
  }

  const job = await RestoreJob.findOne({ _id: req.params.id, userId });
  if (!job) return res.status(404).json({ message: 'Job not found.' });
  if (!['queued', 'downloading'].includes(job.status)) {
    return res.status(409).json({ message: `Job is already ${job.status}.` });
  }

  job.status = 'cancelled';
  job.completedAtUtc = new Date();
  await job.save();

  recordAuditLog({
    userId,
    action: 'restore.cancelled',
    actorType: 'user',
    description: `Cancelled restore of "${job.fileName}".`,
    targetType: 'restoreJob',
    targetId: req.params.id
  });

  res.json(job);
});

export default router;
