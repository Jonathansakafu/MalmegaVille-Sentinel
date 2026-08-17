import { sendAlertEmail, isEmailConfigured } from './emailService.js';
import { sendTelegramAlert, isTelegramConfigured } from './telegramService.js';
import { getEffectiveNotificationSettings } from './notificationSettingsService.js';
import { notificationLogoUrl, dashboardUrl } from '../config.js';

export interface EventAlertPayload {
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
  telegram: { configured: boolean; sent: boolean; error?: string };
}

export async function notifySecurityEvent(payload: EventAlertPayload): Promise<NotificationDeliveryResult> {
  const { alertEmailRecipient, telegramBotToken, telegramChatId } = await getEffectiveNotificationSettings();
  const emailConfigured = isEmailConfigured(alertEmailRecipient);
  const telegramConfigured = isTelegramConfigured(telegramBotToken, telegramChatId);

  if (!emailConfigured && !telegramConfigured) {
    console.warn(`No notification channel configured (email or Telegram); alert not delivered: ${payload.eventType}`);
    return {
      email: { configured: false, sent: false },
      telegram: { configured: false, sent: false }
    };
  }

  const eventTime = typeof payload.timestampUtc === 'string' ? new Date(payload.timestampUtc) : payload.timestampUtc;
  const safeSeverity = payload.severity ? payload.severity.charAt(0).toUpperCase() + payload.severity.slice(1).toLowerCase() : 'Informational';
  const subject = `MalmegaVille Sentinel Event: ${payload.eventType} [${safeSeverity}]`;

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
      <p style="color:#555;">This alert was also sent via Telegram if a bot is configured for this account.</p>
    </div>
  `;

  const text = `MalmegaVille Sentinel Event Notification\n\nDevice Name: ${payload.deviceName}\nEvent Type: ${payload.eventType}\nSeverity: ${safeSeverity}\nTimestamp: ${eventTime.toISOString()}\nDescription: ${payload.description}${payload.threatScore !== undefined ? `\nThreat Score: ${payload.threatScore}` : ''}${payload.recommendedAction ? `\nRecommended Action: ${payload.recommendedAction}` : ''}\n\nOpen your MalmegaVille Sentinel dashboard to review this and other events: ${dashboardUrl}`;

  const telegramText = `${subject}\n\n${text}`;

  const results = await Promise.allSettled([
    emailConfigured ? sendAlertEmail({ subject, text, html, recipient: alertEmailRecipient }) : Promise.resolve(),
    telegramConfigured
      ? sendTelegramAlert({ text: telegramText, botToken: telegramBotToken, chatId: telegramChatId })
      : Promise.resolve()
  ]);

  const [emailResult, telegramResult] = results;
  if (emailConfigured && emailResult.status === 'rejected') {
    console.error('Email alert failed', emailResult.reason);
  }
  if (telegramConfigured && telegramResult.status === 'rejected') {
    console.error('Telegram alert failed', telegramResult.reason);
  }

  return {
    email: {
      configured: emailConfigured,
      sent: emailConfigured && emailResult.status === 'fulfilled',
      error: emailConfigured && emailResult.status === 'rejected' ? String(emailResult.reason) : undefined
    },
    telegram: {
      configured: telegramConfigured,
      sent: telegramConfigured && telegramResult.status === 'fulfilled',
      error: telegramConfigured && telegramResult.status === 'rejected' ? String(telegramResult.reason) : undefined
    }
  };
}
