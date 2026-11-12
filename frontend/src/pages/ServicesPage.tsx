import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Usb, Camera, MapPin, Mail, KeyRound, ArrowRight } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const SERVICES = [
  {
    id: 'usb-login',
    icon: Usb,
    title: 'USB & login monitoring',
    description:
      'Every sign-in and USB device insertion on a protected computer is logged and checked against your trusted-device list, so unexpected activity never goes unnoticed.',
    to: '/download'
  },
  {
    id: 'evidence',
    icon: Camera,
    title: 'Lost-device evidence capture',
    description:
      'Mark a device lost from your dashboard and Sentinel silently captures a webcam photo whenever it unlocks or a USB drive is inserted, building a timeline of evidence.',
    to: '/download'
  },
  {
    id: 'location',
    icon: MapPin,
    title: 'Approximate location tracking',
    description:
      'Wi-Fi based positioning, with an IP-based fallback, narrows down where a lost device last connected so you know where to start looking.',
    to: '/download'
  },
  {
    id: 'alerts',
    icon: Mail,
    title: 'Instant email alerts',
    description:
      'Logins, incidents, and lost-device captures are emailed to you the moment they happen — no need to keep the dashboard open.',
    to: '/download'
  },
  {
    id: 'settings',
    icon: KeyRound,
    title: 'Account & device settings',
    description:
      'Manage trusted USB devices, notification preferences, and your account password from a single settings panel.',
    to: '/login'
  }
];

function ServicesPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const target = document.getElementById(hash);
    if (!target) return;
    const timer = window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen text-white">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-4 sm:px-6 sm:py-6">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="holo-panel holo-corner p-8 text-center sm:p-14">
          <span className="mx-auto flex h-14 w-14 items-center justify-center border border-brand-green/40 bg-brand-green/10 text-brand-green">
            <Layers size={26} />
          </span>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.26em] text-brand-green/80">capability matrix</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Services</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            One lightweight agent, installed on any Windows PC you want protected, feeds everything below straight
            into your dashboard.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ id, icon: Icon, title, description, to }) => (
            <Link
              key={title}
              id={id}
              to={id === 'settings' && isAuthenticated ? '/dashboard/settings' : to}
              className="holo-panel holo-corner group scroll-mt-24 p-5 transition hover:-translate-y-0.5 hover:border-brand-green/40"
            >
              <span className="flex h-11 w-11 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green transition group-hover:shadow-neon">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-400">{description}</p>
              <span className="mt-4 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.18em] text-brand-green">
                Open <ArrowRight size={10} className="transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </section>

        <section className="holo-panel holo-corner p-6 text-center sm:p-10">
          <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready to protect your devices?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400 sm:text-base">
            Create your free account and install the agent on any device you want monitored.
          </p>
          <button
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
            type="button"
            className="mt-6 min-h-[48px] border border-brand-green bg-brand-green/15 px-8 font-mono text-xs font-bold uppercase tracking-[0.18em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black"
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Get Started for Free'}
          </button>
        </section>
      </div>
    </div>
  );
}

export default ServicesPage;
