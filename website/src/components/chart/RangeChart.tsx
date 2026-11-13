import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { formatNumber } from '../../lib/format';
import type { Tick } from '../../lib/periods';
import type { Point } from '../../lib/types';
import { curve } from './curve';

interface Props {
  // Changes with the period shown, so its readings fade in.
  id: string;
  points: Point[];
  before?: Point;
  after?: Point;
  start: number;
  end: number;
  slots: number[];
  ticks: Tick[];
  color: string;
  // Values at or under this take the other colour, like a low battery.
  low?: { below: number; color: string };
  decimals: number;
  label: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
}

const HEIGHT = 240;
const TOP = 10;
const BOTTOM = 26;
const RIGHT = 44;

const niceStep = (span: number) => {
  const magnitude = 10 ** Math.floor(Math.log10(span));
  return ([1, 2, 5, 10].find((step) => step * magnitude >= span) ?? 10) * magnitude;
};

const scale = (points: Point[]) => {
  const low = Math.min(...points.map((point) => point.min));
  const high = Math.max(...points.map((point) => point.max));
  const step = niceStep(Math.max(high - low, Math.abs(high) * 0.02, 1e-6) / 3);
  const min = Math.floor(low / step) * step;
  const max = Math.max(Math.ceil(high / step) * step, min + step);
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step), step };
};

