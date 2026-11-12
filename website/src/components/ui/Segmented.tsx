interface Props<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  text?: (value: T) => string;
  compact?: boolean;
}

export default function Segmented<T extends string>({ label, options, value, onChange, text = (option) => option, compact = false }: Props<T>) {
  return (
    <div role="group" aria-label={label} className={`${compact ? 'inline-flex shrink-0' : 'flex'} rounded-full bg-fill p-0.5`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className="flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition duration-200 ease-out aria-pressed:bg-surface aria-pressed:shadow-sm dark:aria-pressed:bg-navy-700"
        >
          {text(option)}
        </button>
      ))}
    </div>
  );
}