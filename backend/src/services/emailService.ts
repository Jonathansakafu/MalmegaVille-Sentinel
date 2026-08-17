import nodemailer from 'nodemailer';
import {
  emailHost,
  emailPort,
  emailUser,
  emailPass,
  emailFrom,
  alertEmailRecipient,
  emailSecure
} from '../config.js';

interface EmailOptions {
  subject: string;
  text: string;
  html?: string;
  recipient?: string;
}

export function isEmailConfigured(recipient?: string) {
  return Boolean(emailHost && emailPort && emailUser && emailPass && (recipient || alertEmailRecipient));
}

export async function sendAlertEmail({ subject, text, html, recipient }: EmailOptions) {
  const to = recipient || alertEmailRecipient;
  if (!isEmailConfigured(to)) {
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
