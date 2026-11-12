// Sample data for the demo and `npm run dev`. It lives in the browser, always ends a few minutes ago, and resets on reload.
import { ApiError } from './api';
import { timeZone } from './zone';

type Body = Record<string, any>;
type Handler = (input: { id: number; body: Body; query: URLSearchParams }) => unknown;

interface DemoMetric {
  name: string;
  interval: number;
  active: boolean;
}

interface DemoSensor {
  id: number;
  name: string;
  address: string;
  decoder: string;
  device: number | null;
  since: number;
  metrics: DemoMetric[];
  sinks: string[];
  climate?: { temperature: number; humidity: number; outside?: boolean };
}

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const now = () => Date.now();
const iso = (time: number) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const units: Record<string, string> = { temperature: '°C', humidity: '%', battery: '%', voltage: 'V' };
const metric = (name: string, interval: number): DemoMetric => ({ name, interval, active: true });

const health = (uptime: number, rssi: number, temperature: number) => ({
  uptime,
  boots: 3,
  reset_reason: 'power_on',
  rssi,
  wifi_reconnects: 0,
  free_heap: 186400,
  min_free_heap: 158200,
  largest_block: 114688,
  temperature,
  pending: 0,
  dropped: 0,
  build: 'Nov 9 2026 20:14:05',
});

const devices: { id: number; name: string; active: boolean; added: boolean; telemetry?: ReturnType<typeof health> }[] = [
  { id: 1, name: 'Living room gateway', active: true, added: false, telemetry: health(268200, -58, 41.5) },
  { id: 2, name: 'Balcony gateway', active: true, added: false, telemetry: health(181500, -64, 38.2) },
];

const sensors: DemoSensor[] = [
  {
    id: 1,
    name: 'Bedroom',
    address: 'A4:C1:38:2A:EF:13',
    decoder: 'bthome',
    device: 1,
    since: 400,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600), metric('voltage', 3600)],
    sinks: ['lyra'],
    climate: { temperature: 19.4, humidity: 54 },
  },
  {
    id: 2,
    name: 'Living room sofa',
    address: 'A4:C1:38:5B:10:7E',
    decoder: 'bthome',
    device: 1,
    since: 400,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600)],
    sinks: ['lyra'],
    climate: { temperature: 21.2, humidity: 49 },
  },
  {
    id: 3,
    name: 'Living room window',
    address: 'A4:C1:38:6D:2E:B1',
    decoder: 'bthome',
    device: 1,
    since: 400,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600)],
    sinks: ['lyra'],
    climate: { temperature: 20.5, humidity: 51 },
  },
  {
    id: 4,
    name: 'Balcony',
    address: 'A4:C1:38:91:0C:44',
    decoder: 'bthome',
    device: 2,
    since: 400,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600)],
    sinks: ['lyra'],
    climate: { temperature: 13, humidity: 64, outside: true },
  },
];

const deleted = new Map<string, { from: number; to: number }[]>();
let dashboard: unknown = [
  { type: 'combined', size: 'large', sensor: null, metric: 'temperature', sensors: [2, 3] },
  { type: 'sensor', size: 'large', sensor: 1, metric: null },
  { type: 'metric', size: 'small', sensor: 4, metric: 'temperature' },
  { type: 'metric', size: 'small', sensor: 4, metric: 'humidity' },
  { type: 'batteries', size: 'large', sensor: null, metric: null, sensors: [1, 2, 3, 4] },
];
let settings = { temperature_unit: 'celsius', time_zone: null };
let passkeys = [
  { id: 1, name: 'MacBook', created_at: iso(now() - 40 * DAY), last_used_at: iso(now() - 2 * HOUR), current: true },
  { id: 2, name: 'iPhone', created_at: iso(now() - 12 * DAY), last_used_at: iso(now() - 3 * DAY), current: false },
];
let sessions = [
  { id: 1, user_agent: navigator.userAgent, passkey: 'MacBook', created_at: iso(now() - 2 * HOUR), last_used_at: iso(now()), current: true },
  {
    id: 2,
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    passkey: 'iPhone',
    created_at: iso(now() - 3 * DAY),
    last_used_at: iso(now() - 5 * HOUR),
    current: false,
  },
];

