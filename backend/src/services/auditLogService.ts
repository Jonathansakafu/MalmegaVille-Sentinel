import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';
import { dblessTestMode } from '../config.js';
import { addAuditLog, listAuditLogsForUser } from './inMemoryStore.js';

export interface AuditLogEntry {
  userId: string;
  action: string;
  actorType: 'user' | 'agent' | 'system';
  description: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget by design, like notifySecurityEvent elsewhere: a logging
// failure must never block or fail the request it's describing, so this
// swallows its own errors rather than letting a caller's unhandled rejection
// surface one.
export async function recordAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    if (dblessTestMode) {
      addAuditLog({ ...entry, metadata: entry.metadata ?? {} });
      return;
    }

    if (mongoose.connection.readyState !== 1) {
      return;
    }

    await AuditLog.create({ ...entry, metadata: entry.metadata ?? {} });
  } catch (error) {
    console.error('Failed to record audit log entry', error);
  }
}

export async function listAuditLogs(userId: string, limit = 100) {
  if (dblessTestMode) {
    return listAuditLogsForUser(userId, limit);
  }

  if (mongoose.connection.readyState !== 1) {
    return [];
  }

  return AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(limit);
}
