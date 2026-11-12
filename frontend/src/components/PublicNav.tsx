import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, Shield, X } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About Us' },
  { to: '/services', label: 'Services' },
  { to: '/download', label: 'Download' }
];

function PublicNav({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
      isActive ? 'border-brand-green text-brand-green' : 'border-transparent text-slate-400 hover:border-brand-green/40 hover:text-slate-100'
    }`;

  return (
    <header className="relative border-b border-brand-green/20 bg-ink-900/70 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
        <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setMenuOpen(false)}>
          <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center border border-brand-green/50 bg-brand-green/10 text-brand-green">
            <Shield size={20} />
            <span className="absolute inset-0 animate-pulse-ring border border-brand-green/30" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-white sm:text-base">MalmegaVille</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-brand-green">Sentinel</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={navLinkClass} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <button
              onClick={() => navigate('/dashboard')}
              type="button"
              className="min-h-[40px] border border-brand-green/50 bg-brand-green/10 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green hover:text-black"
            >
              Enter console
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                type="button"
                className="min-h-[40px] border border-white/15 px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-brand-green hover:text-brand-green"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/login?view=register')}
                type="button"
                className="min-h-[40px] border border-brand-green/50 bg-brand-green/10 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-green transition hover:bg-brand-green hover:text-black"
              >
                Get started
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
          aria-label="Toggle menu"
          className="flex h-10 w-10 items-center justify-center border border-brand-green/25 text-brand-green lg:hidden"
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-brand-green/15 px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center border-l-2 px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] transition ${
                    isActive
                      ? 'border-brand-green bg-brand-green/10 text-brand-green'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
            {isAuthenticated ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/dashboard');
                }}
                type="button"
                className="min-h-[44px] border border-brand-green/50 bg-brand-green/10 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-green"
              >
                Enter console
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/login');
                  }}
                  type="button"
                  className="min-h-[44px] border border-white/15 px-4 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-200"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/login?view=register');
                  }}
                  type="button"
                  className="min-h-[44px] border border-brand-green/50 bg-brand-green/10 px-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-green"
                >
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

export default PublicNav;
