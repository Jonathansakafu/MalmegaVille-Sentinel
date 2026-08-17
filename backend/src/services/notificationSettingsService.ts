import mongoose from 'mongoose';
import NotificationSettings from '../models/NotificationSettings.js';
import { dblessTestMode } from '../config.js';
import { getNotificationSettings as getInMemorySettings } from './inMemoryStore.js';

export interface EffectiveNotificationSettings {
  alertEmailRecipient?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
}

// DB-stored settings (configured via the desktop app or web UI) take priority
// over the operator-level defaults in .env, which remain as a fallback.
export async function getEffectiveNotificationSettings(): Promise<EffectiveNotificationSettings> {
  if (dblessTestMode) {
    const settings = getInMemorySettings();
    return {
      alertEmailRecipient: settings.alertEmailRecipient || undefined,
      telegramBotToken: settings.telegramBotToken || undefined,
      telegramChatId: settings.telegramChatId || undefined
    };
  }

  if (mongoose.connection.readyState !== 1) {
    return {};
  }

  const settings = await NotificationSettings.findOne();
  return {
    alertEmailRecipient: settings?.alertEmailRecipient || undefined,
    telegramBotToken: settings?.telegramBotToken || undefined,
    telegramChatId: settings?.telegramChatId || undefined
  };
}
