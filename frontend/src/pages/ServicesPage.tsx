import { useNavigate } from 'react-router-dom';
import { Layers, Usb, Camera, MapPin, Mail, KeyRound } from 'lucide-react';
import PublicNav from '../components/PublicNav';

const SERVICES = [
  {
    icon: Usb,
    title: 'USB & login monitoring',
    description:
      'Every sign-in and USB device insertion on a protected computer is logged and checked against your trusted-device list, so unexpected activity never goes unnoticed.'
  },
  {
    icon: Camera,
    title: 'Lost-device evidence capture',
    description:
      'Mark a device lost from your dashboard and Sentinel silently captures a webcam photo whenever it unlocks or a USB drive is inserted, building a timeline of evidence.'
  },
  {
    icon: MapPin,
    title: 'Approximate location tracking',
    description:
      'Wi-Fi based positioning, with an IP-based fallback, narrows down where a lost device last connected so you know where to start looking.'
  },
  {
    icon: Mail,
    title: 'Instant email alerts',
    description:
      'Logins, incidents, and lost-device captures are emailed to you the moment they happen — no need to keep the dashboard open.'
  },
  {
    icon: KeyRound,
    title: 'Account & device settings',
    description:
      'Manage trusted USB devices, notification preferences, and your account password from a single settings panel.'
  }
];

function ServicesPage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <PublicNav isAuthenticated={isAuthenticated} />

        <section className="rounded-3xl bg-brand-panel p-8 text-center shadow-lg shadow-black/30 sm:p-16">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-green/10 text-brand-green">
            <Layers size={26} />
          </span>
          <h1 className="mt-6 text-3xl font-bold text-white sm:text-4xl">Services</h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-slate-300 sm:text-base">
            One lightweight agent, installed on any Windows PC you want protected, feeds everything below straight
            into your dashboard.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title, description }) => (
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

export default ServicesPage;
