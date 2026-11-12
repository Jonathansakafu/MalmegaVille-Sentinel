import { useNavigate } from 'react-router-dom';
import { Camera, Download, Mail, MapPin, ShieldCheck, Usb } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const FEATURES = [
  {
    icon: Usb,
    title: 'USB & login monitoring',
    description: 'Every USB insertion and sign-in on your protected device is logged and checked against your trusted-device list.'
  },
  {
    icon: Camera,
    title: 'Lost-device evidence',
    description: 'Flag a device lost and it silently captures a webcam photo whenever it unlocks or a USB drive is inserted.'
  },
  {
    icon: MapPin,
    title: 'Approximate location',
    description: 'Wi-Fi based positioning (with an IP-based fallback) helps narrow down where a lost device last connected.'
  },
  {
    icon: Mail,
    title: 'Email alerts, instantly',
    description: 'Logins, incidents, and lost-device captures land in your inbox the moment they happen.'
  }
];

function HomePage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-4 sm:px-6 sm:py-6">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="relative grid items-center gap-6 px-1 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10">
          <div>
            <span className="inline-flex items-center gap-2 border border-brand-green/30 bg-brand-green/[0.08] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" />
              endpoint security · human scale
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">
              Know the moment your device is <span className="neon-text text-brand-green">at risk</span>.
            </h1>
            <p className="mt-5 max-w-xl text-sm text-slate-300 sm:text-base">
              MalmegaVille Sentinel watches your computer for security events, alerts you the instant they happen, and quietly
              gathers evidence — a photo, a location, copied files — if it's ever lost or stolen.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
                type="button"
                className="min-h-[48px] border border-brand-green bg-brand-green/15 px-6 font-mono text-xs font-bold uppercase tracking-[0.18em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black sm:text-sm"
              >
                {isAuthenticated ? 'Enter console' : 'Get started'}
              </button>
              {!isAuthenticated ? (
                <button
                  onClick={() => navigate('/login')}
                  type="button"
                  className="min-h-[48px] border border-white/15 px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:text-sm"
                >
                  Authenticate
                </button>
              ) : null}
              <button
                onClick={() => navigate('/download')}
                type="button"
                className="flex min-h-[48px] items-center gap-2 border border-white/15 px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:text-sm"
              >
                <Download size={15} />
                Download agent
              </button>
            </div>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">
              Windows PCs today · Android companion available · macOS in development
            </p>
          </div>

          <div className="holo-panel holo-corner scan-overlay p-4 sm:p-5">
            <div className="terminal p-3 text-[11px] leading-relaxed">
              <p className="flex items-center justify-between border-b border-brand-green/15 pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                <span>sentinel · live preview</span>
                <span className="flex items-center gap-1.5 text-brand-green">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" /> online
                </span>
              </p>
              <p className="mt-2 text-slate-500">$ sentinel status --all</p>
              <p className="text-brand-green">&gt; agents reachable ......... yes</p>
              <p className="text-brand-green">&gt; evidence channel ......... armed</p>
              <p className="text-brand-cyan">&gt; alert delivery ........... encrypted</p>
              <p className="text-slate-400">&gt; monitoring usb + sign-ins</p>
              <p className="mt-2 flex items-center gap-1 text-brand-green">
                <span className="text-slate-500">sentinel@core:~$</span>
                <span className="inline-block h-3 w-1.5 animate-flicker bg-brand-green align-middle" />
              </p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ['devices', 'monitored'],
                ['events', 'captured'],
                ['alerts', 'delivered']
              ].map(([value, label]) => (
                <div key={label} className="border border-white/8 bg-white/[0.02] px-2 py-2">
                  <p className="font-mono text-sm font-bold text-brand-green">{value}</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="holo-panel holo-corner group p-4 transition hover:-translate-y-0.5">
              <span className="flex h-10 w-10 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green transition group-hover:shadow-neon">
                <Icon size={18} />
              </span>
              <h3 className="mt-3 text-sm font-bold text-white">{title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{description}</p>
            </div>
          ))}
        </section>

        <section className="holo-panel holo-corner flex flex-col items-center gap-3 p-6 text-center sm:p-10">
          <ShieldCheck size={26} className="text-brand-green" />
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to protect your devices?</h2>
          <p className="max-w-xl text-sm text-slate-400">
            Create your free account and install the agent on any device you want monitored.
          </p>
          <button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
            type="button"
            className="mt-3 min-h-[48px] border border-brand-green bg-brand-green/15 px-8 font-mono text-xs font-bold uppercase tracking-[0.18em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black"
          >
            {isAuthenticated ? 'Enter console' : 'Enlist for free'}
          </button>
        </section>

        <p className="pb-2 text-center font-mono text-[9px] uppercase tracking-[0.24em] text-slate-700">
          protect · detect · respond
        </p>
      </div>
    </div>
  );
}

export default HomePage;
