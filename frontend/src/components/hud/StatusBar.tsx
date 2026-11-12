import { useEffect, useState } from 'react';

const WAVE = [
  3, 6, 10, 5, 14, 8, 3, 12, 18, 7, 4, 10, 15, 6, 3, 8, 13, 5, 9, 4, 7, 12, 6, 3, 10, 16, 7, 4, 8, 3
];

function Waveform() {
  const points = WAVE.map((height, index) => `${index * 3},${12 - height / 2}`).join(' ');
  return (
    <svg viewBox="0 0 90 12" className="h-3 w-[90px] shrink-0" aria-hidden="true">
      <polyline points={points} fill="none" stroke="rgba(0,255,136,0.55)" strokeWidth="0.9" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="rgba(0,217,255,0.25)" strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Bottom command-strip: live clock, rotating status line and a synthetic
 * waveform. Messages are supplied by the caller so nothing on screen is
 * invented by this component.
 */
export function StatusBar({ messages, brand = 'MalmegaVille Sentinel' }: { messages: string[]; brand?: string }) {
  const [now, setNow] = useState(() => new Date());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (messages.length < 2) return undefined;
    const rotate = window.setInterval(() => setIndex((current) => (current + 1) % messages.length), 6000);
    return () => window.clearInterval(rotate);
  }, [messages.length]);

  return (
    <div className="flex items-center gap-3 border-t border-brand-green/15 bg-[#020705]/95 px-3 py-2 sm:px-5">
      <span className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.22em] text-brand-green/75 sm:flex">
        <Waveform />
        {brand}
      </span>
      <p key={index} className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-slate-400">
        <span className="mr-2 text-brand-green">&gt;</span>
        {messages[index] ?? messages[0]}
      </p>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-slate-500">
        {now.toLocaleTimeString([], { hour12: false })}
      </span>
    </div>
  );
}

export default StatusBar;
