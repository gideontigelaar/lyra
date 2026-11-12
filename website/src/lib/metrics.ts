import { BatteryHighIcon, DropHalfBottomIcon, DropIcon, GaugeIcon, type Icon, LightningIcon, SunIcon, ThermometerSimpleIcon, WindIcon } from '@phosphor-icons/react';
import type { Sensor } from './types';

interface MetricStyle {
  label: string;
  decimals: number;
  color: string;
  icon: Icon;
  role?: 'status' | 'detail';
}

const styles: Record<string, MetricStyle> = {
  temperature: { label: 'Temperature', decimals: 1, color: 'var(--metric-temperature)', icon: ThermometerSimpleIcon },
  humidity: { label: 'Humidity', decimals: 0, color: 'var(--metric-humidity)', icon: DropIcon },
  battery: { label: 'Battery', decimals: 0, color: 'var(--metric-battery)', icon: BatteryHighIcon, role: 'status' },
  voltage: { label: 'Battery voltage', decimals: 2, color: 'var(--metric-voltage)', icon: LightningIcon, role: 'detail' },
  pressure: { label: 'Pressure', decimals: 1, color: 'var(--metric-other)', icon: GaugeIcon },
  illuminance: { label: 'Light', decimals: 0, color: 'var(--metric-other)', icon: SunIcon },
  dew_point: { label: 'Dew point', decimals: 1, color: 'var(--metric-other)', icon: DropHalfBottomIcon },
  co2: { label: 'CO₂', decimals: 0, color: 'var(--metric-other)', icon: WindIcon },
};

const order = Object.keys(styles);

export const metricStyle = (metric: string): MetricStyle =>
  styles[metric] ?? {
    label: metric.charAt(0).toUpperCase() + metric.slice(1).replace(/_/g, ' '),
    decimals: 1,
    color: 'var(--metric-other)',
    icon: GaugeIcon,
  };

export const sortMetrics = <T extends { name: string }>(metrics: T[]) => [...metrics].sort((a, b) => (order.indexOf(a.name) + 1 || order.length + 1) - (order.indexOf(b.name) + 1 || order.length + 1));

export const LOW_BATTERY = 20;

const withRole = <T extends { name: string }>(metrics: T[], keep: (role: MetricStyle['role']) => boolean) => sortMetrics(metrics.filter((metric) => keep(metricStyle(metric.name).role)));

export const mainMetrics = <T extends { name: string }>(metrics: T[]) => withRole(metrics, (role) => role === undefined);

export const dataMetrics = <T extends { name: string }>(metrics: T[]) => withRole(metrics, (role) => role !== 'detail');

export const detailMetrics = <T extends { name: string }>(metrics: T[]) => withRole(metrics, (role) => role === 'detail');

const battery = (sensor: Sensor) => sensor.metrics.find((metric) => metric.name === 'battery' && metric.active);

export const hasBattery = (sensor: Sensor) => battery(sensor) !== undefined;

export const batteryLevel = (sensor: Sensor) => battery(sensor)?.latest?.value ?? null;

export const lowBattery = (sensor: Sensor) => {
  const level = batteryLevel(sensor);
  return level !== null && level <= LOW_BATTERY ? level : null;
};