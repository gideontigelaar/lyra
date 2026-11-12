import { api } from './api';
import { loadSettings } from './settings';
import type { Sensor } from './types';
import { converter } from './units';

export const loadSensors = async (): Promise<Sensor[]> => {
  const [{ sensors }, { temperature_unit }] = await Promise.all([api<{ sensors: Sensor[] }>('/sensors'), loadSettings()]);

  return sensors.map((sensor) => ({
    ...sensor,
    metrics: sensor.metrics.map((metric) => {
      const { unit, convert } = converter(metric.unit, temperature_unit);
      return { ...metric, unit, latest: metric.latest && { ...metric.latest, value: convert(metric.latest.value) } };
    }),
  }));
};