import { FormEvent, useState } from 'react';
import { loginUser, registerUser } from '../api';

function AuthCard({ onAuthSuccess }: { onAuthSuccess: (token: string, email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [view, setView] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');
    setSubmitting(true);

    try {
      const data = view === 'login' ? await loginUser(email, password) : await registerUser(email, password);
      onAuthSuccess(data.token, data.user.email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${view === 'login' ? 'Login' : 'Registration'} failed`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-dark px-4 py-10 text-white sm:px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-brand-panel p-6 shadow-xl shadow-black/40 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/logo.jpeg" alt="MalmegaVille Sentinel" className="mb-2 h-32 w-32 object-contain sm:h-40 sm:w-40" />
          <p className="text-slate-400">Secure your endpoints with device monitoring and incident reporting.</p>
        </div>

        <div className="mb-6 flex justify-center gap-2">
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              view === 'login' ? 'bg-brand-green text-black' : 'border border-slate-700 bg-slate-900 text-slate-300'
            }`}
            onClick={() => setView('login')}
            type="button"
          >
            Login
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
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
            className="w-full rounded-2xl bg-brand-green px-4 py-3 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50"
          >
            {submitting ? 'Please wait…' : view === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthCard;
