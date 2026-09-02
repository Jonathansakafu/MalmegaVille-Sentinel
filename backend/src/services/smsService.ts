import { twilioAccountSid, twilioAuthToken, twilioFromNumber } from '../config.js';

const MAX_MESSAGE_LENGTH = 320;

export function isSmsConfigured(recipient?: string): boolean {
  return Boolean(twilioAccountSid && twilioAuthToken && twilioFromNumber && recipient);
}

export interface SendAlertSmsOptions {
  recipient: string;
  body: string;
}

export async function sendAlertSms({ recipient, body }: SendAlertSmsOptions): Promise<void> {
  if (!isSmsConfigured(recipient)) {
    return;
  }

  const truncatedBody = body.length > MAX_MESSAGE_LENGTH ? body.slice(0, MAX_MESSAGE_LENGTH) : body;

  const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ From: twilioFromNumber!, To: recipient, Body: truncatedBody })
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new Error(`Twilio API request failed (${response.status}): ${responseBody}`);
  }
}
