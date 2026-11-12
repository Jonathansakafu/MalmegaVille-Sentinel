import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { agentLimiter, dashboardLimiter } from '../middleware/rateLimiters.js';
import { validateBody } from '../middleware/validate.js';
import { validateSyncToken } from './syncRoutes.js';
import NetworkDestination from '../models/NetworkDestination.js';
import NetworkSnapshot from '../models/NetworkSnapshot.js';
import Device from '../models/Device.js';
import { dblessTestMode } from '../config.js';
import { notifySecurityEvent } from '../services/alertService.js';
import {
  findDeviceByDeviceId,
  listNetworkDestinations,
  upsertNetworkDestination,
  updateNetworkDestination,
  addNetworkSnapshot,
  listNetworkSnapshots
} from '../services/inMemoryStore.js';

const router = Router();

const MAX_CONNECTIONS_PER_SNAPSHOT = 2000;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;

const snapshotSchema = z.object({
  deviceId: z.string().trim().min(1),
  deviceName: z.string().trim().max(120).optional(),
  capturedAtUtc: z.string().optional(),
  connections: z
    .array(
      z.object({
        remoteAddress: z.string().trim().min(1).max(100),
        remotePort: z.number().int().min(0).max(65535).optional(),
        processName: z.string().trim().max(260).optional(),
        state: z.string().trim().max(40).optional()
      })
    )
    .max(MAX_CONNECTIONS_PER_SNAPSHOT)
});

const updateDestinationSchema = z.object({
  verdict: z.enum(['unknown', 'trusted']),
  label: z.string().trim().max(120).optional()
});

function normalizeAddress(input: string): string {
  return input.trim().replace(/^::ffff:/i, '');
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

function isPublicAddress(rawAddress: string): boolean {
  const address = normalizeAddress(rawAddress);
  if (!address) return false;
  if (!address.includes(':')) return isPublicIpv4(address);

  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return false;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return false;
  return true;
}

async function deviceOwnerUserId(deviceId: string): Promise<string | undefined> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.userId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.userId?.toString();
}

async function deviceDisplayName(deviceId: string): Promise<string> {
  if (dblessTestMode) {
    return findDeviceByDeviceId(deviceId)?.name ?? deviceId;
  }
  const device = await Device.findOne({ deviceId });
  return device?.name ?? deviceId;
}

// POST /api/network/snapshots - sync-token authed. One report per minute per
// device: the agent lists established TCP connections with their owning
// process. Addresses are turned into a per-device destination inventory so a
// connection that has never been seen before can be flagged exactly once,
// instead of alerting on every snapshot that contains it.
router.post('/snapshots', agentLimiter, validateBody(snapshotSchema), async (req, res) => {
  if (!validateSyncToken(req)) {
    return res.status(401).json({ message: 'Invalid sync token.' });
  }

  const { deviceId, capturedAtUtc } = req.body;
  const userId = await deviceOwnerUserId(deviceId);
  if (!userId) {
    return res.status(404).json({ message: 'Unknown device.' });
  }

  const uniqueConnections = new Map<
    string,
    { remoteAddress: string; remotePort?: number; processName?: string; state?: string }
  >();
  for (const connection of req.body.connections as {
    remoteAddress: string;
    remotePort?: number;
    processName?: string;
    state?: string;
  }[]) {
    const remoteAddress = normalizeAddress(connection.remoteAddress);
    if (!remoteAddress) continue;
    const existing = uniqueConnections.get(remoteAddress);
    uniqueConnections.set(remoteAddress, {
      remoteAddress,
      remotePort: connection.remotePort ?? existing?.remotePort,
      processName: connection.processName || existing?.processName,
      state: connection.state ?? existing?.state
    });
  }

  const connections = [...uniqueConnections.values()];
  const publicConnections = connections.filter((connection) => isPublicAddress(connection.remoteAddress));
  const newPublicDestinations: { remoteAddress: string; processName?: string }[] = [];
  const now = new Date();

  for (const connection of publicConnections) {
    if (dblessTestMode) {
      const { created } = upsertNetworkDestination({
        userId,
        deviceId,
        remoteAddress: connection.remoteAddress,
        remotePort: connection.remotePort,
        processName: connection.processName,
        isPublic: true
      });
      if (created) newPublicDestinations.push({ remoteAddress: connection.remoteAddress, processName: connection.processName });
      continue;
    }

    const filter = { userId, deviceId, remoteAddress: connection.remoteAddress };
    const existing = await NetworkDestination.findOne(filter).select('_id');
    try {
      await NetworkDestination.findOneAndUpdate(
        filter,
        {
          $set: {
            remotePort: connection.remotePort,
            processName: connection.processName,
            isPublic: true,
            lastSeenUtc: now
          },
          $setOnInsert: {
            userId,
            deviceId,
            remoteAddress: connection.remoteAddress,
            verdict: 'unknown',
            firstSeenUtc: now
          },
          $inc: { seenCount: 1 }
        },
        { upsert: true, new: true }
      );
      if (!existing) {
        newPublicDestinations.push({ remoteAddress: connection.remoteAddress, processName: connection.processName });
      }
    } catch (error: any) {
      // Two snapshots racing on the same new address can both attempt the
      // insert; the second one is a duplicate-key error, not a failure.
      if (error?.code !== 11000) throw error;
    }
  }

  let unknownCount: number;
  if (dblessTestMode) {
    const destinations = listNetworkDestinations(userId);
    unknownCount = destinations.filter(
      (destination) => destination.deviceId === deviceId && destination.isPublic && destination.verdict === 'unknown'
    ).length;
  } else {
    unknownCount = await NetworkDestination.countDocuments({ userId, deviceId, isPublic: true, verdict: 'unknown' });
  }

  const snapshotFields = {
    userId,
    deviceId,
    deviceName: req.body.deviceName ?? (await deviceDisplayName(deviceId)),
    connections,
    connectionCount: connections.length,
    publicCount: publicConnections.length,
    unknownCount,
    capturedAtUtc: capturedAtUtc ? new Date(capturedAtUtc) : now
  };

  if (dblessTestMode) {
    addNetworkSnapshot(snapshotFields);
  } else {
    await NetworkSnapshot.create(snapshotFields);
  }

  for (const destination of newPublicDestinations.slice(0, 10)) {
    notifySecurityEvent({
      userId,
      deviceId,
      deviceName: snapshotFields.deviceName,
      eventType: 'New Outbound Connection',
      timestampUtc: now,
      severity: 'Medium',
      threatScore: 55,
      description: `A first-time outbound connection to ${destination.remoteAddress}${
        destination.processName ? ` by ${destination.processName}` : ''
      } was observed.`,
      recommendedAction:
        'Confirm you recognize this destination and the process that opened it. Mark it trusted once verified.',
      metadata: {
        remoteAddress: destination.remoteAddress,
        processName: destination.processName
      }
    }).catch((error) => console.error('Network destination notification failed', error));
  }

  res.status(201).json({
    saved: true,
    connections: connections.length,
    publicConnections: publicConnections.length,
    newDestinations: newPublicDestinations.length
  });
});

