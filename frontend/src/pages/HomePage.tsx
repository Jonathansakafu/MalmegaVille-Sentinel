import { Link, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BellRing,
  Camera,
  CheckCircle2,
  Crosshair,
  Download,
  Fingerprint,
  FolderLock,
  HardDriveDownload,
  KeyRound,
  LockKeyhole,
  Mail,
  MapPin,
  MonitorSmartphone,
  Network,
  Radar,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Usb,
  Wifi
} from 'lucide-react';
import PublicNav from '../components/PublicNav';
import HoloGlobe from '../components/globe/HoloGlobe';
import StatusBar from '../components/hud/StatusBar';
import { useAlerts } from '../components/ui/Alerts';
import { getExperienceSettings } from '../lib/experience';

const CAPABILITIES: { icon: LucideIcon; title: string; description: string; status: string; code: string; to: string }[] = [
  {
    icon: Usb,
    title: 'USB & login monitoring',
    description: 'Every removable drive and sign-in on a protected device is recorded and checked against your trusted list.',
    status: 'Active',
    code: 'MOD-01',
    to: '/services#usb-login'
  },
  {
    icon: Camera,
    title: 'Lost-device evidence',
    description: 'Flag a device lost and it silently captures a webcam photo the next time it unlocks or a drive is inserted.',
    status: 'Armed',
    code: 'MOD-02',
    to: '/services#evidence'
  },
  {
    icon: MapPin,
    title: 'Approximate location',
    description: 'Wi-Fi positioning with an IP-based fallback narrows down where a lost device last connected.',
    status: 'Wi-Fi + IP',
    code: 'MOD-03',
    to: '/services#location'
  },
  {
    icon: Mail,
    title: 'Instant alert delivery',
    description: 'Logins, incidents and lost-device captures reach your inbox, phone and relay the moment they happen.',
    status: 'Encrypted',
    code: 'MOD-04',
    to: '/services#alerts'
  },
  {
    icon: FolderLock,
    title: 'File integrity watch',
    description: 'SHA-256 manifests diffed every scan, alerts on tampering, and a verified backup of every changed file.',
    status: 'Active',
    code: 'MOD-05',
    to: '/dashboard/file-protection'
  },
  {
    icon: Network,
    title: 'Outbound network monitor',
    description: 'Every established connection with its owning process; first contact with a public peer raises an alert.',
    status: 'Active',
    code: 'MOD-06',
    to: '/dashboard/network'
  },
  {
    icon: HardDriveDownload,
    title: 'Verified restore center',
    description: 'Push evidence or a stored backup back to a device and re-hash the written file before calling it recovered.',
    status: 'Active',
    code: 'MOD-07',
    to: '/dashboard/restore'
  }
];

const SIGNALS: { icon: LucideIcon; title: string; detail: string; level: string; tone: string; to: string }[] = [
  { icon: Usb, title: 'USB media inserted', detail: 'usb intelligence · agent reported', level: 'Low', tone: 'text-brand-green border-brand-green/40', to: '/services#usb-login' },
  { icon: Fingerprint, title: 'Sign-in outside trusted hours', detail: 'login guard · policy match', level: 'High', tone: 'text-brand-amber border-brand-amber/40', to: '/services#usb-login' },
  { icon: Camera, title: 'Lost-device unlock', detail: 'evidence protocol · capture queued', level: 'Critical', tone: 'text-brand-danger border-brand-danger/50', to: '/services#evidence' },
  { icon: Wifi, title: 'Location fix resolved', detail: 'geolocation · wifi positioning', level: 'Info', tone: 'text-brand-cyan border-brand-cyan/40', to: '/services#location' }
];

