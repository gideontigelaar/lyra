import { ArrowsMergeIcon, CaretLeftIcon, CaretRightIcon, StackIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { MAX_PER_CARD, canCombine, cardKey } from '../../lib/cards';
import { formatNumber, unitText } from '../../lib/format';
import { dataMetrics, hasBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { appear, group, pressable, row, secondaryButton, sectionTitle } from '../../lib/ui';
import MetricChip from '../MetricChip';
import Dialog from '../ui/Dialog';
import { AverageForm, BatteriesForm, Toggle, ValuesForm } from './CardForms';

interface Props {
  open: boolean;
  sensors: Sensor[];
  cards: Card[];
  onToggle: (card: Card) => void;
  onClose: () => void;
}

type View = { kind: 'home' } | { kind: 'sensor'; id: number } | { kind: 'values'; id: number } | { kind: 'average' } | { kind: 'batteries' };

const tile = `${group} ${pressable} flex min-h-24 flex-col items-start gap-2 p-3 text-left`;

const heading = `${sectionTitle} mb-2 px-1`;

const summaryOf = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.latest))
    .map((metric) => `${formatNumber(metric.latest!.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}`)
    .join(' · ') || 'No data yet';

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1.5 mb-3 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-[15px] text-accent transition-opacity hover:opacity-70">
      <CaretLeftIcon weight="bold" className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export default function PinSheet({ open, sensors, cards, onToggle, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'home' });
  const keys = new Set(cards.map(cardKey));
  const sensor = view.kind === 'sensor' || view.kind === 'values' ? sensors.find((item) => item.id === view.id) : undefined;
  const combinable = sensors.flatMap((item) => item.metrics.map((metric) => metric.name)).some((name, _, all) => canCombine(name) && all.filter((other) => other === name).length > 1);
  const titles = { home: 'Add to Summary', average: 'Average card', batteries: 'Batteries card' };
  const batteries = sensors.some(hasBattery);
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
      <div key={view.kind} className={appear}>
        {view.kind === 'values' && sensor ? (
          <Back label={sensor.name} onClick={() => setView({ kind: 'sensor', id: sensor.id })} />
        ) : (
          view.kind !== 'home' && <Back label="All cards" onClick={() => setView({ kind: 'home' })} />
        )}
        {view.kind === 'home' && (
          <>
            <h3 className={heading}>Sensors</h3>
            <div className="grid grid-cols-2 gap-3">
              {sensors.map((item) => (
                <button key={item.id} type="button" className={tile} onClick={() => setView({ kind: 'sensor', id: item.id })}>
                  <span className="w-full truncate text-[17px] font-semibold">{item.name}</span>
                  <span className="w-full truncate text-[13px] text-muted">{summaryOf(item)}</span>
                </button>
              ))}
            </div>
            {(combinable || batteries) && (
              <>
                <h3 className={`${heading} mt-5`}>Across sensors</h3>
                <div className="grid grid-cols-2 gap-3">
                  {combinable && (
                    <button type="button" className={tile} onClick={() => setView({ kind: 'average' })}>
                      <span className="flex items-center gap-2 text-[17px] font-semibold">
                        <ArrowsMergeIcon weight="bold" className="size-5 text-accent" aria-hidden="true" />
                        Average
                      </span>
                      <span className="text-[13px] text-muted">One value over 2 to {MAX_PER_CARD.combined} sensors</span>
                    </button>
                  )}
                  {batteries && (
                    <button type="button" className={tile} onClick={() => setView({ kind: 'batteries' })}>
                      <span className="flex items-center gap-2 text-[17px] font-semibold">
                        <MetricChip metric="battery" small />
                        Batteries
                      </span>
                      <span className="text-[13px] text-muted">Levels of up to {MAX_PER_CARD.batteries} sensors</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {view.kind === 'sensor' && sensor && (
          <>
            {dataMetrics(sensor.metrics).length > 1 && (
              <button type="button" className={`${group} ${row} ${pressable} mb-5`} onClick={() => setView({ kind: 'values', id: sensor.id })}>
                <StackIcon weight="fill" className="size-6 shrink-0 p-1 text-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px]">Combined</span>
                  <span className="block text-[13px] text-muted">2 to {MAX_PER_CARD.sensor} values in one card</span>
                </span>
                <CaretRightIcon className="size-4 shrink-0 text-muted/70" weight="bold" aria-hidden="true" />
              </button>
            )}
            {dataMetrics(sensor.metrics).length ? (
              <>
                <h3 className={heading}>One value</h3>
                <div className={`${group} divide-y divide-line`}>
                  {dataMetrics(sensor.metrics).map((metric) => {
                    const card: Card = { type: 'metric', size: 'small', sensor: sensor.id, metric: metric.name, graph: true };
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
              </>
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
        {view.kind === 'values' && sensor && <ValuesForm sensor={sensor} cards={cards} onSubmit={add} />}
        {view.kind === 'average' && <AverageForm sensors={sensors} cards={cards} onSubmit={add} />}
        {view.kind === 'batteries' && <BatteriesForm sensors={sensors} cards={cards} onSubmit={add} />}
      </div>
    </Dialog>
  );
}