import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { MAX_PER_CARD, canCombine, cardKey, sensorValues } from '../../lib/cards';
import { dataMetrics, hasBattery, metricStyle } from '../../lib/metrics';
import type { Card, Sensor } from '../../lib/types';
import { group, primaryButton, row, sectionTitle } from '../../lib/ui';
import MetricChip from '../MetricChip';
import { Row } from '../ui/List';
import Segmented from '../ui/Segmented';
import Switch from '../ui/Switch';

const ICON = 'size-4 transition duration-200 ease-out starting:scale-50 starting:opacity-0';

export function Toggle({ on, label, disabled, onClick }: { on: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-accent transition aria-pressed:bg-accent aria-pressed:text-white disabled:opacity-40 dark:aria-pressed:text-navy-950"
    >
      {on ? <CheckIcon key="on" weight="bold" className={ICON} aria-hidden="true" /> : <PlusIcon key="off" weight="bold" className={ICON} aria-hidden="true" />}
    </button>
  );
}

export function GraphSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className={`${group} mt-5`}>
      <Row label="Graph of the last 24 hours" trailing={<Switch label="Graph of the last 24 hours" checked={checked} onChange={onChange} />} />
    </div>
  );
}

// A card's form either adds a new card or changes the one being edited.
interface FormProps {
  cards: Card[];
  editing?: Card;
  onSubmit: (card: Card) => void;
}

interface GroupProps<T> extends FormProps {
  intro: string;
  what: 'sensors' | 'values';
  options: { key: T; label: string; icon?: ReactNode }[];
  min?: number;
  max: number;
  picked: T[];
  onPick: (keys: T[]) => void;
  card: Card;
  add: string;
  before?: ReactNode;
  after?: ReactNode;
}

// Picking the 2 or more sensors or values of one card.
function Group<T extends number | string>({ intro, what, options, min = 2, max, picked, onPick, card, cards, editing, add, onSubmit, before, after }: GroupProps<T>) {
  const exists = cards.some((item) => item !== editing && cardKey(item) === cardKey(card));

  return (
    <>
      <p className="mb-4 text-[15px] text-muted">{intro}</p>
      {before}
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
      {after}
      <button type="button" className={`${primaryButton} mt-5 w-full py-3 text-[17px]`} disabled={picked.length < min || exists} onClick={() => onSubmit(card)}>
        {exists ? 'Already on Summary' : picked.length < min ? `Pick at least ${min} ${min === 1 ? what.slice(0, -1) : what}` : editing ? 'Save' : add}
      </button>
    </>
  );
}

const sensorOptions = (sensors: Sensor[]) => sensors.map((sensor) => ({ key: sensor.id, label: sensor.name }));

export function ValuesForm({ sensor, ...props }: FormProps & { sensor: Sensor }) {
  const edited = props.editing?.type === 'sensor' ? props.editing : undefined;
  const options = dataMetrics(sensor.metrics);
  const [picked, setPicked] = useState(() => (edited?.metrics ?? sensorValues(sensor)).filter((name) => options.some((metric) => metric.name === name)));
  const [graph, setGraph] = useState(edited?.graph ?? true);
  const card: Card = { size: 'large', ...edited, type: 'sensor', sensor: sensor.id, metric: null, metrics: picked, graph };

  return (
    <Group
      {...props}
      intro="Shows the values you pick together in one card."
      what="values"
      options={options.map((metric) => ({ key: metric.name, label: metricStyle(metric.name).label, icon: <MetricChip metric={metric.name} small /> }))}
      max={MAX_PER_CARD.sensor}
      picked={picked}
      onPick={setPicked}
      card={card}
      add={`Add card with ${picked.length} values`}
      after={edited?.size === 'large' && <GraphSwitch checked={graph} onChange={setGraph} />}
    />
  );
}

export function AverageForm({ sensors, ...props }: FormProps & { sensors: Sensor[] }) {
  const edited = props.editing?.type === 'combined' ? props.editing : undefined;
  const metrics = [...new Set(sensors.flatMap((sensor) => sensor.metrics.map((metric) => metric.name)))].filter(
    (name) => canCombine(name) && sensors.filter((sensor) => sensor.metrics.some((metric) => metric.name === name)).length > 1,
  );
  const [metric, setMetric] = useState(edited?.metric ?? metrics[0]);
  const [chosen, setChosen] = useState<number[]>(edited?.sensors ?? []);
  const [graph, setGraph] = useState(edited?.graph ?? true);
  const options = sensors.filter((sensor) => sensor.metrics.some((item) => item.name === metric));
  const picked = chosen.filter((id) => options.some((sensor) => sensor.id === id));
  const card: Card = { size: 'large', ...edited, type: 'combined', sensor: null, metric, sensors: picked, graph };

  return (
    <Group
      {...props}
      intro="Averages one value over the sensors you pick, with a graph of the last 24 hours."
      what="sensors"
      options={sensorOptions(options)}
      max={MAX_PER_CARD.combined}
      picked={picked}
      onPick={setChosen}
      card={card}
      add={`Add average of ${picked.length} sensors`}
      before={
        <>
          <h3 className={`${sectionTitle} mb-2 px-1`}>Value</h3>
          <div className="mb-5">
            <Segmented label="Value" options={metrics} value={metric} onChange={setMetric} text={(name) => metricStyle(name).label} />
          </div>
        </>
      }
      after={edited && <GraphSwitch checked={graph} onChange={setGraph} />}
    />
  );
}

export function BatteriesForm({ sensors, ...props }: FormProps & { sensors: Sensor[] }) {
  const edited = props.editing?.type === 'batteries' ? props.editing : undefined;
  const options = sensors.filter(hasBattery);
  const [picked, setPicked] = useState(() => edited?.sensors ?? options.slice(0, MAX_PER_CARD.batteries).map((sensor) => sensor.id));
  const card: Card = { size: 'large', ...edited, type: 'batteries', sensor: null, metric: null, sensors: picked };

  return (
    <Group
      {...props}
      intro="Lists the battery level of the sensors you pick, lowest first."
      what="sensors"
      options={sensorOptions(options)}
      min={1}
      max={MAX_PER_CARD.batteries}
      picked={picked}
      onPick={setPicked}
      card={card}
      add={picked.length === 1 ? 'Add battery' : `Add batteries of ${picked.length} sensors`}
    />
  );
}