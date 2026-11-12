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

// A battery drawn as one, filled as far as it's charged. Its height comes from the class.
export function BatteryShape({ level, low, className }: { level: number; low: boolean; className: string }) {
  return (
    <span className={`flex items-center gap-0.5 ${className}`} aria-hidden="true">
      <span className="h-full flex-1 rounded-xl border-2 border-line p-0.5">
        <span
          className="block h-full rounded-[0.5rem] transition-[width] duration-500"
          style={{ width: `${Math.min(Math.max(level, 0), 100)}%`, background: low ? 'var(--status-warning)' : metricStyle('battery').color }}
        />
      </span>
      <span className="h-2/5 w-1 rounded-r-sm bg-line" />
    </span>
  );
}