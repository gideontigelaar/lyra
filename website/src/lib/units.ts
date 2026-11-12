import { loadSettings } from './settings';

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;

export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export const converter = (unit: string, temperature: TemperatureUnit) =>
  unit === '°C' && temperature === 'fahrenheit' ? { unit: '°F', convert: (value: number) => value * 1.8 + 32 } : { unit, convert: (value: number) => value };

export const displayUnit = async (unit: string) => converter(unit, (await loadSettings()).temperature_unit);