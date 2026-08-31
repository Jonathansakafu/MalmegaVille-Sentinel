import { useEffect, useState } from 'react';
import { Download, Apple, Clock, FileArchive } from 'lucide-react';
import PublicNav from '../components/PublicNav';

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
    <div className="min-h-screen bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="text-center">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">Download the Desktop Agent</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Install the agent on any computer you want monitored. Sign in with your MalmegaVille Sentinel account
            after installing to link the device to your dashboard.
          </p>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <div
            className={`rounded-3xl bg-brand-panel p-6 shadow-lg shadow-black/30 sm:p-8 ${
              detected === 'windows' ? 'ring-2 ring-brand-green' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green/10 text-brand-green">
                <FileArchive size={22} />
              </span>
              {detected === 'windows' ? (
                <span className="rounded-full bg-brand-green/10 px-3 py-1 text-xs font-semibold text-brand-green">
                  Recommended for your device
                </span>
              ) : null}
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">Windows</h2>
            <p className="mt-2 text-sm text-slate-400">
              Windows 10/11. Requires the .NET 8 SDK to build the agent from source — full setup steps are included
              in the download.
            </p>
            <a
              href="/downloads/malmegaville-sentinel-windows-agent.zip"
              download
              className="mt-6 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-green px-6 py-3 text-sm font-semibold text-black transition hover:bg-white"
            >
              <Download size={16} />
              Download for Windows
            </a>
          </div>

          <div className="rounded-3xl bg-brand-panel p-6 opacity-80 shadow-lg shadow-black/30 sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
              <Apple size={22} />
            </span>
            <h2 className="mt-5 text-xl font-semibold text-white">macOS</h2>
            <p className="mt-2 text-sm text-slate-400">
              A native Mac agent is in development. Sign up now and we'll let you know the moment it's ready.
            </p>
            <button
              disabled
              type="button"
              className="mt-6 flex min-h-[48px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-400"
            >
              <Clock size={16} />
              Coming Soon
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default DownloadPage;
