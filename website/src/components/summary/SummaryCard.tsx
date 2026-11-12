import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, MinusIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { type CSSProperties, type KeyboardEvent } from 'react';
import { cardHref, cardKey, cardValues, sparkKey } from '../../lib/cards';
import { clockTime, formatNumber, unitText } from '../../lib/format';
import { batteryLevel, hasBattery, lowBattery, metricStyle } from '../../lib/metrics';
import type { Spot } from '../../lib/grid';
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
  // A removed card fading out. It's gone from the cards already, so Undo and Done see the change straight away.
  leaving?: boolean;
  spot: Spot;
  onRemove: () => void;
  onResize: () => void;
  onEdit: () => void;
}

// Cards are placed on the grid of Summary, which sets --cell and --gap. Spots change through transitions, so moves and resizes slide.
export const PLACE =
  'absolute top-0 left-0 h-[calc(var(--h)*var(--cell)_+_(var(--h)_-_1)*var(--gap))] w-[calc(var(--w)*var(--cell)_+_(var(--w)_-_1)*var(--gap))] translate-x-[calc(var(--x)*(var(--cell)_+_var(--gap)))] translate-y-[calc(var(--y)*(var(--cell)_+_var(--gap)))]';

export const spotStyle = ({ x, y, w, h }: Spot) => ({ '--x': x, '--y': y, '--w': w, '--h': h }) as CSSProperties;

