import { useDraggable } from '@dnd-kit/core';
import { ArrowsInSimpleIcon, ArrowsOutSimpleIcon, BroadcastIcon, MinusIcon, PulseIcon, WarningCircleIcon, WifiHighIcon } from '@phosphor-icons/react';
import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import { cardHref, cardKey, cardValues, sparkKey } from '../../lib/cards';
import { aboutDays, clockTime, formatNumber, timeAgo, unitText } from '../../lib/format';
import { batteryLevel, hasBattery, lowBattery, metricStyle, trendOf } from '../../lib/metrics';
import type { Spot } from '../../lib/grid';
import { SUMMARY, sensorPath } from '../../lib/paths';
import { rangeOf } from '../../lib/readings';
import { isFresh, isOnline } from '../../lib/status';
import { dbm, duration, kilobytes, signal } from '../../lib/telemetry';
import type { Card, Device, Point, Sensor, SensorMetric } from '../../lib/types';
import { card as cardClass, pressable } from '../../lib/ui';
import BatteryFill, { BatteryShape } from '../BatteryFill';
import MetricChip, { Chip, MetricIcon } from '../MetricChip';
import Sparkline from '../chart/Sparkline';
import MetricValue from '../MetricValue';

export type Spark = { points: Point[]; start: number; end: number };

// How far a moving card may go from its spot, in pixels.
export type Bounds = { left: number; right: number; top: number; bottom: number };

interface Temperature {
  unit: string;
  convert: (value: number) => number;
}

interface Props {
  card: Card;
  sensors: Sensor[];
  devices: Device[];
  // How a chip's temperature in °C shows, in the unit picked in Settings.
  temperature: Temperature;
  sparks: Record<string, Spark>;
  now: number;
  editing: boolean;
  // A removed card fading out. It's gone from the cards already, so Undo and Done see the change straight away.
  leaving?: boolean;
  spot: Spot;
  bounds?: Bounds;
  onRemove: () => void;
  onResize: () => void;
  onEdit: () => void;
}

// Cards are placed on the grid of Summary, which sets --cell and --gap. Spots change through transitions, so moves and resizes slide.
// A dragged card adds how far it's moved, --dx and --dy, to the same translate. A transform would be scaled along with the lifted card.
const PLACE =
  'absolute top-0 left-0 h-[calc(var(--h)*var(--cell)_+_(var(--h)_-_1)*var(--gap))] w-[calc(var(--w)*var(--cell)_+_(var(--w)_-_1)*var(--gap))] translate-x-[calc(var(--x)*(var(--cell)_+_var(--gap))_+_var(--dx,0px))] translate-y-[calc(var(--y)*(var(--cell)_+_var(--gap))_+_var(--dy,0px))]';

const spotStyle = ({ x, y, w, h }: Spot) => ({ '--x': x, '--y': y, '--w': w, '--h': h }) as CSSProperties;

// True from the second frame on. Until then a new card or outline only fades in: Safari works out the first frame's spot
// before the grid has its width, and sliding from there looked like the cards flew in from the right.
const useSettled = () => {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => setSettled(true))));
    return () => cancelAnimationFrame(frame);
  }, []);

  return settled;
};

// Where the dragged card lands.
export function DropOutline({ spot }: { spot: Spot }) {
  const settled = useSettled();

  return (
    <div
      aria-hidden="true"
      style={spotStyle(spot)}
      className={`${PLACE} rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 duration-200 ease-out starting:opacity-0 ${settled ? 'transition-[translate,opacity]' : 'transition-opacity'}`}
    />
  );
}

