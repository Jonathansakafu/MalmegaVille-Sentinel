import dotenv from 'dotenv';
import path from 'node:path';

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
export const dashboardUrl = (process.env.DASHBOARD_URL ?? 'http://localhost:5173').replace(/\/$/, '');
export const notificationLogoUrl = process.env.NOTIFICATION_LOGO_URL ?? `${dashboardUrl}/logo.jpeg`;
export const captureStorageDir = process.env.CAPTURE_STORAGE_DIR
  ? path.resolve(process.env.CAPTURE_STORAGE_DIR)
  : path.join(process.cwd(), 'capture-storage');
export const captureMaxFileBytes = process.env.CAPTURE_MAX_FILE_BYTES
  ? Number(process.env.CAPTURE_MAX_FILE_BYTES)
  : 25 * 1024 * 1024;
export const captureMaxSessionBytes = process.env.CAPTURE_MAX_SESSION_BYTES
  ? Number(process.env.CAPTURE_MAX_SESSION_BYTES)
  : 500 * 1024 * 1024;
export const ipGeolocationEnabled = process.env.IP_GEOLOCATION_ENABLED !== 'false';
// Free, no-API-key IP geolocation lookup used as a fallback when the agent
// can't get a Wi-Fi based fix. Sends the device's public IP to this
// third-party service - documented in .env.example so it's an informed default.
export const ipGeolocationUrl = process.env.IP_GEOLOCATION_URL ?? 'http://ip-api.com/json';
