import { CaretLeftIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { goBack, pageState } from '../../lib/router';

interface Props {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}

// Back goes to the page this one was opened from, or else to the page above it.
export default function PageHeader({ title, subtitle, back, actions }: Props) {
  const from = pageState().trail.at(-1);
  const target = back && (from ? { href: from.href, label: from.title } : back);

  return (
    <div className="mb-5">
      {target && (
        <a
          href={target.href}
          onClick={(event) => {
            event.preventDefault();
            goBack(target.href);
          }}
          className="-ml-1.5 inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-full py-1 pr-2 text-[15px] text-accent transition-opacity hover:opacity-70"
        >
          <CaretLeftIcon className="size-4 shrink-0" weight="bold" aria-hidden="true" />
          <span className="truncate">{target.label}</span>
        </a>
      )}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight [overflow-wrap:anywhere] sm:text-[32px]">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {subtitle && <div className="mt-0.5 text-[15px] text-muted">{subtitle}</div>}
    </div>
  );
}