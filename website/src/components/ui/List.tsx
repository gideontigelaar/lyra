import { CaretRightIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { group, pressable, row, sectionTitle } from '../../lib/ui';

interface SectionProps {
  title?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function Section({ title, action, footer, children }: SectionProps) {
  return (
    <section className="mt-6 first:mt-0">
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          {title && <h2 className={sectionTitle}>{title}</h2>}
          {action}
        </div>
      )}
      <div className={`${group} divide-y divide-line`}>{children}</div>
      {footer && <div className="mt-2 px-4 text-footnote text-muted">{footer}</div>}
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Row({ label, icon, detail, trailing, href, onClick, danger, disabled }: RowProps) {
  const content = (
    <>
      {icon}
      <span className={`min-w-0 flex-1 text-body ${danger ? 'text-danger' : ''}`}>{label}</span>
      {detail && <span className="min-w-0 shrink truncate text-right text-body text-muted">{detail}</span>}
      {trailing}
      {(href || (onClick && !danger)) && <CaretRightIcon className="size-4 shrink-0 text-muted/70" weight="bold" aria-hidden="true" />}
    </>
  );

  if (href) {
    return (
      <a href={href} className={`${row} ${pressable}`}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" className={`${row} ${pressable} disabled:pointer-events-none disabled:opacity-40`} onClick={onClick} disabled={disabled}>
        {content}
      </button>
    );
  }

  return <div className={row}>{content}</div>;
}