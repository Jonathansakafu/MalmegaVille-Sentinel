import { useEffect, useState } from 'react';
import { Mail, Send, Save, User, Usb, ShieldCheck, Trash2, Check, KeyRound } from 'lucide-react';
import {
  NotificationSettings,
  NotificationTestResult,
  TrustedUsbDevice,
  UnrecognizedUsbEvent,
  fetchNotificationSettings,
  saveNotificationSettings,
  sendTestAlert,
  updateUsername,
  changePassword,
  fetchTrustedUsbDevices,
  addTrustedUsbDevice,
  removeTrustedUsbDevice,
  fetchUnrecognizedUsbEvents
} from '../api';
import Spinner from './Spinner';

function describeChannel(name: string, channel: { configured: boolean; sent: boolean; error?: string }): string {
  if (!channel.configured) return `${name}: not configured`;
  return channel.sent ? `${name}: sent` : `${name}: failed (${channel.error})`;
}

function AccountSettings({ token, username, onUsernameChange }: { token: string; username: string; onUsernameChange: (username: string) => void }) {
  const [value, setValue] = useState(username);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => setValue(username), [username]);

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const result = await updateUsername(token, value);
      onUsernameChange(result.username);
      setStatus('Username updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update username.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <User size={18} className="text-brand-green" />
        Account
      </h2>
      <p className="mt-2 text-sm text-slate-400">This is the name shown across your dashboard.</p>

      <div className="mt-6 max-w-lg space-y-4">
        <label className="block text-sm font-medium text-slate-300">
          Username
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            type="text"
            minLength={3}
            maxLength={24}
            pattern="[a-zA-Z0-9_.\-]+"
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
          />
        </label>

        <button
          onClick={handleSave}
          disabled={saving || value === username || value.trim().length < 3}
          type="button"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-brand-green px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
        >
          <Save size={16} />
          Save Username
        </button>

        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </div>
    </section>
  );
}

