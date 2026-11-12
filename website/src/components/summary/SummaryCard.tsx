import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { cardHref, cardKey, cardValues, sparkKey } from '../../lib/cards';
import { clockTime, formatNumber, unitText } from '../../lib/format';
import { batteryLevel, hasBattery, lowBattery, metricStyle } from '../../lib/metrics';
import type { Card, Point, Sensor } from '../../lib/types';
import { card as cardClass, pressable } from '../../lib/ui';
import MetricChip from '../MetricChip';
import Sparkline from '../chart/Sparkline';
import MetricValue from '../MetricValue';

export type Spark = { points: Point[]; start: number; end: number };

interface Props {
  card: Card;
  sensors: Sensor[];
  sparks: Record<string, Spark>;
  now: number;
  editing: boolean;
  onRemove: () => void;
  onResize: () => void;
}

const cardName = (card: Card, sensors: Sensor[]) => {
  if (card.type === 'batteries') {
    return 'Batteries';
  }

  if (card.type === 'combined') {
    return `Average ${metricStyle(card.metric).label.toLowerCase()}`;
  }

  const sensor = sensors.find((item) => item.id === card.sensor)!;
  return card.type === 'sensor' ? sensor.name : `${sensor.name} ${metricStyle(card.metric).label.toLowerCase()}`;
};

// One line per hour: the average of the sensors that have a value for that hour.
const averageSpark = (sparks: (Spark | undefined)[]): Spark | undefined => {
  const present = sparks.filter((spark) => spark !== undefined);

  if (!present.length) {
    return undefined;
  }

  const hours = new Map<number, number[]>();
  present.forEach((spark) => spark.points.forEach((point) => hours.set(point.time, [...(hours.get(point.time) ?? []), point.avg])));

  const points = [...hours]
    .sort(([a], [b]) => a - b)
    .map(([time, values]) => {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { time, min: avg, max: avg, avg };
    });

  return { points, start: present[0].start, end: present[0].end };
};

function Header({ title, subtitle, time, large }: { title: string; subtitle?: string; time: string | null; large: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-muted">{subtitle}</div>}
      </div>
      {time && large && <span className="shrink-0 text-[13px] text-muted">{time}</span>}
    </div>
  );
}

function ValueBody({ card, sensors, sparks, now }: Props) {
  const values = cardValues(card, sensors);
  const name = card.metric!;
  const style = metricStyle(name);
  const large = card.size === 'large';
  const readings = values.flatMap(({ metric }) => (metric.latest ? [metric.latest] : []));
  const numbers = readings.map((reading) => reading.value);
  const value = numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : null;
  const newest = readings
    .map((reading) => reading.measured_at)
    .sort()
    .at(-1);
  const spark = averageSpark(values.map(({ sensor, metric }) => sparks[sparkKey(sensor.id, metric.name)]));
  const combined = card.type === 'combined';
  const unit = values[0]?.metric.unit ?? '';

  return (
    <>
      <div className="flex items-start gap-2.5">
        <MetricChip metric={name} />
        <div className="min-w-0 flex-1">
          <Header
            title={combined ? `Average ${style.label.toLowerCase()}` : style.label}
            subtitle={combined ? values.map(({ sensor }) => sensor.name).join(', ') : sensors.length > 1 ? values[0]?.sensor.name : undefined}
            time={newest ? clockTime(newest, now) : null}
            large={large}
          />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <MetricValue metric={name} value={value} unit={unit} size={large ? 'huge' : 'large'} />
        {combined && large && numbers.length > 1 && (
          <span className="truncate text-[13px] text-muted">
            {formatNumber(Math.min(...numbers), style.decimals)}–{formatNumber(Math.max(...numbers), style.decimals)}
            {unitText(unit)}
          </span>
        )}
      </div>
      {spark && <Sparkline {...spark} color={style.color} className="mt-3 min-h-8 w-full flex-1" />}
    </>
  );
}

// Values fill the card in balanced rows: up to 3 side by side, more in two rows on a large card, pairs on a small one.
const rowsOf = <T,>(items: T[], large: boolean) => {
  const perRow = large ? (items.length <= 3 ? items.length : Math.ceil(items.length / 2)) : items.length <= 3 ? 1 : 2;
  return Array.from({ length: Math.ceil(items.length / perRow) }, (_, i) => items.slice(i * perRow, (i + 1) * perRow));
};

