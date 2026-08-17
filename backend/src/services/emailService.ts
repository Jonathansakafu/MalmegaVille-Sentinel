import nodemailer from 'nodemailer';
import {
  emailHost,
  emailPort,
  emailUser,
  emailPass,
  emailFrom,
  alertEmailRecipient,
  emailSecure,
  resendApiKey
} from '../config.js';

interface EmailOptions {
  subject: string;
  text: string;
  html?: string;
  recipient?: string;
}

export function isEmailConfigured(recipient?: string) {
  const hasRecipient = Boolean(recipient || alertEmailRecipient);
  if (resendApiKey) {
    return hasRecipient;
  }
  return Boolean(emailHost && emailPort && emailUser && emailPass && hasRecipient);
}

export async function sendAlertEmail({ subject, text, html, recipient }: EmailOptions) {
  const to = recipient || alertEmailRecipient;
  if (!isEmailConfigured(to)) {
    return;
  }

  // Resend's HTTP API (port 443) is used when configured, since raw SMTP (ports 587/465)
  // is blocked outbound on some PaaS hosts (confirmed on Railway - see README).
  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: emailFrom, to, subject, html, text })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend API request failed (${response.status}): ${body}`);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailSecure,
    auth: {
      user: emailUser,
      pass: emailPass
    }
  });

  await transporter.sendMail({
    from: emailFrom,
    to,
    subject,
    text,
    html
  });
}
