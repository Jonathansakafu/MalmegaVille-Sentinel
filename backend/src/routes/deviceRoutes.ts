import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import Device from '../models/Device.js';
import { dblessTestMode } from '../config.js';
import { recordAuditLog } from '../services/auditLogService.js';
import { listDevicesForUser, upsertDevice, setDeviceLostStatus, removeDeviceByIdForUser } from '../services/inMemoryStore.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const createDeviceSchema = z.object({
  deviceId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  operatingSystem: z.string().trim().min(1)
});

const lostStatusSchema = z.object({
  isLost: z.boolean()
});

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(listDevicesForUser(userId));
  }

  const devices = await Device.find({ userId });
  res.json(devices);
});

router.post('/', validateBody(createDeviceSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, name, operatingSystem } = req.body;

  if (dblessTestMode) {
    const device = upsertDevice({ userId, deviceId, name, operatingSystem });
    return res.status(201).json(device);
  }

  const existingDevice = await Device.findOne({ userId, deviceId });
  if (existingDevice) {
    existingDevice.lastSeen = new Date();
    existingDevice.name = name;
    existingDevice.operatingSystem = operatingSystem;
    await existingDevice.save();
    return res.json(existingDevice);
  }

  const device = new Device({
    userId,
    deviceId,
    name,
    operatingSystem,
    lastSeen: new Date(),
    securityStatus: 'safe'
  });

  await device.save();
  res.status(201).json(device);
});

router.patch('/:id/lost-status', validateBody(lostStatusSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { isLost } = req.body;

  if (dblessTestMode) {
    const device = setDeviceLostStatus(req.params.id, userId, isLost);
    if (!device) {
      return res.status(404).json({ message: 'Device not found.' });
    }
    recordAuditLog({
      userId,
      action: isLost ? 'device.marked_lost' : 'device.marked_found',
      actorType: 'user',
      description: `Device "${device.name}" marked as ${isLost ? 'lost/stolen' : 'found'}.`,
      targetType: 'device',
      targetId: device.deviceId
    });
    return res.json(device);
  }

  const device = await Device.findOne({ _id: req.params.id, userId });
  if (!device) {
    return res.status(404).json({ message: 'Device not found.' });
  }

  device.isLost = isLost;
  device.lostAt = isLost ? new Date() : null;
  device.securityStatus = isLost ? 'stolen' : 'safe';
  await device.save();

  recordAuditLog({
    userId,
    action: isLost ? 'device.marked_lost' : 'device.marked_found',
    actorType: 'user',
    description: `Device "${device.name}" marked as ${isLost ? 'lost/stolen' : 'found'}.`,
    targetType: 'device',
    targetId: device.deviceId
  });

  res.json(device);
});

// Lets a user clean up stale/duplicate device entries themselves - e.g. the
// Android app previously generated a fresh random deviceId on every
// uninstall/reinstall, registering what looked like a brand new device each
// time even though it was the same phone. Only removes the Device record;
// its past captures are left alone (same as the captures list not
// cascading when its owning device disappears elsewhere in the codebase).
router.delete('/:id', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const removed = removeDeviceByIdForUser(req.params.id, userId);
    if (!removed) {
      return res.status(404).json({ message: 'Device not found.' });
    }
    recordAuditLog({
      userId,
      action: 'device.removed',
      actorType: 'user',
      description: 'Device removed from inventory.',
      targetType: 'device',
      targetId: req.params.id
    });
    return res.status(204).send();
  }

  const device = await Device.findOneAndDelete({ _id: req.params.id, userId });
  if (!device) {
    return res.status(404).json({ message: 'Device not found.' });
  }

  recordAuditLog({
    userId,
    action: 'device.removed',
    actorType: 'user',
    description: `Device "${device.name}" removed from inventory.`,
    targetType: 'device',
    targetId: device.deviceId
  });

  res.status(204).send();
});

export default router;
