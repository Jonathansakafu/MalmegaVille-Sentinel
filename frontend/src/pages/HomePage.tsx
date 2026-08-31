import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Camera, MapPin, Mail, Usb, Download } from 'lucide-react';
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
    <div className="min-h-screen bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-10 sm:space-y-14">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-brand-green">
              <ShieldCheck size={14} />
              Endpoint security, made personal
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight text-white sm:text-5xl">
              Know the moment your device is at risk.
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              MalmegaVille Sentinel watches your computer for security events, alerts you by email, and quietly
              gathers evidence — a photo, a location, copied files — if it's ever lost or stolen.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
                type="button"
                className="min-h-[48px] rounded-2xl bg-brand-green px-6 py-3 text-sm font-semibold text-black transition hover:bg-white sm:text-base"
              >
                {isAuthenticated ? 'Go to Dashboard' : 'Get Started'}
              </button>
              {!isAuthenticated ? (
                <button
                  onClick={() => navigate('/login')}
                  type="button"
                  className="min-h-[48px] rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:text-base"
                >
                  Login
                </button>
              ) : null}
              <button
                onClick={() => navigate('/download')}
                type="button"
                className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:text-base"
              >
                <Download size={16} />
                Download Agent
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-500">Works on Windows PCs today — macOS support is coming soon.</p>
          </div>

          <div className="rounded-3xl bg-brand-panel p-6 shadow-2xl shadow-black/40 sm:p-8">
            <img src="/logo.jpeg" alt="MalmegaVille Sentinel" className="mx-auto w-40 rounded-2xl object-contain sm:w-56" />
            <div className="mt-6 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-sm text-slate-400">
              <p className="flex items-center gap-2 font-semibold text-brand-green">
                <span className="h-2 w-2 rounded-full bg-brand-green animate-pulse" />
                System Online
              </p>
              <p>Devices, incidents, and captures — all in one dashboard, alerted straight to your inbox.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-3xl bg-brand-panel p-5 shadow-lg shadow-black/30">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-green/10 text-brand-green">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">{description}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-brand-panel p-6 text-center shadow-lg shadow-black/30 sm:p-10">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready to protect your devices?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Create your free account and install the agent on any device you want monitored.
          </p>
          <button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
            type="button"
            className="mt-6 min-h-[48px] rounded-2xl bg-brand-green px-8 py-3 text-sm font-semibold text-black transition hover:bg-white sm:text-base"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Get Started for Free'}
          </button>
        </section>
      </div>
    </div>
  );
}

export default HomePage;
