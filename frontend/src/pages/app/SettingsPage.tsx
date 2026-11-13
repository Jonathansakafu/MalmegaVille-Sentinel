import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Bell, MonitorSpeaker, Settings as SettingsIcon, Volume2, Zap } from 'lucide-react';
import SettingsPanel from '../../components/SettingsPanel';
import { PanelTitle } from '../../components/shell/AppShell';
import { useExperienceSettings } from '../../lib/experience';
import { sound } from '../../lib/sound';
import type { DashboardContext } from './context';

function Toggle({
  checked,
  onChange,
  label,
  hint
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 border transition ${checked ? 'border-brand-green/60 bg-brand-green/20' : 'border-white/15 bg-white/5'}`}
      >
        <span
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 transition-all ${checked ? 'left-6 bg-brand-green' : 'left-1 bg-slate-500'}`}
        />
      </button>
    </div>
  );
}

function SettingsPage() {
  const { token, username, onUsernameChange } = useOutletContext<DashboardContext>();
  const { settings: experience, update: updateExperience } = useExperienceSettings();
  const [audio, setAudio] = useState(() => sound.getSettings());

  const patchAudio = (patch: Partial<{ enabled: boolean; volume: number }>) => {
    sound.update(patch);
    setAudio(sound.getSettings());
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="hud-label">Operator configuration</p>
        <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Account, alerting, trusted hardware, and how the command center looks and sounds on this device.
        </p>
      </div>

      <section className="holo-panel holo-corner p-4 sm:p-5 min-w-0">
        <PanelTitle icon={Volume2} title="Sound &amp; experience" />
        <p className="mt-2 text-xs text-slate-500">
          Synthesised on this device with the Web Audio API - no audio files are downloaded, and nothing plays until you interact
          with the page.
        </p>

        <div className="mt-4 grid gap-x-8 lg:grid-cols-2">
          <div>
            <Toggle
              checked={audio.enabled}
              onChange={(enabled) => patchAudio({ enabled })}
              label="Interface sounds"
              hint="Clicks, keystrokes, navigation, cinematic loading drone, and access granted/denied cues."
            />
            <div className="border-b border-white/5 py-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="volume" className="text-sm font-semibold text-slate-100">
                  Volume
                </label>
                <span className="font-mono text-xs text-brand-green">{Math.round(audio.volume * 100)}%</span>
              </div>
              <input
                id="volume"
                type="range"
                min={0}
                max={100}
                value={Math.round(audio.volume * 100)}
                disabled={!audio.enabled}
                onChange={(event) => patchAudio({ volume: Number(event.target.value) / 100 })}
                className="mt-2 w-full accent-brand-green disabled:opacity-40"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    ['click', 'Click'],
                    ['key', 'Keystroke'],
                    ['grant', 'Access granted'],
                    ['deny', 'Access denied']
                  ] as const
                ).map(([name, label]) => (
                  <button
                    key={name}
                    type="button"
                    disabled={!audio.enabled}
                    onClick={() => sound.play(name)}
                    className="min-h-[32px] border border-white/10 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-slate-300 transition hover:border-brand-green/40 hover:text-brand-green disabled:opacity-40"
                  >
                    ▶ {label}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              checked={experience.reducedMotion}
              onChange={(reducedMotion) => updateExperience({ reducedMotion })}
              label="Reduce motion"
              hint="Stops globe rotation, scanlines, glitch, and transition animations."
            />
            <Toggle
              checked={experience.lowEffects}
              onChange={(lowEffects) => updateExperience({ lowEffects })}
              label="Low-effects mode"
              hint="Drops decorative overlays and glow for slower devices and low-power phones."
            />
          </div>

          <div className="mt-4 lg:mt-0">
            <div className="border border-white/8 bg-black/30 p-3">
              <p className="hud-label">Preview</p>
              <div className="terminal mt-2 p-2.5 text-[11px] leading-relaxed">
                <p className="text-slate-500">sentinel@core:~$ audit --session</p>
                <p className="text-brand-green">link established · operator authenticated</p>
                <p className="text-brand-cyan">telemetry channel: encrypted</p>
                <p className="text-brand-green/90">
                  ready<span className="ml-0.5 inline-block h-3 w-1.5 animate-flicker bg-brand-green align-middle" />
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-2 border border-brand-cyan/20 bg-brand-cyan/[0.04] p-3 text-xs text-slate-400">
              <Zap size={14} className="mt-0.5 shrink-0 text-brand-cyan" />
              <p>
                Sound settings apply to this browser only. The Android agent plays its own cues on-device; the Windows agent follows
                the same sound profile.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 pt-1">
        <SettingsIcon size={14} className="text-brand-green" />
        <p className="hud-label">Account, alerting &amp; trusted hardware</p>
      </div>
      <SettingsPanel token={token} username={username} onUsernameChange={onUsernameChange} />

      <p className="flex items-center gap-2 pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">
        <Bell size={11} /> Alert delivery is configured above · <MonitorSpeaker size={11} /> interface audio is local to this browser
      </p>
    </div>
  );
}

export default SettingsPage;
