import { Router } from 'express';
import SyncEvent from '../models/SyncEvent.js';
import Device from '../models/Device.js';
import TrustedUsbDevice from '../models/TrustedUsbDevice.js';
import { syncToken, dblessTestMode } from '../config.js';
import { notifySecurityEvent } from '../services/alertService.js';
import { getEffectiveNotificationSettings } from '../services/notificationSettingsService.js';
import { agentLimiter } from '../middleware/rateLimiters.js';
import { findDeviceByDeviceId, listTrustedUsbDevices, recordUsbConnectEvent } from '../services/inMemoryStore.js';

const router = Router();
const MAX_EVENTS_PER_BATCH = 500;
const USB_CONNECT_EVENT_TYPE = 'USB Device Connected';

router.use(agentLimiter);

async function getTrustedUsbIdentifiers(userId: string): Promise<Set<string>> {
  if (dblessTestMode) {
    return new Set(listTrustedUsbDevices(userId).map((device) => device.identifier));
  }
  const devices = await TrustedUsbDevice.find({ userId }).select('identifier');
  return new Set(devices.map((device) => device.identifier));
}

// Sync events only carry a deviceId (assigned by the agent), so the owning
// account has to be resolved from the Device registered under that id. A
// deviceId with no matching Device (not yet registered by any account) has
// no known owner - trust checks and alerts for it are skipped rather than
// falling back to some other tenant's settings.
async function resolveDeviceOwners(deviceIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(deviceIds)];
  const owners = new Map<string, string>();

  if (dblessTestMode) {
    for (const id of uniqueIds) {
      const device = findDeviceByDeviceId(id);
      if (device) owners.set(id, device.userId);
    }
    return owners;
  }

  const devices = await Device.find({ deviceId: { $in: uniqueIds } }).select('deviceId userId');
  for (const device of devices) {
    owners.set(device.deviceId, device.userId.toString());
  }
  return owners;
}

export function validateSyncToken(req: any) {
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
  if (payload.length > MAX_EVENTS_PER_BATCH) {
    return res.status(413).json({ message: `A maximum of ${MAX_EVENTS_PER_BATCH} events may be submitted per request.` });
  }

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

  // Attribute each event to the account that registered its deviceId. An
  // unrecognized deviceId has no owner, so its trust check and alert are
  // skipped rather than falling back to some other tenant's settings.
  const owners = await resolveDeviceOwners(events.map((event) => event.deviceId));
  const eventsWithOwners = events.map((event) => ({ ...event, userId: owners.get(event.deviceId) }));

  // A USB-connect event for a drive on the owning account's trusted list is
  // downgraded to Informational before it ever reaches the alert-worthy
  // filter below, so known devices never trigger a notification.
  // Unrecognized ones are left alone (still alert) and tracked per-account
  // for the "Mark as Known" dashboard action.
  const trustedIdentifiersByUser = new Map<string, Set<string>>();
  for (const event of eventsWithOwners) {
    if (event.eventType !== USB_CONNECT_EVENT_TYPE || !event.userId) continue;

    if (!trustedIdentifiersByUser.has(event.userId)) {
      trustedIdentifiersByUser.set(event.userId, await getTrustedUsbIdentifiers(event.userId));
    }
    const trustedIdentifiers = trustedIdentifiersByUser.get(event.userId)!;

    if (trustedIdentifiers.has(event.deviceName)) {
      event.severity = 'Informational';
    } else if (event.deviceName !== 'unknown') {
      recordUsbConnectEvent(event.userId, event.deviceName, event.description, event.timestampUtc);
    }
  }

  // Routine telemetry (e.g. the desktop agent's 15-second heartbeat) is
  // "Informational" severity and arrives constantly - alerting on it would
  // flood every configured channel. Only notify for events severe enough to
  // actually warrant the owner's attention.
  const alertWorthyEvents = eventsWithOwners.filter((event) => event.severity.toLowerCase() !== 'informational');

  const sendAlerts = () => {
    for (const event of alertWorthyEvents) {
      if (!event.userId) {
        console.warn(`Skipping alert for event on unregistered device ${event.deviceId}`);
        continue;
      }
      notifySecurityEvent({
        userId: event.userId,
        deviceName: event.deviceName,
        eventType: event.eventType,
        timestampUtc: event.timestampUtc,
        severity: event.severity,
        description: event.description,
        threatScore: event.threatScore,
        recommendedAction: event.recommendedAction,
        metadata: event.metadata
      }).catch((error) => {
        console.error('Notification failed for sync event', error);
      });
    }
  };

  if (dblessTestMode) {
    sendAlerts();
    return res.status(201).json({ saved: events.length, dbPersisted: false, message: 'DB-less mode active; events were not persisted.' });
  }

  const savedEvents = await SyncEvent.insertMany(eventsWithOwners);
  sendAlerts();

  return res.status(201).json({ saved: savedEvents.length });
});

router.get('/status', (_req, res) => {
  res.json({ healthy: true, syncEndpoint: '/api/sync/events' });
});

router.get('/lost-status', async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const deviceId = String(req.query.deviceId ?? '');
  if (!deviceId) {
    return res.status(400).json({ message: 'deviceId is required.' });
  }

  // Piggybacks the owner's SMS alert number on the same poll the agent
  // already runs every ~15s to check lost status, rather than adding a
  // second endpoint/poll cycle just for this.
  if (dblessTestMode) {
    const device = findDeviceByDeviceId(deviceId);
    const settings = device ? await getEffectiveNotificationSettings(device.userId) : {};
    return res.json({ deviceId, isLost: device?.isLost ?? false, phoneNumber: settings.alertPhoneNumber ?? null });
  }

  const device = await Device.findOne({ deviceId });
  const settings = device ? await getEffectiveNotificationSettings(String(device.userId)) : {};
  res.json({ deviceId, isLost: device?.isLost ?? false, phoneNumber: settings.alertPhoneNumber ?? null });
});

export default router;
