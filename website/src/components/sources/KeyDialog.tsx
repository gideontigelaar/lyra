import { primaryButton, secondaryButton } from '../../lib/ui';
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
      <p className="text-[15px] text-muted">Add this key to the source's firmware and flash it. It's only shown now.</p>
      {/* One tap selects the whole key, for copying it by hand. */}
      <p className="mt-4 rounded-2xl bg-surface p-4 font-mono text-[14px] break-all select-all">{value}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={() => copy(value ?? '', 'key')}>
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