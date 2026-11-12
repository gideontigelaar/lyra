import { isDemo } from './session';

const API_URL = 'https://api.gideontigelaar.com/lyra';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const failed = async (response: Response) => {
  const data = await response.json().catch(() => null);
  return new ApiError(response.status, data?.error ?? response.statusText);
};

const request = async <T>(path: string, method: string, body?: object): Promise<T> => {
  if (isDemo()) {
    const { demoRequest } = await import('./demo');
    return (await demoRequest(method, path, body)) as T;
  }

  const response = await fetch(API_URL + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw await failed(response);
  }

  return response.status === 204 ? (undefined as T) : response.json();
};

// A response that isn't JSON, like a backup. Never cached.
export const apiText = async (path: string): Promise<string> => {
  if (isDemo()) {
    const { demoRequest } = await import('./demo');
    return String(await demoRequest('GET', path));
  }

  const response = await fetch(API_URL + path, { credentials: 'include' });

  if (!response.ok) {
    throw await failed(response);
  }

  return response.text();
};

// Short-lived cache of reads, so moving between pages is instant. Any change clears it.
const FRESH_MS = 15000;
const reads = new Map<string, { time: number; data: Promise<unknown> }>();

export const api = <T = void>(path: string, method = 'GET', body?: object): Promise<T> => {
  if (method !== 'GET') {
    reads.clear();
    return request<T>(path, method, body);
  }

  const cached = reads.get(path);

  if (cached && Date.now() - cached.time < FRESH_MS) {
    return cached.data as Promise<T>;
  }

  const data = request<T>(path, method);
  reads.set(path, { time: Date.now(), data });
  data.catch(() => reads.delete(path));
  return data;
};