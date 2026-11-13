import { hasBattery, mainMetrics, metricStyle } from './metrics';
import { SUMMARY, averagePath, batteriesPath, sensorPath, sourcePath } from './paths';
import type { Card, Device, Sensor, SensorMetric } from './types';

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
    case 'source':
      return `source:${card.source}`;
    default:
      return `metric:${card.sensor}:${card.metric}`;
  }
};

// How many values a sensor card holds. A small card has room for 3 under each other, or 2 with their graphs.
export const valueLimit = (size: Card['size'], graph: boolean) => (size === 'large' ? MAX_PER_CARD.sensor : graph ? 2 : 3);

// The values a sensor card keeps when it has less room: the first ones, as they show from left to right.
export const fitValues = (names: string[], limit: number) =>
  mainMetrics(names.map((name) => ({ name })))
    .map(({ name }) => name)
    .slice(0, limit);

// What a sensor card starts with: its recorded main values. A battery only goes on a batteries card.
const sensorValues = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.active))
    .map((metric) => metric.name)
    .slice(0, MAX_PER_CARD.sensor);

// A card opens a page in Summary's tab: its sensor, on its value when it shows one, its source, or a page of its own for an average or several batteries.
export const cardHref = (card: Card) => {
  switch (card.type) {
    case 'source':
      return sourcePath(card.source, SUMMARY);
    case 'batteries':
      return card.sensors.length === 1 ? sensorPath(card.sensors[0], 'battery', SUMMARY) : batteriesPath(card.sensors);
    case 'combined':
      return averagePath(card.metric, card.sensors);
    default:
      return sensorPath(card.sensor, card.type === 'metric' ? card.metric : undefined, SUMMARY);
  }
};

export const sparkKey = (sensor: number, metric: string) => `${sensor}:${metric}`;

// Only plain measurements can be averaged across sensors, not status values like battery.
export const canCombine = (metric: string) => metricStyle(metric).role === undefined;

// The sensor values a card shows.
export const cardValues = (card: Card, sensors: Sensor[]): { sensor: Sensor; metric: SensorMetric }[] => {
  const pick = (id: number, keep: (metric: SensorMetric) => boolean) => {
    const sensor = sensors.find((item) => item.id === id);
    return sensor ? sensor.metrics.filter(keep).map((metric) => ({ sensor, metric })) : [];
  };

  switch (card.type) {
    case 'batteries':
    case 'source':
      return [];
    case 'combined':
      return card.sensors.flatMap((id) => pick(id, (metric) => metric.name === card.metric));
    case 'metric':
      return pick(card.sensor, (metric) => metric.name === card.metric);
    default: {
      const sensor = sensors.find((item) => item.id === card.sensor)!;
      const fresh = sensor.metrics.filter((metric) => metric.active && metric.latest !== null && card.metrics.includes(metric.name));
      return mainMetrics(fresh).map((metric) => ({ sensor, metric }));
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

const toCard = ({ type, size, sensor, metric, sensors: ids, metrics: names, graph: shown, source }: Record<string, unknown>, sensors: Sensor[], devices: Device[]): Card | null => {
  if (size !== 'small' && size !== 'large') {
    return null;
  }

  const graph = shown !== false;

  switch (type) {
    case 'batteries': {
      // Batteries cards saved before sensors could be picked showed every battery.
      const list = members(ids ?? sensors.filter(hasBattery).map((item) => item.id), 'battery', 1, MAX_PER_CARD.batteries, sensors);
      return list && { type, size, sensor: null, metric: null, sensors: list };
    }
    case 'combined': {
      const list = typeof metric === 'string' && canCombine(metric) ? members(ids, metric, 2, MAX_PER_CARD.combined, sensors) : null;
      return list && { type, size, sensor: null, metric: metric as string, sensors: list, graph };
    }
    case 'sensor': {
      const found = sensors.find((item) => item.id === sensor);

      if (!found || metric !== null) {
        return null;
      }

      // No values means all of them: cards saved before values could be picked, or before the sensor had any. A battery saved with them is left out.
      const known = mainMetrics(found.metrics).map((item) => item.name);
      const list = [...new Set(Array.isArray(names) ? names : [])].filter((name) => known.includes(name));
      const limit = valueLimit(size, graph);
      return { type, size, sensor: found.id, metric, metrics: list.length ? (list.length > limit ? fitValues(list, limit) : list) : fitValues(sensorValues(found), limit), graph };
    }
    case 'metric': {
      // A battery card saved as a value card becomes a batteries card of that sensor.
      const list = metric === 'battery' ? members([sensor], 'battery', 1, 1, sensors) : null;
      return list
        ? { type: 'batteries', size, sensor: null, metric: null, sensors: list }
        : has(sensors, sensor, metric)
          ? { type, size, sensor: sensor as number, metric: metric as string, graph }
          : null;
    }
    case 'source':
      return devices.some((device) => device.id === source) ? { type, size, sensor: null, metric: null, source: source as number } : null;
    default:
      return null;
  }
};

export const toCards = (value: unknown, sensors: Sensor[], devices: Device[]): Card[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards = value.flatMap((card) => (typeof card === 'object' && card !== null ? (toCard(card, sensors, devices) ?? []) : []));
  return [...new Map(cards.map((card) => [cardKey(card), card])).values()];
};