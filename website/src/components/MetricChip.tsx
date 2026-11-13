import type { Icon } from '@phosphor-icons/react';
import { metricStyle } from '../lib/metrics';

interface ChipProps {
  icon: Icon;
  color: string;
  // Without a label the chip only decorates text that already says what it is.
  label?: string;
  small?: boolean;
}

// An icon on a tint of its own colour.
export function Chip({ icon: Icon, color, label, small = false }: ChipProps) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg ${small ? 'size-6' : 'size-8'}`} style={{ color, backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)` }}>
      <Icon weight="fill" className={small ? 'size-3.5' : 'size-4.5'} aria-label={label} aria-hidden={label ? undefined : true} />
    </span>
  );
}

export default function MetricChip({ metric, small = false }: { metric: string; small?: boolean }) {
  const style = metricStyle(metric);
  return <Chip icon={style.icon} color={style.color} label={style.label} small={small} />;
}

// A value's icon without the tint, for values listed under a card's title, so the title's chip is the only one.
export function MetricIcon({ metric, className = '' }: { metric: string; className?: string }) {
  const { icon: Icon, color, label } = metricStyle(metric);
  return <Icon weight="fill" className={`shrink-0 ${className}`} style={{ color }} aria-label={label} />;
}