function HomePage({ isAuthenticated }: { isAuthenticated: boolean }) {
  const navigate = useNavigate();
  const { showAlert } = useAlerts();
  const experience = getExperienceSettings();

  const runAccessDemo = () => {
    showAlert({
      kind: 'denied',
      title: 'ACCESS DENIED',
      message: 'Unauthorized action blocked. This is the intervention every destructive device command receives.',
      detail: 'demo · simulated intervention · no device was touched',
      sticky: true
    });
  };

  return (
    <div className="min-h-screen text-slate-100">
      <PublicNav isAuthenticated={isAuthenticated} />

      <main className="mx-auto w-full max-w-[1440px] px-4 pb-10 pt-5 sm:px-6">
        <section aria-label="Platform status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={Radar}
            label="Active modules"
            value="11"
            suffix="/11"
            note="All modules online"
            tone="green"
            filled={11}
            segments={11}
            to="/services"
          />
          <StatCard
            icon={MonitorSmartphone}
            label="Platforms"
            value="03"
            suffix="/03"
            note="Win · Android · Web"
            tone="cyan"
            filled={3}
            segments={3}
            to="/download"
          />
          <StatCard
            icon={BellRing}
            label="Alert channels"
            value="04"
            suffix="/04"
            note="Email · push · SMS"
            tone="green"
            filled={4}
            segments={4}
            to="/services#alerts"
          />
          <StatCard
            icon={LockKeyhole}
            label="Encryption"
            value="AES-256"
            note="At rest · TLS"
            tone="green"
            filled={6}
            segments={6}
            to="/services#settings"
          />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col justify-center lg:col-span-5">
            <span className="inline-flex w-fit items-center gap-2 border border-brand-green/30 bg-brand-green/[0.07] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-green">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" />
              Endpoint security platform · v1.0
            </span>
            <h1 className="mt-5 text-[2.15rem] font-bold leading-[1.05] [text-wrap:balance] sm:text-5xl xl:text-[3.05rem]">
              Know the moment your device is <span className="neon-text text-brand-green">at risk</span>.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
              Sentinel watches your computer for security events, alerts you the instant they happen, and quietly gathers
              evidence — a photo, a location, copied files — if it is ever lost or stolen.
            </p>

            <div className="mt-7 flex flex-wrap gap-2.5">
              <button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
                type="button"
                className="group flex min-h-[50px] w-full items-center justify-center gap-2 border border-brand-green bg-brand-green/15 px-6 font-mono text-xs font-bold uppercase tracking-[0.18em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black sm:w-auto"
              >
                {isAuthenticated ? 'Enter console' : 'Get started'}
                <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
              </button>
              {!isAuthenticated ? (
                <button
                  onClick={() => navigate('/login')}
                  type="button"
                  className="min-h-[50px] w-full border border-white/15 px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:w-auto"
                >
                  Authenticate
                </button>
              ) : null}
              <button
                onClick={() => navigate('/download')}
                type="button"
                className="flex min-h-[50px] w-full items-center justify-center gap-2 border border-white/15 px-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-brand-green hover:text-brand-green sm:w-auto"
              >
                <Download size={15} />
                Download agent
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={12} className="text-brand-green" /> Windows 10 / 11
              </span>
              <span className="h-3 w-px bg-white/10" />
              <span className="flex items-center gap-1.5">
                <Smartphone size={12} className="text-brand-cyan" /> Android companion
              </span>
              <span className="h-3 w-px bg-white/10" />
              <button
                type="button"
                onClick={runAccessDemo}
                className="flex items-center gap-1.5 text-slate-500 transition hover:text-brand-danger"
              >
                <ShieldAlert size={12} /> Preview access denial
              </button>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-7">
            <div className="holo-panel holo-corner scan-overlay relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-green/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Crosshair size={15} className="text-brand-green" />
                  <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-slate-100">Global posture</h2>
                </div>
                <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em]">
                  <span className="border border-white/10 px-2 py-1 text-slate-500">Preview feed</span>
                  <span className="flex items-center gap-1.5 border border-brand-green/30 bg-brand-green/10 px-2 py-1 text-brand-green">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" /> Scanning
                  </span>
                </div>
              </div>

              <div className="relative h-[330px] sm:h-[350px]">
                <div className="pointer-events-none absolute inset-0 grid-fade" />
                <HoloGlobe pins={[]} reducedMotion={experience.reducedMotion} />
                <div className="pointer-events-none absolute left-3 top-3 hidden space-y-1.5 font-mono text-[9px] uppercase tracking-[0.16em] sm:block">
                  <p className="text-slate-500">lat 00.000</p>
                  <p className="text-slate-500">lon 00.000</p>
                </div>
                <div className="pointer-events-none absolute bottom-1 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.08em] text-slate-400 sm:bottom-3 sm:flex-col sm:items-start sm:gap-y-1.5 sm:tracking-[0.16em]">
                  <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-green" /> Safe device</p>
                  <p className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-danger" /> Lost device</p>
                  <p className="hidden items-center gap-1.5 text-slate-500 sm:flex"><span className="h-2 w-2 rounded-full border border-brand-cyan" /> Coverage ring</p>
                </div>
                <p className="absolute inset-x-0 bottom-3 mx-auto hidden max-w-[15rem] text-center font-mono text-[9px] uppercase leading-relaxed tracking-[0.14em] text-slate-600 sm:block">
                  Device locations render here as soon as an agent reports one.
                </p>
              </div>

              <div className="grid grid-cols-3 divide-x divide-white/5 border-t border-brand-green/10">
                {[
                  ['Agents', 'Windows · Android', '/download'],
                  ['Transport', 'TLS 1.2+', '/about'],
                  ['Evidence', 'On demand', '/services#evidence']
                ].map(([label, value, to]) => (
                  <Link key={label} to={to} className="block px-3 py-2.5 transition hover:bg-white/[0.03]">
                    <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-slate-600">{label}</p>
                    <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-slate-300">{value}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div>
            <SectionHeader label="Capability matrix" title="Seven modules, one operator console" meta="07 live" icon={ScanLine} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {CAPABILITIES.map(({ icon: Icon, title, description, status, code, to }) => (
                <Link
                  key={title}
                  to={to}
                  className="holo-panel holo-corner group block p-4 transition hover:-translate-y-0.5 hover:border-brand-green/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green transition group-hover:shadow-neon">
                      <Icon size={18} />
                    </span>
                    <span className="border border-brand-green/25 bg-brand-green/[0.06] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-brand-green">
                      {status}
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-sm font-bold text-white">{title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{description}</p>
                  <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">{code}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader label="Signal taxonomy" title="How the console reads events" meta="Example rows" icon={ShieldAlert} />
            <div className="holo-panel holo-corner divide-y divide-white/5">
              {SIGNALS.map(({ icon: Icon, title, detail, level, tone, to }) => (
                <Link key={title} to={to} className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.03]">
                  <Icon size={17} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-slate-100">{title}</p>
                    <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">{detail}</p>
                  </div>
                  <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${tone}`}>{level}</span>
                </Link>
              ))}
              <p className="px-4 py-2.5 font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-slate-600">
                Real event types. Counters stay at zero until your first agent reports.
              </p>
            </div>

            <div className="terminal holo-panel holo-corner p-3 text-[11px] leading-relaxed">
              <p className="flex items-center justify-between border-b border-brand-green/15 pb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                <span>sentinel · status</span>
                <span className="flex items-center gap-1.5 text-brand-green">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-green" /> online
                </span>
              </p>
              <p className="mt-2 text-slate-500">$ sentinel status --all</p>
              <p className="text-brand-green">&gt; usb guard ............... armed</p>
              <p className="text-brand-green">&gt; login watcher ........... armed</p>
              <p className="text-brand-green">&gt; integrity watch ......... armed</p>
              <p className="text-brand-cyan">&gt; network telemetry ....... streaming</p>
              <p className="text-brand-green">&gt; restore channel ......... verified</p>
              <p className="text-brand-cyan">&gt; evidence channel ........ encrypted</p>
              <p className="flex items-center gap-1 text-brand-green">
                <span className="text-slate-500">sentinel@core:~$</span>
                <span className="inline-block h-3 w-1.5 animate-flicker bg-brand-green align-middle" />
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <SectionHeader label="Deployment" title="Three steps from download to watch" meta="~5 min" icon={KeyRound} />
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            {[
              {
                step: '01',
                icon: KeyRound,
                title: 'Create operator account',
                copy: 'Register with your email. No card, no gateway account, no installer licence.',
                to: isAuthenticated ? '/dashboard' : '/login?view=register'
              },
              {
                step: '02',
                icon: Download,
                title: 'Install the agent',
                copy: 'Run the Windows setup as Administrator, or pair the Android companion for SMS relay.',
                to: '/download'
              },
              {
                step: '03',
                icon: Crosshair,
                title: 'Watch the console',
                copy: 'Devices, incidents, evidence and location land in one command center in real time.',
                to: isAuthenticated ? '/dashboard' : '/login'
              }
            ].map(({ step, icon: Icon, title, copy, to }) => (
              <Link key={step} to={to} className="holo-panel holo-corner relative block overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-brand-green/40">
                <span className="pointer-events-none absolute -right-2 -top-5 font-mono text-[4.5rem] font-bold leading-none text-white/[0.04]">{step}</span>
                <span className="flex h-9 w-9 items-center justify-center border border-brand-green/30 bg-brand-green/10 text-brand-green">
                  <Icon size={16} />
                </span>
                <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.24em] text-brand-green/70">Step {step}</p>
                <h3 className="mt-1 text-sm font-bold text-white">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{copy}</p>
                <span className="mt-3 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.16em] text-brand-green">
                  Continue <ArrowRight size={10} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="holo-panel holo-corner scan-overlay mt-6 overflow-hidden p-6 sm:p-9">
          <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div className="flex items-center gap-5">
              <div className="relative hidden h-16 w-16 items-center justify-center border border-brand-green/40 bg-brand-green/10 text-brand-green sm:flex">
                <ShieldCheck size={30} />
                <span className="absolute inset-0 animate-pulse-ring border border-brand-green/30" />
              </div>
              <div>
                <p className="hud-label">Deploy sentinel</p>
                <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">Ready to put your devices under watch?</h2>
                <p className="mt-2 max-w-xl text-sm text-slate-400">
                  Create a free account, install the agent on any device, and let the console handle the rest.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              <button
                onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login?view=register')}
                type="button"
                className="min-h-[50px] border border-brand-green bg-brand-green/15 px-7 font-mono text-xs font-bold uppercase tracking-[0.18em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black"
              >
                {isAuthenticated ? 'Enter console' : 'Enlist for free'}
              </button>
              <button
                onClick={() => navigate('/download')}
                type="button"
                className="min-h-[50px] border border-white/15 px-7 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-brand-green hover:text-brand-green"
              >
                Download agent
              </button>
            </div>
          </div>
        </section>
      </main>

      <StatusBar
        messages={[
          'sentinel core online — all telemetry channels encrypted',
          'windows agent available — android companion available',
          'evidence protocol armed, waiting for a lost-device signal',
          'secure today. safer tomorrow. protect · detect · respond'
        ]}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  note,
  tone,
  filled,
  segments,
  to
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  tone: 'green' | 'cyan';
  filled: number;
  segments: number;
  to: string;
}) {
  const tones = {
    green: { icon: 'text-brand-green border-brand-green/25 bg-brand-green/[0.07]', bar: 'bg-brand-green' },
    cyan: { icon: 'text-brand-cyan border-brand-cyan/25 bg-brand-cyan/[0.07]', bar: 'bg-brand-cyan' }
  } as const;
  const palette = tones[tone];

  return (
    <Link to={to} className="holo-panel holo-corner block px-3.5 py-3 transition hover:-translate-y-0.5 hover:border-brand-green/40 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-[#a3d4b4]/70">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center border ${palette.icon}`}>
          <Icon size={14} />
        </span>
      </div>
      <p className="mt-2 whitespace-nowrap font-mono text-[1.5rem] font-bold leading-none text-white sm:text-[1.7rem]">
        {value}
        {suffix ? <span className="ml-1 text-[10px] font-semibold text-slate-500">{suffix}</span> : null}
      </p>
      <p className="mt-1.5 truncate font-mono text-[8px] uppercase tracking-[0.1em] text-slate-500 sm:text-[9px] sm:tracking-[0.12em]">{note}</p>
      <div className="mt-2.5 flex gap-1" aria-hidden="true">
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            className={`h-1 flex-1 ${index < filled ? palette.bar : 'bg-white/8'}`}
            style={index < filled ? { boxShadow: '0 0 6px -1px currentColor' } : undefined}
          />
        ))}
      </div>
    </Link>
  );
}

function SectionHeader({
  label,
  title,
  meta,
  icon: Icon
}: {
  label: string;
  title: string;
  meta: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="hud-label">{label}</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
          <Icon size={17} className="text-brand-green" />
          {title}
        </h2>
      </div>
      <span className="border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-slate-500">{meta}</span>
    </div>
  );
}

export default HomePage;
