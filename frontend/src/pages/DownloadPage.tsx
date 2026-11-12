import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Apple, Clock, ShieldCheck, Smartphone } from 'lucide-react';
import PublicNav from '../components/PublicNav';

// Zipped rather than a bare .exe link: Chrome (and some other browsers)
// flags a freshly-published, unsigned executable as an "uncommon/dangerous
// file" and blocks the download outright until the user overrides it -
// wrapping it in a .zip avoids that extra friction.
const WINDOWS_INSTALLER_URL =
  'https://github.com/Jonathansakafu/MalmegaVille-Sentinel/releases/download/windows-agent-v1.0.1/MalmegaVilleSentinelSetup.zip';

// Served from this site so the link always points at the build that matches
// the deployed dashboard - the artifact keeps its product name.
const ANDROID_APP_URL = '/downloads/MalmegaVille%20Sentinel.apk';

function detectPlatform(): 'windows' | 'mac' | 'other' {
  const platform = navigator.userAgent || '';
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'mac';
  return 'other';
}

function DownloadPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [detected, setDetected] = useState<'windows' | 'mac' | 'other'>('other');

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-4 sm:px-6 sm:py-6">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-brand-green/80">distribution node</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Download the Agent</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Install the agent on any computer you want monitored. Sign in with your MalmegaVille Sentinel account
            after installing to link the device to your dashboard.
          </p>
        </section>

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className={`holo-panel holo-corner p-6 sm:p-8 ${
              detected === 'windows' ? 'ring-1 ring-brand-green/70' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-12 w-12 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green">
                <ShieldCheck size={22} />
              </span>
              {detected === 'windows' ? (
                <span className="border border-brand-green/40 bg-brand-green/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green">
                  Recommended
                </span>
              ) : null}
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">Windows</h2>
            <p className="mt-2 text-sm text-slate-400">
              Windows 10/11. Unzip, then run the installer inside as Administrator and sign in when the tray app
              opens.
            </p>
            <a
              href={WINDOWS_INSTALLER_URL}
              className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 border border-brand-green bg-brand-green/15 px-6 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black"
            >
              <Download size={16} />
              Download for Windows (.zip)
            </a>
            <div className="mt-3 space-y-1 text-center text-xs text-slate-500">
              <p>
                Browser flags the download as unrecognized? Click the arrow next to it and choose "Keep" — it's a
                new file, not a known publisher yet.
              </p>
              <p>
                Windows SmartScreen may also warn when you run it — choose "More info" → "Run anyway".
              </p>
              <p>
                <a href="/downloads/malmegaville-sentinel-windows-agent.zip" className="underline hover:text-slate-300">
                  Prefer to build from source?
                </a>
              </p>
            </div>
          </div>

          <div className="holo-panel holo-corner p-6 sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green">
              <Smartphone size={22} />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-white">Android Companion</h2>
            <p className="mt-2 text-sm text-slate-400">
              Optional — pair a phone to relay SMS alerts through its own SIM, free, no gateway account needed. Not
              required for core monitoring.
            </p>
            <a
              href={ANDROID_APP_URL}
              className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 border border-brand-green bg-brand-green/15 px-6 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black"
            >
              <Download size={16} />
              Download APK
            </a>
            <p className="mt-3 text-center text-xs text-slate-500">
              You'll need to allow "install unknown apps" for your browser — Android will prompt you the first time.
            </p>
          </div>

          <Link
            to="/login?view=register"
            className="holo-panel holo-corner group block p-6 opacity-80 transition hover:-translate-y-0.5 hover:border-brand-green/40 hover:opacity-100 sm:p-8"
          >
            <span className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/[0.03] text-slate-500">
              <Apple size={22} />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-white">macOS</h2>
            <p className="mt-2 text-sm text-slate-400">
              A native Mac agent is in development. Sign up now and we'll let you know the moment it's ready.
            </p>
            <span className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 border border-white/10 px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition group-hover:border-brand-green/40 group-hover:text-brand-green">
              <Clock size={16} />
              Coming Soon · Notify me
            </span>
          </Link>

          <Link
            to="/login?view=register"
            className="holo-panel holo-corner group block p-6 opacity-80 transition hover:-translate-y-0.5 hover:border-brand-green/40 hover:opacity-100 sm:p-8"
          >
            <span className="flex h-12 w-12 items-center justify-center border border-white/10 bg-white/[0.03] text-slate-500">
              <Apple size={22} />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-white">iOS Companion</h2>
            <p className="mt-2 text-sm text-slate-400">
              Apple doesn't allow apps to send SMS silently, so the iPhone app will deliver push notification
              alerts instead. Sign up now and we'll let you know the moment it's ready.
            </p>
            <span className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 border border-white/10 px-6 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 transition group-hover:border-brand-green/40 group-hover:text-brand-green">
              <Clock size={16} />
              Coming Soon · Notify me
            </span>
          </Link>
        </section>
      </div>
    </div>
  );
}

export default DownloadPage;
