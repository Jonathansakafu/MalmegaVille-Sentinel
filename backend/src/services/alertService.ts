import { sendAlertEmail, isEmailConfigured } from './emailService.js';
import { emailOnlyTestingMode, notificationLogoUrl } from '../config.js';

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

export async function notifySecurityEvent(payload: EventAlertPayload) {
  if (!isEmailConfigured()) {
    return;
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
      <p style="color:#555;">This is a development testing mode alert. Email notification is currently the primary delivery channel.</p>
    </div>
  `;

  const text = `MalmegaVille Sentinel Event Notification\n\nDevice Name: ${payload.deviceName}\nEvent Type: ${payload.eventType}\nSeverity: ${safeSeverity}\nTimestamp: ${eventTime.toISOString()}\nDescription: ${payload.description}${payload.threatScore !== undefined ? `\nThreat Score: ${payload.threatScore}` : ''}${payload.recommendedAction ? `\nRecommended Action: ${payload.recommendedAction}` : ''}`;

  if (!emailOnlyTestingMode) {
    // In future releases, support additional notification channels here.
  }

  await sendAlertEmail({
    subject,
    text,
    html
  });
}
