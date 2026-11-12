import { CaretLeftIcon, CaretRightIcon, CheckIcon, PlusIcon, StackIcon } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { MAX_PER_CARD, canCombine, cardKey, sensorValues } from '../../lib/cards';
import { formatNumber, unitText } from '../../lib/format';
import { dataMetrics, hasBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { group, pressable, primaryButton, row, secondaryButton, sectionTitle } from '../../lib/ui';
import MetricChip from '../MetricChip';
import Dialog from '../ui/Dialog';
import Segmented from '../ui/Segmented';

interface Props {
  open: boolean;
  sensors: Sensor[];
  cards: Card[];
  onToggle: (card: Card) => void;
  onClose: () => void;
}

type View = { kind: 'home' } | { kind: 'sensor'; id: number } | { kind: 'values'; id: number } | { kind: 'combined' } | { kind: 'batteries' };

const tile = `${group} ${pressable} flex min-h-24 flex-col items-start gap-2 p-3 text-left`;

const summaryOf = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.latest))
    .map((metric) => `${formatNumber(metric.latest!.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}`)
    .join(' · ') || 'No data yet';

function Toggle({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-accent transition aria-pressed:bg-accent aria-pressed:text-white disabled:opacity-40 dark:aria-pressed:text-navy-950"
    >
      {on ? <CheckIcon weight="bold" className="size-4" aria-hidden="true" /> : <PlusIcon weight="bold" className="size-4" aria-hidden="true" />}
    </button>
  );
}

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1.5 mb-3 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-[15px] text-accent transition-opacity hover:opacity-70">
      <CaretLeftIcon weight="bold" className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

interface GroupProps<T> {
  intro: string;
  what: 'sensors' | 'values';
  options: { key: T; label: string; icon?: ReactNode }[];
  max: number;
  picked: T[];
  onPick: (keys: T[]) => void;
  card: Card;
  cards: Card[];
  add: string;
  onAdd: () => void;
  children?: ReactNode;
}

// Picking the 2 or more sensors or values of one card.
function Group<T extends number | string>({ intro, what, options, max, picked, onPick, card, cards, add, onAdd, children }: GroupProps<T>) {
  const exists = cards.some((item) => cardKey(item) === cardKey(card));

  return (
    <>
      <p className="mb-4 text-[15px] text-muted">{intro}</p>
      {children}
      <h3 className={`${sectionTitle} mb-2 px-1`}>{what === 'sensors' ? 'Sensors' : 'Values'}</h3>
      <div className={`${group} divide-y divide-line`}>
        {options.map(({ key, label, icon }) => {
          const on = picked.includes(key);
          return (
            <div key={key} className={row}>
              {icon}
              <span className="min-w-0 flex-1 truncate text-[17px]">{label}</span>
              <Toggle on={on} disabled={!on && picked.length >= max} label={`Include ${label}`} onClick={() => onPick(on ? picked.filter((item) => item !== key) : [...picked, key])} />
            </div>
          );
        })}
      </div>
      <p className="mt-2 px-4 text-[13px] text-muted">
        Up to {max} {what} per card.
      </p>
      <button type="button" className={`${primaryButton} mt-5 w-full py-3 text-[17px]`} disabled={picked.length < 2 || exists} onClick={onAdd}>
        {exists ? 'Already on Summary' : picked.length < 2 ? `Pick at least 2 ${what}` : add}
      </button>
    </>
  );
}

const sensorOptions = (sensors: Sensor[]) => sensors.map((sensor) => ({ key: sensor.id, label: sensor.name }));

function Values({ sensor, cards, onAdd }: { sensor: Sensor; cards: Card[]; onAdd: (card: Card) => void }) {
  const options = dataMetrics(sensor.metrics);
  const [picked, setPicked] = useState(() => sensorValues(sensor).filter((name) => options.some((metric) => metric.name === name)));
  const card: Card = { type: 'sensor', size: 'large', sensor: sensor.id, metric: null, metrics: picked };

  return (
    <Group
      intro="Shows the values you pick together in one card."
      what="values"
      options={options.map((metric) => ({ key: metric.name, label: metricStyle(metric.name).label, icon: <MetricChip metric={metric.name} small /> }))}
      max={MAX_PER_CARD.sensor}
      picked={picked}
      onPick={setPicked}
      card={card}
      cards={cards}
      add={`Add card with ${picked.length} values`}
      onAdd={() => onAdd(card)}
    />
  );
}

function Combine({ sensors, cards, onAdd }: { sensors: Sensor[]; cards: Card[]; onAdd: (card: Card) => void }) {
  const metrics = [...new Set(sensors.flatMap((sensor) => sensor.metrics.map((metric) => metric.name)))].filter(
    (name) => canCombine(name) && sensors.filter((sensor) => sensor.metrics.some((metric) => metric.name === name)).length > 1,
  );
  const [metric, setMetric] = useState(metrics[0]);
  const [chosen, setChosen] = useState<number[]>([]);
  const options = sensors.filter((sensor) => sensor.metrics.some((item) => item.name === metric));
  const picked = chosen.filter((id) => options.some((sensor) => sensor.id === id));
  const card: Card = { type: 'combined', size: 'large', sensor: null, metric, sensors: picked };

  return (
    <Group
      intro="Shows the average of the sensors you pick, with a graph of the last 24 hours."
      what="sensors"
      options={sensorOptions(options)}
      max={MAX_PER_CARD.combined}
      picked={picked}
      onPick={setChosen}
      card={card}
      cards={cards}
      add={`Add average of ${picked.length} sensors`}
      onAdd={() => onAdd(card)}
    >
      <h3 className={`${sectionTitle} mb-2 px-1`}>Value</h3>
      <div className="mb-5">
        <Segmented label="Value" options={metrics} value={metric} onChange={setMetric} text={(name) => metricStyle(name).label} />
      </div>
    </Group>
  );
}

