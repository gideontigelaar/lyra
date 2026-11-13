import { formatNumber, unitText } from '../lib/format';
import { metricStyle } from '../lib/metrics';

interface Props {
  metric: string;
  value: number | null;
  unit: string;
  size?: 'small' | 'medium' | 'large' | 'huge' | 'giant';
}

const SIZES = { small: 'text-lg', medium: 'text-title-2', large: 'text-title-1', huge: 'text-4xl', giant: 'text-5xl' };

export default function MetricValue({ metric, value, unit, size = 'large' }: Props) {
  if (value === null) {
    return <span className="text-subheadline text-muted">No data</span>;
  }

  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={`leading-none font-semibold tracking-tight ${SIZES[size]}`}>{formatNumber(value, metricStyle(metric).decimals)}</span>
      <span className={`font-semibold text-muted ${size === 'giant' ? 'text-xl' : 'text-subheadline'}`}>{unitText(unit)}</span>
    </span>
  );
}