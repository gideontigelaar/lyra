import type { CSSProperties } from 'react';
import { formatNumber, unitText } from '../lib/format';
import { metricStyle } from '../lib/metrics';

type Size = 'small' | 'medium' | 'large' | 'huge' | 'giant';

interface Props {
  metric: string;
  value: number | null;
  unit: string;
  size?: Size;
  // Shrinks the number until the value fits the nearest container, for spots where a long value like 1,014.9 hPa wouldn't.
  fit?: boolean;
}

// Each size's class, and its variable for the most a fitting value may take.
const SIZES: Record<Size, [string, string]> = {
  small: ['text-lg', '--text-lg'],
  medium: ['text-title-2', '--text-title-2'],
  large: ['text-title-1', '--text-title-1'],
  huge: ['text-4xl', '--text-4xl'],
  giant: ['text-5xl', '--text-5xl'],
};

// A little more than the system font's semibold digits and marks take, in em, and the unit's letters at their own size.
const numberWidth = (text: string) => [...text].reduce((sum, char) => sum + (/\d/.test(char) ? 0.66 : char === '-' ? 0.7 : 0.25), 0);
const unitWidth = (text: string) => [...text].reduce((sum, char) => sum + (char === ' ' ? 0.27 : char === '%' ? 1 : 0.66), 0);

export default function MetricValue({ metric, value, unit, size = 'large', fit = false }: Props) {
  if (value === null) {
    return <span className="text-subheadline text-muted">No Data</span>;
  }

  const number = formatNumber(value, metricStyle(metric).decimals);
  const units = unitText(unit);
  const unitSize = size === 'giant' ? 20 : 15;
  // Never larger than its size, and no smaller than 12px.
  const style = fit ? ({ '--fit': `clamp(0.75rem, calc((100cqw - ${Math.ceil(unitWidth(units) * unitSize)}px) / ${numberWidth(number)}), var(${SIZES[size][1]}))` } as CSSProperties) : undefined;

  return (
    <span className="whitespace-nowrap tabular-nums" style={style}>
      <span className={`leading-none font-semibold tracking-tight ${fit ? 'text-(length:--fit)' : SIZES[size][0]}`}>{number}</span>
      <span className={`font-semibold text-muted ${size === 'giant' ? 'text-xl' : 'text-subheadline'}`}>{units}</span>
    </span>
  );
}