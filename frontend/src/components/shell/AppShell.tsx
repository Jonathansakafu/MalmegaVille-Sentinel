import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronDown,
  Cpu,
  Database,
  FileWarning,
  FolderLock,
  HardDriveDownload,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorSmartphone,
  Network,
  Radar,
  Server,
  Settings as SettingsIcon,
  Shield,
  Usb,
  X
} from 'lucide-react';
import { sound } from '../../lib/sound';

export type ShellCounters = {
  devices: number;
  online: number;
  incidents: number;
  critical: number;
  captures: number;
};

type NavEntry = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  counter?: 'devices' | 'incidents' | 'captures';
  soon?: boolean;
};

const NAV: NavEntry[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/devices', label: 'Device Agents', icon: MonitorSmartphone, counter: 'devices' },
  { to: '/dashboard/threats', label: 'Threats & Incidents', icon: AlertTriangle, counter: 'incidents' },
  { to: '/dashboard/usb', label: 'USB Intelligence', icon: Usb },
  { to: '/dashboard/timeline', label: 'Event Timeline', icon: Activity },
  { to: '/dashboard/evidence', label: 'Evidence', icon: Images, counter: 'captures' },
  { to: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { to: '/dashboard/file-protection', label: 'File Protection', icon: FolderLock, soon: true },
  { to: '/dashboard/network', label: 'Network Monitor', icon: Network, soon: true },
  { to: '/dashboard/restore', label: 'Restore Center', icon: HardDriveDownload, soon: true },
  { to: '/dashboard/settings', label: 'Settings', icon: SettingsIcon }
];

function AppShell({
  counters,
  username,
  userEmail,
  onLogout,
  children
}: {
  counters: ShellCounters;
  username: string;
  userEmail: string;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const displayName = username || 'security operator';

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  const counterValue = useMemo(
    () => ({ devices: counters.devices, incidents: counters.incidents, captures: counters.captures }),
    [counters]
  );

  const timeLabel = clock.toLocaleTimeString([], { hour12: false });

  return (
    <div className="min-h-screen text-slate-100">
      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="relative h-full w-72 border-r border-brand-green/20 bg-ink-900 p-4">
            <ShellBrand />
            <SidebarNav counters={counters} onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-brand-green/15 bg-ink-900/80 px-4 py-5 backdrop-blur lg:flex">
          <ShellBrand />
          <SidebarNav counters={counters} />
          <div className="mt-auto">
            <div className="holo-panel p-3">
              <div className="flex items-center gap-2 text-brand-green">
                <Shield size={18} />
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em]">System protected</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {counters.online}/{counters.devices} agents reachable
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-brand-green/15 bg-ink-900/85 backdrop-blur">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Open navigation"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-10 w-10 items-center justify-center border border-brand-green/25 text-brand-green lg:hidden"
                >
                  <Menu size={18} />
                </button>
                <p className="hidden font-mono text-[11px] uppercase tracking-[0.24em] text-brand-green/80 sm:block">
                  Protect. Detect. Respond.
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <p className="hidden font-mono text-xs text-slate-400 sm:block">{timeLabel}</p>
                <button
                  type="button"
                  onClick={() => {
                    sound.play('nav');
                    navigate('/dashboard/threats');
                  }}
                  aria-label={`${counters.incidents} incidents`}
                  className="relative flex h-10 w-10 items-center justify-center border border-brand-green/20 text-slate-300 transition hover:border-brand-green/60 hover:text-brand-green"
                >
                  <Bell size={17} />
                  {counters.critical > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-danger px-1 text-[10px] font-bold text-white">
                      {counters.critical}
                    </span>
                  ) : null}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    aria-haspopup="true"
                    aria-expanded={userMenuOpen}
                    className="flex min-h-[40px] items-center gap-2 border border-brand-green/20 px-2 py-1.5 text-sm font-semibold text-slate-200 transition hover:border-brand-green/60"
                  >
                    <span className="flex h-7 w-7 items-center justify-center bg-brand-gradient font-mono text-xs font-bold text-black">
                      {displayName.trim().charAt(0).toUpperCase() || 'S'}
                    </span>
                    <span className="hidden max-w-[10rem] truncate sm:block">{displayName}</span>
                    <ChevronDown size={14} className={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {userMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-60 border border-brand-green/20 bg-ink-800 shadow-2xl shadow-black/60">
                      <div className="border-b border-brand-green/10 px-4 py-3">
                        <p className="hud-label">Signed in as</p>
                        <p className="mt-1 truncate text-sm font-semibold text-white">{displayName}</p>
                        {userEmail ? <p className="mt-0.5 truncate text-xs text-slate-500">{userEmail}</p> : null}
                      </div>
                      <button
                        type="button"
                        onClick={onLogout}
                        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>

          <footer className="border-t border-brand-green/10 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-600">
              <span className="flex items-center gap-2 text-brand-green/70">
                <Cpu size={12} /> MalmegaVille Sentinel
              </span>
              <span>{timeLabel} · session encrypted</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function ShellBrand() {
  return (
    <div className="flex items-center gap-3 border-b border-brand-green/15 pb-5">
      <div className="relative flex h-11 w-11 items-center justify-center border border-brand-green/50 bg-brand-green/10 text-brand-green">
        <Shield size={22} />
        <span className="absolute inset-0 animate-pulse-ring border border-brand-green/30" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight text-white">MalmegaVille</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand-green">Sentinel</p>
      </div>
    </div>
  );
}

function SidebarNav({ counters, onNavigate }: { counters: ShellCounters; onNavigate?: () => void }) {
  return (
    <nav className="mt-5 flex-1 space-y-1 overflow-y-auto pb-4">
      {NAV.map(({ to, label, icon: Icon, counter, soon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/dashboard'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex min-h-[42px] items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition ${
              isActive
                ? 'border-brand-green bg-brand-green/10 text-brand-green shadow-[inset_0_0_24px_-12px_rgba(0,255,136,0.9)]'
                : 'border-transparent text-slate-400 hover:border-brand-green/40 hover:bg-white/[0.03] hover:text-slate-100'
            }`
          }
        >
          <Icon size={16} />
          <span className="truncate">{label}</span>
          {soon ? (
            <span className="ml-auto rounded-sm border border-slate-700 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500">
              soon
            </span>
          ) : counter && counters[counter] > 0 ? (
            <span className="ml-auto rounded-sm bg-brand-green/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-green">
              {counters[counter]}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

export function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'green',
  hint,
  onClick
}: {
  label: string;
  value: string | number;
  icon: typeof Radar;
  tone?: 'green' | 'cyan' | 'danger' | 'amber';
  hint?: string;
  onClick?: () => void;
}) {
  const tones = {
    green: 'text-brand-green border-brand-green/25',
    cyan: 'text-brand-cyan border-brand-cyan/25',
    danger: 'text-brand-danger border-brand-danger/30',
    amber: 'text-brand-amber border-brand-amber/30'
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`holo-panel holo-corner group flex w-full flex-col gap-2 p-4 text-left transition hover:-translate-y-0.5 ${tones[tone]} ${onClick ? '' : 'cursor-default'}`}
    >
      <div className="flex items-center justify-between">
        <span className="hud-label">{label}</span>
        <Icon size={18} className="opacity-80 transition group-hover:scale-110" />
      </div>
      <p className="font-mono text-3xl font-bold text-white">{value}</p>
      {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </button>
  );
}

export function PanelTitle({ icon: Icon, title, action }: { icon: typeof Server; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand-green/10 pb-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-100">
        <Icon size={16} className="text-brand-green" />
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, message }: { icon: typeof Database; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon size={28} className="text-slate-600" />
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      <p className="max-w-sm text-xs text-slate-500">{message}</p>
    </div>
  );
}

export function UnavailableModule({ title, icon: Icon, requirements }: { title: string; icon: typeof FileWarning; requirements: string[] }) {
  return (
    <div className="space-y-4">
      <PanelTitle icon={Icon} title={title} />
      <div className="holo-panel holo-corner p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Not available yet</p>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">
          This module has no data source yet. It is shown so the navigation matches the product plan, and it will light up
          automatically once the agent and API support below exist - nothing here is simulated.
        </p>
        <ul className="mt-5 space-y-2">
          {requirements.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-400">
              <Server size={14} className="mt-0.5 shrink-0 text-slate-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AppShell;
