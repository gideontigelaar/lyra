import { formatDate, formatDateRange, sameDay } from './format';
import type { Bucketing } from './types';

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

const day = (date: Date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

const monday = (date: Date) => day(date, -((date.getDay() + 6) % 7));

const each = (start: Date, end: Date, next: (date: Date) => Date) => {
  const times: number[] = [];

  for (let date = start; date < end; date = next(date)) {
    times.push(date.getTime());
  }

  return times;
};

const hours = (start: Date, end: Date) => each(start, end, (date) => new Date(date.getTime() + HOUR));

const days = (start: Date, end: Date) => each(start, end, (date) => day(date, 1));

export const periods: Record<PeriodId, Period> = {
  H: {
    label: 'Hour',
    bucket: 'raw',
    start: (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()),
    shift: (start, steps) => new Date(start.getTime() + steps * HOUR),
    slots: () => [],
    ticks: (start) => [0, 15, 30, 45].map((minutes) => ({ time: start.getTime() + minutes * 60000, label: formatDate(start.getTime() + minutes * 60000, 'time') })),
    title: (start, end) => `${formatDate(start, 'dayLong')}, ${formatDateRange(start, end, 'time')}`,
    slotTitle: (slot) => formatDate(slot, 'time'),
  },
  D: {
    label: 'Day',
    bucket: 'hour',
    start: (date) => day(date),
    shift: (start, steps) => day(start, steps),
    slots: hours,
    ticks: (start) => [0, 6, 12, 18].map((hour) => new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour)).map((date) => ({ time: date.getTime(), label: formatDate(date, 'hour') })),
    title: (start, _, now) => (sameDay(start, now) ? 'Today' : sameDay(start, day(now, -1)) ? 'Yesterday' : formatDate(start, 'dateLong')),
    slotTitle: (slot, next) => formatDateRange(slot, next, 'time'),
  },
  W: {
    label: 'Week',
    bucket: 'hour',
    start: monday,
    shift: (start, steps) => day(start, steps * 7),
    slots: hours,
    ticks: (start, end) => days(start, end).map((time) => ({ time, label: formatDate(time, 'weekday') })),
    title: (start, end) => formatDateRange(start, day(end, -1), 'date'),
    slotTitle: (slot, next) => `${formatDate(slot, 'dayLong')}, ${formatDateRange(slot, next, 'time')}`,
  },
  M: {
    label: 'Month',
    bucket: 'day',
    start: (date) => new Date(date.getFullYear(), date.getMonth(), 1),
    shift: (start, steps) => new Date(start.getFullYear(), start.getMonth() + steps, 1),
    slots: days,
    ticks: (start, end) =>
      days(start, end)
        .filter((time) => [1, 8, 15, 22, 29].includes(new Date(time).getDate()))
        .map((time) => ({ time, label: formatDate(time, 'dayNumber') })),
    title: (start) => formatDate(start, 'monthYear'),
    slotTitle: (slot) => formatDate(slot, 'dayLong'),
  },
  '6M': {
    label: '6 months',
    bucket: 'day',
    start: (date) => day(monday(date), -175),
    shift: (start, steps) => day(start, steps * 182),
    slots: days,
    ticks: (start, end) =>
      each(new Date(start.getFullYear(), start.getMonth() + 1, 1), end, (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1)).map((time) => ({ time, label: formatDate(time, 'month') })),
    title: (start, end) => formatDateRange(start, day(end, -1), 'monthShortYear'),
    slotTitle: (slot) => formatDate(slot, 'dateLong'),
  },
  Y: {
    label: 'Year',
    bucket: 'day',
    start: (date) => new Date(date.getFullYear(), 0, 1),
    shift: (start, steps) => new Date(start.getFullYear() + steps, 0, 1),
    slots: days,
    ticks: (start, end) => each(start, end, (date) => new Date(date.getFullYear(), date.getMonth() + 1, 1)).map((time) => ({ time, label: formatDate(time, 'monthLetter') })),
    title: (start) => formatDate(start, 'year'),
    slotTitle: (slot) => formatDate(slot, 'dayLong'),
  },
};

export const isPeriod = (value: unknown): value is PeriodId => PERIODS.includes(value as PeriodId);