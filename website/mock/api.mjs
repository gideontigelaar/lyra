import { randomBytes } from 'node:crypto';
import { text } from 'node:stream/consumers';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365.25 * DAY;
const now = () => Date.now();
const iso = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');

class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

const fail = (status, error) => new Reply(status, { error });

const units = { temperature: '°C', humidity: '%', battery: '%', voltage: 'V' };
const metric = (name, interval) => ({ name, interval, active: true });

const devices = [
  { id: 1, name: 'XIAO-ESP32C6-01', active: true, seen: () => now() - 25000 },
  { id: 2, name: 'XIAO-ESP32C6-02', active: true, seen: () => now() - 3 * DAY },
];

const sensors = [
  {
    id: 1,
    name: 'Bedroom',
    address: 'A4:C1:38:2A:EF:13',
    decoder: 'bthome',
    device: 1,
    since: 400,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600), metric('voltage', 3600)],
    sinks: ['lyra'],
  },
  {
    id: 2,
    name: 'Living room',
    address: 'A4:C1:38:5B:10:7E',
    decoder: 'bthome',
    device: 1,
    since: 120,
    drain: 0.7,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600)],
    sinks: ['lyra'],
  },
  {
    id: 3,
    name: 'Balcony',
    address: 'A4:C1:38:91:0C:44',
    decoder: 'bthome',
    device: 2,
    since: 60,
    metrics: [metric('temperature', 900), metric('humidity', 900), metric('battery', 3600)],
    sinks: ['lyra'],
  },
];

const deleted = new Map();
let dashboard = null;
let settings = { temperature_unit: 'celsius' };
let passkeys = [
  { id: 1, name: 'MacBook', created_at: iso(now() - 40 * DAY), last_used_at: iso(now() - 2 * HOUR), current: true },
  { id: 2, name: 'iPhone', created_at: iso(now() - 12 * DAY), last_used_at: null, current: false },
];

const noise = (seed) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

const value = (sensor, name, time) => {
  const day = (time / DAY) % 1;
  const season = Math.sin(2 * Math.PI * (time / YEAR - 0.2));
  const jitter = noise(time / 900000 + sensor.id * 7919 + name.length * 104729);
  const age = (time - (now() - sensor.since * DAY)) / DAY;

  return {
    temperature: () => +(19.5 + sensor.id * 0.9 - (sensor.id === 3 ? 9 : 0) + 2 * Math.sin(2 * Math.PI * (day - 0.55)) + 3 * season + 0.25 * jitter).toFixed(2),
    humidity: () => +(55 - sensor.id * 3 + 7 * Math.sin(2 * Math.PI * (day + 0.1)) - 6 * season + 1.5 * jitter).toFixed(1),
    battery: () => Math.max(5, Math.round(100 - age * (sensor.drain ?? 0.05) - sensor.id * 2)),
    voltage: () => +(2.65 + Math.max(5, 100 - age * (sensor.drain ?? 0.05)) * 0.0045 + 0.01 * jitter).toFixed(3),
  }[name]();
};

const lastTime = (sensor) => (sensor.device === 2 ? devices[1].seen() : now());

const readings = (sensor, metric, from, to) => {
  const ranges = deleted.get(`${sensor.id}:${metric.name}`) ?? [];
  const step = metric.interval * 1000;
  const first = Math.max(from, now() - sensor.since * DAY);
  const last = Math.min(to, lastTime(sensor));
  const list = [];

  for (let time = Math.ceil(first / step) * step; time < last; time += step) {
    if (!ranges.some((range) => time >= range.from && time < range.to)) {
      list.push({ time, value: value(sensor, metric.name, time) });
    }
  }

  return list;
};

const formats = new Map();

