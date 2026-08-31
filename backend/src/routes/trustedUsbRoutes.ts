import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import TrustedUsbDevice from '../models/TrustedUsbDevice.js';
import SyncEvent from '../models/SyncEvent.js';
import { dblessTestMode } from '../config.js';
import {
  listTrustedUsbDevices,
  findTrustedUsbDeviceByIdentifier,
  addTrustedUsbDevice,
  removeTrustedUsbDevice,
  listRecentUsbEvents
} from '../services/inMemoryStore.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const createTrustedUsbDeviceSchema = z.object({
  identifier: z.string().trim().min(1),
  label: z.string().trim().min(1)
});

const USB_CONNECT_EVENT_TYPE = 'USB Device Connected';

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(listTrustedUsbDevices(userId));
  }

  const devices = await TrustedUsbDevice.find({ userId }).sort({ createdAt: -1 });
  res.json(devices);
});

router.post('/', validateBody(createTrustedUsbDeviceSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { identifier, label } = req.body;

  if (dblessTestMode) {
    if (findTrustedUsbDeviceByIdentifier(userId, identifier)) {
      return res.status(409).json({ message: 'This USB device is already trusted.' });
    }
    const device = addTrustedUsbDevice(userId, identifier, label);
    return res.status(201).json(device);
  }

  const existing = await TrustedUsbDevice.findOne({ userId, identifier });
  if (existing) {
    return res.status(409).json({ message: 'This USB device is already trusted.' });
  }

  const device = await TrustedUsbDevice.create({ userId, identifier, label });
  res.status(201).json(device);
});

router.delete('/:id', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const removed = removeTrustedUsbDevice(userId, req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Trusted device not found.' });
    }
    return res.status(204).send();
  }

  const result = await TrustedUsbDevice.findOneAndDelete({ _id: req.params.id, userId });
  if (!result) {
    return res.status(404).json({ message: 'Trusted device not found.' });
  }
  res.status(204).send();
});

// Recent USB-connect events not already on the trusted list, deduped by device
// identifier (most recent occurrence), so the dashboard can offer a one-click
// "Mark as Known" action right where the alert shows up.
router.get('/recent-unrecognized', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const trustedIdentifiers = new Set(
    dblessTestMode
      ? listTrustedUsbDevices(userId).map((device) => device.identifier)
      : (await TrustedUsbDevice.find({ userId }).select('identifier')).map((device) => device.identifier)
  );

  const rawEvents = dblessTestMode
    ? listRecentUsbEvents(userId)
    : (await SyncEvent.find({ eventType: USB_CONNECT_EVENT_TYPE, userId }).sort({ createdAt: -1 }).limit(50)).map((event) => ({
        deviceName: event.deviceName,
        description: event.description,
        timestampUtc: event.timestampUtc
      }));

  const seen = new Set<string>();
  const unrecognized: { deviceName: string; description: string; timestampUtc: Date }[] = [];
  for (const event of rawEvents) {
    if (!event.deviceName || event.deviceName === 'unknown' || trustedIdentifiers.has(event.deviceName) || seen.has(event.deviceName)) {
      continue;
    }
    seen.add(event.deviceName);
    unrecognized.push(event);
    if (unrecognized.length >= 10) break;
  }

  res.json(unrecognized);
});

export default router;
