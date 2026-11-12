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

const QUARTER = 900000;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

// Several sensors' points as one line: per time, the average of the sensors that have a value then.
// Single readings of different sensors rarely share a time, so those are averaged per quarter of an hour.
export const averagePoints = (lists: Point[][]): Point[] => {
  if (lists.length === 1) {
    return lists[0];
  }

  const raw = lists.flat().every((point) => point.min === point.max);
  const times = new Map<number, Point[]>();
  lists.flat().forEach((point) => {
    const time = raw ? Math.floor(point.time / QUARTER) * QUARTER : point.time;
    times.set(time, [...(times.get(time) ?? []), point]);
  });

  return [...times]
    .sort(([a], [b]) => a - b)
    .map(([time, points]) => ({ time, min: mean(points.map((point) => point.min)), max: mean(points.map((point) => point.max)), avg: mean(points.map((point) => point.avg)) }));
};