function Batteries({ sensors, cards, onAdd }: { sensors: Sensor[]; cards: Card[]; onAdd: (card: Card) => void }) {
  const options = sensors.filter(hasBattery);
  const [picked, setPicked] = useState(() => options.slice(0, MAX_PER_CARD.batteries).map((sensor) => sensor.id));
  const card: Card = { type: 'batteries', size: 'large', sensor: null, metric: null, sensors: picked };

  return (
    <Group
      intro="Lists the battery level of the sensors you pick, lowest first."
      what="sensors"
      options={sensorOptions(options)}
      max={MAX_PER_CARD.batteries}
      picked={picked}
      onPick={setPicked}
      card={card}
      cards={cards}
      add={`Add batteries of ${picked.length} sensors`}
      onAdd={() => onAdd(card)}
    />
  );
}

export default function PinSheet({ open, sensors, cards, onToggle, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'home' });
  const keys = new Set(cards.map(cardKey));
  const sensor = view.kind === 'sensor' || view.kind === 'values' ? sensors.find((item) => item.id === view.id) : undefined;
  const combinable = sensors.flatMap((item) => item.metrics.map((metric) => metric.name)).some((name, _, all) => canCombine(name) && all.filter((other) => other === name).length > 1);
  const titles = { home: 'Add to Summary', combined: 'Combined card', batteries: 'Batteries card' };
  const close = () => {
    setView({ kind: 'home' });
    onClose();
  };
  const add = (card: Card) => {
    onToggle(card);
    setView({ kind: 'home' });
  };

  return (
    <Dialog open={open} title={sensor ? sensor.name : titles[view.kind as keyof typeof titles]} onClose={close}>
      {view.kind === 'values' && sensor ? (
        <Back label={sensor.name} onClick={() => setView({ kind: 'sensor', id: sensor.id })} />
      ) : (
        view.kind !== 'home' && <Back label="All cards" onClick={() => setView({ kind: 'home' })} />
      )}
      {view.kind === 'home' && (
        <div className="grid grid-cols-2 gap-3">
          {sensors.map((item) => (
            <button key={item.id} type="button" className={tile} onClick={() => setView({ kind: 'sensor', id: item.id })}>
              <span className="w-full truncate text-[17px] font-semibold">{item.name}</span>
              <span className="w-full truncate text-[13px] text-muted">{summaryOf(item)}</span>
            </button>
          ))}
          {combinable && (
            <button type="button" className={tile} onClick={() => setView({ kind: 'combined' })}>
              <span className="flex items-center gap-2 text-[17px] font-semibold">
                <StackIcon weight="fill" className="size-5 text-accent" aria-hidden="true" />
                Combined
              </span>
              <span className="text-[13px] text-muted">Average of several sensors</span>
            </button>
          )}
          {sensors.filter(hasBattery).length > 1 && (
            <button type="button" className={tile} onClick={() => setView({ kind: 'batteries' })}>
              <span className="flex items-center gap-2 text-[17px] font-semibold">
                <MetricChip metric="battery" small />
                Batteries
              </span>
              <span className="text-[13px] text-muted">Battery levels of several sensors</span>
            </button>
          )}
        </div>
      )}
      {view.kind === 'sensor' && sensor && (
        <>
          {dataMetrics(sensor.metrics).length > 1 && (
            <button type="button" className={`${group} ${row} ${pressable} mb-5`} onClick={() => setView({ kind: 'values', id: sensor.id })}>
              <StackIcon weight="fill" className="size-6 shrink-0 p-1 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[17px]">Several values</span>
                <span className="block text-[13px] text-muted">Pick 2 to {MAX_PER_CARD.sensor} for one card</span>
              </span>
              <CaretRightIcon className="size-4 shrink-0 text-muted/70" weight="bold" aria-hidden="true" />
            </button>
          )}
          {dataMetrics(sensor.metrics).length ? (
            <div className={`${group} divide-y divide-line`}>
              {dataMetrics(sensor.metrics).map((metric) => {
                const card: Card = { type: 'metric', size: 'small', sensor: sensor.id, metric: metric.name };
                const label = metricStyle(metric.name).label;
                const on = keys.has(cardKey(card));
                return (
                  <div key={metric.name} className={row}>
                    <MetricChip metric={metric.name} small />
                    <span className="min-w-0 flex-1 text-[17px]">{label}</span>
                    <Toggle on={on} label={`${on ? 'Remove' : 'Add'} ${sensor.name} ${label.toLowerCase()}`} onClick={() => onToggle(card)} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="px-1 text-[15px] text-muted">No values yet. They show up here after the first reading.</p>
          )}
        </>
      )}
      {(view.kind === 'home' || view.kind === 'sensor') && (
        <button type="button" className={`${secondaryButton} mt-5 w-full py-3 text-[17px]`} onClick={close}>
          Done
        </button>
      )}
      {view.kind === 'values' && sensor && <Values sensor={sensor} cards={cards} onAdd={add} />}
      {view.kind === 'combined' && <Combine sensors={sensors} cards={cards} onAdd={add} />}
      {view.kind === 'batteries' && <Batteries sensors={sensors} cards={cards} onAdd={add} />}
    </Dialog>
  );
}