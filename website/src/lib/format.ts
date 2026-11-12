import { sameDay, startOfDay, timeZone } from './zone';

const LOCALE = 'en-GB';
const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const OPTIONS = {
  time: { hour: '2-digit', minute: '2-digit' },
  hour: { hour: '2-digit' },
  weekday: { weekday: 'short' },
  dayNumber: { day: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  dayLong: { weekday: 'short', day: 'numeric', month: 'short' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  dateLong: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  month: { month: 'short' },
  monthLetter: { month: 'narrow' },
  monthYear: { month: 'long', year: 'numeric' },
  monthShortYear: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

type Format = keyof typeof OPTIONS;

let formats: { zone: string; list: Partial<Record<Format, Intl.DateTimeFormat>> } = { zone: '', list: {} };

const formatter = (format: Format) => {
  if (formats.zone !== timeZone()) {
    formats = { zone: timeZone(), list: {} };
  }

  return (formats.list[format] ??= new Intl.DateTimeFormat(LOCALE, { ...OPTIONS[format], timeZone: formats.zone }));
};

export const formatDate = (time: number | Date, format: Format) => formatter(format).format(time);

export const formatDateRange = (from: number | Date, to: number | Date, format: Format) => formatter(format).formatRange(from, to);

export const formatNumber = (value: number, decimals: number) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

export const unitText = (unit: string) => (unit === '%' || unit.startsWith('°') ? unit : ` ${unit}`);

export const timeAgo = (iso: string, now: number) => {
  const minutes = Math.round((Date.parse(iso) - now) / 60000);

  if (minutes > -1) {
    return 'just now';
  }

  if (minutes > -60) {
    return relativeTime.format(minutes, 'minute');
  }

  const hours = Math.round(minutes / 60);
  return hours > -24 ? relativeTime.format(hours, 'hour') : relativeTime.format(Math.round(hours / 24), 'day');
};

export const clockTime = (iso: string, now: number) => {
  const time = Date.parse(iso);
  return sameDay(time, now) ? formatDate(time, 'time') : sameDay(time, startOfDay(now, -1)) ? 'Yesterday' : formatDate(time, 'day');
};

export const intervalText = (seconds: number) => (seconds < 3600 ? `Every ${seconds / 60} min` : seconds === 3600 ? 'Every hour' : `Every ${seconds / 3600} hours`);