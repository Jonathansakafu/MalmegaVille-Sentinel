import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import NotificationSettings from '../models/NotificationSettings.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { getNotificationSettingsForUser, saveNotificationSettingsForUser } from '../services/inMemoryStore.js';
import { dblessTestMode } from '../config.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const notificationSettingsSchema = z.object({
  alertEmailRecipient: z.union([z.literal(''), z.string().trim().email()])
});

router.get('/notifications', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(getNotificationSettingsForUser(userId));
  }

  const settings = await NotificationSettings.findOne({ userId });
  res.json({
    alertEmailRecipient: settings?.alertEmailRecipient ?? ''
  });
});

router.put('/notifications', validateBody(notificationSettingsSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { alertEmailRecipient } = req.body;

  if (dblessTestMode) {
    return res.json(saveNotificationSettingsForUser(userId, { alertEmailRecipient }));
  }

  const settings = await NotificationSettings.findOneAndUpdate(
    { userId },
    { userId, alertEmailRecipient, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    alertEmailRecipient: settings.alertEmailRecipient ?? ''
  });
});

router.post('/notifications/test', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const result = await notifySecurityEvent({
    userId,
    deviceName: 'Desktop App',
    eventType: 'Test Alert',
    timestampUtc: new Date(),
    severity: 'Informational',
    description: 'This is a test alert sent from the MalmegaVille Sentinel desktop app to verify your notification settings.'
  });

  res.json(result);
});

export default router;
