import type { Device, SensorMetric } from './types';

const ONLINE_MS = 15 * 60000;

export const isOnline = (device: Device, now: number) => device.active && device.last_seen_at !== null && now - Date.parse(device.last_seen_at) < ONLINE_MS;

export const isFresh = (metric: SensorMetric, now: number) => metric.latest !== null && now - Date.parse(metric.latest.measured_at) < Math.max(metric.interval * 2000, 30 * 60000);