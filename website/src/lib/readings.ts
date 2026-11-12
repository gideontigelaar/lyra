import { api } from './api';
import { timeZone } from './load';
import type { Bucketing, Point, ReadingsResponse } from './types';

export const fetchPoints = async (sensor: number, metric: string, from: number, to: number, bucket: Bucketing): Promise<Point[]> => {
  const query = new URLSearchParams({
    sensor: String(sensor),
    metric,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    tz: timeZone(),
    bucket,
  });
  const { readings } = await api<ReadingsResponse>(`/readings?${query}`);

  return readings.map((reading) =>
    'value' in reading
      ? { time: Date.parse(reading.time), min: reading.value, max: reading.value, avg: reading.value }
      : { time: Date.parse(reading.time), min: reading.min, max: reading.max, avg: reading.avg },
  );
};

export const rangeOf = (points: Point[]) => (points.length ? { min: Math.min(...points.map((point) => point.min)), max: Math.max(...points.map((point) => point.max)) } : null);