// Repeatable pseudo-random number from 0 to 1.
const random = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Smooth noise from -1 to 1 that changes over about one period.
const drift = (time: number, period: number, seed: number) => {
  const t = time / period;
  const i = Math.floor(t);
  const u = (t - i) ** 2 * (3 - 2 * (t - i));
  return (random(i + seed * 7919) * (1 - u) + random(i + 1 + seed * 7919) * u) * 2 - 1;
};

// A value over the day, eased between [hour, value] points that start at 0 and end at 24.
const daily = (hour: number, points: [number, number][]) => {
  const next = points.findIndex(([at]) => at > hour);
  const [h0, v0] = points[next - 1];
  const [h1, v1] = points[next];
  const f = (hour - h0) / (h1 - h0);
  return v0 + (v1 - v0) * f * f * (3 - 2 * f);
};

// Heating comes on before 7, stays up in the evening and goes down at night.
const HEATING: [number, number][] = [
  [0, -0.6],
  [5, -1.1],
  [6.5, -1.1],
  [8, 0.2],
  [12, 0],
  [15, 0.3],
  [18, 0.5],
  [22.5, 0.4],
  [24, -0.6],
];
const BEDROOM: [number, number][] = [
  [0, 0.3],
  [6.5, 0.1],
  [8, -0.5],
  [13, -0.7],
  [18, -0.3],
  [21.5, 0],
  [23, 0.4],
  [24, 0.3],
];
const OUTSIDE: [number, number][] = [
  [0, -0.4],
  [6, -1],
  [9, -0.3],
  [14.5, 1],
  [18, 0.4],
  [21, -0.1],
  [24, -0.4],
];
const SUN: [number, number][] = [
  [0, 0],
  [11, 0],
  [14, 1],
  [16, 0.7],
  [19, 0],
  [24, 0],
];
const SLEEP: [number, number][] = [
  [0, 4],
  [7, 5],
  [8.5, 0],
  [22.5, 0],
  [23.5, 3],
  [24, 4],
];

const value = (sensor: DemoSensor, name: string, time: number) => {
  const local = time + offsetAt(timeZone(), time);
  const hour = (((local % DAY) + DAY) % DAY) / HOUR;
  const day = Math.floor(local / DAY);
  const season = Math.sin((2 * Math.PI * (((time / DAY) % 365.25) - 106)) / 365.25);
  const weather = drift(time, 2.5 * DAY, 1);
  const cloud = (drift(time, 0.8 * DAY, 2) + 1) / 2;
  const { temperature: base, humidity: wet, outside = false } = sensor.climate ?? { temperature: 20, humidity: 50 };
  const seed = sensor.id * 31;
  const outdoor = 10.3 + 7.4 * season + 3 * weather + (2.5 + 3 * (1 - cloud)) * daily(hour, OUTSIDE);

  // Some mornings a window is opened for a while.
  const opened = 7.5 + 3 * random(day * 13 + seed);
  const airing = random(day * 7 + seed) > 0.75 && hour >= opened ? Math.exp(-(hour - opened) / 0.6) : 0;
  // Most evenings there's cooking.
  const cooking = random(day * 11 + seed) > 0.35 && hour >= 18 ? Math.exp(-(hour - 18) / 0.8) * Math.min(1, (hour - 18) * 4) : 0;

  const indoor =
    base +
    0.8 * season +
    0.35 * weather +
    daily(hour, sensor.id === 1 ? BEDROOM : HEATING) +
    (sensor.id === 3 ? 0.9 * (1 - cloud) * daily(hour, SUN) : 0) -
    1.6 * airing +
    0.15 * drift(time, 3 * HOUR, seed) +
    0.05 * drift(time, 25 * MINUTE, seed + 1);
  const temperature = outside ? outdoor + 0.3 * drift(time, 2 * HOUR, seed) + 0.1 * drift(time, 20 * MINUTE, seed + 1) : indoor;

  switch (name) {
    case 'temperature':
      return +temperature.toFixed(2);
    case 'humidity': {
      const humidity = outside
        ? 78 - 4 * (outdoor - 10.3 - 7.4 * season - 3 * weather) + 8 * drift(time, 1.5 * DAY, 5) + 6 * cloud
        : wet - 2 * (indoor - base) - 4 * season + 4 * weather + (sensor.id === 1 ? daily(hour, SLEEP) : 0) + (sensor.id === 2 ? 8 * cooking : 0) - 6 * airing + 1.2 * drift(time, 2 * HOUR, seed + 2);
      return +Math.min(Math.max(humidity, 25), 99).toFixed(1);
    }
    case 'battery':
      return Math.round(100 - ((time - (now() - sensor.since * DAY)) / DAY) * (0.02 + 0.012 * sensor.id) - (outside && temperature < 5 ? 2 : 0));
    default:
      return +(2.55 + 0.0055 * (100 - ((time - (now() - sensor.since * DAY)) / DAY) * (0.02 + 0.012 * sensor.id)) + 0.004 * drift(time, 6 * HOUR, seed)).toFixed(3);
  }
};

