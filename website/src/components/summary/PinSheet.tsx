import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { cardKey } from '../../lib/cards';
import { dataMetrics, hasBattery, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { group, row } from '../../lib/ui';
import Dialog from '../ui/Dialog';

interface Props {
  open: boolean;
  sensors: Sensor[];
  cards: Card[];
  onToggle: (card: Card) => void;
  onClose: () => void;
}

interface Option {
  card: Card;
  label: string;
  name: string;
}

export default function PinSheet({ open, sensors, cards, onToggle, onClose }: Props) {
  const keys = new Set(cards.map(cardKey));
  const groups: { title?: string; options: Option[] }[] = sensors.map((sensor) => ({
    title: sensors.length > 1 ? sensor.name : undefined,
    options: [
      { card: { type: 'sensor', size: 'large', sensor: sensor.id, metric: null, graph: true }, label: 'All values', name: `${sensor.name} all values` },
      ...dataMetrics(sensor.metrics).map((metric): Option => {
        const label = metricStyle(metric.name).label;
        return { card: { type: 'metric', size: 'small', sensor: sensor.id, metric: metric.name, graph: true }, label, name: `${sensor.name} ${label.toLowerCase()}` };
      }),
    ],
  }));

  if (sensors.filter(hasBattery).length > 1) {
    groups.unshift({ options: [{ card: { type: 'batteries', size: 'small', sensor: null, metric: null }, label: 'Batteries', name: 'batteries' }] });
  }

  return (
    <Dialog open={open} title="Add to Summary" onClose={onClose}>
      <div className="space-y-6">
        {groups.map(({ title, options }) => (
          <section key={cardKey(options[0].card)}>
            {title && <h3 className="mb-2 px-1 text-[15px] font-semibold text-muted">{title}</h3>}
            <div className={`${group} divide-y divide-line`}>
              {options.map(({ card, label, name }) => {
                const pinned = keys.has(cardKey(card));
                return (
                  <div key={cardKey(card)} className={row}>
                    <span className="flex-1 text-[17px]">{label}</span>
                    <button
                      type="button"
                      onClick={() => onToggle(card)}
                      aria-label={`${pinned ? 'Remove' : 'Add'} ${name}`}
                      aria-pressed={pinned}
                      className="flex size-8 items-center justify-center rounded-full bg-fill text-accent transition-colors aria-pressed:bg-accent aria-pressed:text-white dark:aria-pressed:text-navy-950"
                    >
                      {pinned ? <CheckIcon weight="bold" className="size-4" aria-hidden="true" /> : <PlusIcon weight="bold" className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-full bg-fill py-2.5 text-[17px] font-semibold">
        Done
      </button>
    </Dialog>
  );
}