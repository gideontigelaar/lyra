import { CopyIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { primaryButton, secondaryButton } from '../../lib/ui';
import Dialog from '../ui/Dialog';

interface Props {
  value: string | null;
  onClose: () => void;
}

export default function KeyDialog({ value, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={value !== null} title="Source Key" onClose={close}>
      <p className="text-[15px] text-muted">
        Put this key in <code className="font-mono text-[14px]">firmware/include/credentials.h</code> as <code className="font-mono text-[14px]">API_KEY</code> and flash the source. It's only shown
        now.
      </p>
      <div className="mt-4 rounded-2xl bg-surface p-4 font-mono text-[14px] break-all select-all">{value}</div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => navigator.clipboard.writeText(value ?? '').then(() => setCopied(true))}>
          <CopyIcon weight="bold" className="size-4" aria-hidden="true" />
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className={primaryButton} onClick={close}>
          Done
        </button>
      </div>
    </Dialog>
  );
}