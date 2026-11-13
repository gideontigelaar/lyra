import { formatDate, formatDateRange, timeRange } from './format';
import type { Bucketing } from './types';
import { offsetAt, sameDay, startOfDay, wall, zoned } from './zone';

export const PERIODS = ['H', 'D', 'W', 'M', '6M', 'Y'] as const;

export type PeriodId = (typeof PERIODS)[number];

export interface Tick {
  time: number;
  label: string;
}

interface Period {
  label: string;
  bucket: Bucketing;
  start: (date: Date) => Date;
  shift: (start: Date, steps: number) => Date;
  slots: (start: Date, end: Date) => number[];
  ticks: (start: Date, end: Date) => Tick[];
  title: (start: Date, end: Date, now: Date) => string;
  slotTitle: (slot: number, next: number) => string;
}

const HOUR = 3600000;

const monday = (date: Date) => startOfDay(date, -((wall(date).weekday + 6) % 7));

const month = (date: Date, offset = 0) => {
  const { year, month } = wall(date);
  return zoned(year, month + offset);
};

const each = (start: Date, end: Date, next: (date: Date) => Date) => {
  const times: number[] = [];

  for (let date = start; date < end; date = next(date)) {
    times.push(date.getTime());
  }

  return times;
};

const hours = (start: Date, end: Date) => each(start, end, (date) => new Date(date.getTime() + HOUR));

const days = (start: Date, end: Date) => each(start, end, (date) => startOfDay(date, 1));

export const periods: Record<PeriodId, Period> = {
  H: {
    label: 'Hour',
    bucket: 'raw',
    start: (date) => new Date(date.getTime() - ((date.getTime() + offsetAt(date.getTime())) % HOUR)),
    shift: (start, steps) => new Date(start.getTime() + steps * HOUR),
    slots: () => [],
    ticks: (start) => [0, 15, 30, 45].map((minutes) => ({ time: start.getTime() + minutes * 60000, label: formatDate(start.getTime() + minutes * 60000, 'time') })),
    title: (start, end) => `${formatDate(start, 'dayLong')}, ${timeRange(start, end)}`,
    slotTitle: (slot) => formatDate(slot, 'time'),
  },
  D: {
    label: 'Day',
    bucket: 'hour',
    start: (date) => startOfDay(date),
    shift: (start, steps) => startOfDay(start, steps),
    slots: hours,
    ticks: (start) => {
      const { year, month, day } = wall(start);
      return [0, 6, 12, 18].map((hour) => zoned(year, month, day, hour)).map((date) => ({ time: date.getTime(), label: formatDate(date, 'hour') }));
    },
    title: (start, _, now) => (sameDay(start, now) ? 'Today' : sameDay(start, startOfDay(now, -1)) ? 'Yesterday' : formatDate(start, 'dateLong')),
    slotTitle: (slot, next) => timeRange(slot, next),
  },
  W: {
    label: 'Week',
    bucket: 'hour',
    start: monday,
    shift: (start, steps) => startOfDay(start, steps * 7),
    slots: hours,
    ticks: (start, end) => days(start, end).map((time) => ({ time, label: formatDate(time, 'weekday') })),
    title: (start, end) => formatDateRange(start, startOfDay(end, -1), 'date'),
    slotTitle: (slot, next) => `${formatDate(slot, 'dayLong')}, ${timeRange(slot, next)}`,
  },
  M: {
    label: 'Month',
    bucket: 'day',
    start: (date) => month(date),
    shift: (start, steps) => month(start, steps),
    slots: days,
    ticks: (start, end) =>
      days(start, end)
        .filter((time) => [1, 8, 15, 22, 29].includes(wall(time).day))
        .map((time) => ({ time, label: formatDate(time, 'dayNumber') })),
    title: (start) => formatDate(start, 'monthYear'),
    slotTitle: (slot) => formatDate(slot, 'dayLong'),
  },
  '6M': {
    label: '6 months',
    bucket: 'day',
    start: (date) => startOfDay(monday(date), -175),
    shift: (start, steps) => startOfDay(start, steps * 182),
    slots: days,
    ticks: (start, end) => each(month(start, 1), end, (date) => month(date, 1)).map((time) => ({ time, label: formatDate(time, 'month') })),
    title: (start, end) => formatDateRange(start, startOfDay(end, -1), 'monthShortYear'),
    slotTitle: (slot) => formatDate(slot, 'dateLong'),
  },
  Y: {
    label: 'Year',
    bucket: 'day',
    start: (date) => zoned(wall(date).year, 0),
    shift: (start, steps) => zoned(wall(start).year + steps, 0),
    slots: days,
    ticks: (start, end) => each(start, end, (date) => month(date, 1)).map((time) => ({ time, label: formatDate(time, 'monthLetter') })),
    title: (start) => formatDate(start, 'year'),
    slotTitle: (slot) => formatDate(slot, 'dayLong'),
  },
};

export const isPeriod = (value: unknown): value is PeriodId => PERIODS.includes(value as PeriodId);