import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { authenticate } from '../middleware/authMiddleware.js';
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
import {
  findDeviceByDeviceId,
  addInMemoryCapture,
  listCapturesForUser,
  findCaptureByIdForUser,
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
router.post('/location', async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, triggerEvent, capturedAtUtc, latitude, longitude, accuracyMeters } = req.body ?? {};
  if (typeof deviceId !== 'string' || !deviceId) {
    return res.status(400).json({ message: 'deviceId is required.' });
  }

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
    triggerEvent: triggerEvent === 'usb_insert' || triggerEvent === 'login_unlock' ? triggerEvent : undefined,
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
router.post('/photo', uploadPhoto.single('photo'), async (req, res) => {
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
    triggerEvent: triggerEvent === 'usb_insert' || triggerEvent === 'login_unlock' ? triggerEvent : undefined,
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
router.post('/usb-file', uploadUsbFile.single('file'), async (req, res) => {
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
router.post('/usb-manifest', async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, sessionId, entries } = req.body;
  if (typeof deviceId !== 'string' || !deviceId || typeof sessionId !== 'string' || !sessionId || !Array.isArray(entries)) {
    return res.status(400).json({ message: 'deviceId, sessionId, and entries[] are required.' });
  }

  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const manifestFields = entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry: any) => ({
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
router.get('/', authenticate, async (req, res) => {
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
router.get('/:id/content', authenticate, async (req, res) => {
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

export default router;
