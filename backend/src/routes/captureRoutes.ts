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
import Capture from '../models/Capture.js';
import Device from '../models/Device.js';
import {
  dblessTestMode,
  captureStorageDir,
  captureMaxFileBytes,
  captureMaxSessionBytes,
  ipGeolocationEnabled,
  ipGeolocationUrl
} from '../config.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { recordAuditLog } from '../services/auditLogService.js';
import {
  findDeviceByDeviceId,
  addInMemoryCapture,
  listCapturesForUser,
  findCaptureByIdForUser,
  removeCaptureByIdForUser,
  sumSessionBytes
} from '../services/inMemoryStore.js';

const router = Router();

fs.mkdirSync(captureStorageDir, { recursive: true });

const storage = multer.diskStorage({
  destination: captureStorageDir,
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname || '')}`)
});

const uploadPhoto = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });
const uploadUsbFile = multer({ storage, limits: { fileSize: captureMaxFileBytes } });

// 'sign_in' (a fresh Windows sign-in, not just an unlock) and 'phone_check'
// (an Android device's own periodic/unlock lost-status check) were added
// after this list was first written and are validated the same way as the
// original two - listed together so `photo`'s inline check below can't
// silently drift out of sync with this again.
const VALID_TRIGGER_EVENTS = ['usb_insert', 'login_unlock', 'sign_in', 'phone_check'] as const;

const locationSchema = z.object({
  deviceId: z.string().trim().min(1),
  triggerEvent: z.enum(VALID_TRIGGER_EVENTS).optional(),
  capturedAtUtc: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyMeters: z.number().optional()
});

const usbManifestSchema = z.object({
  deviceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  entries: z.array(z.unknown())
});

async function deviceDisplayName(deviceId: string): Promise<string> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.name ?? deviceId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.name ?? deviceId;
}

async function deviceOwnerUserId(deviceId: string): Promise<string | undefined> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.userId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.userId?.toString();
}

function clientIp(req: any): string {
  const forwardedFor = req.header('x-forwarded-for');
  const ip = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : req.socket.remoteAddress;
  return (ip ?? '').replace(/^::ffff:/, '');
}

interface IpLocationResult {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
}

async function resolveIpLocation(ip: string): Promise<IpLocationResult | undefined> {
  if (!ipGeolocationEnabled || !ip || ip === '127.0.0.1' || ip === '::1') {
    return undefined;
  }

  try {
    const response = await fetch(`${ipGeolocationUrl}/${encodeURIComponent(ip)}`);
    if (!response.ok) return undefined;
    const body: any = await response.json();
    if (body.status === 'fail' || typeof body.lat !== 'number' || typeof body.lon !== 'number') {
      return undefined;
    }
    return { latitude: body.lat, longitude: body.lon, city: body.city, region: body.regionName, country: body.country };
  } catch (error) {
    console.error('IP geolocation lookup failed', error);
    return undefined;
  }
}

// POST /api/captures/location - sync-token authed, called by the desktop agent.
// Prefers Wi-Fi-based coordinates supplied by the agent; falls back to
// server-side IP geolocation when the agent couldn't get an OS location fix.
router.post('/location', agentLimiter, validateBody(locationSchema), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, triggerEvent, capturedAtUtc, latitude, longitude, accuracyMeters } = req.body;

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  let metadata: Record<string, unknown>;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    metadata = { source: 'wifi', latitude, longitude, accuracyMeters };
  } else {
    const ipLocation = await resolveIpLocation(clientIp(req));
    metadata = ipLocation ? { source: 'ip', ...ipLocation } : { source: 'unavailable' };
  }

  const captureFields = {
    userId,
    deviceId,
    captureType: 'location' as const,
    triggerEvent: (VALID_TRIGGER_EVENTS as readonly string[]).includes(triggerEvent) ? triggerEvent : undefined,
    skipped: metadata.source === 'unavailable',
    skipReason: metadata.source === 'unavailable' ? 'location_unavailable' : undefined,
    capturedAtUtc: capturedAtUtc ? new Date(capturedAtUtc) : new Date(),
    metadata
  };

  const capture = dblessTestMode
    ? addInMemoryCapture(captureFields)
    : await Capture.create(captureFields);

  if (metadata.source !== 'unavailable') {
    notifySecurityEvent({
      userId,
      deviceName: await deviceDisplayName(deviceId),
      eventType: 'Lost Device Location Captured',
      timestampUtc: new Date(),
      severity: 'High',
      description: `An approximate location (${metadata.source === 'wifi' ? 'Wi-Fi' : 'IP-based'}) was captured on a device flagged lost.`,
      metadata: { captureId: dblessTestMode ? (capture as any).id : (capture as any)._id.toString(), ...metadata }
    }).catch((error) => console.error('Capture notification failed', error));
  }

  res.status(201).json(capture);
});

// POST /api/captures/photo - sync-token authed, called by the desktop agent
router.post('/photo', agentLimiter, uploadPhoto.single('photo'), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, triggerEvent, capturedAtUtc } = req.body;
  if (typeof deviceId !== 'string' || !deviceId) {
    return res.status(400).json({ message: 'deviceId is required.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'photo file is required.' });
  }

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const captureFields = {
    userId,
    deviceId,
    captureType: 'webcam_photo' as const,
    triggerEvent: (VALID_TRIGGER_EVENTS as readonly string[]).includes(triggerEvent) ? triggerEvent : undefined,
    originalFileName: req.file.originalname,
    sizeBytes: req.file.size,
    mimeType: req.file.mimetype,
    storagePath: path.basename(req.file.path),
    skipped: false,
    capturedAtUtc: capturedAtUtc ? new Date(capturedAtUtc) : new Date(),
    metadata: {}
  };

  const capture = dblessTestMode
    ? addInMemoryCapture(captureFields)
    : await Capture.create(captureFields);

  notifySecurityEvent({
    userId,
    deviceName: await deviceDisplayName(deviceId),
    eventType: 'Lost Device Photo Captured',
    timestampUtc: new Date(),
    severity: 'High',
    description: `A webcam photo was captured on a device flagged lost (trigger: ${triggerEvent ?? 'unknown'}).`,
    metadata: { captureId: dblessTestMode ? (capture as any).id : (capture as any)._id.toString() }
  }).catch((error) => console.error('Capture notification failed', error));

  res.status(201).json(capture);
});

// POST /api/captures/usb-file - sync-token authed, called by the Windows service
router.post('/usb-file', agentLimiter, uploadUsbFile.single('file'), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, sessionId, originalPath, capturedAtUtc } = req.body;
  if (typeof deviceId !== 'string' || !deviceId || typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ message: 'deviceId and sessionId are required.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'file is required.' });
  }

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const existingSessionBytes = dblessTestMode
    ? sumSessionBytes(deviceId, sessionId, 'usb_file')
    : (await Capture.aggregate([
        { $match: { deviceId, sessionId, captureType: 'usb_file' } },
        { $group: { _id: null, total: { $sum: '$sizeBytes' } } }
      ]))[0]?.total ?? 0;

  if (existingSessionBytes + req.file.size > captureMaxSessionBytes) {
    fs.unlink(req.file.path, () => {});
    const skippedFields = {
      userId,
      deviceId,
      captureType: 'usb_file' as const,
      sessionId,
      originalFileName: req.file.originalname,
      originalPath: typeof originalPath === 'string' ? originalPath : undefined,
      sizeBytes: req.file.size,
      skipped: true,
      skipReason: 'session_cap_reached',
      capturedAtUtc: capturedAtUtc ? new Date(capturedAtUtc) : new Date(),
      metadata: {}
    };
    const skippedCapture = dblessTestMode ? addInMemoryCapture(skippedFields) : await Capture.create(skippedFields);
    return res.status(413).json(skippedCapture);
  }

  const captureFields = {
    userId,
    deviceId,
    captureType: 'usb_file' as const,
    sessionId,
    originalFileName: req.file.originalname,
    originalPath: typeof originalPath === 'string' ? originalPath : undefined,
    sizeBytes: req.file.size,
    mimeType: req.file.mimetype,
    storagePath: path.basename(req.file.path),
    skipped: false,
    capturedAtUtc: capturedAtUtc ? new Date(capturedAtUtc) : new Date(),
    metadata: {}
  };

  const capture = dblessTestMode
    ? addInMemoryCapture(captureFields)
    : await Capture.create(captureFields);

  res.status(201).json(capture);
});

// POST /api/captures/usb-manifest - sync-token authed, bulk-registers files that were skipped client-side
router.post('/usb-manifest', agentLimiter, validateBody(usbManifestSchema), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, sessionId, entries } = req.body;

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const manifestFields = (entries as unknown[])
    .filter((entry: unknown): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry: Record<string, unknown>) => ({
      userId,
      deviceId,
      captureType: 'usb_manifest' as const,
      sessionId,
      originalFileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
      originalPath: typeof entry.path === 'string' ? entry.path : undefined,
      sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : undefined,
      skipped: true,
      skipReason: typeof entry.reason === 'string' ? entry.reason : 'unknown',
      capturedAtUtc: new Date(),
      metadata: {}
    }));

  const saved = dblessTestMode
    ? manifestFields.map((fields) => addInMemoryCapture(fields))
    : await Capture.insertMany(manifestFields);

  res.status(201).json({ saved: saved.length });
});

// GET /api/captures - JWT authed, owner-facing gallery list
router.get('/', authenticate, dashboardLimiter, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined;
  const captureType = typeof req.query.captureType === 'string' ? req.query.captureType : undefined;
  const limit = Number(req.query.limit) || 100;

  if (dblessTestMode) {
    return res.json(listCapturesForUser(userId, { deviceId, captureType }).slice(0, limit));
  }

  const filter: Record<string, unknown> = { userId };
  if (deviceId) filter.deviceId = deviceId;
  if (captureType) filter.captureType = captureType;

  const captures = await Capture.find(filter).sort({ capturedAtUtc: -1 }).limit(limit);
  res.json(captures);
});

// GET /api/captures/:id/content - JWT authed, streams the stored file
router.get('/:id/content', authenticate, dashboardLimiter, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const capture = dblessTestMode
    ? findCaptureByIdForUser(req.params.id, userId)
    : await Capture.findOne({ _id: req.params.id, userId });

  if (!capture || capture.skipped || !capture.storagePath) {
    return res.status(404).json({ message: 'Not found.' });
  }

  const absPath = path.join(captureStorageDir, path.basename(capture.storagePath));
  if (!fs.existsSync(absPath)) {
    return res.status(404).json({ message: 'Not found.' });
  }

  res.setHeader('Content-Type', capture.mimeType ?? 'application/octet-stream');
  fs.createReadStream(absPath).pipe(res);
});

// DELETE /api/captures/:id - JWT authed, removes the record and its stored
// file (if any). Scoped to the requesting account's own captures only.
router.delete('/:id', authenticate, dashboardLimiter, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const capture = dblessTestMode
    ? findCaptureByIdForUser(req.params.id, userId)
    : await Capture.findOne({ _id: req.params.id, userId });

  if (!capture) {
    return res.status(404).json({ message: 'Not found.' });
  }

  if (capture.storagePath) {
    const absPath = path.join(captureStorageDir, path.basename(capture.storagePath));
    fs.rm(absPath, { force: true }, () => {
      // Best effort - a missing file shouldn't block deleting the record.
    });
  }

  if (dblessTestMode) {
    removeCaptureByIdForUser(req.params.id, userId);
  } else {
    await Capture.deleteOne({ _id: req.params.id, userId });
  }

  recordAuditLog({
    userId,
    action: 'capture.deleted',
    actorType: 'user',
    description: `Deleted a ${capture.captureType} capture for device ${capture.deviceId}.`,
    targetType: 'capture',
    targetId: req.params.id
  });

  res.status(204).send();
});

export default router;
