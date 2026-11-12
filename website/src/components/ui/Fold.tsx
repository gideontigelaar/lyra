import { CaretDownIcon } from '@phosphor-icons/react';
import { type ReactNode, useState } from 'react';
import { group, pressable, row } from '../../lib/ui';

interface Props {
  title: string;
  hint: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function Fold({ title, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={`group mt-6 ${group}`}>
      <summary className={`${row} ${pressable} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold">{title}</span>
          <span className="block truncate text-[13px] text-muted">{hint}</span>
        </span>
        <CaretDownIcon weight="bold" className="size-4 shrink-0 text-muted transition-transform duration-300 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line bg-bg/50 p-3 transition duration-300 ease-out starting:opacity-0 sm:p-4">{children}</div>
    </details>
  );
}