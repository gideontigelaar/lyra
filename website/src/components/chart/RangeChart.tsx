import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { formatNumber } from '../../lib/format';
import type { Tick } from '../../lib/periods';
import type { Point } from '../../lib/types';
import { curve } from './curve';

interface Props {
  points: Point[];
  before?: Point;
  after?: Point;
  start: number;
  end: number;
  slots: number[];
  ticks: Tick[];
  color: string;
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

export default function RangeChart({ points, before, after, start, end, slots, ticks, color, decimals, label, selected, onSelect }: Props) {
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

  const pick = (event: PointerEvent<SVGRectElement>) => {
    if (!centers.length) {
      return;
    }

    const pointer = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const nearest = centers.reduce((best, center, i) => (Math.abs(center - pointer) < Math.abs(centers[best] - pointer) ? i : best), 0);
    onSelect(nearest);
  };

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
    <div ref={ref} tabIndex={0} role="group" aria-label={label} onKeyDown={onKeyDown} className="relative rounded-xl outline-offset-4 focus-visible:outline-2 focus-visible:outline-accent">
      {width > 0 && (
        <svg width={width} height={HEIGHT} className="block touch-pan-y select-none" aria-hidden="true">
          {y.ticks.map((tick) => (
            <g key={tick}>
              <line x1={0} x2={plotWidth} y1={yPos(tick)} y2={yPos(tick)} className="stroke-line" />
              <text x={plotWidth + 8} y={yPos(tick)} dy="0.35em" className="fill-muted text-[11px] tabular-nums">
                {formatNumber(tick, labelDecimals)}
              </text>
            </g>
          ))}
          <line x1={0} x2={plotWidth} y1={TOP + plotHeight} y2={TOP + plotHeight} className="stroke-line" />
          {ticks.map((tick) => (
            <g key={tick.time}>
              <line x1={x(tick.time)} x2={x(tick.time)} y1={TOP} y2={TOP + plotHeight + 6} className="stroke-line" strokeOpacity={0.6} />
              <text x={x(tick.time) + 4} y={HEIGHT - 6} className="fill-muted text-[11px]">
                {tick.label}
              </text>
            </g>
          ))}
          <clipPath id={clip}>
            <rect x={0} y={0} width={plotWidth} height={HEIGHT} />
          </clipPath>
          {segments.map((indexes) => (
            <g key={all[indexes[0]].time} clipPath={`url(#${clip})`}>
              <path d={`${path(indexes, (point) => point.max)}${path([...indexes].reverse(), (point) => point.min).replace('M', 'L')}Z`} style={{ fill: color, fillOpacity: 0.16 }} />
              <path d={path(indexes, (point) => point.avg)} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: color }} />
              {(indexes.length === 1 || !slots.length) &&
                indexes.filter(inside).map((i) => <circle key={i} cx={allCenters[i]} cy={yPos(all[i].avg)} r={indexes.length === 1 ? 4 : 2.5} style={{ fill: color }} />)}
            </g>
          ))}
          {selected !== null && centers[selected] !== undefined && (
            <>
              <line x1={centers[selected]} x2={centers[selected]} y1={TOP} y2={TOP + plotHeight} className="stroke-muted" strokeWidth={1} />
              <circle cx={centers[selected]} cy={yPos(points[selected].avg)} r={5} strokeWidth={2} className="stroke-bg" style={{ fill: color }} />
            </>
          )}
          {!points.length && (
            <text x={plotWidth / 2} y={TOP + plotHeight / 2} textAnchor="middle" className="fill-muted text-[15px] font-semibold">
              No Data
            </text>
          )}
          <rect
            x={0}
            y={0}
            width={plotWidth}
            height={HEIGHT}
            fill="transparent"
            onPointerDown={pick}
            onPointerMove={(event) => (event.pointerType === 'mouse' || event.buttons) && pick(event)}
            onPointerLeave={(event) => event.pointerType === 'mouse' && onSelect(null)}
          />
        </svg>
      )}
      {width === 0 && <div style={{ height: HEIGHT }} />}
    </div>
  );
}