export const cardName = (card: Card, sensors: Sensor[], devices: Device[]) => {
  if (card.type === 'batteries') {
    return 'Batteries';
  }

  if (card.type === 'source') {
    return `${devices.find((device) => device.id === card.source)!.name} health`;
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
  const hours = new Map<number, number[]>();
  present.forEach((spark) => spark.points.forEach((point) => hours.set(point.time, [...(hours.get(point.time) ?? []), point.avg])));

  // Without points there's no graph, so the value keeps its place at the bottom.
  if (!hours.size) {
    return undefined;
  }

  const points = [...hours]
    .sort(([a], [b]) => a - b)
    .map(([time, values]) => {
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return { time, min: avg, max: avg, avg };
    });

  return { points, start: present[0].start, end: present[0].end };
};

type Time = { text: string; stale: boolean } | null;

// When a card's values are from: their latest reading, or once one is overdue, the oldest of them.
const readingTime = (metrics: SensorMetric[], now: number): Time => {
  const times = metrics.flatMap((metric) => (metric.latest ? [metric.latest.measured_at] : [])).sort();
  const stale = metrics.some((metric) => metric.latest !== null && !isFresh(metric, now));
  const time = stale ? times[0] : times.at(-1);
  return time ? { text: clockTime(time, now), stale } : null;
};

// Every card starts with its chip and title. A large card shows when its values are from beside the title. A small one only
// shows an overdue time, under the title, so the title keeps its room.
function Header({ chip, title, subtitle, time, large }: { chip: ReactNode; title: string; subtitle?: ReactNode; time: Time; large: boolean }) {
  const overdue = !large && time?.stale && <span className="font-semibold text-warning">{time.text}</span>;

  return (
    <div className={`flex ${subtitle || overdue ? 'items-start' : 'items-center'} ${large ? 'gap-2.5' : 'gap-2'}`}>
      {chip}
      <div className="min-w-0 flex-1">
        <div className="truncate text-subheadline font-semibold">{title}</div>
        {(subtitle || overdue) && (
          <div className="truncate text-footnote text-muted">
            {subtitle}
            {subtitle && overdue && ' · '}
            {overdue}
          </div>
        )}
      </div>
      {time && large && <span className={`shrink-0 text-footnote ${time.stale ? 'font-semibold text-warning' : 'text-muted'}`}>{time.text}</span>}
    </div>
  );
}

// A value as weather apps show it in a short line, with degrees or percent but not the rest of its unit.
const brief = (value: number, metric: string, unit: string) => `${formatNumber(value, metricStyle(metric).decimals)}${unit.startsWith('°') ? '°' : unit === '%' ? '%' : ''}`;

function ValueBody({ card, sensors, sparks, now }: Props) {
  const values = cardValues(card, sensors);
  const name = card.metric!;
  const style = metricStyle(name);
  const large = card.size === 'large';
  const readings = values.flatMap(({ metric }) => (metric.latest ? [metric.latest] : []));
  const numbers = readings.map((reading) => reading.value);
  const value = numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : null;
  const metrics = values.map(({ metric }) => metric);
  const changes = metrics.map((metric) => metric.change);
  const trend = trendOf(name, changes);
  const averaged = averageSpark(values.map(({ sensor, metric }) => sparks[sparkKey(sensor.id, metric.name)]));
  const spark = 'graph' in card && card.graph ? averaged : undefined;
  const combined = card.type === 'combined';
  const unit = values[0]?.metric.unit ?? '';
  // A value card's high and low are its readings', an average's those of the average.
  const detail = card.type === 'metric' || card.type === 'combined' ? card.detail : null;
  const range = detail === 'range' && rangeOf((card.type === 'metric' ? sparks[sparkKey(card.sensor, name)] : averaged)?.points ?? []);
  // The dew point is in the sensor's temperature unit.
  const sensor = values[0]?.sensor;
  const dewPoint = detail === 'dew_point' && sensor?.dewPoint != null ? brief(sensor.dewPoint, 'dew_point', sensor.metrics.find((metric) => metric.name === 'temperature')?.unit ?? '°C') : null;
  const line = range ? `H ${brief(range.max, name, unit)} · L ${brief(range.min, name, unit)}` : dewPoint && `Dew point ${dewPoint}`;

  return (
    <>
      <Header
        chip={<MetricChip metric={name} small={!large} />}
        title={combined ? `Average ${style.label.toLowerCase()}` : style.label}
        subtitle={combined ? values.map(({ sensor }) => sensor.name).join(', ') : sensors.length > 1 ? values[0]?.sensor.name : undefined}
        time={readingTime(metrics, now)}
        large={large}
      />
      {spark ? <Sparkline {...spark} color={style.color} className={`mt-3 w-full flex-1 ${line ? 'min-h-6' : 'min-h-8'}`} /> : <div className="flex-1" />}
      <div className="@container mt-2 flex items-baseline gap-3">
        {/* Without a graph the value takes its room. */}
        <MetricValue metric={name} value={value} unit={unit} size={spark ? (large ? 'huge' : 'large') : large ? 'giant' : 'huge'} trend={trend} fit />
        {combined && large && numbers.length > 1 && (
          <span className="min-w-0 truncate text-footnote text-muted">
            {formatNumber(Math.min(...numbers), style.decimals)}–{formatNumber(Math.max(...numbers), style.decimals)}
            {unitText(unit)}
          </span>
        )}
      </div>
      {line && <div className="mt-1 truncate text-footnote text-muted">{line}</div>}
    </>
  );
}

// Values fill a large card side by side, 4 in two rows, and a small one each in a row of its own.
const rowsOf = <T,>(items: T[], large: boolean) => {
  const perRow = large ? (items.length === 4 ? 2 : items.length) : 1;
  return Array.from({ length: Math.ceil(items.length / perRow) }, (_, i) => items.slice(i * perRow, (i + 1) * perRow));
};

// A value of a sensor card opens the sensor's page on that value. It's a link of its own over the card's, so not while editing.
function ValueArea({ href, className, children }: { href?: string; className: string; children: ReactNode }) {
  return href ? (
    <a href={href} className={`relative rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent ${className}`}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}

function SensorBody({ card, sensors, sparks, now, editing }: Props) {
  const sensor = sensors.find((item) => item.id === card.sensor)!;
  const large = card.size === 'large';
  const values = cardValues(card, sensors);
  const graphs = card.type === 'sensor' && card.graph;
  const rows = rowsOf(values, large);
  const metrics = values.map(({ metric }) => metric);
  const time = readingTime(metrics, now);
  const chip = <Chip icon={PulseIcon} color="var(--accent)" label="Sensor" small={!large} />;
  const href = (metric: string) => (editing ? undefined : sensorPath(sensor.id, metric, SUMMARY));
  // Without graphs the values take their room.
  const size = large
    ? graphs
      ? rows.length === 1
        ? 'large'
        : 'medium'
      : rows.length === 1 && rows[0].length <= 2
        ? 'huge'
        : 'large'
    : values.length === 1
      ? 'huge'
      : values.length === 2
        ? 'large'
        : 'medium';

  if (!values.length) {
    return (
      <>
        <Header chip={chip} title={sensor.name} time={null} large={large} />
        <div className="mt-auto text-footnote text-muted">Waiting for the first reading</div>
      </>
    );
  }

  // A small card with graphs stacks its values, each over its graph.
  if (!large && graphs) {
    return (
      <>
        <Header chip={chip} title={sensor.name} time={time} large={false} />
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
          {values.map(({ metric }) => {
            const style = metricStyle(metric.name);
            const spark = sparks[sparkKey(sensor.id, metric.name)];
            return (
              <ValueArea key={metric.name} href={href(metric.name)} className="flex min-h-0 flex-1 flex-col justify-end">
                <div className="flex items-center gap-1.5">
                  <MetricIcon metric={metric.name} className="size-4.5" />
                  <span className="@container min-w-0 flex-1">
                    <MetricValue
                      metric={metric.name}
                      value={metric.latest!.value}
                      unit={metric.unit}
                      size={values.length === 1 ? 'large' : 'medium'}
                      trend={trendOf(metric.name, [metric.change])}
                      fit
                    />
                  </span>
                </div>
                {spark && <Sparkline {...spark} color={style.color} className="mt-1 min-h-3 w-full flex-1" />}
              </ValueArea>
            );
          })}
        </div>
      </>
    );
  }

  // A value's graph sits above it. Its icon only shows when the value has 7.5rem, and two rows only have room for graphs on wider, so taller, cards.
  return (
    <>
      <Header chip={chip} title={sensor.name} time={time} large={large} />
      <div className={`mt-3 flex min-h-0 flex-1 flex-col ${large ? 'gap-3' : 'gap-2'}`}>
        {rows.map((row, i) => (
          <div key={i} className="flex min-h-0 flex-1 gap-3">
            {row.map(({ metric }) => {
              const style = metricStyle(metric.name);
              const spark = large && graphs ? sparks[sparkKey(sensor.id, metric.name)] : undefined;
              return (
                <ValueArea key={metric.name} href={href(metric.name)} className="@container flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                  {spark && <Sparkline {...spark} color={style.color} className={`mb-2 w-full flex-1 ${rows.length === 1 ? 'min-h-5' : 'hidden min-h-4 @[24rem]/card:block'}`} />}
                  <div className="flex items-center gap-1.5">
                    <MetricIcon metric={metric.name} className={`hidden @[7.5rem]:block ${size === 'huge' ? 'size-6' : 'size-5'}`} />
                    <span className="@container min-w-0 flex-1">
                      <MetricValue metric={metric.name} value={metric.latest!.value} unit={metric.unit} size={size} trend={trendOf(metric.name, [metric.change])} fit />
                    </span>
                  </div>
                </ValueArea>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

// One battery: its level large, with a battery filled as far as it's charged and how long it has left. Batteries change too slowly for a graph to say anything.
function BatteryBody({ sensor, large, left, now }: { sensor: Sensor; large: boolean; left: boolean; now: number }) {
  const level = batteryLevel(sensor);
  const low = lowBattery(sensor) !== null;
  const battery = sensor.metrics.find((metric) => metric.name === 'battery');

  return (
    <>
      <Header chip={<MetricChip metric="battery" small={!large} />} title="Battery" subtitle={sensor.name} time={battery ? readingTime([battery], now) : null} large={large} />
      {/* The level, with a battery of one size next to it, filled as far as it's charged. */}
      <div className={`mt-auto flex items-center pt-2 ${large ? 'gap-3' : 'gap-2'}`}>
        <MetricValue metric="battery" value={level} unit="%" size={large ? 'huge' : 'large'} />
        {level !== null && <BatteryShape level={level} low={low} className={large ? 'h-9' : 'h-6'} />}
        {low && (
          <span className="flex min-w-0 items-center gap-1 text-footnote font-semibold text-warning">
            <WarningCircleIcon weight="fill" className="size-4 shrink-0" aria-hidden="true" />
            <span className={`truncate ${large ? '' : 'sr-only'}`}>Low</span>
          </span>
        )}
      </div>
      {left && sensor.battery_days_left !== null && <div className="mt-1 truncate text-footnote text-muted">{aboutDays(sensor.battery_days_left)} left</div>}
    </>
  );
}

// Lowest first, in one column, with bars on a large card. 4 only fit in one column on a card that's wide, so tall, enough, else they go in two without bars.
function BatteriesBody({ card, sensors }: { card: Extract<Card, { type: 'batteries' }>; sensors: Sensor[] }) {
  const large = card.size === 'large';
  const list = sensors
    .filter((sensor) => card.sensors.includes(sensor.id) && hasBattery(sensor))
    .map((sensor) => ({ sensor, level: batteryLevel(sensor), low: lowBattery(sensor) !== null }))
    .sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity));
  const four = large && list.length > 3;
  const layout = four ? 'grid grid-flow-col grid-rows-2 @[24rem]/card:flex @[24rem]/card:flex-col' : 'flex flex-col';
  const bars = !large ? 'hidden' : four ? 'hidden @[24rem]/card:block' : '';

  return (
    <>
      <Header chip={<MetricChip metric="battery" small={!large} />} title="Batteries" time={null} large={large} />
      <ul className={`mt-auto gap-x-6 gap-y-1.5 pt-3 ${layout}`}>
        {list.map(({ sensor, level, low }) => (
          <li key={sensor.id} className="flex min-w-0 items-center gap-2 text-subheadline">
            <span className="min-w-0 flex-1 truncate">{sensor.name}</span>
            {low && <WarningCircleIcon weight="fill" className="size-4 shrink-0 text-warning" aria-label="Low" />}
            {level !== null && <BatteryFill level={level} low={low} className={`h-1.5 w-16 shrink-0 ${bars}`} />}
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{level === null ? '–' : `${Math.round(level)}%`}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

// A source's health from its latest report: whether it's online, its Wi-Fi, uptime and free memory, and on a large card its chip temperature.
function SourceBody({ device, large, now, temperature }: { device: Device; large: boolean; now: number; temperature: Temperature }) {
  const telemetry = device.telemetry;
  const online = isOnline(device, now);
  const status = !device.active ? (
    <span>Inactive</span>
  ) : online ? (
    <span className="text-good">Online</span>
  ) : (
    <span className="text-warning">{!device.last_seen_at ? 'Never connected' : large ? `Offline · ${timeAgo(device.last_seen_at, now)}` : 'Offline'}</span>
  );
  const rssi = telemetry?.rssi;
  const wifi = rssi === undefined ? null : { ...signal(rssi), text: dbm(rssi) };
  const stats = [
    {
      label: 'Wi-Fi',
      value: wifi && (
        <span className="flex items-center gap-1">
          {/* The arcs a weaker signal doesn't reach show faintly, like the Wi-Fi icon in a phone's status bar. */}
          <span role="img" aria-label={wifi.label} className="relative size-4 shrink-0">
            <WifiHighIcon weight="bold" className="absolute inset-0 size-4 opacity-25" aria-hidden="true" />
            <wifi.icon weight="bold" className="absolute inset-0 size-4" aria-hidden="true" />
          </span>
          {wifi.text}
        </span>
      ),
    },
    { label: 'Uptime', value: telemetry?.uptime !== undefined && duration(telemetry.uptime) },
    { label: 'Memory', value: telemetry?.free_heap !== undefined && kilobytes(telemetry.free_heap) },
    { label: 'Chip temperature', value: large && telemetry?.temperature !== undefined && `${formatNumber(temperature.convert(telemetry.temperature), 1)}${temperature.unit}` },
  ].filter(({ value }) => value);

  return (
    <>
      <Header
        chip={<Chip icon={BroadcastIcon} color="var(--accent)" label="Source" small={!large} />}
        title={device.name}
        subtitle={status}
        time={device.telemetry_at ? { text: clockTime(device.telemetry_at, now), stale: false } : null}
        large={large}
      />
      {!stats.length ? (
        <div className="mt-auto text-footnote text-muted">No reports yet</div>
      ) : large ? (
        <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2">
          {stats.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="truncate text-footnote text-muted">{label}</dt>
              <dd className="truncate text-subheadline font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="mt-auto flex flex-col gap-1.5 pt-3">
          {stats.map(({ label, value }) => (
            <div key={label} className="flex min-w-0 items-baseline gap-2">
              <dt className="min-w-0 flex-1 truncate text-footnote text-muted">{label}</dt>
              <dd className="shrink-0 text-subheadline font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

export default function SummaryCard(props: Props) {
  const { card, sensors, devices, editing, leaving = false, spot, bounds, onRemove, onResize, onEdit } = props;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: cardKey(card), disabled: !editing || leaving });
  const name = cardName(card, sensors, devices);
  const settled = useSettled();
  // The card stays on the grid, so dragging it to an edge never makes the page wider or longer.
  const shift = transform && bounds ? { ...transform, x: Math.min(Math.max(transform.x, bounds.left), bounds.right), y: Math.min(Math.max(transform.y, bounds.top), bounds.bottom) } : transform;
  const battery = card.type === 'batteries' && card.sensors.length === 1 ? sensors.find((item) => item.id === card.sensors[0] && hasBattery(item)) : undefined;
  const body = battery ? (
    <BatteryBody sensor={battery} large={card.size === 'large'} left={card.type === 'batteries' && card.left} now={props.now} />
  ) : card.type === 'source' ? (
    <SourceBody device={devices.find((device) => device.id === card.source)!} large={card.size === 'large'} now={props.now} temperature={props.temperature} />
  ) : card.type === 'sensor' ? (
    <SensorBody {...props} />
  ) : card.type === 'batteries' ? (
    <BatteriesBody card={card} sensors={sensors} />
  ) : (
    <ValueBody {...props} />
  );
  const surface = `${cardClass} flex h-full flex-col overflow-hidden p-4`;
  const lift = 'transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-navy-950/5 active:translate-y-0 active:scale-[0.98]';
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
      style={{ ...spotStyle(spot), ...(shift && { '--dx': `${shift.x}px`, '--dy': `${shift.y}px` }) }}
      className={`${PLACE} @container/card rounded-2xl duration-300 ease-out ${leaving ? 'starting:scale-100 starting:opacity-100' : 'starting:scale-95 starting:opacity-0'} ${
        isDragging ? 'z-20 shadow-xl transition-[width,height,scale,box-shadow]' : settled ? 'transition-[translate,width,height,scale,opacity,box-shadow]' : 'transition-[scale,opacity]'
      } ${leaving ? 'scale-75 opacity-0' : isDragging ? 'scale-[1.03]' : editing ? 'scale-[0.97] ring-2 ring-accent/30' : ''}`}
    >
      {editing ? (
        <div
          {...attributes}
          {...listeners}
          onKeyDown={onKeyDown}
          onClick={onEdit}
          className={`${surface} cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] ${isDragging ? 'cursor-grabbing' : ''}`}
        >
          {body}
        </div>
      ) : card.type === 'sensor' ? (
        // Each value opens the sensor's page on it, the rest of the card the page as it opens by default.
        <div className={`${surface} ${lift} relative hover:bg-fill/60 active:bg-fill has-focus-visible:bg-fill/60`}>
          <a href={cardHref(card)} aria-label={name} className="absolute inset-0 rounded-2xl outline-none" />
          {body}
        </div>
      ) : (
        <a href={cardHref(card)} className={`${surface} ${pressable} ${lift}`}>
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