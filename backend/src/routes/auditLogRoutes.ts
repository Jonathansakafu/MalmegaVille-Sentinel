import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { listAuditLogs } from '../services/auditLogService.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const logs = await listAuditLogs(userId);
  res.json(logs);
});

export default router;
