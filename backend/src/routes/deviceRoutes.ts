import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import Device from '../models/Device.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const devices = await Device.find({ userId });
  res.json(devices);
});

router.post('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, name, operatingSystem } = req.body;
  if (typeof deviceId !== 'string' || typeof name !== 'string' || typeof operatingSystem !== 'string') {
    return res.status(400).json({ message: 'deviceId, name, and operatingSystem are required.' });
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

export default router;
