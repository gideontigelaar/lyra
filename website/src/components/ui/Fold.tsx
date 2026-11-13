import { CaretDownIcon } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { group, pressable, row } from '../../lib/ui';

interface Props {
  title: string;
  hint: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

const FOLD_MS = 300;

// A section that folds open and closed. The grid rows animate between 0fr and 1fr, which works in every current browser.
// Once it has folded, its content is hidden, so the page is only longer while it's open.
export default function Fold({ title, hint, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [folded, setFolded] = useState(!defaultOpen);
  const id = useId();

  useEffect(() => {
    if (open) {
      return;
    }

    const timer = setTimeout(() => setFolded(true), FOLD_MS);
    return () => clearTimeout(timer);
  }, [open]);

  const toggle = () => {
    setFolded(false);
    setOpen(!open);
  };

  return (
    <section className={`mt-6 ${group}`}>
      <h2>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className={`${row} ${pressable}`}>
          <span className="min-w-0 flex-1">
            <span className="block text-body font-semibold">{title}</span>
            <span className="block truncate text-footnote font-normal text-muted">{hint}</span>
          </span>
          <CaretDownIcon weight="bold" className={`size-4 shrink-0 text-muted transition-transform duration-300 ease-out ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h2>
      <div
        id={id}
        inert={!open}
        className={`transition-[grid-template-rows,opacity] duration-300 ease-out ${folded ? 'hidden' : 'grid'} ${open ? 'grid-rows-[1fr] starting:grid-rows-[0fr] starting:opacity-0' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-line bg-bg/50 p-3 sm:p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}