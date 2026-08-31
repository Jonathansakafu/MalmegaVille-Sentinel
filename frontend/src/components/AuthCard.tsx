import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { loginUser, registerUser } from '../api';

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
  const [view, setView] = useState<'login' | 'register'>(initialView);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);

    try {
      const data = view === 'login' ? await loginUser(email, password) : await registerUser(email, password, username);
      onAuthSuccess(data.token, data.user.email, data.user.username);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${view === 'login' ? 'Login' : 'Registration'} failed`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-dark px-4 py-6 text-white sm:px-6 sm:py-10">
      <Link
        to="/"
        className="mb-4 flex items-center gap-2 self-start text-sm font-semibold text-slate-400 transition hover:text-brand-green sm:self-center"
      >
        <ArrowLeft size={16} />
        Back to home
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-brand-panel p-5 shadow-xl shadow-black/40 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src="/logo.jpeg"
            alt="MalmegaVille Sentinel"
            className="mb-2 object-contain"
            style={{ width: 'clamp(3.5rem, 24vw, 8rem)', height: 'clamp(3.5rem, 24vw, 8rem)' }}
          />
          <p className="text-sm text-slate-400 sm:text-base">Secure your endpoints with device monitoring and incident reporting.</p>
        </div>

        <div className="mb-6 flex justify-center gap-2">
          <button
            className={`min-h-[44px] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              view === 'login' ? 'bg-brand-green text-black' : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}
            onClick={() => setView('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`min-h-[44px] flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
              view === 'register' ? 'bg-brand-green text-black' : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}
            onClick={() => setView('register')}
            type="button"
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block text-sm font-medium text-slate-300">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-brand-green"
            />
          </label>
          {view === 'register' ? (
            <label className="block text-sm font-medium text-slate-300">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                type="text"
                minLength={3}
                maxLength={24}
                pattern="[a-zA-Z0-9_.\-]+"
                required
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-brand-green"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">3-24 characters: letters, numbers, dots, dashes, underscores.</span>
            </label>
          ) : null}
          <label className="block text-sm font-medium text-slate-300">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
              className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-brand-green"
            />
          </label>

          {message ? <p className="text-sm text-rose-400">{message}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] w-full rounded-2xl bg-brand-green px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : view === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthCard;
