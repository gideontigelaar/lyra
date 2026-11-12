import { randomBytes } from 'node:crypto';
import { text } from 'node:stream/consumers';

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const now = () => Date.now();
const iso = (time) => new Date(time).toISOString().replace(/\.\d+Z$/, 'Z');

class Reply {
  constructor(status, body) {
    this.status = status;
    this.body = body;
  }
}

const fail = (status, error) => new Reply(status, { error });

let passkeys = [
  { id: 1, name: 'MacBook', created_at: iso(now() - 40 * DAY), last_used_at: iso(now() - 2 * HOUR), current: true },
  { id: 2, name: 'iPhone', created_at: iso(now() - 12 * DAY), last_used_at: null, current: false },
];

const routes = {
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