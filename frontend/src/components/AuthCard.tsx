import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Fingerprint, Lock, ShieldCheck } from 'lucide-react';
import { loginUser, registerUser } from '../api';
import { useAlerts } from './ui/Alerts';
import { sound } from '../lib/sound';

function AuthCard({
  onAuthSuccess,
  initialView = 'login'
}: {
  onAuthSuccess: (token: string, email: string, username: string) => void;
  initialView?: 'login' | 'register';
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [view, setView] = useState<'login' | 'register'>(initialView);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showAlert } = useAlerts();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);

    try {
      const data =
        view === 'login' ? await loginUser(email, password) : await registerUser(email, password, username, phoneNumber);
      sound.play('grant');
      onAuthSuccess(data.token, data.user.email, data.user.username);
    } catch (error) {
      const detail = error instanceof Error ? error.message : `${view === 'login' ? 'Login' : 'Registration'} failed`;
      setMessage(detail);
      showAlert({
        kind: 'denied',
        title: 'ACCESS DENIED',
        message: view === 'login' ? 'Credentials rejected. The command center stays sealed.' : 'Enrollment was rejected by the server.',
        detail
      });
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-2 w-full border border-brand-green/20 bg-black/50 px-3 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-brand-green/70 focus:shadow-neon';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-8 text-white sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-fade opacity-70" />
      <Link
        to="/"
        className="relative mb-4 flex items-center gap-2 self-start font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500 transition hover:text-brand-green sm:self-center"
      >
        <ArrowLeft size={14} />
        return to surface
      </Link>

      <div className="holo-panel holo-corner scan-overlay relative w-full max-w-md p-5 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-14 w-14 items-center justify-center border border-brand-green/50 bg-brand-green/10 text-brand-green">
            <ShieldCheck size={26} />
            <span className="absolute inset-0 animate-pulse-ring border border-brand-green/30" />
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.32em] text-brand-green/80">MalmegaVille Sentinel</p>
          <h1 className="mt-1 font-mono text-xl font-bold tracking-[0.16em] text-white neon-text">
            {view === 'login' ? 'SECURE ACCESS' : 'OPERATOR ENROLLMENT'}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
            <Lock size={10} /> authorized personnel only
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          {(['login', 'register'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setView(option);
                setMessage('');
              }}
              className={`min-h-[40px] border font-mono text-[10px] uppercase tracking-[0.18em] transition ${
                view === option
                  ? 'border-brand-green/60 bg-brand-green/15 text-brand-green shadow-neon'
                  : 'border-white/10 text-slate-400 hover:border-brand-green/30 hover:text-slate-200'
              }`}
            >
              {option === 'login' ? 'Authenticate' : 'Enroll'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="hud-label">Operator email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="operator@domain"
              className={inputClass}
            />
          </label>

          {view === 'register' ? (
            <label className="block">
              <span className="hud-label">Callsign / username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                type="text"
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_.\-]+"
                required
                placeholder="nightwatch"
                className={inputClass}
              />
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">
                3-24 chars · letters, numbers, dots, dashes, underscores
              </span>
            </label>
          ) : null}

          {view === 'register' ? (
            <label className="block">
              <span className="hud-label">Recovery phone (optional)</span>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                type="tel"
                placeholder="+15551234567"
                pattern="^\+[1-9]\d{6,14}$"
                className={inputClass}
              />
              <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-slate-600">
                used only when a lost device has no internet
              </span>
            </label>
          ) : null}

          <label className="block">
            <span className="hud-label">Passphrase</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
              autoComplete={view === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              className={inputClass}
            />
          </label>

          {message ? (
            <p className="border border-brand-danger/40 bg-brand-danger/10 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-rose-300">
              {message}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 border border-brand-green bg-brand-green/15 font-mono text-xs font-bold uppercase tracking-[0.22em] text-brand-green shadow-neon transition hover:bg-brand-green hover:text-black disabled:opacity-50"
          >
            <Fingerprint size={15} className={submitting ? 'animate-pulse' : ''} />
            {submitting ? 'verifying…' : view === 'login' ? 'jack in' : 'create operator'}
          </button>
        </form>

        <p className="mt-5 border-t border-white/5 pt-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">
          tls channel · credentials never leave the vault
        </p>
      </div>
    </div>
  );
}

export default AuthCard;
