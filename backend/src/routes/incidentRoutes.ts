import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import Incident from '../models/Incident.js';
import Device from '../models/Device.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { dblessTestMode } from '../config.js';
import { listIncidentsForUser, addIncident, findDeviceByDeviceId } from '../services/inMemoryStore.js';

const router = Router();

router.use(authenticate);
router.use(dashboardLimiter);

const createIncidentSchema = z.object({
  deviceId: z.string().trim().min(1),
  incidentType: z.string().trim().min(1),
  threatScore: z.number().min(0).max(100),
  severity: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional()
});

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    return res.json(listIncidentsForUser(userId));
  }

  const incidents = await Incident.find({ userId }).sort({ createdAt: -1 });
  res.json(incidents);
});

router.post('/', validateBody(createIncidentSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, incidentType, threatScore, severity, summary, details } = req.body;

  const incidentFields = {
    deviceId,
    userId,
    incidentType,
    threatScore,
    severity,
    summary,
    details: details ?? {}
  };

  const incident = dblessTestMode ? addIncident(incidentFields) : await new Incident(incidentFields).save();

  const deviceName = dblessTestMode
    ? findDeviceByDeviceId(deviceId)?.name ?? 'Unknown device'
    : (await Device.findOne({ userId, deviceId }))?.name ?? 'Unknown device';

  notifySecurityEvent({
    deviceName,
    eventType: 'Incident Report',
    timestampUtc: new Date(),
    severity,
    description: summary,
    threatScore,
    recommendedAction: 'Review the incident and perform containment steps immediately.',
    metadata: { incidentType, details }
  }).catch((error) => {
    console.error('Incident email notification failed', error);
  });

  res.status(201).json(incident);
});

export default router;
