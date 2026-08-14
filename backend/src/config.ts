import dotenv from 'dotenv';

dotenv.config();

// Allow running the backend without MongoDB for quick testing by setting
// DBLESS_TEST_MODE=true in the environment. When enabled, `mongodbUri` and
// `jwtSecret` may be undefined and startup will skip DB initialization.
export const mongodbUri = process.env.MONGODB_URI;
export const jwtSecret = process.env.JWT_SECRET;
export const dblessTestMode =
  process.env.DBLESS_TEST_MODE === 'true' || process.env.SKIP_DB === 'true' || process.env.NODE_ENV === 'test';

export const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
export const telegramChatId = process.env.TELEGRAM_CHAT_ID;
export const emailHost = process.env.EMAIL_HOST;
export const emailPort = process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : undefined;
export const emailUser = process.env.EMAIL_USER;
export const emailPass = process.env.EMAIL_PASS;
export const emailFrom = process.env.EMAIL_FROM ?? 'no-reply@malmegaville.local';
export const alertEmailRecipient = process.env.ALERT_EMAIL_RECIPIENT;
export const emailSecure = process.env.EMAIL_SECURE === 'true';
export const syncToken = process.env.SYNC_TOKEN;
export const notificationMode = process.env.NOTIFICATION_MODE?.toLowerCase() ?? 'email';
export const notificationLogoUrl = process.env.NOTIFICATION_LOGO_URL ?? '';
export const emailOnlyTestingMode = notificationMode === 'email';
