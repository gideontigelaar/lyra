import { mainMetrics, metricStyle } from './metrics';
import type { Card, Sensor, SensorMetric } from './types';

export const cardKey = (card: Card) =>
  card.type === 'combined' ? `combined:${[...card.sensors].sort((a, b) => a - b).join('+')}:${card.metric}` : `${card.type}:${card.sensor ?? ''}:${card.metric ?? ''}`;

export const cardHref = (card: Card) => (card.type === 'batteries' || card.type === 'combined' ? '/sensors/' : `/sensor/?id=${card.sensor}${card.type === 'metric' ? `&metric=${card.metric}` : ''}`);

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
      const fresh = pick(card.sensor, (metric) => metric.active && metric.latest !== null).map(({ metric }) => metric);
      const sensor = sensors.find((item) => item.id === card.sensor)!;
      return [...mainMetrics(fresh), ...fresh.filter((metric) => metric.name === 'battery')].map((metric) => ({ sensor, metric }));
    }
  }
};

export const defaultCards = (sensors: Sensor[]): Card[] => {
  const metrics = sensors.length === 1 ? mainMetrics(sensors[0].metrics.filter((metric) => metric.active)) : [];

  return metrics.length
    ? metrics.map((metric) => ({ type: 'metric', size: 'large', sensor: sensors[0].id, metric: metric.name }))
    : sensors.map((sensor) => ({ type: 'sensor', size: 'large', sensor: sensor.id, metric: null }));
};

const has = (sensors: Sensor[], id: unknown, metric: unknown) => sensors.some((sensor) => sensor.id === id && sensor.metrics.some((item) => item.name === metric));

const fits = (card: Record<string, unknown>, sensors: Sensor[]) => {
  if (card.size !== 'small' && card.size !== 'large') {
    return false;
  }

  switch (card.type) {
    case 'batteries':
      return card.sensor === null && card.metric === null;
    case 'combined':
      return typeof card.metric === 'string' && canCombine(card.metric) && Array.isArray(card.sensors) && new Set(card.sensors).size >= 2 && card.sensors.every((id) => has(sensors, id, card.metric));
    case 'sensor':
      return card.metric === null && sensors.some((sensor) => sensor.id === card.sensor);
    default:
      return card.type === 'metric' && has(sensors, card.sensor, card.metric);
  }
};

export const toCards = (value: unknown, sensors: Sensor[]): Card[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards = value
    .filter((card) => typeof card === 'object' && card !== null && fits(card, sensors))
    .map(
      ({ type, size, sensor, metric, sensors: ids }) => (type === 'combined' ? { type, size, sensor: null, metric, sensors: [...new Set(ids as number[])] } : { type, size, sensor, metric }) as Card,
    );

  return [...new Map(cards.map((card) => [cardKey(card), card])).values()];
};