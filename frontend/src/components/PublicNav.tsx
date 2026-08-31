import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

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
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      isActive ? 'bg-brand-green text-black' : 'text-slate-300 hover:text-brand-green'
    }`;

  return (
    <header className="rounded-3xl bg-brand-panel p-4 shadow-xl shadow-black/40 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="flex min-w-0 items-center gap-3" onClick={() => setMenuOpen(false)}>
          <img
            src="/logo.jpeg"
            alt="MalmegaVille Sentinel"
            className="h-10 w-10 flex-shrink-0 rounded-xl object-contain sm:h-12 sm:w-12"
          />
          <span className="truncate text-base font-bold text-white sm:text-lg">MalmegaVille Sentinel</span>
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
              className="min-h-[44px] rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
            >
              Go to Dashboard
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                type="button"
                className="min-h-[44px] rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-brand-green hover:text-brand-green"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/login?view=register')}
                type="button"
                className="min-h-[44px] rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white"
              >
                Get Started
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
          aria-label="Toggle menu"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 text-slate-200 lg:hidden"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen ? (
        <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `min-h-[44px] rounded-2xl px-4 py-2.5 text-sm font-semibold transition flex items-center ${
                    isActive ? 'bg-brand-green text-black' : 'text-slate-300 hover:bg-slate-900'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex flex-col gap-2 pt-2">
            {isAuthenticated ? (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate('/dashboard');
                }}
                type="button"
                className="min-h-[44px] rounded-2xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-black"
              >
                Go to Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/login');
                  }}
                  type="button"
                  className="min-h-[44px] rounded-2xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200"
                >
                  Login
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/login?view=register');
                  }}
                  type="button"
                  className="min-h-[44px] rounded-2xl bg-brand-green px-4 py-2.5 text-sm font-semibold text-black"
                >
                  Get Started
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
