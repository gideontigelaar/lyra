import { dataMetrics, hasBattery, mainMetrics, metricStyle } from './metrics';
import { sensorPath } from './paths';
import type { Card, Sensor, SensorMetric, Spots } from './types';

// The most a card holds: values on a sensor card, sensors on a batteries or combined card.
export const MAX_PER_CARD = { sensor: 6, batteries: 6, combined: 3 };

const joined = (list: (number | string)[]) => [...list].sort().join('+');

export const cardKey = (card: Card) => {
  switch (card.type) {
    case 'sensor':
      return `sensor:${card.sensor}:${joined(card.metrics)}`;
    case 'batteries':
    case 'combined':
      return `${card.type}:${joined(card.sensors)}:${card.metric ?? ''}`;
    default:
      return `metric:${card.sensor}:${card.metric}`;
  }
};

// Main values first, then battery, like everywhere else.
const valueOrder = <T extends { name: string }>(metrics: T[]) => [...mainMetrics(metrics), ...metrics.filter((metric) => metric.name === 'battery')];

// What a sensor card starts with: its recorded main values and battery.
export const sensorValues = (sensor: Sensor) =>
  valueOrder(sensor.metrics.filter((metric) => metric.active))
    .map((metric) => metric.name)
    .slice(0, MAX_PER_CARD.sensor);

// A card opens its sensor, on its value when it shows one. A batteries card of one sensor opens that sensor's battery.
export const cardHref = (card: Card) => {
  switch (card.type) {
    case 'batteries':
      return card.sensors.length === 1 ? sensorPath(card.sensors[0], 'battery') : '/sensors/';
    case 'combined':
      return '/sensors/';
    default:
      return sensorPath(card.sensor, card.type === 'metric' ? card.metric : undefined);
  }
};

export const sparkKey = (sensor: number, metric: string) => `${sensor}:${metric}`;

// Only plain measurements can be averaged across sensors, not status values like battery.
export const canCombine = (metric: string) => metricStyle(metric).role === undefined;

// The sensor values a card shows. A sensor card shows its main values and its battery.
export const cardValues = (card: Card, sensors: Sensor[]): { sensor: Sensor; metric: SensorMetric }[] => {
  const pick = (id: number, keep: (metric: SensorMetric) => boolean) => {
    const sensor = sensors.find((item) => item.id === id);
    return sensor ? sensor.metrics.filter(keep).map((metric) => ({ sensor, metric })) : [];
  };

  switch (card.type) {
    case 'batteries':
      return [];
    case 'combined':
      return card.sensors.flatMap((id) => pick(id, (metric) => metric.name === card.metric));
    case 'metric':
      return pick(card.sensor, (metric) => metric.name === card.metric);
    default: {
      const sensor = sensors.find((item) => item.id === card.sensor)!;
      const fresh = sensor.metrics.filter((metric) => metric.active && metric.latest !== null && card.metrics.includes(metric.name));
      return valueOrder(fresh).map((metric) => ({ sensor, metric }));
    }
  }
};

export const defaultCards = (sensors: Sensor[]): Card[] => {
  const metrics = sensors.length === 1 ? mainMetrics(sensors[0].metrics.filter((metric) => metric.active)) : [];

  return metrics.length
    ? metrics.map((metric) => ({ type: 'metric', size: 'large', sensor: sensors[0].id, metric: metric.name, graph: true }))
    : sensors.map((sensor) => ({ type: 'sensor', size: 'large', sensor: sensor.id, metric: null, metrics: sensorValues(sensor), graph: true }));
};

const has = (sensors: Sensor[], id: unknown, metric: unknown) => sensors.some((sensor) => sensor.id === id && sensor.metrics.some((item) => item.name === metric));

// The sensors of a batteries or average card that still exist and have the value, if enough are left.
const members = (ids: unknown, metric: string, min: number, max: number, sensors: Sensor[]) => {
  const list = [...new Set(Array.isArray(ids) ? ids : [])].filter((id) => has(sensors, id, metric)).slice(0, max);
  return list.length >= min ? list : null;
};

// Spots must be whole cells inside the grid. Others are dropped, and the card flows in after the rest.
const spotsOf = (value: unknown, size: 'small' | 'large'): Spots | undefined => {
  const at: Spots = {};

  for (const columns of [2, 4] as const) {
    const spot = typeof value === 'object' && value !== null ? (value as Record<number, unknown>)[columns] : undefined;

    if (Array.isArray(spot) && spot.length === 2 && spot.every((n) => Number.isInteger(n) && n >= 0 && n < 1000) && spot[0] + (size === 'large' ? 2 : 1) <= columns) {
      at[columns] = [spot[0], spot[1]];
    }
  }

  return Object.keys(at).length ? at : undefined;
};

const toCard = ({ type, size, sensor, metric, sensors: ids, metrics: names, graph: shown, at: spots }: Record<string, unknown>, sensors: Sensor[]): Card | null => {
  if (size !== 'small' && size !== 'large') {
    return null;
  }

  const at = spotsOf(spots, size);
  const graph = shown !== false;

  switch (type) {
    case 'batteries': {
      // Batteries cards saved before sensors could be picked showed every battery.
      const list = members(ids ?? sensors.filter(hasBattery).map((item) => item.id), 'battery', 1, MAX_PER_CARD.batteries, sensors);
      return list && { type, size, at, sensor: null, metric: null, sensors: list };
    }
    case 'combined': {
      const list = typeof metric === 'string' && canCombine(metric) ? members(ids, metric, 2, MAX_PER_CARD.combined, sensors) : null;
      return list && { type, size, at, sensor: null, metric: metric as string, sensors: list, graph };
    }
    case 'sensor': {
      const found = sensors.find((item) => item.id === sensor);

      if (!found || metric !== null) {
        return null;
      }

      // No values means all of them: cards saved before values could be picked, or before the sensor had any.
      const known = dataMetrics(found.metrics).map((item) => item.name);
      const list = [...new Set(Array.isArray(names) ? names : [])].filter((name) => known.includes(name)).slice(0, MAX_PER_CARD.sensor);
      return { type, size, at, sensor: found.id, metric, metrics: list.length ? list : sensorValues(found), graph };
    }
    case 'metric':
      return has(sensors, sensor, metric) ? { type, size, at, sensor: sensor as number, metric: metric as string, graph } : null;
    default:
      return null;
  }
};

export const toCards = (value: unknown, sensors: Sensor[]): Card[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards = value.flatMap((card) => (typeof card === 'object' && card !== null ? (toCard(card, sensors) ?? []) : []));
  return [...new Map(cards.map((card) => [cardKey(card), card])).values()];
};