import { mainMetrics } from './metrics';
import type { Card, Sensor } from './types';

export const cardKey = (card: Card) => `${card.type}:${card.sensor ?? ''}:${card.metric ?? ''}`;

export const cardHref = (card: Card) => (card.type === 'batteries' ? '/sensors/' : `/sensor/?id=${card.sensor}${card.type === 'metric' ? `&metric=${card.metric}` : ''}`);

export const sparkKey = (sensor: number, metric: string) => `${sensor}:${metric}`;

export const cardMetrics = (card: Card, sensors: Sensor[]) => {
  const sensor = sensors.find((item) => item.id === card.sensor);

  if (!sensor || card.type === 'batteries') {
    return [];
  }

  return card.type === 'metric' ? sensor.metrics.filter((metric) => metric.name === card.metric) : mainMetrics(sensor.metrics.filter((metric) => metric.active && metric.latest));
};

export const defaultCards = (sensors: Sensor[]): Card[] => {
  const metrics = sensors.length === 1 ? mainMetrics(sensors[0].metrics.filter((metric) => metric.active)) : [];

  return metrics.length
    ? metrics.map((metric) => ({ type: 'metric', size: 'large', sensor: sensors[0].id, metric: metric.name, graph: true }))
    : sensors.map((sensor) => ({ type: 'sensor', size: 'large', sensor: sensor.id, metric: null, graph: true }));
};

const fits = (card: Record<string, unknown>, sensors: Sensor[]) =>
  (card.size === 'small' || card.size === 'large') &&
  (card.type === 'batteries'
    ? card.sensor === null && card.metric === null
    : sensors.some((sensor) => sensor.id === card.sensor && (card.type === 'sensor' ? card.metric === null : card.type === 'metric' && sensor.metrics.some((metric) => metric.name === card.metric))));

export const toCards = (value: unknown, sensors: Sensor[]): Card[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const cards = value
    .filter((card) => typeof card === 'object' && card !== null && fits(card, sensors))
    .map(({ type, size, sensor, metric, graph }) => (type === 'batteries' ? { type, size, sensor, metric } : { type, size, sensor, metric, graph: graph !== false }) as Card);

  return [...new Map(cards.map((card) => [cardKey(card), card])).values()];
};