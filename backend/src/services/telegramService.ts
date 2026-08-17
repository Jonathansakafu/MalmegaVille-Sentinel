import { telegramBotToken as envBotToken, telegramChatId as envChatId } from '../config.js';

const TELEGRAM_API_URL = 'https://api.telegram.org';

interface SendMessageOptions {
  text: string;
  botToken?: string;
  chatId?: string;
}

export function isTelegramConfigured(botToken?: string, chatId?: string) {
  return Boolean((botToken || envBotToken) && (chatId || envChatId));
}

export async function sendTelegramAlert({ text, botToken, chatId }: SendMessageOptions) {
  const token = botToken || envBotToken;
  const chat = chatId || envChatId;
  if (!isTelegramConfigured(token, chat)) {
    return;
  }

  const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram alert failed: ${response.status} ${body}`);
  }
}
