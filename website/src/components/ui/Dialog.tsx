import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { releaseAlerts } from '../../lib/toast';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  // A sheet slides up from the bottom on phones. A prompt stays centred and only fades, because iOS draws the text cursor in the wrong place inside moving fields.
  variant?: 'sheet' | 'prompt';
  children: ReactNode;
}

const CLOSE_MS = 200;

export default function Dialog({ open, title, onClose, variant = 'sheet', children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const sheet = variant === 'sheet';
  // While it fades out, the dialog keeps what it showed last, even when its owner already cleared it.
  const last = useRef({ title, children });
  // Each opening starts its content fresh, also when it opens again while still fading out.
  const openings = useRef({ count: 0, open });

  if (open) {
    last.current = { title, children };
  }

  if (open && !openings.current.open) {
    openings.current.count++;
  }

  openings.current.open = open;

  useEffect(() => {
    const dialog = ref.current;

    if (!dialog) {
      return;
    }

    if (open) {
      setShown(true);
      setClosing(false);

      if (!dialog.open) {
        dialog.showModal();
      }

      return;
    }

    if (!dialog.open) {
      return;
    }

    // Fade out first, then close.
    setClosing(true);
    const timer = setTimeout(() => {
      releaseAlerts(dialog);
      dialog.close();
      setShown(false);
      setClosing(false);
    }, CLOSE_MS);

    return () => clearTimeout(timer);
  }, [open]);

  // The on-screen keyboard covers the bottom of the layout viewport on iOS, so the dialog keeps above it.
  // Only when the keyboard comes or goes: following every scroll of the visual viewport made the dialog jump while scrolling in it.
  useEffect(() => {
    const viewport = window.visualViewport;
    const dialog = ref.current;

    if (!open || !viewport || !dialog) {
      return;
    }

    const update = () => dialog.style.setProperty('--keyboard', `${Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))}px`);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      data-closing={closing || undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === ref.current && onClose()}
      className={`m-auto max-h-[calc(100dvh-var(--keyboard,0px)-2rem)] w-[min(30rem,calc(100%-2rem))] overflow-y-auto overscroll-contain rounded-3xl bg-bg p-6 text-inherit shadow-2xl transition duration-200 ease-out backdrop:bg-navy-950/40 backdrop:backdrop-blur-sm backdrop:transition-opacity backdrop:duration-200 starting:opacity-0 starting:backdrop:opacity-0 data-closing:opacity-0 data-closing:backdrop:opacity-0 max-sm:bottom-(--keyboard,0px) dark:bg-navy-900 dark:ring-1 dark:ring-white/10 dark:[--fill:oklch(0.34_0.05_265/0.8)] dark:[--line:var(--color-navy-700)] dark:[--surface:var(--color-navy-800)] ${
        sheet
          ? 'pb-[max(1.5rem,calc(env(safe-area-inset-bottom)-var(--keyboard,0px)))] starting:translate-y-4 data-closing:translate-y-4 max-sm:mb-0 max-sm:max-h-[calc(100dvh-var(--keyboard,0px)-env(safe-area-inset-top)-1rem)] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none sm:starting:translate-y-0 sm:starting:scale-95 sm:data-closing:translate-y-0 sm:data-closing:scale-95'
          : ''
      }`}
    >
      <h2 id={id} className="mb-4 text-xl font-bold tracking-tight">
        {last.current.title}
      </h2>
      {(open || shown) && <Fragment key={openings.current.count}>{last.current.children}</Fragment>}
    </dialog>
  );
}