const offsetAt = (tz, time) => {
  formats.has(tz) || formats.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  const parts = Object.fromEntries(
    formats
      .get(tz)
      .formatToParts(time)
      .map((part) => [part.type, +part.value]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(time / MINUTE) * MINUTE;
};

const bucketStart = (bucket, tz, time) => {
  const offset = offsetAt(tz, time);
  const local = new Date(time + offset);
  const [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()];
  const key = {
    hour: time + offset - ((time + offset) % HOUR),
    day: Date.UTC(y, m, d),
    week: Date.UTC(y, m, d - ((local.getUTCDay() + 6) % 7)),
    month: Date.UTC(y, m, 1),
  }[bucket];
  return key - offsetAt(tz, key - offset);
};

const findSensor = (id) => sensors.find((sensor) => sensor.id === Number(id));

const sensorJson = (sensor) => ({
  id: sensor.id,
  name: sensor.name,
  address: sensor.address,
  decoder: sensor.decoder,
  device: sensor.device,
  metrics: sensor.metrics.map((metric) => {
    const [latest] = readings(sensor, metric, lastTime(sensor) - metric.interval * 2000, now()).slice(-1);
    return { ...metric, unit: units[metric.name], latest: latest ? { value: latest.value, measured_at: iso(latest.time) } : null };
  }),
  sinks: sensor.sinks,
});

const listReadings = ({ query }) => {
  const sensor = findSensor(query.get('sensor'));
  const metric = sensor?.metrics.find((item) => item.name === query.get('metric'));

  if (!metric) {
    return fail(400, 'unknown sensor or metric');
  }

  const bucket = query.get('bucket') ?? 'raw';
  const tz = query.get('tz') ?? 'UTC';
  const list = readings(sensor, metric, Date.parse(query.get('from')), Date.parse(query.get('to')));

  if (bucket === 'raw') {
    return { unit: units[metric.name], bucket, readings: list.map((reading) => ({ time: iso(reading.time), value: reading.value })) };
  }

  const buckets = new Map();

  for (const reading of list) {
    const key = bucketStart(bucket, tz, reading.time);
    const item = buckets.get(key) ?? { total: 0, count: 0, min: Infinity, max: -Infinity };
    item.total += reading.value;
    item.count += 1;
    item.min = Math.min(item.min, reading.value);
    item.max = Math.max(item.max, reading.value);
    buckets.set(key, item);
  }

  return {
    unit: units[metric.name],
    bucket,
    readings: [...buckets].map(([time, item]) => ({ time: iso(time), avg: +(item.total / item.count).toFixed(3), min: item.min, max: item.max })),
  };
};

const deleteReadings = ({ body }) => {
  const sensor = findSensor(body.sensor);
  const metric = sensor?.metrics.find((item) => item.name === body.metric);

  if (!metric) {
    return fail(400, 'unknown sensor or metric');
  }

  const key = `${sensor.id}:${metric.name}`;
  let count = 0;

  for (const range of body.ranges) {
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    count += readings(sensor, metric, from, to).length;
    deleted.set(key, [...(deleted.get(key) ?? []), { from, to }]);
  }

  return { deleted: count };
};

const routes = {
  'GET /sensors': () => ({ sensors: sensors.map(sensorJson) }),
  'POST /sensors': ({ body }) => {
    const id = Math.max(0, ...sensors.map((sensor) => sensor.id)) + 1;
    sensors.push({ id, name: body.name, address: body.address.toUpperCase(), decoder: body.decoder, device: body.device, since: 0, metrics: [], sinks: ['lyra'] });
    return new Reply(201, { id });
  },
  'PATCH /sensors/{id}': ({ id, body }) => {
    const sensor = findSensor(id) ?? null;

    if (!sensor) {
      return fail(404, 'not found');
    }

    Object.assign(sensor, 'name' in body ? { name: body.name } : {}, 'device' in body ? { device: body.device } : {}, 'sinks' in body ? { sinks: body.sinks } : {});

    for (const [name, change] of Object.entries(body.metrics ?? {})) {
      Object.assign(sensor.metrics.find((metric) => metric.name === name) ?? {}, change);
    }

    return null;
  },
  'DELETE /sensors/{id}': ({ id }) => {
    sensors.splice(sensors.indexOf(findSensor(id)), 1);
    return null;
  },
  'GET /devices': () => ({
    devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      active: device.active,
      last_seen_at: device.seen ? iso(device.seen()) : null,
      sensors: sensors.filter((sensor) => sensor.device === device.id).map((sensor) => sensor.id),
    })),
  }),
  'POST /devices': ({ body }) => {
    const id = Math.max(0, ...devices.map((device) => device.id)) + 1;
    devices.push({ id, name: body.name, active: true, seen: null });
    return new Reply(201, { id, key: randomBytes(32).toString('hex') });
  },
  'PATCH /devices/{id}': ({ id, body }) => {
    Object.assign(devices.find((device) => device.id === Number(id)) ?? {}, body);
    return null;
  },
  'POST /devices/{id}/key': () => ({ key: randomBytes(32).toString('hex') }),
  'DELETE /devices/{id}': ({ id }) => {
    devices.splice(
      devices.findIndex((device) => device.id === Number(id)),
      1,
    );
    sensors.filter((sensor) => sensor.device === Number(id)).forEach((sensor) => (sensor.device = null));
    return null;
  },
  'GET /decoders': () => ({ decoders: [{ name: 'bthome', label: 'BTHome' }] }),
  'GET /sinks': () => ({ sinks: [{ name: 'lyra', label: 'Lyra' }] }),
  'GET /readings': listReadings,
  'DELETE /readings': deleteReadings,
  'GET /dashboard': () => ({ cards: dashboard }),
  'PUT /dashboard': ({ body }) => {
    dashboard = body.cards;
    return { cards: dashboard };
  },
  'DELETE /dashboard': () => {
    dashboard = null;
    return null;
  },
  'GET /settings': () => settings,
  'PATCH /settings': ({ body }) => {
    settings = { temperature_unit: body.temperature_unit };
    return null;
  },
  'GET /passkeys': () => ({ passkeys }),
  'POST /passkeys/options': () => ({
    rp: { name: 'Lyra', id: 'localhost' },
    user: { id: randomBytes(32).toString('base64url'), name: 'Lyra', displayName: 'Lyra' },
    challenge: randomBytes(32).toString('base64url'),
    pubKeyCredParams: [-8, -7, -257].map((alg) => ({ type: 'public-key', alg })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestation: 'none',
  }),
  'POST /passkeys': ({ body }) => {
    const id = Math.max(0, ...passkeys.map((passkey) => passkey.id)) + 1;
    passkeys.push({ id, name: body.name.trim(), created_at: iso(now()), last_used_at: null, current: false });
    return new Reply(201, { id });
  },
  'DELETE /passkeys/{id}': ({ id }) => {
    passkeys = passkeys.filter((passkey) => passkey.id !== Number(id));
    return null;
  },
  'POST /auth/logout': () => null,
};

export default function mockApi() {
  return {
    name: 'mock-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const ids = url.pathname.match(/\d+/g) ?? [];
        const route = routes[`${req.method} ${url.pathname.replace(/\/\d+(?=\/|$)/g, '/{id}')}`];
        const input = await text(req);
        const result = route ? route({ query: url.searchParams, body: input && JSON.parse(input), id: ids[0] }) : fail(404, 'not found');
        const { status, body } = result instanceof Reply ? result : { status: result === null ? 204 : 200, body: result };
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(status === 204 ? undefined : JSON.stringify(body));
      });
    },
  };
}