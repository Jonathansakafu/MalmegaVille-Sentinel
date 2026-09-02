import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import mongoose from 'mongoose';
import MobileDevice from '../models/MobileDevice.js';
import { firebaseServiceAccountJson, dblessTestMode } from '../config.js';
import { listMobileDevicesForUser, removeMobileDeviceByToken } from './inMemoryStore.js';

let cachedApp: App | null | undefined;

function getFirebaseApp(): App | null {
  if (cachedApp !== undefined) {
    return cachedApp;
  }

  if (!firebaseServiceAccountJson) {
    cachedApp = null;
    return cachedApp;
  }

  try {
    const credentials = JSON.parse(firebaseServiceAccountJson);
    cachedApp = initializeApp({ credential: cert(credentials) });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK for mobile push relay', error);
    cachedApp = null;
  }

  return cachedApp;
}

export function isMobileRelayConfigured(): boolean {
  return Boolean(firebaseServiceAccountJson);
}

export interface MobileRelayResult {
  configured: boolean;
  sent: boolean;
  error?: string;
}

// Pushes a "send this SMS" instruction to every Android phone paired to this
// account (via Firebase Cloud Messaging); the companion app's background
// handler sends it through that phone's own SIM. A data-only message, not a
// visible notification - the phone doesn't need to be unlocked or the app
// open, only running in the background with SMS permission granted.
export async function sendSmsRelayPush(userId: string, recipientPhoneNumber: string, body: string): Promise<MobileRelayResult> {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    return { configured: false, sent: false };
  }

  const devices = dblessTestMode
    ? listMobileDevicesForUser(userId)
    : mongoose.connection.readyState === 1
      ? await MobileDevice.find({ userId })
      : [];

  if (devices.length === 0) {
    return { configured: true, sent: false, error: 'No paired Android device for this account.' };
  }

  let sentAny = false;
  let lastError: string | undefined;

  await Promise.all(
    devices.map(async (device) => {
      try {
        await getMessaging(firebaseApp).send({
          token: device.fcmToken,
          data: { type: 'send_sms', to: recipientPhoneNumber, body },
          android: { priority: 'high' }
        });
        sentAny = true;
      } catch (error) {
        lastError = String(error);
        const errorCode = (error as { errorInfo?: { code?: string } })?.errorInfo?.code;
        if (errorCode === 'messaging/registration-token-not-registered') {
          if (dblessTestMode) {
            removeMobileDeviceByToken(device.fcmToken);
          } else {
            await MobileDevice.deleteOne({ fcmToken: device.fcmToken });
          }
        }
      }
    })
  );

  return { configured: true, sent: sentAny, error: sentAny ? undefined : (lastError ?? 'Delivery failed.') };
}
