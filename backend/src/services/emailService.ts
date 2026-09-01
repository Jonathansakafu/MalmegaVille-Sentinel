import nodemailer from 'nodemailer';
import { emailHost, emailPort, emailUser, emailPass, emailFrom, emailSecure, resendApiKey, brevoApiKey } from '../config.js';

interface EmailOptions {
  subject: string;
  text: string;
  html?: string;
  recipient?: string;
}

// Each account supplies its own recipient (configured via the dashboard); there
// is no operator-wide fallback address, since that would deliver every
// tenant's alerts to the same inbox.
export function isEmailConfigured(recipient?: string) {
  const hasRecipient = Boolean(recipient);
  if (resendApiKey || brevoApiKey) {
    return hasRecipient;
  }
  return Boolean(emailHost && emailPort && emailUser && emailPass && hasRecipient);
}

// EMAIL_FROM is stored RFC 5322-style ("Name <email@domain>"), which is what
// Resend's API takes directly - Brevo's API instead wants sender name/email
// as separate fields, so this pulls them apart.
function parseFromAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<(.+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^"|"$/g, '').trim();
    return { name: name || undefined, email: match[2].trim() };
  }
  return { email: from.trim() };
}

export async function sendAlertEmail({ subject, text, html, recipient }: EmailOptions) {
  const to = recipient;
  if (!isEmailConfigured(to)) {
    return;
  }

  // HTTP-API providers (port 443) are preferred over raw SMTP (ports 587/465),
  // which is blocked outbound on some PaaS hosts (confirmed on Railway - see README).
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

  if (brevoApiKey) {
    const sender = parseFromAddress(emailFrom);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Brevo API request failed (${response.status}): ${body}`);
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
