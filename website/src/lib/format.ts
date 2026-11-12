const LOCALE = 'en-GB';
const relativeTime = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const formats = {
  date: new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }),
};

export const formatDate = (time: number | Date, format: keyof typeof formats) => formats[format].format(time);

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