import { api } from './api';
import type { Bucketing, Point, ReadingsResponse } from './types';
import { displayUnit } from './units';
import { timeZone } from './zone';

export const fetchPoints = async (sensor: number, metric: string, from: number, to: number, bucket: Bucketing): Promise<Point[]> => {
  const query = new URLSearchParams({
    sensor: String(sensor),
    metric,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    tz: timeZone(),
    bucket,
  });
  const { unit, readings } = await api<ReadingsResponse>(`/readings?${query}`);
  const { convert } = await displayUnit(unit);

  return readings.map((reading) =>
    'value' in reading
      ? { time: Date.parse(reading.time), min: convert(reading.value), max: convert(reading.value), avg: convert(reading.value) }
      : { time: Date.parse(reading.time), min: convert(reading.min), max: convert(reading.max), avg: convert(reading.avg) },
  );
};

export const rangeOf = (points: Point[]) => (points.length ? { min: Math.min(...points.map((point) => point.min)), max: Math.max(...points.map((point) => point.max)) } : null);