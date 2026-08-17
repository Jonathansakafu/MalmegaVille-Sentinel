import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import NotificationSettings from '../models/NotificationSettings.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { getNotificationSettings, saveNotificationSettings } from '../services/inMemoryStore.js';
import { dblessTestMode } from '../config.js';

const router = Router();

router.use(authenticate);

function validateEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

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

router.put('/notifications', async (req, res) => {
  const { alertEmailRecipient, telegramBotToken, telegramChatId } = req.body;

  if (typeof alertEmailRecipient !== 'string' || (alertEmailRecipient !== '' && !validateEmail(alertEmailRecipient))) {
    return res.status(400).json({ message: 'alertEmailRecipient must be a valid email address or an empty string.' });
  }
  if (typeof telegramBotToken !== 'string') {
    return res.status(400).json({ message: 'telegramBotToken must be a string.' });
  }
  if (typeof telegramChatId !== 'string') {
    return res.status(400).json({ message: 'telegramChatId must be a string.' });
  }

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
