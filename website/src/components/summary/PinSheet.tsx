import { CaretLeftIcon, CheckIcon, PlusIcon, StackIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { canCombine, cardKey } from '../../lib/cards';
import { formatNumber, unitText } from '../../lib/format';
import { dataMetrics, hasBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { group, pressable, primaryButton, row, sectionTitle } from '../../lib/ui';
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

type View = { kind: 'home' } | { kind: 'sensor'; id: number } | { kind: 'combined' };

const tile = `${group} ${pressable} flex min-h-24 flex-col items-start gap-2 p-3 text-left`;

const summaryOf = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.latest))
    .map((metric) => `${formatNumber(metric.latest!.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}`)
    .join(' · ') || 'No data yet';

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-accent transition-colors aria-pressed:bg-accent aria-pressed:text-white dark:aria-pressed:text-navy-950"
    >
      {on ? <CheckIcon weight="bold" className="size-4" aria-hidden="true" /> : <PlusIcon weight="bold" className="size-4" aria-hidden="true" />}
    </button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1.5 mb-3 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-[15px] text-accent transition-opacity hover:opacity-70">
      <CaretLeftIcon weight="bold" className="size-4" aria-hidden="true" />
      All cards
    </button>
  );
}

function Combine({ sensors, cards, onToggle, onDone }: { sensors: Sensor[]; cards: Card[]; onToggle: (card: Card) => void; onDone: () => void }) {
  const metrics = [...new Set(sensors.flatMap((sensor) => sensor.metrics.map((metric) => metric.name)))].filter(
    (name) => canCombine(name) && sensors.filter((sensor) => sensor.metrics.some((metric) => metric.name === name)).length > 1,
  );
  const [metric, setMetric] = useState(metrics[0]);
  const [chosen, setChosen] = useState<number[]>([]);
  const options = sensors.filter((sensor) => sensor.metrics.some((item) => item.name === metric));
  const picked = chosen.filter((id) => options.some((sensor) => sensor.id === id));
  const card: Card = { type: 'combined', size: 'large', sensor: null, metric, sensors: picked };
  const exists = cards.some((item) => cardKey(item) === cardKey(card));

  return (
    <>
      <p className="mb-4 text-[15px] text-muted">Shows the average of the sensors you pick, with a graph of the last 24 hours.</p>
      <h3 className={`${sectionTitle} mb-2 px-1`}>Value</h3>
      <Segmented label="Value" options={metrics} value={metric} onChange={setMetric} text={(name) => metricStyle(name).label} />
      <h3 className={`${sectionTitle} mt-5 mb-2 px-1`}>Sensors</h3>
      <div className={`${group} divide-y divide-line`}>
        {options.map((sensor) => (
          <div key={sensor.id} className={row}>
            <span className="min-w-0 flex-1 truncate text-[17px]">{sensor.name}</span>
            <Toggle
              on={picked.includes(sensor.id)}
              label={`Include ${sensor.name}`}
              onClick={() => setChosen(picked.includes(sensor.id) ? picked.filter((id) => id !== sensor.id) : [...picked, sensor.id])}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`${primaryButton} mt-5 w-full py-3 text-[17px]`}
        disabled={picked.length < 2 || exists}
        onClick={() => {
          onToggle(card);
          onDone();
        }}
      >
        {exists ? 'Already on Summary' : picked.length < 2 ? 'Pick at least 2 sensors' : `Add average of ${picked.length} sensors`}
      </button>
    </>
  );
}

export default function PinSheet({ open, sensors, cards, onToggle, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'home' });
  const keys = new Set(cards.map(cardKey));
  const sensor = view.kind === 'sensor' ? sensors.find((item) => item.id === view.id) : undefined;
  const combinable = sensors.flatMap((item) => item.metrics.map((metric) => metric.name)).some((name, _, all) => canCombine(name) && all.filter((other) => other === name).length > 1);
  const batteries: Card = { type: 'batteries', size: 'small', sensor: null, metric: null };
  const close = () => {
    setView({ kind: 'home' });
    onClose();
  };

  return (
    <Dialog open={open} title={sensor ? sensor.name : view.kind === 'combined' ? 'Combined card' : 'Add to Summary'} onClose={close}>
      {view.kind !== 'home' && <Back onClick={() => setView({ kind: 'home' })} />}
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
            <div className={`${group} flex min-h-24 flex-col items-start justify-between gap-2 p-3`}>
              <span className="flex w-full items-center gap-2 text-[17px] font-semibold">
                <MetricChip metric="battery" small />
                <span className="flex-1">Batteries</span>
                <Toggle on={keys.has(cardKey(batteries))} label="Add batteries" onClick={() => onToggle(batteries)} />
              </span>
              <span className="text-[13px] text-muted">Every sensor's battery</span>
            </div>
          )}
        </div>
      )}
      {sensor && (
        <div className={`${group} divide-y divide-line`}>
          {[
            { type: 'sensor', size: 'large', sensor: sensor.id, metric: null } as Card,
            ...dataMetrics(sensor.metrics).map((metric): Card => ({ type: 'metric', size: 'small', sensor: sensor.id, metric: metric.name })),
          ].map((card) => {
            const label = card.metric ? metricStyle(card.metric).label : 'All values';
            return (
              <div key={cardKey(card)} className={row}>
                {card.metric ? <MetricChip metric={card.metric} small /> : <StackIcon weight="fill" className="size-6 p-1 text-accent" aria-hidden="true" />}
                <span className="min-w-0 flex-1 text-[17px]">{label}</span>
                <Toggle on={keys.has(cardKey(card))} label={`${keys.has(cardKey(card)) ? 'Remove' : 'Add'} ${sensor.name} ${label.toLowerCase()}`} onClick={() => onToggle(card)} />
              </div>
            );
          })}
        </div>
      )}
      {view.kind === 'combined' && <Combine sensors={sensors} cards={cards} onToggle={onToggle} onDone={() => setView({ kind: 'home' })} />}
    </Dialog>
  );
}