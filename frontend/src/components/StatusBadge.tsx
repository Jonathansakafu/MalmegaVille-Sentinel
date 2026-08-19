export type BadgeTone = 'safe' | 'neutral' | 'low' | 'medium' | 'high' | 'critical';

const TONE_CLASSES: Record<BadgeTone, string> = {
  safe: 'bg-brand-green/15 text-brand-green',
  neutral: 'bg-slate-800 text-slate-300',
  low: 'bg-sky-500/15 text-sky-400',
  medium: 'bg-amber-500/15 text-amber-400',
  high: 'bg-rose-500/15 text-rose-400 animate-pulse',
  critical: 'bg-rose-600/25 text-rose-300 ring-1 ring-inset ring-rose-500/60 animate-pulse'
};

export function severityTone(severity: string): BadgeTone {
  switch (severity.toLowerCase()) {
    case 'informational':
      return 'neutral';
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'critical':
      return 'critical';
    default:
      return 'medium';
  }
}

function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export default StatusBadge;
