import { sendAlertEmail, isEmailConfigured } from './emailService.js';
import { sendPushNotification, PushDeliveryResult } from './pushService.js';
import { sendAlertSms, isSmsConfigured } from './smsService.js';
import { sendSmsRelayPush, MobileRelayResult } from './mobilePushService.js';
import { getEffectiveNotificationSettings } from './notificationSettingsService.js';
import { notificationLogoUrl, dashboardUrl } from '../config.js';

export interface EventAlertPayload {
  userId: string;
  deviceName: string;
  eventType: string;
  timestampUtc: string | Date;
  severity: string;
  description: string;
  threatScore?: number;
  recommendedAction?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationDeliveryResult {
  email: { configured: boolean; sent: boolean; error?: string };
  push: PushDeliveryResult;
  sms: { configured: boolean; sent: boolean; error?: string };
  mobileRelay: MobileRelayResult;
}

export async function notifySecurityEvent(payload: EventAlertPayload): Promise<NotificationDeliveryResult> {
  const { alertEmailRecipient, alertPhoneNumber } = await getEffectiveNotificationSettings(payload.userId);
  const emailConfigured = isEmailConfigured(alertEmailRecipient);
  const smsConfigured = isSmsConfigured(alertPhoneNumber);

  const eventTime = typeof payload.timestampUtc === 'string' ? new Date(payload.timestampUtc) : payload.timestampUtc;
  const safeSeverity = payload.severity ? payload.severity.charAt(0).toUpperCase() + payload.severity.slice(1).toLowerCase() : 'Informational';
  const subject = `MalmegaVille Sentinel Event: ${payload.eventType} [${safeSeverity}]`;

  // Push and SMS are both independent of email configuration - an account
  // missing one channel's setup should still get whichever channels it does
  // have configured. Unlike the Windows agent's own offline-only direct-modem
  // SMS fallback, this cloud path fires for every alert-worthy event whenever
  // the backend itself is reachable, which is the common case.
  const pushResultPromise = sendPushNotification(payload.userId, {
    title: `${payload.eventType} [${safeSeverity}]`,
    body: `${payload.deviceName}: ${payload.description}`,
    url: dashboardUrl
  });

  const smsBody = `MalmegaVille Sentinel [${safeSeverity}]: ${payload.eventType} on ${payload.deviceName}. ${payload.description}`;

  const smsResultPromise = (async (): Promise<{ configured: boolean; sent: boolean; error?: string }> => {
    if (!smsConfigured) {
      return { configured: false, sent: false };
    }
    try {
      await sendAlertSms({ recipient: alertPhoneNumber!, body: smsBody });
      return { configured: true, sent: true };
    } catch (error) {
      console.error('SMS alert failed', error);
      return { configured: true, sent: false, error: String(error) };
    }
  })();

  // Alternative to the paid cloud SMS gateway above: relays through a
  // companion Android app on a phone the account has paired, using that
  // phone's own SIM instead of Twilio.
  const mobileRelayResultPromise = alertPhoneNumber
    ? sendSmsRelayPush(payload.userId, alertPhoneNumber, smsBody)
    : Promise.resolve<MobileRelayResult>({ configured: false, sent: false });

  if (!emailConfigured) {
    console.warn(`No alert email configured for this account; email alert not delivered: ${payload.eventType}`);
    return {
      email: { configured: false, sent: false },
      push: await pushResultPromise,
      sms: await smsResultPromise,
      mobileRelay: await mobileRelayResultPromise
    };
  }

  const metadataHtml = payload.metadata
    ? Object.entries(payload.metadata)
        .map(([key, value]) => `<li><strong>${key}:</strong> ${String(value)}</li>`)
        .join('')
    : '';

  const htmlLogo = notificationLogoUrl
    ? `<div style="margin-bottom: 16px;"><img src="${notificationLogoUrl}" alt="MalmegaVille Sentinel" style="max-width:240px; height:auto;" /></div>`
    : '';

  const html = `
    <div style="font-family:Segoe UI, sans-serif; color:#111;">
      ${htmlLogo}
      <h2>MalmegaVille Sentinel Event Notification</h2>
      <ul>
        <li><strong>Device Name:</strong> ${payload.deviceName}</li>
        <li><strong>Event Type:</strong> ${payload.eventType}</li>
        <li><strong>Severity:</strong> ${safeSeverity}</li>
        <li><strong>Timestamp:</strong> ${eventTime.toISOString()}</li>
        <li><strong>Description:</strong> ${payload.description}</li>
        ${payload.threatScore !== undefined ? `<li><strong>Threat Score:</strong> ${payload.threatScore}</li>` : ''}
        ${payload.recommendedAction ? `<li><strong>Recommended Action:</strong> ${payload.recommendedAction}</li>` : ''}
      </ul>
      ${metadataHtml ? `<h3>Metadata</h3><ul>${metadataHtml}</ul>` : ''}
      <div style="margin-top:24px;">
        <a href="${dashboardUrl}" style="display:inline-block; background:#7ed957; color:#050805; font-weight:bold; text-decoration:none; padding:12px 20px; border-radius:12px;">
          Open MalmegaVille Sentinel Dashboard
        </a>
        <p style="color:#555; margin-top:12px;">
          Review this event, your full device inventory, and any lost/stolen device captures at
          <a href="${dashboardUrl}" style="color:#4c9a2a;">${dashboardUrl}</a>.
        </p>
      </div>
    </div>
  `;

  const text = `MalmegaVille Sentinel Event Notification\n\nDevice Name: ${payload.deviceName}\nEvent Type: ${payload.eventType}\nSeverity: ${safeSeverity}\nTimestamp: ${eventTime.toISOString()}\nDescription: ${payload.description}${payload.threatScore !== undefined ? `\nThreat Score: ${payload.threatScore}` : ''}${payload.recommendedAction ? `\nRecommended Action: ${payload.recommendedAction}` : ''}\n\nOpen your MalmegaVille Sentinel dashboard to review this and other events: ${dashboardUrl}`;

  let emailError: string | undefined;
  let emailSent = false;
  try {
    await sendAlertEmail({ subject, text, html, recipient: alertEmailRecipient });
    emailSent = true;
  } catch (error) {
    console.error('Email alert failed', error);
    emailError = String(error);
  }

  return {
    email: { configured: emailConfigured, sent: emailSent, error: emailError },
    push: await pushResultPromise,
    sms: await smsResultPromise,
    mobileRelay: await mobileRelayResultPromise
  };
}
