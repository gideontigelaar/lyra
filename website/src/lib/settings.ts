import { api } from './api';
import type { TemperatureUnit } from './units';
import { setTimeZone } from './zone';

export interface UserSettings {
  temperature_unit: TemperatureUnit;
  time_zone: string | null;
}

let settings: Promise<UserSettings> | undefined;

const use = (saved: UserSettings) => {
  setTimeZone(saved.time_zone);
  return saved;
};

export const loadSettings = () =>
  (settings ??= api<UserSettings>('/settings').then(use, (e) => {
    settings = undefined;
    throw e;
  }));

export const saveSettings = async (change: Partial<UserSettings>) => {
  await api('/settings', 'PATCH', change);
  const saved = use({ ...(await loadSettings()), ...change });
  settings = Promise.resolve(saved);
};