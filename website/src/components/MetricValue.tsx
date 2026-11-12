import { formatNumber, unitText } from '../lib/format';
import { metricStyle } from '../lib/metrics';

interface Props {
  metric: string;
  value: number | null;
  unit: string;
  size?: 'small' | 'medium' | 'large' | 'huge';
}

const SIZES = { small: 'text-[18px]', medium: 'text-[22px]', large: 'text-[28px]', huge: 'text-[36px]' };

export default function MetricValue({ metric, value, unit, size = 'large' }: Props) {
  if (value === null) {
    return <span className="text-[15px] text-muted">No data</span>;
  }

  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={`leading-none font-semibold tracking-tight ${SIZES[size]}`}>{formatNumber(value, metricStyle(metric).decimals)}</span>
      <span className="text-[15px] font-semibold text-muted">{unitText(unit)}</span>
    </span>
  );
}