function ChangePassword({ token }: { token: string }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const canSubmit = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setStatus('');
    try {
      await changePassword(token, currentPassword, newPassword);
      setStatus('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <KeyRound size={18} className="text-brand-green" />
        Change Password
      </h2>
      <p className="mt-2 text-sm text-slate-400">Applies to both the web dashboard and the desktop app sign-in.</p>

      <div className="mt-6 max-w-lg space-y-4">
        <label className="block text-sm font-medium text-slate-300">
          Current password
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
          />
        </label>

        <label className="block text-sm font-medium text-slate-300">
          New password
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            type="password"
            minLength={8}
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>
        </label>

        <label className="block text-sm font-medium text-slate-300">
          Confirm new password
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-brand-green"
          />
          {confirmPassword && confirmPassword !== newPassword ? (
            <span className="mt-1 block text-xs font-normal text-rose-400">Passwords don't match.</span>
          ) : null}
        </label>

        <button
          onClick={handleSave}
          disabled={saving || !canSubmit}
          type="button"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-brand-green px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
        >
          <KeyRound size={16} />
          Update Password
        </button>

        {status ? <p className="text-sm text-slate-300">{status}</p> : null}
      </div>
    </section>
  );
}

function KnownUsbDevices({ token }: { token: string }) {
  const [trusted, setTrusted] = useState<TrustedUsbDevice[]>([]);
  const [unrecognized, setUnrecognized] = useState<UnrecognizedUsbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [manualIdentifier, setManualIdentifier] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const [busyIdentifier, setBusyIdentifier] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([fetchTrustedUsbDevices(token), fetchUnrecognizedUsbEvents(token)])
      .then(([trustedDevices, unrecognizedEvents]) => {
        setTrusted(trustedDevices);
        setUnrecognized(unrecognizedEvents);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Failed to load USB devices.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const handleTrust = async (identifier: string, label: string) => {
    if (!label.trim()) {
      setStatus('Give this device a name before marking it known.');
      return;
    }
    setBusyIdentifier(identifier);
    setStatus('');
    try {
      await addTrustedUsbDevice(token, identifier, label.trim());
      load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to mark device as known.');
    } finally {
      setBusyIdentifier(null);
    }
  };

  const handleRemove = async (device: TrustedUsbDevice) => {
    const id = device._id ?? device.id;
    if (!id) return;
    setBusyIdentifier(device.identifier);
    try {
      await removeTrustedUsbDevice(token, id);
      load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to remove device.');
    } finally {
      setBusyIdentifier(null);
    }
  };

  return (
    <section className="rounded-3xl bg-brand-panel p-4 shadow-lg shadow-black/30 sm:p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Usb size={18} className="text-brand-green" />
        Known USB Devices
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Devices marked as known don't trigger an alert when plugged in. Unrecognized devices still alert you as usual.
      </p>

      {loading ? (
        <div className="mt-6">
          <Spinner label="Loading USB devices..." />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {unrecognized.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Recently alerted, not yet trusted</h3>
              <div className="mt-3 space-y-3">
                {unrecognized.map((event) => (
                  <div key={event.deviceName} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                    <p className="break-all text-xs text-slate-500">{event.deviceName}</p>
                    <p className="mt-1 text-sm text-slate-300">{event.description}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.timestampUtc).toLocaleString()}</p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <input
                        value={labelDrafts[event.deviceName] ?? ''}
                        onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [event.deviceName]: e.target.value }))}
                        placeholder="Name this device (e.g. My SanDisk drive)"
                        type="text"
                        className="min-h-[44px] flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-green"
                      />
                      <button
                        onClick={() => handleTrust(event.deviceName, labelDrafts[event.deviceName] ?? '')}
                        disabled={busyIdentifier === event.deviceName}
                        type="button"
                        className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-brand-green px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
                      >
                        <ShieldCheck size={16} />
                        Mark as Known
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-semibold text-slate-300">Trusted devices</h3>
            {trusted.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No trusted USB devices yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {trusted.map((device) => (
                  <div
                    key={device._id ?? device.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">{device.label}</p>
                      <p className="truncate text-xs text-slate-500">{device.identifier}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(device)}
                      disabled={busyIdentifier === device.identifier}
                      type="button"
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-700 px-3 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-500 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-300">Add manually</h3>
            <p className="mt-1 text-xs text-slate-500">
              Paste the device identifier from an alert email (the "Device Name" field) if you'd rather add it before it shows up above.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={manualLabel}
                onChange={(e) => setManualLabel(e.target.value)}
                placeholder="Name"
                type="text"
                className="min-h-[44px] flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-green"
              />
              <input
                value={manualIdentifier}
                onChange={(e) => setManualIdentifier(e.target.value)}
                placeholder="Device identifier"
                type="text"
                className="min-h-[44px] flex-[2] rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-brand-green"
              />
              <button
                onClick={async () => {
                  if (!manualIdentifier.trim() || !manualLabel.trim()) return;
                  await handleTrust(manualIdentifier.trim(), manualLabel);
                  setManualIdentifier('');
                  setManualLabel('');
                }}
                disabled={!manualIdentifier.trim() || !manualLabel.trim()}
                type="button"
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-green hover:text-brand-green disabled:opacity-50"
              >
                <Check size={16} />
                Add
              </button>
            </div>
          </div>

          {status ? <p className="text-sm text-slate-300">{status}</p> : null}
        </div>
      )}
    </section>
  );
}

function SettingsPanel({
  token,
  username,
  onUsernameChange
}: {
  token: string;
  username: string;
  onUsernameChange: (username: string) => void;
}) {
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
    <div className="space-y-6">
      <AccountSettings token={token} username={username} onUsernameChange={onUsernameChange} />

      <ChangePassword token={token} />

      <KnownUsbDevices token={token} />

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
    </div>
  );
}

export default SettingsPanel;
