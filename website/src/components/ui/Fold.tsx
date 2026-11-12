import { CaretDownIcon } from '@phosphor-icons/react';
import { type ReactNode, useId, useState } from 'react';
import { group, pressable, row } from '../../lib/ui';

interface Props {
  title: string;
  hint: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

// A section that folds open and closed. The grid rows animate between 0fr and 1fr, which works in every current browser.
export default function Fold({ title, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <section className={`mt-6 ${group}`}>
      <h2>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={`${row} ${pressable}`}>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold">{title}</span>
            <span className="block truncate text-[13px] font-normal text-muted">{hint}</span>
          </span>
          <CaretDownIcon weight="bold" className={`size-4 shrink-0 text-muted transition-transform duration-300 ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h2>
      <div id={id} inert={!open} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-line bg-bg/50 p-3 sm:p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}