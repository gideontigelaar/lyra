import { cardKey } from '../../lib/cards';
import type { Card, Device, Sensor } from '../../lib/types';
import Dialog from '../ui/Dialog';
import { AverageForm, BatteriesForm, SourceForm, ValuesForm } from './CardForms';
import { cardName } from './SummaryCard';

interface Props {
  card: Card | null;
  sensors: Sensor[];
  devices: Device[];
  cards: Card[];
  onSave: (card: Card) => void;
  onClose: () => void;
}

// Changes a card on Summary: what it shows and whether it has a graph.
export default function CardEditor({ card, sensors, devices, cards, onSave, onClose }: Props) {
  const sensor = card && (card.type === 'sensor' || card.type === 'metric') ? sensors.find((item) => item.id === card.sensor) : undefined;
  const key = card ? cardKey(card) : '';
  const form = { cards, editing: card ?? undefined, onSubmit: onSave };

  return (
    <Dialog open={card !== null} title={card ? cardName(card, sensors, devices) : ''} onClose={onClose}>
      {sensor && <ValuesForm key={key} {...form} sensor={sensor} />}
      {card?.type === 'combined' && <AverageForm key={key} {...form} sensors={sensors} />}
      {card?.type === 'batteries' && <BatteriesForm key={key} {...form} sensors={sensors} />}
      {card?.type === 'source' && <SourceForm key={key} {...form} devices={devices} />}
    </Dialog>
  );
}