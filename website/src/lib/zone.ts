const MINUTE = 60000;
const DAY = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const clocks = new Map<string, Intl.DateTimeFormat>();

const clock = (timeZone: string) => {
  let format = clocks.get(timeZone);

  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    clocks.set(timeZone, format);
  }

  return format;
};

let zone = browserZone();

export const timeZone = () => zone;

// A saved zone the browser doesn't know falls back to the browser's own.
export const setTimeZone = (saved: string | null) => {
  try {
    zone = saved ? (clock(saved), saved) : browserZone();
  } catch {
    zone = browserZone();
  }
};

/** Calendar fields of a moment in a time zone, months counted from 0 like Date. */
export const wall = (time: number | Date, timeZone = zone) => {
  const parts: Record<string, string> = {};

  for (const { type, value } of clock(timeZone).formatToParts(time)) {
    parts[type] = value;
  }

  return { year: Number(parts.year), month: Number(parts.month) - 1, day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), weekday: WEEKDAYS.indexOf(parts.weekday) };
};

export const offsetAt = (time: number, timeZone = zone) => {
  const { year, month, day, hour, minute } = wall(time, timeZone);
  return Date.UTC(year, month, day, hour, minute) - Math.floor(time / MINUTE) * MINUTE;
};

/** The moment a wall-clock time happens in the chosen zone. Like Date, a time skipped by a clock change moves forward and a repeated one takes the first. */
export const zoned = (year: number, month: number, day = 1, hour = 0, minute = 0) => {
  const local = Date.UTC(year, month, day, hour, minute);
  const before = offsetAt(local - DAY);
  const after = offsetAt(local + DAY);

  if (before === after) {
    return new Date(local - before);
  }

  const times = [local - before, local - after].filter((time) => time + offsetAt(time) === local);
  return new Date(times.length ? Math.min(...times) : local - before);
};

export const startOfDay = (time: number | Date, days = 0) => {
  const { year, month, day } = wall(time);
  return zoned(year, month, day + days);
};

export const sameDay = (a: number | Date, b: number | Date) => {
  const [x, y] = [wall(a), wall(b)];
  return x.year === y.year && x.month === y.month && x.day === y.day;
};