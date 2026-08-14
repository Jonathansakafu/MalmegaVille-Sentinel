import { telegramBotToken } from '../config.js';

const TELEGRAM_API_URL = 'https://api.telegram.org';

interface SendMessageOptions {
  chatId: string;
  text: string;
}

export async function sendTelegramAlert({ chatId, text }: SendMessageOptions) {
  const token = telegramBotToken;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram alert failed: ${response.status} ${body}`);
  }
}
