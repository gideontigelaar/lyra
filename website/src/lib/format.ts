const LOCALE = 'en-GB';
const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const formats = {
  time: new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }),
  hour: new Intl.DateTimeFormat(LOCALE, { hour: '2-digit' }),
  weekday: new Intl.DateTimeFormat(LOCALE, { weekday: 'short' }),
  dayNumber: new Intl.DateTimeFormat(LOCALE, { day: 'numeric' }),
  day: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }),
  dayLong: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }),
  date: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
  dateLong: new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  month: new Intl.DateTimeFormat(LOCALE, { month: 'short' }),
  monthLetter: new Intl.DateTimeFormat(LOCALE, { month: 'narrow' }),
  monthYear: new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric' }),
  monthShortYear: new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }),
  year: new Intl.DateTimeFormat(LOCALE, { year: 'numeric' }),
};

export const formatDate = (time: number | Date, format: keyof typeof formats) => formats[format].format(time);

export const formatDateRange = (from: number | Date, to: number | Date, format: keyof typeof formats) => formats[format].formatRange(from, to);

export const formatNumber = (value: number, decimals: number) => new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);

export const unitText = (unit: string) => (unit === '%' || unit.startsWith('°') ? unit : ` ${unit}`);

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

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
  const time = new Date(iso);
  const today = new Date(now);

  if (sameDay(time, today)) {
    return formatDate(time, 'time');
  }

  today.setDate(today.getDate() - 1);
  return sameDay(time, today) ? 'Yesterday' : formatDate(time, 'day');
};

export const intervalText = (seconds: number) => (seconds < 3600 ? `Every ${seconds / 60} min` : seconds === 3600 ? 'Every hour' : `Every ${seconds / 3600} hours`);