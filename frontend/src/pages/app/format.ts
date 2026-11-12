export function formatRelativeTime(fromMs: number, nowMs: number): string {
  const diffSeconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

export function shortHash(hash: string | undefined | null): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

export function severityStyles(severity: string): { badge: string; dot: string; icon: string } {
  switch (severity.toLowerCase()) {
    case 'critical':
      return {
        badge: 'border-brand-danger/50 bg-brand-danger/15 text-rose-300',
        dot: 'bg-brand-danger',
        icon: 'text-brand-danger'
      };
    case 'high':
      return {
        badge: 'border-brand-danger/40 bg-brand-danger/10 text-rose-300',
        dot: 'bg-brand-danger',
        icon: 'text-brand-danger'
      };
    case 'medium':
      return {
        badge: 'border-brand-amber/40 bg-brand-amber/10 text-amber-300',
        dot: 'bg-brand-amber',
        icon: 'text-brand-amber'
      };
    case 'low':
      return {
        badge: 'border-brand-cyan/40 bg-brand-cyan/10 text-cyan-300',
        dot: 'bg-brand-cyan',
        icon: 'text-brand-cyan'
      };
    default:
      return {
        badge: 'border-slate-600 bg-slate-800/60 text-slate-300',
        dot: 'bg-slate-400',
        icon: 'text-slate-400'
      };
  }
}
