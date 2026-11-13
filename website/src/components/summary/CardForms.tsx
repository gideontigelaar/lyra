import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { MAX_PER_CARD, batteryLimit, canCombine, cardKey, fitValues, valueLimit } from '../../lib/cards';
import { hasBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import type { Card, Device, Sensor } from '../../lib/types';
import { group, placeholder, row, sectionTitle, widePrimaryButton } from '../../lib/ui';
import MetricChip from '../MetricChip';
import { Row } from '../ui/List';
import Segmented from '../ui/Segmented';
import Switch from '../ui/Switch';

const ICON = 'size-4 transition duration-200 ease-out starting:scale-50 starting:opacity-0';

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
      {on ? <CheckIcon key="on" weight="bold" className={ICON} aria-hidden="true" /> : <PlusIcon key="off" weight="bold" className={ICON} aria-hidden="true" />}
    </button>
  );
}

function GraphSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
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
  intro?: string;
  what: 'sensors' | 'values' | 'sources';
  options: { key: T; label: string; icon?: ReactNode }[];
  min?: number;
  max: number;
  picked: T[];
  onPick: (keys: T[]) => void;
  card: Card;
  note?: string;
  before?: ReactNode;
  after?: ReactNode;
}

// Picking the sensors or values of one card, or just one of them when that's all it takes. Adding always closes the sheet, so the new card shows straight away.
function Group<T extends number | string>({ intro, what, options, min = 2, max, picked, onPick, card, cards, editing, onSubmit, note, before, after }: GroupProps<T>) {
  const exists = cards.some((item) => item !== editing && cardKey(item) === cardKey(card));
  const single = max === 1;

  return (
    <>
      {intro && <p className="mb-4 text-subheadline text-muted">{intro}</p>}
      {before}
      <h3 className={`${sectionTitle} mb-2 px-1`}>{what}</h3>
      <div className={`${group} divide-y divide-line`}>
        {options.map(({ key, label, icon }) => {
          const on = picked.includes(key);
          return (
            <div key={key} className={row}>
              {icon}
              <span className="min-w-0 flex-1 truncate text-body">{label}</span>
              <Toggle
                on={on}
                disabled={!single && !on && picked.length >= max}
                label={`Include ${label}`}
                onClick={() => onPick(on ? picked.filter((item) => item !== key) : single ? [key] : [...picked, key])}
              />
            </div>
          );
        })}
      </div>
      {!single && <p className="mt-2 px-4 text-footnote text-muted">{note ?? `Up to ${max} ${what} per card.`}</p>}
      {after}
      <button type="button" className={`${widePrimaryButton} mt-6`} disabled={picked.length < min || exists} onClick={() => onSubmit(card)}>
        {exists
          ? 'Already on Summary'
          : picked.length < min
            ? min === 1
              ? `Pick a ${what.slice(0, -1)}`
              : `Pick at least ${min} ${what}`
            : editing
              ? 'Save'
              : picked.length > 1
                ? `Add card (${picked.length} ${what})`
                : 'Add card'}
      </button>
    </>
  );
}

const sensorOptions = (sensors: Sensor[]) => sensors.map((sensor) => ({ key: sensor.id, label: sensor.name }));

