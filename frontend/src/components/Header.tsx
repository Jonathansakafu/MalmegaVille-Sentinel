import { LayoutDashboard, Images, Settings, LogOut } from 'lucide-react';

export type TabKey = 'dashboard' | 'captures' | 'settings';

const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'captures', label: 'Captures', icon: Images },
  { key: 'settings', label: 'Settings', icon: Settings }
];

function Header({
  userEmail,
  activeTab,
  onTabChange,
  totalDevices,
  totalIncidents,
  onLogout
}: {
  userEmail: string;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  totalDevices: number;
  totalIncidents: number;
  onLogout: () => void;
}) {
  return (
    <header className="rounded-3xl bg-brand-panel p-4 shadow-xl shadow-black/40 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img
            src="/logo.jpeg"
            alt="MalmegaVille Sentinel"
            className="flex-shrink-0 object-contain"
            style={{ width: 'clamp(2.5rem, 12vw, 5rem)', height: 'clamp(2.5rem, 12vw, 5rem)' }}
          />
          <p className="min-w-0 truncate text-sm text-slate-400 sm:text-base">Welcome back, {userEmail || 'security operator'}.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-sm text-slate-300 sm:px-4 sm:py-3 sm:text-left">
            Devices: <span className="font-semibold text-white">{totalDevices}</span>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-center text-sm text-slate-300 sm:px-4 sm:py-3 sm:text-left">
            Incidents: <span className="font-semibold text-white">{totalIncidents}</span>
          </div>
          <button
            onClick={onLogout}
            className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500 hover:text-white sm:col-span-1 sm:py-3"
            type="button"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      <nav className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800 pt-4 sm:mt-6 sm:flex sm:flex-wrap sm:pt-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            type="button"
            className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
              activeTab === key
                ? 'bg-brand-green text-black'
                : 'border border-slate-700 bg-slate-900 text-slate-200 hover:border-brand-green hover:text-brand-green'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>
    </header>
  );
}

export default Header;
