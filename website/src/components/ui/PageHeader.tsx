import { CaretLeftIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, back, actions }: Props) {
  return (
    <div className="mb-6">
      <div className="flex min-h-9 items-center justify-between gap-3">
        {back ? (
          <a href={back.href} className="-ml-1.5 inline-flex min-w-0 items-center gap-0.5 rounded-full py-1 pr-2 text-[17px] text-accent hover:opacity-70">
            <CaretLeftIcon className="size-5 shrink-0" weight="bold" aria-hidden="true" />
            <span className="truncate">{back.label}</span>
          </a>
        ) : (
          <span />
        )}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      <h1 className="mt-1 text-[34px] leading-tight font-bold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
      {subtitle && <div className="mt-0.5 text-[15px] text-muted">{subtitle}</div>}
    </div>
  );
}