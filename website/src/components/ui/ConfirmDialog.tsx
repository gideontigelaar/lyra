import type { ReactNode } from 'react';
import { dangerButton, secondaryButton } from '../../lib/ui';
import Dialog from './Dialog';

interface Props {
  open: boolean;
  title: string;
  confirm: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}

export default function ConfirmDialog({ open, title, confirm, busy, onConfirm, onClose, children }: Props) {
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className="text-[15px] text-muted">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={dangerButton} onClick={onConfirm} disabled={busy}>
          {confirm}
        </button>
      </div>
    </Dialog>
  );
}