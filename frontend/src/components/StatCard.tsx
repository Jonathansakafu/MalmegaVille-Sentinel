import { LucideIcon } from 'lucide-react';

type Accent = 'sky' | 'amber' | 'rose' | 'green';

const ACCENT_CLASSES: Record<Accent, { border: string; icon: string; shadow: string }> = {
  sky: { border: 'hover:border-sky-500/50 focus-visible:border-sky-500/50', icon: 'bg-sky-500/15 text-sky-400', shadow: 'hover:shadow-sky-500/10' },
  amber: { border: 'hover:border-amber-500/50 focus-visible:border-amber-500/50', icon: 'bg-amber-500/15 text-amber-400', shadow: 'hover:shadow-amber-500/10' },
  rose: { border: 'hover:border-rose-500/50 focus-visible:border-rose-500/50', icon: 'bg-rose-500/15 text-rose-400', shadow: 'hover:shadow-rose-500/10' },
  green: { border: 'hover:border-brand-green/50 focus-visible:border-brand-green/50', icon: 'bg-brand-green/15 text-brand-green', shadow: 'hover:shadow-brand-green/10' }
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  pulse = false,
  onClick
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: Accent;
  pulse?: boolean;
  onClick?: () => void;
}) {
  const classes = ACCENT_CLASSES[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/80 p-4 text-left shadow-lg shadow-black/20 transition duration-150 hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 sm:p-5 ${classes.border} ${classes.shadow}`}
    >
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-2xl transition group-hover:scale-110 ${classes.icon}`}>
          <Icon size={18} />
        </span>
        {pulse ? <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" /> : null}
      </div>
      <div>
        <p className="text-2xl font-bold text-white sm:text-3xl">{value}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      </div>
    </button>
  );
}

export default StatCard;
