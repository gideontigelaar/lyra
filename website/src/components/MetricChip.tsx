import { metricStyle } from '../lib/metrics';

export default function MetricChip({ metric, small = false }: { metric: string; small?: boolean }) {
  const style = metricStyle(metric);

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${small ? 'size-6' : 'size-8'}`}
      style={{ color: style.color, backgroundColor: `color-mix(in oklch, ${style.color} 15%, transparent)` }}
    >
      <style.icon weight="fill" className={small ? 'size-3.5' : 'size-4.5'} aria-label={style.label} />
    </span>
  );
}