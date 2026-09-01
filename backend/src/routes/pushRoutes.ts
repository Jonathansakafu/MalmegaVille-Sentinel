import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import { vapidPublicKey } from '../config.js';
import { isPushConfigured, saveSubscription, removeSubscription } from '../services/pushService.js';

const router = Router();

// The browser needs the VAPID public key before it can even create a
// subscription, so this one endpoint is intentionally not behind auth -
// it carries no user data, just the server's public push key.
router.get('/public-key', (_req, res) => {
  if (!isPushConfigured()) {
    return res.status(404).json({ message: 'Push notifications are not configured on this server.' });
  }
  res.json({ publicKey: vapidPublicKey });
});

router.use(authenticate);
router.use(dashboardLimiter);

const subscriptionSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1)
  })
});

router.post('/subscribe', validateBody(subscriptionSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (!isPushConfigured()) {
    return res.status(503).json({ message: 'Push notifications are not configured on this server.' });
  }

  await saveSubscription(userId, req.body);
  res.status(201).json({ message: 'Subscribed.' });
});

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().url()
});

router.post('/unsubscribe', validateBody(unsubscribeSchema), async (req, res) => {
  await removeSubscription(req.body.endpoint);
  res.json({ message: 'Unsubscribed.' });
});

export default router;
