import { useId } from 'react';

const TONES = {
  green: { line: '#00ff88', fill: 'rgba(0, 255, 136, 0.22)' },
  cyan: { line: '#00d9ff', fill: 'rgba(0, 217, 255, 0.2)' },
  danger: { line: '#ff1744', fill: 'rgba(255, 23, 68, 0.22)' },
  amber: { line: '#ffb020', fill: 'rgba(255, 176, 32, 0.2)' }
} as const;

export type SparklineTone = keyof typeof TONES;

/**
 * Tiny SVG trend line for real bucketed telemetry. Values are normalised to
 * the series' own range, so a flat series renders as a baseline instead of
 * implying movement that never happened.
 */
export function Sparkline({
  values,
  tone = 'green',
  height = 34,
  className = ''
}: {
  values: number[];
  tone?: SparklineTone;
  height?: number;
  className?: string;
}) {
  const gradientId = useId().replace(/[:]/g, '');
  const width = 120;
  const palette = TONES[tone];
  const series = values.length > 1 ? values : [0, 0];
  const max = Math.max(...series);
  const bottom = Math.min(...series, 0);
  const range = Math.max(max - bottom, 1);
  const step = width / (series.length - 1);

  const points = series.map((value, index) => {
    const x = index * step;
    const y = height - 3 - ((value - bottom) / range) * (height - 8);
    return [x, y] as const;
  });

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.fill} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={palette.line} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={palette.line} />
    </svg>
  );
}

export default Sparkline;
