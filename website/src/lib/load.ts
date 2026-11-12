import { useEffect, useState } from 'react';
import { ApiError } from './api';

export const failure = (e: unknown) => {
  if (e instanceof ApiError && e.status === 401) {
    location.assign('/login/');
  }

  return e instanceof Error ? e.message : String(e);
};

export const useLoad = <T>(load: () => Promise<T>, deps: unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;

    load().then(
      (result) => {
        if (current) {
          setData(result);
          setError(null);
        }
      },
      (e) => current && setError(failure(e)),
    );

    return () => {
      current = false;
    };
  }, [...deps, version]);

  return { data, error, reload: () => setVersion((v) => v + 1) };
};