const readings = (sensor: DemoSensor, item: DemoMetric, from: number, to: number) => {
  const ranges = deleted.get(`${sensor.id}:${item.name}`) ?? [];
  const step = item.interval * 1000;
  const first = Math.max(from, now() - sensor.since * DAY);
  const last = Math.min(to, now());
  const list: { time: number; value: number }[] = [];

  for (let time = Math.ceil(first / step) * step; time < last; time += step) {
    if (!ranges.some((range) => time >= range.from && time < range.to)) {
      list.push({ time, value: value(sensor, item.name, time) });
    }
  }

  return list;
};

const offsets = new Map<string, number>();

const offsetAt = (zone: string, time: number) => {
  const hour = `${zone}:${Math.floor(time / HOUR)}`;

  if (!offsets.has(hour)) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
        .formatToParts(time)
        .map((part) => [part.type, Number(part.value)]),
    );
    offsets.set(hour, Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(time / MINUTE) * MINUTE);
  }

  return offsets.get(hour)!;
};

const bucketStart = (bucket: string, zone: string, time: number) => {
  const offset = offsetAt(zone, time);
  const local = new Date(time + offset);
  const [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()];
  const start =
    bucket === 'hour' ? time + offset - ((time + offset) % HOUR) : bucket === 'day' ? Date.UTC(y, m, d) : bucket === 'week' ? Date.UTC(y, m, d - ((local.getUTCDay() + 6) % 7)) : Date.UTC(y, m, 1);
  return start - offsetAt(zone, start - offset);
};

const findSensor = (id: unknown) => sensors.find((sensor) => sensor.id === Number(id));

const sensorJson = (sensor: DemoSensor) => ({
  ...sensor,
  metrics: sensor.metrics.map((item) => {
    const latest = readings(sensor, item, now() - item.interval * 2000, now()).at(-1);
    return { ...item, unit: units[item.name], latest: latest ? { value: latest.value, measured_at: iso(latest.time) } : null };
  }),
});

const listReadings: Handler = ({ query }) => {
  const sensor = findSensor(query.get('sensor'));
  const item = sensor?.metrics.find((entry) => entry.name === query.get('metric'));

  if (!sensor || !item) {
    throw new ApiError(400, 'unknown sensor or metric');
  }

  const bucket = query.get('bucket') ?? 'raw';
  const zone = query.get('tz') ?? 'UTC';
  const list = readings(sensor, item, Date.parse(query.get('from')!), Date.parse(query.get('to')!));

  if (bucket === 'raw') {
    return { unit: units[item.name], bucket, readings: list.map((reading) => ({ time: iso(reading.time), value: reading.value })) };
  }

  const buckets = new Map<number, { total: number; count: number; min: number; max: number }>();

  for (const reading of list) {
    const start = bucketStart(bucket, zone, reading.time);
    const entry = buckets.get(start) ?? { total: 0, count: 0, min: Infinity, max: -Infinity };
    entry.total += reading.value;
    entry.count += 1;
    entry.min = Math.min(entry.min, reading.value);
    entry.max = Math.max(entry.max, reading.value);
    buckets.set(start, entry);
  }

  return { unit: units[item.name], bucket, readings: [...buckets].map(([time, entry]) => ({ time: iso(time), avg: +(entry.total / entry.count).toFixed(3), min: entry.min, max: entry.max })) };
};

const deleteReadings: Handler = ({ body }) => {
  const sensor = findSensor(body.sensor);
  const item = sensor?.metrics.find((entry) => entry.name === body.metric);

  if (!sensor || !item) {
    throw new ApiError(400, 'unknown sensor or metric');
  }

  let count = 0;

  for (const range of body.ranges as { from: string; to: string }[]) {
    const [from, to] = [Date.parse(range.from), Date.parse(range.to)];
    count += readings(sensor, item, from, to).length;
    deleted.set(`${sensor.id}:${item.name}`, [...(deleted.get(`${sensor.id}:${item.name}`) ?? []), { from, to }]);
  }

  return { deleted: count };
};

