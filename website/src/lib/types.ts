export interface Latest {
  value: number;
  measured_at: string;
}

export interface SensorMetric {
  name: string;
  unit: string;
  interval: number;
  active: boolean;
  latest: Latest | null;
}

export interface Sensor {
  id: number;
  name: string;
  address: string;
  decoder: string;
  device: number | null;
  metrics: SensorMetric[];
  sinks: string[];
}

export interface Telemetry {
  uptime?: number;
  boots?: number;
  reset_reason?: string;
  rssi?: number;
  wifi_reconnects?: number;
  free_heap?: number;
  min_free_heap?: number;
  largest_block?: number;
  temperature?: number;
  pending?: number;
  dropped?: number;
  build?: string;
}

export interface Device {
  id: number;
  name: string;
  active: boolean;
  last_seen_at: string | null;
  telemetry: Telemetry | null;
  telemetry_at: string | null;
  sensors: number[];
}

export interface Option {
  name: string;
  label: string;
}

export type Bucketing = 'raw' | 'hour' | 'day' | 'week' | 'month';

export type Reading = { time: string; value: number } | { time: string; avg: number; min: number; max: number };

export interface ReadingsResponse {
  unit: string;
  bucket: Bucketing;
  readings: Reading[];
  // The nearest reading or bucket on each side of the range, if there's one within as long again.
  before: Reading | null;
  after: Reading | null;
}

export interface Point {
  time: number;
  min: number;
  max: number;
  avg: number;
}

interface CardBase {
  size: 'small' | 'large';
}

export type Card = CardBase &
  (
    | { type: 'metric'; sensor: number; metric: string; graph: boolean }
    | { type: 'sensor'; sensor: number; metric: null; metrics: string[]; graph: boolean }
    | { type: 'combined'; sensor: null; metric: string; sensors: number[]; graph: boolean }
    | { type: 'batteries'; sensor: null; metric: null; sensors: number[] }
  );

export interface Passkey {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  current: boolean;
}

export interface Session {
  id: number;
  user_agent: string | null;
  passkey: string;
  created_at: string;
  last_used_at: string;
  current: boolean;
}