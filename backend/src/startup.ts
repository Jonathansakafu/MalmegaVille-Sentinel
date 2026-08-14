import { jwtSecret, mongodbUri, dblessTestMode } from './config.js';

export function validateStartupConfig() {
  if (dblessTestMode) {
    console.warn('DBLESS_TEST_MODE enabled: skipping required env validation (MONGODB_URI, JWT_SECRET)');
    return;
  }

  const missing: string[] = [];
  if (!mongodbUri) missing.push('MONGODB_URI');
  if (!jwtSecret) missing.push('JWT_SECRET');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
