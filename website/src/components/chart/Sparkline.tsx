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
  const last = points.at(-1)!;

  // Like the big chart, the line is dashed across a gap, where points are further apart than usual.
  const gaps = points.slice(1).map((point, i) => point.time - points[i].time);
  const spacing = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  const segments: Point[][] = [];

  points.forEach((point, i) => {
    if (i > 0 && gaps[i - 1] <= spacing * 1.5) {
      segments.at(-1)!.push(point);
    } else {
      segments.push([point]);
    }
  });

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {segments.map((segment) => (
          <path
            key={segment[0].time}
            d={curve(segment.map((point) => [x(point.time), y(point.avg)]))}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ stroke: color }}
          />
        ))}
        {segments.slice(1).map((segment, i) => {
          const [from, to] = [segments[i].at(-1)!, segment[0]];
          return (
            <line
              key={to.time}
              x1={x(from.time)}
              y1={y(from.avg)}
              x2={x(to.time)}
              y2={y(to.avg)}
              strokeWidth={1.5}
              strokeDasharray="3 4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ stroke: color }}
            />
          );
        })}
      </svg>
      <span className="absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-surface" style={{ left: `${x(last.time)}%`, top: `${(y(last.avg) / HEIGHT) * 100}%`, background: color }} />
    </div>
  );
}