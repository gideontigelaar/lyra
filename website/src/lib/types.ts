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

export interface Device {
  id: number;
  name: string;
  active: boolean;
  last_seen_at: string | null;
  sensors: number[];
}

export interface Option {
  name: string;
  label: string;
}

export type Bucketing = 'raw' | 'hour' | 'day' | 'week' | 'month';

export interface ReadingsResponse {
  unit: string;
  bucket: Bucketing;
  readings: ({ time: string; value: number } | { time: string; avg: number; min: number; max: number })[];
}

export interface Point {
  time: number;
  min: number;
  max: number;
  avg: number;
}

export interface Passkey {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  current: boolean;
}