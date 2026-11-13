// A battery level as a bar that's filled that far, in the warning colour when it's low.
export default function BatteryFill({ level, low, className }: { level: number; low: boolean; className: string }) {
  return (
    <span className={`overflow-hidden rounded-full bg-fill ${className}`} aria-hidden="true">
      <span className={`block h-full rounded-full transition-[width] duration-500 ${low ? 'bg-warning' : 'bg-(--metric-battery)'}`} style={{ width: `${Math.min(Math.max(level, 0), 100)}%` }} />
    </span>
  );
}

// A battery drawn as one, filled as far as it's charged. It's a drawing, so every size has the same shape: the class only sets its height.
export function BatteryShape({ level, low, className }: { level: number; low: boolean; className: string }) {
  const width = (38 * Math.min(Math.max(level, 0), 100)) / 100;

  return (
    <svg viewBox="0 0 50 24" className={`w-auto shrink-0 ${className}`} aria-hidden="true">
      <rect x={1} y={1} width={44} height={22} rx={6} fill="none" strokeWidth={2} className="stroke-line" />
      <rect x={4} y={4} width={width} height={16} rx={3.5} className={`transition-[width] duration-500 ${low ? 'fill-warning' : 'fill-(--metric-battery)'}`} style={{ width }} />
      <rect x={47} y={8} width={3} height={8} rx={1.5} className="fill-line" />
    </svg>
  );
}