export const cardName = (card: Card, sensors: Sensor[]) => {
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
  const spark = card.type !== 'batteries' && card.graph ? averageSpark(values.map(({ sensor, metric }) => sparks[sparkKey(sensor.id, metric.name)])) : undefined;
  const combined = card.type === 'combined';
  const unit = values[0]?.metric.unit ?? '';

  return (
    <>
      <div className={`flex items-start ${large ? 'gap-2.5' : 'gap-2'}`}>
        <MetricChip metric={name} small={!large} />
        <div className="min-w-0 flex-1">
          <Header
            title={combined ? `Average ${style.label.toLowerCase()}` : style.label}
            subtitle={combined ? values.map(({ sensor }) => sensor.name).join(', ') : sensors.length > 1 ? values[0]?.sensor.name : undefined}
            time={newest ? clockTime(newest, now) : null}
            large={large}
          />
        </div>
      </div>
      {spark ? <Sparkline {...spark} color={style.color} className="mt-3 min-h-8 w-full flex-1" /> : <div className="flex-1" />}
      <div className="mt-2 flex items-baseline gap-3">
        <MetricValue metric={name} value={value} unit={unit} size={large ? 'huge' : 'large'} />
        {combined && large && numbers.length > 1 && (
          <span className="truncate text-[13px] text-muted">
            {formatNumber(Math.min(...numbers), style.decimals)}–{formatNumber(Math.max(...numbers), style.decimals)}
            {unitText(unit)}
          </span>
        )}
      </div>
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
  const values = cardValues(card, sensors);
  const rows = rowsOf(values, large);
  const newest = values
    .map(({ metric }) => metric.latest!.measured_at)
    .sort()
    .at(-1);
  const size = large ? (rows.length === 1 ? 'large' : 'medium') : values.length <= 2 ? 'large' : values.length <= 3 ? 'medium' : 'small';

  const graphs = large && card.type === 'sensor' && card.graph;

  // A value's graph sits above it. Its chip only shows when the value has 7.5rem, and two rows only have room for graphs on wider, so taller, cards.
  return (
    <>
      <Header title={sensor.name} time={newest ? clockTime(newest, now) : null} large={large} />
      {values.length ? (
        <div className={`mt-3 flex min-h-0 flex-1 flex-col ${large ? 'gap-3' : 'gap-2'}`}>
          {rows.map((row, i) => (
            <div key={i} className="flex min-h-0 flex-1 gap-3">
              {row.map(({ metric }) => {
                const style = metricStyle(metric.name);
                const spark = graphs ? sparks[sparkKey(sensor.id, metric.name)] : undefined;
                return (
                  <div key={metric.name} className="@container flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                    {spark && <Sparkline {...spark} color={style.color} className={`mb-2 w-full flex-1 ${rows.length === 1 ? 'min-h-5' : 'hidden min-h-4 @[24rem]/card:block'}`} />}
                    <div className="flex items-center gap-2">
                      <span className="hidden @[7.5rem]:block">
                        <MetricChip metric={metric.name} small />
                      </span>
                      <MetricValue metric={metric.name} value={metric.latest!.value} unit={metric.unit} size={size} />
                    </div>
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

const BATTERY_ROWS = 3;

// Lowest first, in one column with bars when they fit. A large card that's wide, so tall, enough fits 4, more go in two columns.
function BatteriesBody({ card, sensors }: { card: Extract<Card, { type: 'batteries' }>; sensors: Sensor[] }) {
  const style = metricStyle('battery');
  const large = card.size === 'large';
  const all = sensors
    .filter((sensor) => card.sensors.includes(sensor.id) && hasBattery(sensor))
    .map((sensor) => ({ sensor, level: batteryLevel(sensor), low: lowBattery(sensor) !== null }))
    .sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity));
  const list = large ? all : all.slice(0, BATTERY_ROWS);
  const hidden = all.length - list.length;
  const layout =
    !large || list.length <= BATTERY_ROWS ? 'flex flex-col' : list.length === 4 ? 'grid grid-flow-col grid-rows-2 @[24rem]/card:flex @[24rem]/card:flex-col' : 'grid grid-flow-col grid-rows-3';
  const bars = !large ? 'hidden' : list.length <= BATTERY_ROWS ? '' : list.length === 4 ? 'hidden @[24rem]/card:block' : 'hidden';

  return (
    <>
      <div className="flex items-center gap-2.5">
        <MetricChip metric="battery" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">Batteries</span>
        {hidden > 0 && <span className="shrink-0 text-[13px] text-muted">+{hidden}</span>}
      </div>
      <ul className={`mt-auto gap-x-6 gap-y-1.5 pt-3 ${layout}`}>
        {list.map(({ sensor, level, low }) => (
          <li key={sensor.id} className="flex min-w-0 items-center gap-2 text-[15px]">
            <span className="min-w-0 flex-1 truncate">{sensor.name}</span>
            {low && <WarningCircleIcon weight="fill" className="size-4 shrink-0" style={{ color: 'var(--status-warning)' }} aria-label="Low" />}
            {level !== null && (
              <span className={`h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-fill ${bars}`} aria-hidden="true">
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
  const { card, sensors, editing, leaving = false, spot, onRemove, onResize, onEdit } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: cardKey(card), disabled: !editing || leaving });
  const name = cardName(card, sensors);
  const body = card.type === 'sensor' ? <SensorBody {...props} /> : card.type === 'batteries' ? <BatteriesBody card={card} sensors={sensors} /> : <ValueBody {...props} />;
  const surface = `${cardClass} flex h-full flex-col overflow-hidden p-4`;
  const control = `absolute flex size-7 items-center justify-center rounded-full shadow-md transition duration-200 ease-out ${editing ? '' : 'scale-50 opacity-0'}`;

  // Space picks a card up to move it with the arrow keys, Enter opens its settings.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && !isDragging) {
      event.preventDefault();
      onEdit();
    } else {
      listeners?.onKeyDown?.(event);
    }
  };

  return (
    <div
      ref={setNodeRef}
      inert={leaving}
      style={{ ...spotStyle(spot), transform: CSS.Translate.toString(transform) }}
      className={`${PLACE} @container/card rounded-2xl duration-300 ease-out ${leaving ? 'starting:scale-100 starting:opacity-100' : 'starting:scale-95 starting:opacity-0'} ${
        isDragging ? 'z-20 shadow-xl transition-[width,height,scale,box-shadow]' : 'transition-[translate,transform,width,height,scale,opacity,box-shadow]'
      } ${leaving ? 'scale-75 opacity-0' : isDragging ? 'scale-[1.03]' : editing ? 'scale-[0.97] ring-2 ring-accent/30' : ''}`}
    >
      {editing ? (
        <div
          {...attributes}
          {...listeners}
          onKeyDown={onKeyDown}
          onClick={onEdit}
          aria-label={name}
          className={`${surface} cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] ${isDragging ? 'cursor-grabbing' : ''}`}
        >
          {body}
        </div>
      ) : (
        <a href={cardHref(card)} aria-label={name} className={`${surface} ${pressable} hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-950/5 active:translate-y-0 active:scale-[0.98]`}>
          {body}
        </a>
      )}
      <button type="button" inert={!editing} onClick={onRemove} aria-label={`Remove ${name}`} className={`${control} -top-2 -left-2 bg-navy-400 text-white dark:bg-navy-600`}>
        <MinusIcon weight="bold" className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        inert={!editing}
        onClick={onResize}
        aria-label={`${card.size === 'small' ? 'Enlarge' : 'Shrink'} ${name}`}
        className={`${control} -right-2 -bottom-2 bg-surface text-navy-950 ring-1 ring-line dark:text-navy-50`}
      >
        {card.size === 'small' ? <ArrowsOutSimpleIcon weight="bold" className="size-4" aria-hidden="true" /> : <ArrowsInSimpleIcon weight="bold" className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}