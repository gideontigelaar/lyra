import { sameDay, startOfDay, timeZone } from './zone';

const LOCALE = 'en-GB';
const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const list = new Intl.ListFormat(LOCALE, { type: 'conjunction' });
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

// Like Bedroom, Kitchen and Office.
export const formatList = (items: string[]) => list.format(items);

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

// Roughly how long a battery lasts, like "About 8 months".
export const aboutDays = (days: number) => {
  const [count, unit] =
    days < 14 ? [Math.max(1, Math.round(days)), 'day'] : days < 61 ? [Math.round(days / 7), 'week'] : days < 730 ? [Math.round(days / 30.44), 'month'] : [Math.round(days / 365.25), 'year'];
  return `About ${count} ${unit}${count === 1 ? '' : 's'}`;
};

// How often a value is saved, in the largest whole unit, like "15 minutes" or "1 day", as iOS lists its Auto-Lock times.
export const intervalText = (seconds: number) => {
  const [count, unit] = seconds % 86400 === 0 ? [seconds / 86400, 'day'] : seconds % 3600 === 0 ? [seconds / 3600, 'hour'] : seconds % 60 === 0 ? [seconds / 60, 'minute'] : [seconds, 'second'];
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
};