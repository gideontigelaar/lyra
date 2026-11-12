import { pressable, primaryButton, secondaryButton } from '../../lib/ui';
import { CopyMark, CopyText, useCopy } from '../ui/Copy';
import Dialog from '../ui/Dialog';

interface Props {
  value: string | null;
  onClose: () => void;
}

export default function KeyDialog({ value, onClose }: Props) {
  const { copied, copy } = useCopy();
  return (
    <Dialog open={value !== null} title="Source Key" onClose={onClose}>
      <p className="text-[15px] text-muted">
        Put this key in <code className="font-mono text-[14px]">firmware/include/credentials.h</code> as <code className="font-mono text-[14px]">API_KEY</code> and flash the source. It's only shown
        now.
      </p>
      <button type="button" aria-label="Copy key" className={`mt-4 w-full rounded-2xl bg-surface p-4 text-left font-mono text-[14px] break-all ${pressable}`} onClick={() => copy(value ?? '')}>
        <CopyText text={value ?? ''} copied={copied} className="text-[14px]" />
      </button>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => copy(value ?? '')}>
          <CopyMark copied={copied} />
          <CopyText text="Copy" copied={copied} accent={false} />
        </button>
        <button type="button" className={primaryButton} onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}