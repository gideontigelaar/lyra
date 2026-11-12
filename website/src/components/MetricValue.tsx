import { formatNumber, unitText } from '../lib/format';
import { metricStyle } from '../lib/metrics';

interface Props {
  metric: string;
  value: number | null;
  unit: string;
  size?: 'small' | 'large';
}

export default function MetricValue({ metric, value, unit, size = 'large' }: Props) {
  if (value === null) {
    return <span className="text-[15px] text-muted">No data</span>;
  }

  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={size === 'large' ? 'text-[28px] leading-none font-semibold tracking-tight' : 'text-[20px] leading-none font-semibold'}>{formatNumber(value, metricStyle(metric).decimals)}</span>
      <span className="text-[15px] font-semibold text-muted">{unitText(unit)}</span>
    </span>
  );
}