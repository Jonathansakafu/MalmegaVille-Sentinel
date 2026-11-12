import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, ShieldX, Wifi } from 'lucide-react';
import { sound } from '../../lib/sound';

export type AlertKind = 'denied' | 'granted' | 'threat' | 'success' | 'device';

type AlertInput = {
  kind: AlertKind;
  title: string;
  message: string;
  detail?: string;
  /** Stays on screen until dismissed instead of timing out. */
  sticky?: boolean;
};

type AlertState = AlertInput & { id: number };

const AlertContext = createContext<{ showAlert: (alert: AlertInput) => void } | null>(null);

const STYLES: Record<AlertKind, {
  icon: typeof ShieldCheck;
  accent: string;
  border: string;
  glow: string;
  sound: 'grant' | 'deny' | 'alert' | 'success' | 'device';
}> = {
  denied: { icon: ShieldX, accent: 'text-brand-danger', border: 'border-brand-danger/60', glow: 'shadow-neon-danger', sound: 'deny' },
  granted: { icon: ShieldCheck, accent: 'text-brand-green', border: 'border-brand-green/50', glow: 'shadow-neon', sound: 'grant' },
  threat: { icon: AlertTriangle, accent: 'text-brand-danger', border: 'border-brand-danger/60', glow: 'shadow-neon-danger', sound: 'alert' },
  success: { icon: CheckCircle2, accent: 'text-brand-green', border: 'border-brand-green/40', glow: 'shadow-neon', sound: 'success' },
  device: { icon: Wifi, accent: 'text-brand-cyan', border: 'border-brand-cyan/40', glow: 'shadow-neon-cyan', sound: 'device' }
};

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback((input: AlertInput) => {
    sound.play(STYLES[input.kind].sound);
    setAlert({ ...input, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!alert || alert.sticky) return;
    const timer = window.setTimeout(() => setAlert(null), 3200);
    return () => window.clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    if (!alert) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') setAlert(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert]);

  const style = alert ? STYLES[alert.kind] : null;
  const Icon = style?.icon;

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      {alert && style && Icon ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-label={alert.title}
        >
          <div className={`holo-panel scan-overlay holo-corner w-full max-w-lg animate-glitch border ${style.border} p-6 sm:p-8 ${style.glow}`}>
            <div className="flex items-start gap-4">
              <span className={`mt-1 ${style.accent}`}>
                <Icon size={38} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="hud-label">{alert.kind === 'denied' ? 'Security intervention' : alert.kind === 'threat' ? 'Threat detected' : 'System message'}</p>
                <h2 className={`mt-1 font-mono text-2xl font-bold tracking-wide ${style.accent}`}>{alert.title}</h2>
                <p className="mt-3 text-sm text-slate-200">{alert.message}</p>
                {alert.detail ? (
                  <p className="mt-3 break-words rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-slate-400">
                    {alert.detail}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAlert(null)}
                  className="mt-6 min-h-[44px] w-full border border-white/20 bg-white/5 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:border-brand-green hover:text-brand-green sm:w-auto sm:px-8"
                >
                  Acknowledge
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) throw new Error('useAlerts must be used inside AlertProvider');
  return context;
}
