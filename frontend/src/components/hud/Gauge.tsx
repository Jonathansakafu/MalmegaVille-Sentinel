/**
 * Segmented circular gauge in the style of a hardware scan dial. The tick
 * ring is the progress indicator: filled ticks are "on", dim ticks are the
 * remaining capacity. Value is always a real computed percentage.
 */
export function Gauge({
  value,
  size = 190,
  label,
  caption,
  tone = 'green'
}: {
  value: number;
  size?: number;
  label: string;
  caption?: string;
  tone?: 'green' | 'cyan' | 'danger';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const ticks = 44;
  const colors = {
    green: { tick: '#00ff88', glow: 'rgba(0,255,136,0.55)', text: 'text-brand-green' },
    cyan: { tick: '#00d9ff', glow: 'rgba(0,217,255,0.5)', text: 'text-brand-cyan' },
    danger: { tick: '#ff1744', glow: 'rgba(255,23,68,0.55)', text: 'text-brand-danger' }
  } as const;
  const palette = colors[tone];

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div
        className="pointer-events-none absolute inset-4 rounded-full"
        style={{ boxShadow: `0 0 60px -18px ${palette.glow}, inset 0 0 40px -26px ${palette.glow}` }}
      />
      <svg viewBox="0 0 120 120" className="h-full w-full">
        <circle cx="60" cy="60" r="43" fill="rgba(0,255,136,0.02)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" />
        <g style={{ filter: `drop-shadow(0 0 2px ${palette.glow})` }}>
          {Array.from({ length: ticks }, (_, index) => {
            const angle = (index / ticks) * Math.PI * 2 - Math.PI / 2;
            const active = (index / ticks) * 100 < clamped;
            const inner = active ? 46.5 : 48;
            const outer = 53.5;
            return (
              <line
                key={index}
                x1={60 + Math.cos(angle) * inner}
                y1={60 + Math.sin(angle) * inner}
                x2={60 + Math.cos(angle) * outer}
                y2={60 + Math.sin(angle) * outer}
                stroke={active ? palette.tick : 'rgba(255,255,255,0.09)'}
                strokeWidth={active ? 2.1 : 1.2}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-[2rem] font-bold leading-none text-white">
          {clamped}
          <span className={`text-sm ${palette.text}`}>%</span>
        </span>
        <span className="mt-1.5 max-w-[7.5rem] font-mono text-[9px] uppercase leading-tight tracking-[0.18em] text-slate-400">
          {label}
        </span>
        {caption ? <span className={`mt-1 font-mono text-[9px] uppercase tracking-[0.16em] ${palette.text}`}>{caption}</span> : null}
      </div>
    </div>
  );
}

export default Gauge;
