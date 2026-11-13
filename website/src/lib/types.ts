export interface Latest {
  value: number;
  measured_at: string;
  // The reading 1 to 2 hours before, in the unit it's stored in, if there's one.
  hour_before: number | null;
}

export interface SensorMetric {
  name: string;
  unit: string;
  interval: number;
  active: boolean;
  latest: Latest | null;
  // How much it changed over the hour before the latest reading, in the unit it's stored in. Worked out when loading.
  change: number | null;
}

export interface Sensor {
  id: number;
  name: string;
  address: string;
  decoder: string;
  device: number | null;
  metrics: SensorMetric[];
  sinks: string[];
  // How many days its battery has left at the rate it dropped, or null while the API can't tell yet.
  battery_days_left: number | null;
  // From its latest temperature and humidity, when it doesn't record a dew point of its own. Worked out when loading.
  dewPoint: number | null;
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

// What happened to a source over the last 7 days.
interface Counts {
  restarts: number;
  wifi_reconnects: number;
  dropped: number;
}

export interface Device {
  id: number;
  name: string;
  active: boolean;
  last_seen_at: string | null;
  telemetry: Telemetry | null;
  telemetry_at: string | null;
  counts: Counts | null;
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

// A line under a card's value: the high and low of the last 24 hours, or the dew point.
export type Detail = 'range' | 'dew_point';

interface CardBase {
  size: 'small' | 'large';
  // Alone in its row, the card sits at the right end of it, where it was dropped.
  end?: true;
}

export type Card = CardBase &
  (
    | { type: 'metric'; sensor: number; metric: string; graph: boolean; detail: Detail | null }
    | { type: 'sensor'; sensor: number; metric: null; metrics: string[]; graph: boolean }
    | { type: 'combined'; sensor: null; metric: string; sensors: number[]; graph: boolean; detail: Detail | null }
    | { type: 'batteries'; sensor: null; metric: null; sensors: number[] }
    | { type: 'source'; sensor: null; metric: null; source: number }
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