router.use(authenticate);
router.use(dashboardLimiter);

router.get('/', async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const destinations = listNetworkDestinations(userId);
    const snapshots = listNetworkSnapshots(userId, undefined, 200);
    return res.json(buildOverview(destinations, snapshots, Date.now()));
  }

  const [destinations, snapshots] = await Promise.all([
    NetworkDestination.find({ userId }).sort({ lastSeenUtc: -1 }).limit(300),
    NetworkSnapshot.find({ userId }).sort({ capturedAtUtc: -1 }).limit(200).select('-connections')
  ]);

  return res.json(buildOverview(destinations, snapshots, Date.now()));
});

function buildOverview(
  destinations: {
    _id?: unknown;
    id?: string;
    deviceId: string;
    remoteAddress: string;
    remotePort?: number | null;
    processName?: string | null;
    isPublic: boolean;
    verdict: 'unknown' | 'trusted';
    label?: string | null;
    seenCount: number;
    firstSeenUtc: Date | string;
    lastSeenUtc: Date | string;
  }[],
  snapshots: {
    deviceId: string;
    deviceName?: string | null;
    connectionCount: number;
    publicCount: number;
    unknownCount: number;
    capturedAtUtc: Date | string;
  }[],
  nowMs: number
) {
  const latestByDevice = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latestByDevice.has(snapshot.deviceId)) latestByDevice.set(snapshot.deviceId, snapshot);
  }

  const latest = [...latestByDevice.values()].map((snapshot) => ({
    deviceId: snapshot.deviceId,
    deviceName: snapshot.deviceName ?? snapshot.deviceId,
    connectionCount: snapshot.connectionCount,
    publicCount: snapshot.publicCount,
    unknownCount: snapshot.unknownCount,
    capturedAtUtc: snapshot.capturedAtUtc,
    active: nowMs - new Date(snapshot.capturedAtUtc).getTime() < ACTIVE_WINDOW_MS
  }));

  const publicDestinations = destinations.filter((destination) => destination.isPublic);
  const unknownDestinations = publicDestinations.filter((destination) => destination.verdict === 'unknown');

  return {
    stats: {
      activeDevices: latest.filter((snapshot) => snapshot.active).length,
      connections: latest.reduce((total, snapshot) => total + snapshot.connectionCount, 0),
      publicConnections: latest.reduce((total, snapshot) => total + snapshot.publicCount, 0),
      destinations: publicDestinations.length,
      unknownDestinations: unknownDestinations.length,
      trustedDestinations: publicDestinations.length - unknownDestinations.length
    },
    latest,
    destinations: destinations.slice(0, 120).map((destination) => ({
      id: '_id' in destination && destination._id ? String(destination._id) : destination.id,
      deviceId: destination.deviceId,
      remoteAddress: destination.remoteAddress,
      remotePort: destination.remotePort,
      processName: destination.processName,
      isPublic: destination.isPublic,
      verdict: destination.verdict,
      label: destination.label,
      seenCount: destination.seenCount,
      firstSeenUtc: destination.firstSeenUtc,
      lastSeenUtc: destination.lastSeenUtc
    }))
  };
}

router.patch('/destinations/:id', validateBody(updateDestinationSchema), async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (dblessTestMode) {
    const destination = updateNetworkDestination(req.params.id, userId, req.body);
    if (!destination) return res.status(404).json({ message: 'Destination not found.' });
    return res.json(destination);
  }

  const destination = await NetworkDestination.findOneAndUpdate(
    { _id: req.params.id, userId },
    { $set: req.body },
    { new: true }
  );
  if (!destination) return res.status(404).json({ message: 'Destination not found.' });
  res.json(destination);
});

export default router;
