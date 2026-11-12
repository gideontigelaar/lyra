import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, CaretRightIcon, ChartLineIcon, MinusIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { cardHref, cardKey, cardMetrics, sparkKey } from '../../lib/cards';
import { clockTime } from '../../lib/format';
import { batteryLevel, hasBattery, lowBattery, metricStyle } from '../../lib/metrics';
import type { Card, Point, Sensor } from '../../lib/types';

export type Spark = { points: Point[]; start: number; end: number };
import { card as cardClass, pressable } from '../../lib/ui';
import Sparkline from '../chart/Sparkline';
import MetricValue from '../MetricValue';

interface Props {
  card: Card;
  sensors: Sensor[];
  sparks: Record<string, Spark>;
  now: number;
  index: number;
  editing: boolean;
  onRemove: () => void;
  onResize: () => void;
  onGraph: () => void;
}

const cardName = (card: Card, sensors: Sensor[]) => {
  const sensor = sensors.find((item) => item.id === card.sensor);

  if (card.type === 'batteries' || !sensor) {
    return 'Batteries';
  }

  if (card.type === 'sensor') {
    return sensor.name;
  }

  const label = metricStyle(card.metric).label;
  return sensors.length > 1 ? `${sensor.name} ${label.toLowerCase()}` : label;
};

function MetricBody({ card, sensors, sparks, now }: Props) {
  const sensor = sensors.find((item) => item.id === card.sensor)!;
  const metric = sensor.metrics.find((item) => item.name === card.metric)!;
  const style = metricStyle(metric.name);
  const large = card.size === 'large';
  const time = metric.latest ? clockTime(metric.latest.measured_at, now) : null;
  const spark = card.type === 'metric' && card.graph ? sparks[sparkKey(sensor.id, metric.name)] : undefined;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <style.icon weight="fill" className="size-4 shrink-0" style={{ color: style.color }} aria-hidden="true" />
        <span className="truncate text-[15px] font-semibold">{style.label}</span>
        {time && <span className={`ml-auto shrink-0 text-[13px] text-muted ${large ? '' : 'max-sm:hidden'}`}>{time}</span>}
        {large && <CaretRightIcon weight="bold" className={`size-3.5 shrink-0 text-muted/70 ${time ? '' : 'ml-auto'}`} aria-hidden="true" />}
      </div>
      {sensors.length > 1 && <div className="truncate text-[13px] text-muted">{sensor.name}</div>}
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <MetricValue metric={metric.name} value={metric.latest?.value ?? null} unit={metric.unit} />
        {large && spark && <Sparkline {...spark} color={style.color} className="w-24" />}
      </div>
    </>
  );
}

