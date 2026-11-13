import { ArrowsMergeIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { MAX_PER_CARD, canCombine } from '../../lib/cards';
import { formatNumber, unitText } from '../../lib/format';
import { hasBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { appear, group, pressable, sectionTitle, wideSecondaryButton } from '../../lib/ui';
import { Chip } from '../MetricChip';
import Dialog from '../ui/Dialog';
import { AverageForm, BatteriesForm, ValuesForm } from './CardForms';

interface Props {
  open: boolean;
  sensors: Sensor[];
  cards: Card[];
  onAdd: (card: Card) => void;
  onClose: () => void;
}

type View = { kind: 'home' } | { kind: 'sensor'; id: number } | { kind: 'average' } | { kind: 'batteries' };

const tile = `${group} ${pressable} flex min-h-24 w-full flex-1 flex-col items-start gap-2 p-3 text-left`;

const heading = `${sectionTitle} mb-2 px-1`;

const summaryOf = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.latest))
    .map((metric) => `${formatNumber(metric.latest!.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}`)
    .join(' · ') || 'No Data';

function Back({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="-ml-1.5 mb-3 inline-flex items-center gap-0.5 rounded-full py-1 pr-2 text-subheadline text-accent transition-opacity hover:opacity-70">
      <CaretLeftIcon weight="bold" className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

export default function PinSheet({ open, sensors, cards, onAdd, onClose }: Props) {
  const [view, setView] = useState<View>({ kind: 'home' });
  const sensor = view.kind === 'sensor' ? sensors.find((item) => item.id === view.id) : undefined;
  const combinable = sensors.flatMap((item) => item.metrics.map((metric) => metric.name)).some((name, _, all) => canCombine(name) && all.filter((other) => other === name).length > 1);
  const titles = { home: 'Add to Summary', average: 'Average card', batteries: 'Batteries card' };
  const batteries = sensors.some(hasBattery);
  const close = () => {
    setView({ kind: 'home' });
    onClose();
  };
  const add = (card: Card) => {
    setView({ kind: 'home' });
    onAdd(card);
  };

  const sensorTiles = sensors.map((item) => (
    <button key={item.id} type="button" className={tile} onClick={() => setView({ kind: 'sensor', id: item.id })}>
      <span className="w-full truncate text-body font-semibold">{item.name}</span>
      <span className="w-full truncate text-footnote text-muted">{summaryOf(item)}</span>
    </button>
  ));
  const acrossTiles = [
    combinable && (
      <button key="average" type="button" className={tile} onClick={() => setView({ kind: 'average' })}>
        <span className="flex items-center gap-2 text-body font-semibold">
          <Chip icon={ArrowsMergeIcon} color="var(--accent)" small />
          Average
        </span>
        <span className="text-footnote text-muted">One value over 2 to {MAX_PER_CARD.combined} sensors</span>
      </button>
    ),
    batteries && (
      <button key="batteries" type="button" className={tile} onClick={() => setView({ kind: 'batteries' })}>
        <span className="flex items-center gap-2 text-body font-semibold">
          <Chip icon={metricStyle('battery').icon} color={metricStyle('battery').color} small />
          Batteries
        </span>
        <span className="text-footnote text-muted">Levels of up to {MAX_PER_CARD.batteries} sensors</span>
      </button>
    ),
  ].filter(Boolean);
  const side = sensorTiles.length === 1 && acrossTiles.length === 1;

  return (
    <Dialog open={open} title={sensor ? sensor.name : titles[view.kind as keyof typeof titles]} onClose={close}>
      <div key={view.kind} className={appear}>
        {view.kind !== 'home' && <Back label="All cards" onClick={() => setView({ kind: 'home' })} />}
        {view.kind === 'home' &&
          // With one tile in each section, the two sections sit side by side.
          (side ? (
            <div className="grid grid-cols-2 gap-3">
              <section className="flex flex-col">
                <h3 className={heading}>Sensors</h3>
                {sensorTiles}
              </section>
              <section className="flex flex-col">
                <h3 className={heading}>Across sensors</h3>
                {acrossTiles}
              </section>
            </div>
          ) : (
            <>
              <h3 className={heading}>Sensors</h3>
              <div className="grid grid-cols-2 gap-3">{sensorTiles}</div>
              {acrossTiles.length > 0 && (
                <>
                  <h3 className={`${heading} mt-5`}>Across sensors</h3>
                  <div className="grid grid-cols-2 gap-3">{acrossTiles}</div>
                </>
              )}
            </>
          ))}
        {view.kind === 'home' && (
          <button type="button" className={`${wideSecondaryButton} mt-6`} onClick={close}>
            Cancel
          </button>
        )}
        {view.kind === 'sensor' && sensor && <ValuesForm sensor={sensor} cards={cards} onSubmit={add} />}
        {view.kind === 'average' && <AverageForm sensors={sensors} cards={cards} onSubmit={add} />}
        {view.kind === 'batteries' && <BatteriesForm sensors={sensors} cards={cards} onSubmit={add} />}
      </div>
    </Dialog>
  );
}