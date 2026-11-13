import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ShieldAlert, ShieldQuestion, X } from 'lucide-react';
import { sound } from '../../lib/sound';

export type ConfirmTone = 'danger' | 'default';

export type ConfirmOptions = {
  title: string;
  message: string;
  detail?: string;
  tone?: ConfirmTone;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PendingRequest = ConfirmOptions & { resolve: (accepted: boolean) => void };

const ConfirmContext = createContext<{ confirm: (options: ConfirmOptions) => Promise<boolean> } | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setRequest({ ...options, resolve });
    });
  }, []);

  const settle = useCallback(
    (accepted: boolean) => {
      request?.resolve(accepted);
      setRequest(null);
    },
    [request]
  );

  useEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    sound.play(request.tone === 'danger' ? 'alert' : 'key');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [request, settle]);

  const danger = request?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {request ? (
        <div
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
          aria-label={request.title}
          onClick={() => settle(false)}
        >
          <div
            className={`holo-panel scan-overlay holo-corner w-full max-w-md animate-glitch border p-6 sm:p-8 ${
              danger ? 'border-brand-danger/60 shadow-neon-danger' : 'border-brand-green/50 shadow-neon'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4">
              <span className={danger ? 'mt-1 text-brand-danger' : 'mt-1 text-brand-cyan'}>
                {danger ? <ShieldAlert size={38} strokeWidth={2.2} /> : <ShieldQuestion size={38} strokeWidth={2.2} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="hud-label">{danger ? 'Action requires clearance' : 'Confirm action'}</p>
                <h2 className={`mt-1 font-mono text-2xl font-bold tracking-wide ${danger ? 'text-brand-danger' : 'text-brand-green'}`}>
                  {request.title}
                </h2>
                <p className="mt-3 text-sm text-slate-200">{request.message}</p>
                {request.detail ? (
                  <p className="mt-3 break-words rounded-md border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-slate-400">
                    {request.detail}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    ref={cancelRef}
                    type="button"
                    onClick={() => settle(false)}
                    className="flex min-h-[44px] items-center justify-center gap-2 border border-white/20 bg-white/5 px-6 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:border-brand-cyan hover:text-brand-cyan"
                  >
                    <X size={13} />
                    {request.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => settle(true)}
                    className={`flex min-h-[44px] items-center justify-center gap-2 border px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.2em] transition ${
                      danger
                        ? 'border-brand-danger bg-brand-danger/15 text-brand-danger hover:bg-brand-danger hover:text-black'
                        : 'border-brand-green bg-brand-green/15 text-brand-green hover:bg-brand-green hover:text-black'
                    }`}
                  >
                    {request.confirmLabel ?? 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside ConfirmProvider');
  return context;
}