function SensorBody({ card, sensors, sparks, now }: Props) {
  const sensor = sensors.find((item) => item.id === card.sensor)!;
  const metrics = cardMetrics(card, sensors);
  const large = card.size === 'large';
  const sparked = large && card.type === 'sensor' && card.graph && metrics.some((metric) => sparks[sparkKey(sensor.id, metric.name)]);
  const battery = sensor.metrics.find((metric) => metric.name === 'battery' && metric.active && metric.latest);
  const latest = metrics
    .map((metric) => metric.latest!.measured_at)
    .sort()
    .at(-1);

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="truncate text-[17px] font-semibold">{sensor.name}</span>
        {latest && <span className="ml-auto shrink-0 text-[13px] text-muted">{clockTime(latest, now)}</span>}
        <CaretRightIcon weight="bold" className={`size-3.5 shrink-0 text-muted/70 ${latest ? '' : 'ml-auto'}`} aria-hidden="true" />
      </div>
      {!latest && <div className="text-[13px] text-muted">Waiting for data</div>}
      {sparked ? (
        <div className="mt-auto grid gap-4 pt-3" style={{ gridTemplateColumns: `repeat(${Math.min(metrics.length, 3)}, minmax(0, 1fr))` }}>
          {metrics.slice(0, 3).map((metric) => {
            const style = metricStyle(metric.name);
            const spark = sparks[sparkKey(sensor.id, metric.name)];
            return (
              <div key={metric.name} className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <style.icon weight="fill" className="size-4 shrink-0" style={{ color: style.color }} aria-label={style.label} />
                  <MetricValue metric={metric.name} value={metric.latest!.value} unit={metric.unit} size="small" />
                </div>
                {spark && <Sparkline {...spark} color={style.color} className="mt-2 w-full" />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-4">
          {[...metrics.slice(0, large ? 3 : 2), ...(large && battery ? [battery] : [])].map((metric) => {
            const style = metricStyle(metric.name);
            return (
              <div key={metric.name} className="flex items-center gap-1.5">
                <style.icon weight="fill" className="size-4 shrink-0" style={{ color: style.color }} aria-label={style.label} />
                <MetricValue metric={metric.name} value={metric.latest!.value} unit={metric.unit} size="small" />
              </div>
            );
          })}
        </div>
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
      <div className="flex items-center gap-1.5">
        <style.icon weight="fill" className="size-4 shrink-0" style={{ color: style.color }} aria-hidden="true" />
        <span className="truncate text-[15px] font-semibold">Batteries</span>
        {large && <CaretRightIcon weight="bold" className="ml-auto size-3.5 shrink-0 text-muted/70" aria-hidden="true" />}
      </div>
      <ul className="mt-auto space-y-1.5 pt-3">
        {list.map(({ sensor, level, low }) => (
          <li key={sensor.id} className="flex items-center gap-2 text-[15px]">
            <span className="min-w-0 flex-1 truncate">{sensor.name}</span>
            {low && <WarningCircleIcon weight="fill" className="size-4 shrink-0" style={{ color: 'var(--status-warning)' }} aria-label="Low" />}
            {large && level !== null && (
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-fill" aria-hidden="true">
                <span className="block h-full rounded-full" style={{ width: `${Math.min(Math.max(level, 0), 100)}%`, background: low ? 'var(--status-warning)' : style.color }} />
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
  const { card, sensors, index, editing, onRemove, onResize, onGraph } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardKey(card), disabled: !editing });
  const name = cardName(card, sensors);
  const body = card.type === 'metric' ? <MetricBody {...props} /> : card.type === 'sensor' ? <SensorBody {...props} /> : <BatteriesBody {...props} />;
  const surface = `${cardClass} flex h-full flex-col overflow-hidden p-4`;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition, animationDelay: `${(index % 4) * -0.08}s` }}
      className={`relative ${card.size === 'large' ? 'col-span-2' : 'col-span-1'} ${editing && !isDragging ? 'scale-[0.97]' : ''} transition-transform duration-300 ease-out ${isDragging ? 'z-10' : ''}`}
    >
      {editing ? (
        <div {...attributes} {...listeners} aria-label={`${name}, reorder`} className={`${surface} cursor-grab touch-none ${isDragging ? 'cursor-grabbing shadow-xl' : ''}`}>
          {body}
        </div>
      ) : (
        <a href={cardHref(card)} aria-label={name} className={`${surface} ${pressable}`}>
          {body}
        </a>
      )}
      {editing && (
        <>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
            className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-navy-400 text-white shadow-md dark:bg-navy-600"
          >
            <MinusIcon weight="bold" className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onResize}
            aria-label={`${card.size === 'small' ? 'Enlarge' : 'Shrink'} ${name}`}
            className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full bg-surface text-navy-950 shadow-md ring-1 ring-line dark:text-navy-50"
          >
            {card.size === 'small' ? <ArrowsOutSimpleIcon weight="bold" className="size-4" aria-hidden="true" /> : <ArrowsInSimpleIcon weight="bold" className="size-4" aria-hidden="true" />}
          </button>
          {card.size === 'large' && card.type !== 'batteries' && (
            <button
              type="button"
              onClick={onGraph}
              aria-label={`Graph on ${name}`}
              aria-pressed={card.graph}
              className="absolute right-7 -bottom-2 flex size-7 items-center justify-center rounded-full bg-surface text-navy-950 shadow-md ring-1 ring-line aria-pressed:bg-accent aria-pressed:text-white aria-pressed:ring-accent dark:text-navy-50 dark:aria-pressed:text-navy-950"
            >
              <ChartLineIcon weight="bold" className="size-4" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}