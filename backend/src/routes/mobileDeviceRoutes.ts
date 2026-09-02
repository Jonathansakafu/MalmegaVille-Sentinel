import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import MobileDevice from '../models/MobileDevice.js';
import { dblessTestMode } from '../config.js';
import { listMobileDevicesForUser, upsertMobileDevice } from '../services/inMemoryStore.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const registerSchema = z.object({
  fcmToken: z.string().trim().min(1),
  deviceLabel: z.string().trim().max(100).optional()
});

// Called by the companion Android app right after sign-in, and again
// whenever Firebase issues it a new token - upserts by token, so re-pairing
// the same phone just refreshes its record rather than duplicating it.
router.post('/register', validateBody(registerSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { fcmToken, deviceLabel } = req.body;

  if (dblessTestMode) {
    const device = upsertMobileDevice({ userId, platform: 'android', fcmToken, deviceLabel: deviceLabel ?? '' });
    return res.status(201).json(device);
  }

  const device = await MobileDevice.findOneAndUpdate(
    { fcmToken },
    { userId, platform: 'android', fcmToken, deviceLabel: deviceLabel ?? '', lastSeenAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(201).json(device);
});

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(listMobileDevicesForUser(userId));
  }

  const devices = await MobileDevice.find({ userId });
  res.json(devices);
});

export default router;
