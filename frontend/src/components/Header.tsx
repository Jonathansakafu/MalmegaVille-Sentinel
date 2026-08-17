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
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.jpeg" alt="MalmegaVille Sentinel" className="h-16 w-16 flex-shrink-0 object-contain sm:h-20 sm:w-20" />
          <p className="text-sm text-slate-400 sm:text-base">Welcome back, {userEmail || 'security operator'}.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-300 border border-slate-800">
            Devices: <span className="font-semibold text-white">{totalDevices}</span>
          </div>
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm text-slate-300 border border-slate-800">
            Incidents: <span className="font-semibold text-white">{totalIncidents}</span>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 rounded-2xl border border-rose-500 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500 hover:text-white"
            type="button"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-2 border-t border-slate-800 pt-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            type="button"
            className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
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
