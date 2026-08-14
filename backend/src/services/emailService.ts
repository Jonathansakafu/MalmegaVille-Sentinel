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
}

export function isEmailConfigured() {
  return Boolean(emailHost && emailPort && emailUser && emailPass && alertEmailRecipient);
}

export async function sendAlertEmail({ subject, text, html }: EmailOptions) {
  if (!isEmailConfigured()) {
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
    to: alertEmailRecipient,
    subject,
    text,
    html
  });
}
