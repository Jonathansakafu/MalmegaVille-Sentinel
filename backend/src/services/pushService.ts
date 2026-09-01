import webpush from 'web-push';
import mongoose from 'mongoose';
import PushSubscription from '../models/PushSubscription.js';
import { vapidPublicKey, vapidPrivateKey, vapidSubject, dblessTestMode } from '../config.js';
import {
  addPushSubscription,
  listPushSubscriptionsForUser,
  removePushSubscription
} from './inMemoryStore.js';

export function isPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

if (isPushConfigured()) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(userId: string, subscription: PushSubscriptionInput): Promise<void> {
  if (dblessTestMode) {
    addPushSubscription({ userId, endpoint: subscription.endpoint, keys: subscription.keys });
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    return;
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { userId, endpoint: subscription.endpoint, keys: subscription.keys },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  if (dblessTestMode) {
    removePushSubscription(endpoint);
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    return;
  }

  await PushSubscription.deleteOne({ endpoint });
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
}

export interface PushDeliveryResult {
  configured: boolean;
  sent: boolean;
  error?: string;
}

// Sends to every subscription the account has registered (e.g. one per
// browser/device the dashboard was opened and enabled on). A subscription
// the push service reports as gone (410) or unknown (404) is pruned so it
// isn't retried forever.
export async function sendPushNotification(userId: string, payload: PushNotificationPayload): Promise<PushDeliveryResult> {
  if (!isPushConfigured()) {
    return { configured: false, sent: false };
  }

  const subscriptions = dblessTestMode
    ? listPushSubscriptionsForUser(userId)
    : mongoose.connection.readyState === 1
      ? await PushSubscription.find({ userId })
      : [];

  if (subscriptions.length === 0) {
    return { configured: true, sent: false, error: 'No push subscriptions registered for this account.' };
  }

  const body = JSON.stringify(payload);
  let sentAny = false;
  let lastError: string | undefined;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys!.p256dh, auth: subscription.keys!.auth } },
          body
        );
        sentAny = true;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(subscription.endpoint);
        } else {
          lastError = String(error);
        }
      }
    })
  );

  return { configured: true, sent: sentAny, error: sentAny ? undefined : lastError ?? 'Delivery failed.' };
}
