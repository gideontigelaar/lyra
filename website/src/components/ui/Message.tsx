interface Props {
  error?: string | null;
  loading?: boolean;
}

export default function Message({ error, loading }: Props) {
  if (error) {
    return (
      <p className="py-2 text-[15px] text-danger" role="alert">
        {error}
      </p>
    );
  }

  return loading ? <p className="py-2 text-[15px] text-muted">Loading…</p> : null;
}