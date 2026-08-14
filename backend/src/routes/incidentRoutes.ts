import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import Incident from '../models/Incident.js';
import Device from '../models/Device.js';
import { notifySecurityEvent } from '../services/alertService.js';

const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const incidents = await Incident.find({ userId }).sort({ createdAt: -1 });
  res.json(incidents);
});

router.post('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { deviceId, incidentType, threatScore, severity, summary, details } = req.body;
  if (
    typeof deviceId !== 'string' ||
    typeof incidentType !== 'string' ||
    typeof threatScore !== 'number' ||
    typeof severity !== 'string' ||
    typeof summary !== 'string'
  ) {
    return res.status(400).json({ message: 'deviceId, incidentType, threatScore, severity, and summary are required and must be valid.' });
  }

  const incident = new Incident({
    deviceId,
    userId,
    incidentType,
    threatScore,
    severity,
    summary,
    details: typeof details === 'object' && details !== null ? details : {}
  });

  await incident.save();

  const device = await Device.findOne({ userId, deviceId });
  const deviceName = device?.name ?? 'Unknown device';

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
