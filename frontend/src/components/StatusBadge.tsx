const TONE_CLASSES: Record<'safe' | 'warning' | 'danger' | 'neutral', string> = {
  safe: 'bg-brand-green/15 text-brand-green',
  warning: 'bg-amber-500/15 text-amber-400',
  danger: 'bg-rose-500/15 text-rose-400 animate-pulse',
  neutral: 'bg-slate-800 text-slate-300'
};

function StatusBadge({ label, tone }: { label: string; tone: 'safe' | 'warning' | 'danger' | 'neutral' }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export default StatusBadge;