// One value makes a value card, more make a sensor card. A new card with more values is large, so they have room.
// A battery isn't one of the values: it only goes on a batteries card.
export function ValuesForm({ sensor, ...props }: FormProps & { sensor: Sensor }) {
  const edited = props.editing?.type === 'sensor' || props.editing?.type === 'metric' ? props.editing : undefined;
  const options = mainMetrics(sensor.metrics);
  const [picked, setPicked] = useState(() => (edited ? (edited.type === 'sensor' ? edited.metrics : [edited.metric]) : []).filter((name) => options.some((metric) => metric.name === name)));
  const [graph, setGraph] = useState(edited?.graph ?? true);
  // A new card is small while its values fit, and large when they don't.
  const size = edited?.size ?? (picked.length <= valueLimit('small', graph) ? 'small' : 'large');
  const max = edited ? valueLimit(edited.size, graph) : MAX_PER_CARD.sensor;
  const card: Card = picked.length === 1 ? { type: 'metric', size, sensor: sensor.id, metric: picked[0], graph } : { type: 'sensor', size, sensor: sensor.id, metric: null, metrics: picked, graph };

  if (!options.length) {
    return <p className={placeholder}>No values yet. They show up here after the first reading.</p>;
  }

  return (
    <Group
      {...props}
      intro={edited ? undefined : 'Pick one value for a small card, or more to show them together.'}
      what="values"
      options={options.map((metric) => ({ key: metric.name, label: metricStyle(metric.name).label, icon: <MetricChip metric={metric.name} small /> }))}
      min={1}
      max={max}
      picked={picked}
      onPick={setPicked}
      card={card}
      note={
        !edited
          ? `A small card fits ${valueLimit('small', graph)}, a large one ${MAX_PER_CARD.sensor}.`
          : edited.size === 'small'
            ? `A small card fits ${max}. Enlarge it for up to ${MAX_PER_CARD.sensor}.`
            : undefined
      }
      // Graphs take room, so turning them on can leave a small card fewer values.
      after={
        <GraphSwitch
          checked={graph}
          onChange={(on) => {
            setGraph(on);
            edited && picked.length > valueLimit(edited.size, on) && setPicked(fitValues(picked, valueLimit(edited.size, on)));
          }}
        />
      }
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
      intro="Averages one value over the sensors you pick."
      what="sensors"
      options={sensorOptions(options)}
      max={MAX_PER_CARD.combined}
      picked={picked}
      onPick={setChosen}
      card={card}
      before={
        <>
          <h3 className={`${sectionTitle} mb-2 px-1`}>Value</h3>
          <div className="mb-5">
            <Segmented label="Value" options={metrics} value={metric} onChange={setMetric} text={(name) => metricStyle(name).label} />
          </div>
        </>
      }
      after={<GraphSwitch checked={graph} onChange={setGraph} />}
    />
  );
}

export function BatteriesForm({ sensors, ...props }: FormProps & { sensors: Sensor[] }) {
  const edited = props.editing?.type === 'batteries' ? props.editing : undefined;
  const options = sensors.filter(hasBattery);
  const [picked, setPicked] = useState(() => edited?.sensors ?? options.slice(0, MAX_PER_CARD.batteries).map((sensor) => sensor.id));
  const card: Card = { size: 'large', ...edited, type: 'batteries', sensor: null, metric: null, sensors: picked };
  const max = edited ? batteryLimit(edited.size) : MAX_PER_CARD.batteries;

  return (
    <Group
      {...props}
      intro="Lists the battery level of the sensors you pick, lowest first."
      what="sensors"
      options={sensorOptions(options)}
      min={1}
      max={max}
      picked={picked}
      onPick={setPicked}
      card={card}
      note={edited?.size === 'small' ? `A small card fits ${max}. Enlarge it for up to ${MAX_PER_CARD.batteries}.` : undefined}
    />
  );
}

export function SourceForm({ devices, ...props }: FormProps & { devices: Device[] }) {
  const edited = props.editing?.type === 'source' ? props.editing : undefined;
  const [picked, setPicked] = useState(() => (edited ? [edited.source] : devices.length === 1 ? [devices[0].id] : []));
  const card: Card = { size: 'small', ...edited, type: 'source', sensor: null, metric: null, source: picked[0] ?? 0 };

  return (
    <Group
      {...props}
      intro="Shows whether a source is online, its Wi-Fi signal, uptime and free memory. A large card adds its chip temperature."
      what="sources"
      options={devices.map((device) => ({ key: device.id, label: device.name }))}
      min={1}
      max={1}
      picked={picked}
      onPick={setPicked}
      card={card}
    />
  );
}