const API_URL = import.meta.env.DEV ? '/api' : 'https://api.gideontigelaar.com/lyra';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const api = async <T = void>(path: string, method = 'GET', body?: object): Promise<T> => {
  const response = await fetch(API_URL + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? response.statusText);
  }

  return response.status === 204 ? (undefined as T) : response.json();
};