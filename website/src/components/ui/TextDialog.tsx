import { type SubmitEvent, useId, useState } from 'react';
import { input, primaryButton, secondaryButton } from '../../lib/ui';
import Dialog from './Dialog';

interface Props {
  open: boolean;
  title: string;
  label: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
}

function Form({ label, value, onSave, onClose }: Omit<Props, 'open' | 'title'>) {
  const id = useId();
  const [text, setText] = useState(value);
  const [busy, setBusy] = useState(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    await onSave(text.trim());
    setBusy(false);
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} className={input} value={text} maxLength={50} required autoFocus onChange={(event) => setText(event.target.value)} />
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || !text.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

export default function TextDialog({ open, title, onClose, ...props }: Props) {
  return (
    <Dialog open={open} title={title} variant="prompt" onClose={onClose}>
      <Form {...props} onClose={onClose} />
    </Dialog>
  );
}