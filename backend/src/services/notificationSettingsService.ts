import mongoose from 'mongoose';
import NotificationSettings from '../models/NotificationSettings.js';
import { dblessTestMode } from '../config.js';
import { getNotificationSettingsForUser as getInMemorySettingsForUser } from './inMemoryStore.js';

export interface EffectiveNotificationSettings {
  alertEmailRecipient?: string;
}

// Each account configures its own alert email; settings are looked up by the
// owning userId so one user's recipient is never used for another user's
// alerts.
export async function getEffectiveNotificationSettings(userId: string): Promise<EffectiveNotificationSettings> {
  if (dblessTestMode) {
    const settings = getInMemorySettingsForUser(userId);
    return {
      alertEmailRecipient: settings.alertEmailRecipient || undefined
    };
  }

  if (mongoose.connection.readyState !== 1) {
    return {};
  }

  const settings = await NotificationSettings.findOne({ userId });
  return {
    alertEmailRecipient: settings?.alertEmailRecipient || undefined
  };
}
