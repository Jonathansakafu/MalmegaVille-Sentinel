import { Router } from 'express';
import SyncEvent from '../models/SyncEvent.js';
import { syncToken, dblessTestMode } from '../config.js';
import { notifySecurityEvent } from '../services/alertService.js';

const router = Router();

function validateSyncToken(req: any) {
  if (!syncToken) {
    return true;
  }

  const token = req.header('x-sync-token');
  return typeof token === 'string' && token === syncToken;
}

router.post('/events', async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const payload = Array.isArray(req.body) ? req.body : [req.body];
  const events = payload
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      deviceId: String(item.deviceId ?? 'unknown'),
      deviceName: typeof item.deviceName === 'string' ? item.deviceName : String(item.deviceId ?? 'unknown'),
      eventType: String(item.eventType ?? 'unknown'),
      timestampUtc: item.timestampUtc ? new Date(item.timestampUtc) : new Date(),
      severity: typeof item.severity === 'string' ? item.severity : 'Informational',
      description: String(item.description ?? ''),
      threatScore: typeof item.threatScore === 'number' ? item.threatScore : item.threatScore ? Number(item.threatScore) : undefined,
      recommendedAction: typeof item.recommendedAction === 'string' ? item.recommendedAction : undefined,
      metadata: item.metadata ?? {}
    }));

  if (events.length === 0) {
    return res.status(400).json({ message: 'No valid sync event payload found.' });
  }

  if (dblessTestMode) {
    for (const event of events) {
      notifySecurityEvent({
        deviceName: event.deviceName,
        eventType: event.eventType,
        timestampUtc: event.timestampUtc,
        severity: event.severity,
        description: event.description,
        threatScore: event.threatScore,
        recommendedAction: event.recommendedAction,
        metadata: event.metadata
      }).catch((error) => {
        console.error('Email notification failed for sync event', error);
      });
    }

    return res.status(201).json({ saved: events.length, dbPersisted: false, message: 'DB-less mode active; events were not persisted.' });
  }

  const savedEvents = await SyncEvent.insertMany(events);

  for (const event of events) {
    notifySecurityEvent({
      deviceName: event.deviceName,
      eventType: event.eventType,
      timestampUtc: event.timestampUtc,
      severity: event.severity,
      description: event.description,
      threatScore: event.threatScore,
      recommendedAction: event.recommendedAction,
      metadata: event.metadata
    }).catch((error) => {
      console.error('Email notification failed for sync event', error);
    });
  }

  return res.status(201).json({ saved: savedEvents.length });
});

router.get('/status', (_req, res) => {
  res.json({ healthy: true, syncEndpoint: '/api/sync/events' });
});

export default router;
