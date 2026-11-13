import { useEffect } from 'react';
import { showError } from '../../lib/toast';

interface Props {
  error?: string | null;
  loading?: boolean;
}

// Errors show as floating alerts. In the page there's only a placeholder while loading, or when loading failed.
export default function Message({ error, loading }: Props) {
  useEffect(() => {
    if (error) {
      showError(error);
    }
  }, [error]);

  if (!loading) {
    return null;
  }

  return error ? (
    <p className="py-2 text-subheadline text-muted">Couldn't load this page.</p>
  ) : (
    <p className="py-2 text-subheadline text-muted transition-opacity delay-300 duration-300 starting:opacity-0">Loading…</p>
  );
}