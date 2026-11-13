import { type Icon, WifiHighIcon, WifiLowIcon, WifiMediumIcon, WifiNoneIcon } from '@phosphor-icons/react';
import { formatNumber } from './format';

// How a source's own health reads, on Summary and under Diagnostics.
const REASONS: Record<string, string> = {
  unknown: 'Unknown',
  power_on: 'Power on',
  external: 'Reset pin',
  software: 'Restarted by the firmware',
  panic: 'Crash',
  interrupt_watchdog: 'Watchdog (interrupt)',
  task_watchdog: 'Watchdog (task)',
  watchdog: 'Watchdog',
  deep_sleep: 'Woke from deep sleep',
  brownout: 'Brownout (low voltage)',
  sdio: 'SDIO',
  usb: 'USB',
  jtag: 'JTAG',
  efuse: 'eFuse error',
  power_glitch: 'Power glitch',
  cpu_lockup: 'CPU lockup',
};

export const restartReason = (reason: string) => REASONS[reason] ?? reason;

export const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days} d ${hours} h` : hours ? `${hours} h ${minutes} min` : `${minutes} min`;
};

export const kilobytes = (bytes: number) => `${formatNumber(bytes / 1024, 0)} KB`;

const SIGNALS: [number, string, Icon][] = [
  [-60, 'Strong', WifiHighIcon],
  [-70, 'Good', WifiMediumIcon],
  [-80, 'Weak', WifiLowIcon],
  [-Infinity, 'Very weak', WifiNoneIcon],
];

export const signal = (rssi: number) => {
  const [, label, icon] = SIGNALS.find(([floor]) => rssi >= floor)!;
  return { label, icon };
};

export const dbm = (rssi: number) => `${formatNumber(rssi, 0)} dBm`;