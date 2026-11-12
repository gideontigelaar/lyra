import { type ReactNode, useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Dialog({ open, title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;

    if (open && !dialog?.open) {
      dialog?.showModal();
    } else if (!open && dialog?.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className="m-auto max-h-[85dvh] w-[min(30rem,calc(100%-2rem))] overflow-y-auto overscroll-contain rounded-3xl bg-bg p-6 transition duration-200 ease-out starting:translate-y-4 starting:opacity-0 sm:starting:translate-y-0 sm:starting:scale-95 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-inherit shadow-2xl backdrop:bg-navy-950/40 backdrop:backdrop-blur-sm max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <h2 id={id} className="mb-4 text-xl font-bold tracking-tight">
        {title}
      </h2>
      {open && children}
    </dialog>
  );
}