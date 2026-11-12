import { useState } from 'react';
import { cardKey } from '../../lib/cards';
import type { Card, Sensor } from '../../lib/types';
import { primaryButton } from '../../lib/ui';
import Dialog from '../ui/Dialog';
import { AverageForm, BatteriesForm, GraphSwitch, ValuesForm } from './CardForms';
import { cardName } from './SummaryCard';

interface Props {
  card: Card | null;
  sensors: Sensor[];
  cards: Card[];
  onSave: (card: Card) => void;
  onClose: () => void;
}

function GraphForm({ card, onSave }: { card: Extract<Card, { type: 'metric' }>; onSave: (card: Card) => void }) {
  const [graph, setGraph] = useState(card.graph);

  return (
    <>
      <GraphSwitch checked={graph} onChange={setGraph} />
      <button type="button" className={`${primaryButton} mt-5 w-full py-3 text-[17px]`} onClick={() => onSave({ ...card, graph })}>
        Save
      </button>
    </>
  );
}

// Changes a card on Summary: what it shows and whether it has a graph.
export default function CardEditor({ card, sensors, cards, onSave, onClose }: Props) {
  const sensor = card && card.type === 'sensor' ? sensors.find((item) => item.id === card.sensor) : undefined;
  const key = card ? cardKey(card) : '';
  const form = { cards, editing: card ?? undefined, onSubmit: onSave };

  return (
    <Dialog open={card !== null} title={card ? cardName(card, sensors) : ''} onClose={onClose}>
      {card?.type === 'metric' && <GraphForm key={key} card={card} onSave={onSave} />}
      {sensor && <ValuesForm key={key} {...form} sensor={sensor} />}
      {card?.type === 'combined' && <AverageForm key={key} {...form} sensors={sensors} />}
      {card?.type === 'batteries' && <BatteriesForm key={key} {...form} sensors={sensors} />}
    </Dialog>
  );
}