export default function RangeChart({ id, points, before, after, start, end, slots, ticks, color, low, decimals, label, selected, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(width - RIGHT, 1);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const x = (time: number) => ((time - start) / (end - start)) * plotWidth;
  const y = points.length ? scale([...points, ...(before ? [before] : []), ...(after ? [after] : [])]) : { min: 0, max: 1, ticks: [], step: 1 };
  const yPos = (value: number) => TOP + plotHeight - ((value - y.min) / (y.max - y.min)) * plotHeight;
  const labelDecimals = y.step < 1 ? Math.min(decimals, Math.ceil(-Math.log10(y.step))) : 0;

  const slotIndex = points.map((point) => slots.findIndex((slot, i) => point.time >= slot && point.time < (slots[i + 1] ?? end)));
  const centers = points.map((point, i) => (slots.length ? (x(slots[slotIndex[i]] ?? point.time) + x(slots[slotIndex[i] + 1] ?? end)) / 2 : x(point.time)));
  // The readings just outside the window carry the line on to the edges, so it doesn't stop as if nothing came before or after.
  const all = [...(before ? [before] : []), ...points, ...(after ? [after] : [])];
  const shift = before ? 1 : 0;
  const allCenters = [
    ...(before ? [slots.length ? x(start) - (x(slots[1] ?? end) - x(start)) / 2 : x(before.time)] : []),
    ...centers,
    ...(after ? [slots.length ? x(end) + (x(end) - x(slots.at(-1) ?? start)) / 2 : x(after.time)] : []),
  ];
  const allSlots = [...(before ? [-1] : []), ...slotIndex, ...(after ? [slots.length] : [])];
  const gaps = all.slice(1).map((point, i) => point.time - all[i].time);
  const spacing = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  const segments: number[][] = [];

  all.forEach((_, i) => {
    const joined = i > 0 && (slots.length ? allSlots[i] - allSlots[i - 1] === 1 : gaps[i - 1] <= spacing * 2.5);
    if (joined) {
      segments.at(-1)!.push(i);
    } else {
      segments.push([i]);
    }
  });

  const path = (indexes: number[], value: (point: Point) => number) => curve(indexes.map((i) => [allCenters[i], yPos(value(all[i]))]));
  const inside = (i: number) => i >= shift && i < shift + points.length;
  const clip = useId();
  const edge = low ? Math.min(Math.max((yPos(low.below) - TOP) / plotHeight, 0), 1) : 0;
  const paint = low ? `url(#${clip}-low)` : color;

  const plot = useRef<SVGRectElement>(null);

  // The point nearest to where the pointer or finger is.
  const pickAt = (clientX: number) => {
    if (!centers.length || !plot.current) {
      return;
    }

    const pointer = clientX - plot.current.getBoundingClientRect().left;
    onSelect(centers.reduce((best, center, i) => (Math.abs(center - pointer) < Math.abs(centers[best] - pointer) ? i : best), 0));
  };

  const latest = useRef(pickAt);
  latest.current = pickAt;

  // A finger taps a point, or swipes sideways through them, like in Health or Stocks. Swiping up or down scrolls the page as usual.
  // Touch events, not pointer events, because iOS Safari didn't keep sending pointer moves to the chart.
  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    let touch: { x: number; y: number; way: 'across' | 'along' | null } | null = null;

    const start = (event: TouchEvent) => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, way: null } : null;
    };

    const move = (event: TouchEvent) => {
      if (!touch) {
        return;
      }

      const { clientX, clientY } = event.touches[0];

      if (!touch.way && Math.hypot(clientX - touch.x, clientY - touch.y) > 8) {
        touch.way = Math.abs(clientX - touch.x) > Math.abs(clientY - touch.y) ? 'across' : 'along';
      }

      if (touch.way === 'across') {
        event.preventDefault();
        latest.current(clientX);
      }
    };

    const end = (event: TouchEvent) => {
      if (touch && !touch.way) {
        latest.current(event.changedTouches[0].clientX);
      }

      touch = null;
    };

    const cancel = () => (touch = null);

    element.addEventListener('touchstart', start, { passive: true });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end);
    element.addEventListener('touchcancel', cancel);

    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', cancel);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!points.length) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      onSelect(selected === null ? (step > 0 ? 0 : points.length - 1) : Math.min(Math.max(selected + step, 0), points.length - 1));
    } else if (event.key === 'Escape') {
      onSelect(null);
    }
  };

  return (
    <div ref={ref} tabIndex={0} role="group" aria-label={label} onKeyDown={onKeyDown} className="relative touch-pan-y rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">
      {width > 0 && (
        <svg width={width} height={HEIGHT} className="block select-none [-webkit-touch-callout:none]" aria-hidden="true">
          {y.ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotWidth} y1={yPos(tick)} y2={yPos(tick)} className="stroke-line" />
              <text x={plotWidth + 8} y={yPos(tick)} dy="0.35em" className="fill-muted text-caption-2 tabular-nums">
                {formatNumber(tick, labelDecimals)}
              </text>
            </g>
          ))}
          <line x1={0} x2={plotWidth} y1={TOP + plotHeight} y2={TOP + plotHeight} className="stroke-line" />
          {ticks.map((tick) => (
            <g key={tick.time}>
              <line x1={x(tick.time)} x2={x(tick.time)} y1={TOP} y2={TOP + plotHeight + 6} className="stroke-line" strokeOpacity={0.6} />
              <text x={x(tick.time) + 4} y={HEIGHT - 6} className="fill-muted text-caption-2">
                {tick.label}
              </text>
            </g>
          ))}
          {low && (
            // Above the line where values count as low the chart has its own colour, below it the other one.
            <linearGradient id={`${clip}-low`} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={TOP} y2={TOP + plotHeight}>
              <stop offset={edge} style={{ stopColor: color }} />
              <stop offset={edge} style={{ stopColor: low.color }} />
            </linearGradient>
          )}
          <clipPath id={clip}>
            <rect x={0} y={0} width={plotWidth} height={HEIGHT} />
          </clipPath>
          <g key={id} className="transition-opacity duration-300 ease-out starting:opacity-0">
            {segments.map((indexes) => (
              <g key={all[indexes[0]].time} clipPath={`url(#${clip})`}>
                <path d={`${path(indexes, (point) => point.max)}${path([...indexes].reverse(), (point) => point.min).replace('M', 'L')}Z`} style={{ fill: paint, fillOpacity: 0.16 }} />
                <path d={path(indexes, (point) => point.avg)} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: paint }} />
                {(indexes.length === 1 || !slots.length) &&
                  indexes.filter(inside).map((i) => <circle key={i} cx={allCenters[i]} cy={yPos(all[i].avg)} r={indexes.length === 1 ? 4 : 2.5} style={{ fill: paint }} />)}
              </g>
            ))}
          </g>
          {selected !== null && centers[selected] !== undefined && (
            <>
              <line x1={centers[selected]} x2={centers[selected]} y1={TOP} y2={TOP + plotHeight} className="stroke-muted" strokeWidth={1} />
              <circle
                cx={centers[selected]}
                cy={yPos(points[selected].avg)}
                r={5}
                strokeWidth={2}
                className="stroke-bg"
                style={{ fill: low && points[selected].avg <= low.below ? low.color : color }}
              />
            </>
          )}
          {!points.length && (
            <text x={plotWidth / 2} y={TOP + plotHeight / 2} textAnchor="middle" className="fill-muted text-subheadline font-semibold">
              No Data
            </text>
          )}
          <rect
            x={0}
            y={0}
            width={plotWidth}
            height={HEIGHT}
            fill="transparent"
            ref={plot}
            onPointerDown={(event) => event.pointerType !== 'touch' && pickAt(event.clientX)}
            onPointerMove={(event) => event.pointerType !== 'touch' && pickAt(event.clientX)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && onSelect(null)}
          />
        </svg>
      )}
      {width === 0 && <div style={{ height: HEIGHT }} />}
    </div>
  );
}