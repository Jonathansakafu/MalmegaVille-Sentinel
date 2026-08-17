import { useEffect, useState } from 'react';
import { Mail, Send, Save } from 'lucide-react';
import {
  NotificationSettings,
  NotificationTestResult,
  fetchNotificationSettings,
  saveNotificationSettings,
  sendTestAlert
} from '../api';
import Spinner from './Spinner';

function describeChannel(name: string, channel: { configured: boolean; sent: boolean; error?: string }): string {
  if (!channel.configured) return `${name}: not configured`;
  return channel.sent ? `${name}: sent` : `${name}: failed (${channel.error})`;
}

function SettingsPanel({ token }: { token: string }) {
  const [settings, setSettings] = useState<NotificationSettings>({
    alertEmailRecipient: '',
    telegramBotToken: '',
    telegramChatId: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    fetchNotificationSettings(token)
      .then(setSettings)
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Failed to load notification settings.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('Saving...');
    try {
      const updated = await saveNotificationSettings(token, settings);
      setSettings(updated);
      setStatus('Settings saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus('Sending test alert...');
    try {
      const result: NotificationTestResult = await sendTestAlert(token);
      setStatus([describeChannel('Email', result.email), describeChannel('Telegram', result.telegram)].join('  |  '));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send test alert.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Mail size={18} className="text-brand-green" />
        Notification Settings
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Every channel filled in below is used for alerts at the same time — fill in one or both. These settings are shared with the
        desktop app.
      </p>

      {loading ? (
        <div className="mt-6">
          <Spinner label="Loading settings..." />
        </div>
      ) : (
        <div className="mt-6 max-w-lg space-y-5">
          <label className="block text-sm font-medium text-slate-300">
            Alert email address
            <input
              value={settings.alertEmailRecipient}
              onChange={(event) => setSettings((prev) => ({ ...prev, alertEmailRecipient: event.target.value }))}
              type="email"
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
            />
          </label>

          <label className="block text-sm font-medium text-slate-300">
            Telegram bot token
            <input
              value={settings.telegramBotToken}
              onChange={(event) => setSettings((prev) => ({ ...prev, telegramBotToken: event.target.value }))}
              type="password"
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">Create a bot via @BotFather on Telegram to get a token.</span>
          </label>

          <label className="block text-sm font-medium text-slate-300">
            Telegram chat ID
            <input
              value={settings.telegramChatId}
              onChange={(event) => setSettings((prev) => ({ ...prev, telegramChatId: event.target.value }))}
              type="text"
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Message your bot, then open https://api.telegram.org/bot&lt;token&gt;/getUpdates to find your chat id.
            </span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              onClick={handleSave}
              disabled={saving}
              type="button"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-brand-green px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
            >
              <Save size={16} />
              Save Settings
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              type="button"
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-brand-green hover:text-brand-green disabled:opacity-50"
            >
              <Send size={16} />
              Send Test Alert
            </button>
          </div>

          {status ? <p className="text-sm text-slate-300">{status}</p> : null}
        </div>
      )}
    </section>
  );
}

export default SettingsPanel;