function SensorBody({ card, sensors, sparks, now }: Props) {
  const sensor = sensors.find((item) => item.id === card.sensor)!;
  const large = card.size === 'large';
  const values = cardValues(card, sensors).slice(0, large ? 8 : 6);
  const rows = rowsOf(values, large);
  const newest = values
    .map(({ metric }) => metric.latest!.measured_at)
    .sort()
    .at(-1);
  const size = large ? (rows.length === 1 ? 'large' : 'medium') : values.length <= 2 ? 'large' : values.length <= 4 ? 'medium' : 'small';

  return (
    <>
      <Header title={sensor.name} time={newest ? clockTime(newest, now) : null} large={large} />
      {values.length ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          {rows.map((row, i) => (
            <div key={i} className="flex min-h-0 flex-1 gap-4">
              {row.map(({ metric }) => {
                const style = metricStyle(metric.name);
                const spark = large ? sparks[sparkKey(sensor.id, metric.name)] : undefined;
                return (
                  <div key={metric.name} className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                    <div className="flex items-center gap-2">
                      <MetricChip metric={metric.name} small />
                      <MetricValue metric={metric.name} value={metric.latest!.value} unit={metric.unit} size={size} />
                    </div>
                    {spark && <Sparkline {...spark} color={style.color} className="mt-2 min-h-5 w-full flex-1" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-auto text-[13px] text-muted">Waiting for data</div>
      )}
    </>
  );
}

function BatteriesBody({ card, sensors }: Props) {
  const style = metricStyle('battery');
  const large = card.size === 'large';
  const list = sensors
    .filter(hasBattery)
    .map((sensor) => ({ sensor, level: batteryLevel(sensor), low: lowBattery(sensor) !== null }))
    .sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity))
    .slice(0, large ? 4 : 3);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <MetricChip metric="battery" />
        <span className="truncate text-[15px] font-semibold">Batteries</span>
      </div>
      <ul className="mt-auto space-y-1.5 pt-3">
        {list.map(({ sensor, level, low }) => (
          <li key={sensor.id} className="flex items-center gap-2 text-[15px]">
            <span className="min-w-0 flex-1 truncate">{sensor.name}</span>
            {low && <WarningCircleIcon weight="fill" className="size-4 shrink-0" style={{ color: 'var(--status-warning)' }} aria-label="Low" />}
            {large && level !== null && (
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-fill" aria-hidden="true">
                <span
                  className="block h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.min(Math.max(level, 0), 100)}%`, background: low ? 'var(--status-warning)' : style.color }}
                />
              </span>
            )}
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{level === null ? '–' : `${Math.round(level)}%`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function SummaryCard(props: Props) {
  const { card, sensors, editing, onRemove, onResize } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardKey(card), disabled: !editing });
  const name = cardName(card, sensors);
  const body = card.type === 'sensor' ? <SensorBody {...props} /> : card.type === 'batteries' ? <BatteriesBody {...props} /> : <ValueBody {...props} />;
  const surface = `${cardClass} flex h-full flex-col overflow-hidden p-4`;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`relative ${card.size === 'large' ? 'col-span-2' : 'col-span-1'} ${isDragging ? 'z-10' : ''}`}
    >
      {editing ? (
        <div
          {...attributes}
          {...listeners}
          aria-label={`${name}, reorder`}
          className={`${surface} cursor-grab touch-none ring-2 ring-accent/30 ${isDragging ? 'scale-[1.02] cursor-grabbing shadow-xl' : 'scale-[0.97]'}`}
        >
          {body}
        </div>
      ) : (
        <a href={cardHref(card)} aria-label={name} className={`${surface} ${pressable} hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-950/5 active:translate-y-0 active:scale-[0.98]`}>
          {body}
        </a>
      )}
      {editing && (
        <>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-navy-400 text-white shadow-md transition duration-200 ease-out starting:scale-50 starting:opacity-0 dark:bg-navy-600"
          >
            <MinusIcon weight="bold" className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onResize}
            aria-label={`${card.size === 'small' ? 'Enlarge' : 'Shrink'} ${name}`}
            className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full bg-surface text-navy-950 shadow-md ring-1 ring-line transition duration-200 ease-out starting:scale-50 starting:opacity-0 dark:text-navy-50"
          >
            {card.size === 'small' ? <ArrowsOutSimpleIcon weight="bold" className="size-4" aria-hidden="true" /> : <ArrowsInSimpleIcon weight="bold" className="size-4" aria-hidden="true" />}
          </button>
        </>
      )}
    </div>
  );
}