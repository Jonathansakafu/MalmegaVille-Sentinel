import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import NotificationSettings from '../models/NotificationSettings.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { getNotificationSettings, saveNotificationSettings } from '../services/inMemoryStore.js';
import { dblessTestMode } from '../config.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const notificationSettingsSchema = z.object({
  alertEmailRecipient: z.union([z.literal(''), z.string().trim().email()]),
  telegramBotToken: z.string(),
  telegramChatId: z.string()
});

router.get('/notifications', async (_req, res) => {
  if (dblessTestMode) {
    return res.json(getNotificationSettings());
  }

  const settings = await NotificationSettings.findOne();
  res.json({
    alertEmailRecipient: settings?.alertEmailRecipient ?? '',
    telegramBotToken: settings?.telegramBotToken ?? '',
    telegramChatId: settings?.telegramChatId ?? ''
  });
});

router.put('/notifications', validateBody(notificationSettingsSchema), async (req, res) => {
  const { alertEmailRecipient, telegramBotToken, telegramChatId } = req.body;

  if (dblessTestMode) {
    return res.json(saveNotificationSettings({ alertEmailRecipient, telegramBotToken, telegramChatId }));
  }

  const settings = await NotificationSettings.findOneAndUpdate(
    {},
    { alertEmailRecipient, telegramBotToken, telegramChatId, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    alertEmailRecipient: settings.alertEmailRecipient ?? '',
    telegramBotToken: settings.telegramBotToken ?? '',
    telegramChatId: settings.telegramChatId ?? ''
  });
});

router.post('/notifications/test', async (_req, res) => {
  const result = await notifySecurityEvent({
    deviceName: 'Desktop App',
    eventType: 'Test Alert',
    timestampUtc: new Date(),
    severity: 'Informational',
    description: 'This is a test alert sent from the MalmegaVille Sentinel desktop app to verify your notification settings.'
  });

  res.json(result);
});

export default router;
