import { api } from './api';
import { loadSettings } from './settings';
import type { Sensor, SensorMetric } from './types';
import { converter } from './units';

type Loaded = Omit<Sensor, 'metrics' | 'dewPoint'> & { metrics: Omit<SensorMetric, 'change'>[] };

const HALF_HOUR = 1800000;

// The Magnus formula with Sonntag's constants, within 0.35°C from -45°C to 60°C.
const dewPoint = (celsius: number, humidity: number) => {
  const gamma = Math.log(humidity / 100) + (17.62 * celsius) / (243.12 + celsius);
  return (243.12 * gamma) / (17.62 - gamma);
};

// A sensor with a temperature in °C and a humidity has a dew point, unless it records one of its own.
export const hasDewPoint = (sensor: { metrics: { name: string; unit: string; active: boolean }[] }) =>
  sensor.metrics.some((metric) => metric.name === 'temperature' && metric.unit === '°C' && metric.active) &&
  sensor.metrics.some((metric) => metric.name === 'humidity' && metric.active) &&
  !sensor.metrics.some((metric) => metric.name === 'dew_point');

export const loadSensors = async (): Promise<Sensor[]> => {
  const [{ sensors }, { temperature_unit }] = await Promise.all([api<{ sensors: Loaded[] }>('/sensors'), loadSettings()]);
  const celsius = converter('°C', temperature_unit).convert;

  return sensors.map((sensor) => {
    const latest = (name: string) => sensor.metrics.find((metric) => metric.name === name)?.latest;
    const [temperature, humidity] = [latest('temperature'), latest('humidity')];
    // Readings within half an hour of each other go together.
    const together = temperature && humidity && humidity.value > 0 && Math.abs(Date.parse(temperature.measured_at) - Date.parse(humidity.measured_at)) < HALF_HOUR;

    return {
      ...sensor,
      dewPoint: hasDewPoint(sensor) && together ? celsius(dewPoint(temperature.value, humidity.value)) : null,
      metrics: sensor.metrics.map((metric) => {
        const { unit, convert } = converter(metric.unit, temperature_unit);
        const change = metric.latest && metric.latest.hour_before !== null ? metric.latest.value - metric.latest.hour_before : null;
        return { ...metric, unit, change, latest: metric.latest && { ...metric.latest, value: convert(metric.latest.value) } };
      }),
    };
  });
};