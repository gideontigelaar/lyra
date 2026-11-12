import { metricStyle } from '../lib/metrics';

// A battery level as a bar that's filled that far, in the warning colour when it's low.
export default function BatteryFill({ level, low, className }: { level: number; low: boolean; className: string }) {
  return (
    <span className={`overflow-hidden rounded-full bg-fill ${className}`} aria-hidden="true">
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(Math.max(level, 0), 100)}%`, background: low ? 'var(--status-warning)' : metricStyle('battery').color }}
      />
    </span>
  );
}