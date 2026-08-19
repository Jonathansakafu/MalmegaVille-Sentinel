import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Images, Settings, LogOut, ChevronDown } from 'lucide-react';

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
  onLogout
}: {
  userEmail: string;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const displayName = userEmail || 'security operator';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'S';

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

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
          <p className="min-w-0 truncate text-sm text-slate-400 sm:text-base">Welcome back, {displayName}.</p>
        </div>

        <div className="relative flex-shrink-0 self-end lg:self-auto" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="flex min-h-[44px] items-center gap-2 rounded-full border border-slate-800 bg-slate-900 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-slate-200 transition hover:border-brand-green/60 hover:text-brand-green"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-black">
              {initial}
            </span>
            <ChevronDown size={14} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/50">
              <div className="border-b border-slate-800 px-4 py-3">
                <p className="text-xs text-slate-400">Signed in as</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-100">{displayName}</p>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
                type="button"
                className="flex min-h-[44px] w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          ) : null}
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