const routes: Record<string, Handler> = {
  'GET /sensors': () => ({ sensors: sensors.map(sensorJson) }),
  'POST /sensors': ({ body }) => {
    const id = Math.max(0, ...sensors.map((sensor) => sensor.id)) + 1;
    sensors.push({ id, name: body.name, address: body.address.toUpperCase(), decoder: body.decoder, device: body.device, since: 0, metrics: [], sinks: ['lyra'] });
    return { id };
  },
  'PATCH /sensors/{id}': ({ id, body }) => {
    const sensor = findSensor(id);

    if (!sensor) {
      throw new ApiError(404, 'not found');
    }

    Object.assign(sensor, 'name' in body ? { name: body.name } : {}, 'device' in body ? { device: body.device } : {}, 'sinks' in body ? { sinks: body.sinks } : {});

    for (const [name, change] of Object.entries(body.metrics ?? {})) {
      Object.assign(sensor.metrics.find((item) => item.name === name) ?? {}, change);
    }
  },
  'DELETE /sensors/{id}': ({ id }) => {
    sensors.splice(
      sensors.findIndex((sensor) => sensor.id === id),
      1,
    );
  },
  'GET /devices': () => ({
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      active: device.active,
      last_seen_at: device.added ? null : iso(now() - 20000 - device.id * 9000),
      telemetry: device.telemetry ?? null,
      telemetry_at: device.telemetry ? iso(now() - 60000 * device.id) : null,
      sensors: sensors.filter((sensor) => sensor.device === device.id).map((sensor) => sensor.id),
    })),
  }),
  'POST /devices': ({ body }) => {
    const id = Math.max(0, ...devices.map((device) => device.id)) + 1;
    devices.push({ id, name: body.name, active: true, added: true });
    return { id, key: key() };
  },
  'PATCH /devices/{id}': ({ id, body }) => {
    Object.assign(devices.find((device) => device.id === id) ?? {}, body);
  },
  'POST /devices/{id}/key': () => ({ key: key() }),
  'DELETE /devices/{id}': ({ id }) => {
    devices.splice(
      devices.findIndex((device) => device.id === id),
      1,
    );
    sensors.filter((sensor) => sensor.device === id).forEach((sensor) => (sensor.device = null));
  },
  'GET /decoders': () => ({ decoders: [{ name: 'bthome', label: 'BTHome' }] }),
  'GET /sinks': () => ({ sinks: [{ name: 'lyra', label: 'Lyra' }] }),
  'GET /readings': listReadings,
  'DELETE /readings': deleteReadings,
  'GET /dashboard': () => ({ cards: dashboard }),
  'PUT /dashboard': ({ body }) => ({ cards: (dashboard = body.cards) }),
  'DELETE /dashboard': () => {
    dashboard = null;
  },
  'GET /settings': () => settings,
  'PATCH /settings': ({ body }) => {
    settings = { ...settings, ...body };
  },
  'GET /passkeys': () => ({ passkeys }),
  'POST /passkeys/options': () => {
    throw new ApiError(403, "Passkeys can't be added in the demo.");
  },
  'DELETE /passkeys/{id}': ({ id }) => {
    const name = passkeys.find((passkey) => passkey.id === id)?.name;
    passkeys = passkeys.filter((passkey) => passkey.id !== id);
    sessions = sessions.filter((session) => session.passkey !== name);
  },
  'GET /sessions': () => ({ sessions }),
  'DELETE /sessions/{id}': ({ id }) => {
    sessions = sessions.filter((session) => session.id !== id);
  },
  'GET /auth/setup': () => ({ available: false }),
  'POST /auth/logout': () => undefined,
};

export const demoRequest = async (method: string, path: string, body?: object) => {
  const url = new URL(path, 'https://demo.invalid');
  const route = routes[`${method} ${url.pathname.replace(/\/\d+(?=\/|$)/, '/{id}')}`];

  if (!route) {
    throw new ApiError(404, 'not found');
  }

  return route({ id: Number(url.pathname.match(/\d+/)?.[0]), body: structuredClone(body ?? {}) as Body, query: url.searchParams });
};