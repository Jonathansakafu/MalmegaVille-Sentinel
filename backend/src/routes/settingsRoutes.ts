import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import NotificationSettings from '../models/NotificationSettings.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { recordAuditLog } from '../services/auditLogService.js';
import { getNotificationSettingsForUser, saveNotificationSettingsForUser } from '../services/inMemoryStore.js';
import { dblessTestMode } from '../config.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

// E.164 format (e.g. +15551234567) - the format the device's own cellular
// modem needs to address an SMS directly, with no internet involved.
const phoneNumberPattern = /^\+[1-9]\d{6,14}$/;
const phoneNumberSchema = z.union([
  z.literal(''),
  z.string().trim().regex(phoneNumberPattern, 'Use international format, e.g. +15551234567.')
]);

const notificationSettingsSchema = z.object({
  alertEmailRecipient: z.union([z.literal(''), z.string().trim().email()]),
  alertPhoneNumber: phoneNumberSchema.default('')
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
    alertEmailRecipient: settings?.alertEmailRecipient ?? '',
    alertPhoneNumber: settings?.alertPhoneNumber ?? ''
  });
});

router.put('/notifications', validateBody(notificationSettingsSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { alertEmailRecipient, alertPhoneNumber } = req.body;

  recordAuditLog({
    userId,
    action: 'settings.notifications.updated',
    actorType: 'user',
    description: 'Notification settings were updated.'
  });

  if (dblessTestMode) {
    return res.json(saveNotificationSettingsForUser(userId, { alertEmailRecipient, alertPhoneNumber }));
  }

  const settings = await NotificationSettings.findOneAndUpdate(
    { userId },
    { userId, alertEmailRecipient, alertPhoneNumber, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    alertEmailRecipient: settings.alertEmailRecipient ?? '',
    alertPhoneNumber: settings.alertPhoneNumber ?? ''
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
