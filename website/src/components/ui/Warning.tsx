import { WarningCircleIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

// Something that needs attention, marked like on Summary, so the page an alert there opens shows it too.
export default function Warning({ children }: { children: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-1 font-semibold text-warning">
      <WarningCircleIcon weight="fill" className="size-[1.15em] shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}