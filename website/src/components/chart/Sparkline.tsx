import type { Point } from '../../lib/types';
import { curve } from './curve';

interface Props {
  points: Point[];
  start: number;
  end: number;
  color: string;
  className: string;
}

const WIDTH = 100;
const HEIGHT = 40;
const PAD = 4;

export default function Sparkline({ points, start, end, color, className }: Props) {
  if (!points.length) {
    return null;
  }

  const low = Math.min(...points.map((point) => point.min));
  const high = Math.max(...points.map((point) => point.max));
  const span = high - low || 1;
  const x = (time: number) => PAD + ((time - start) / (end - start)) * (WIDTH - PAD * 2);
  const y = (value: number) => PAD + (HEIGHT - PAD * 2) * (1 - (value - low) / span);
  const line = curve(points.map((point) => [x(point.time), y(point.avg)]));
  const last = points.at(-1)!;

  return (
    <div className={`relative h-10 shrink-0 ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={line} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ stroke: color }} />
      </svg>
      <span className="absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-surface" style={{ left: `${x(last.time)}%`, top: y(last.avg), background: color }} />
    </div>
  );
}