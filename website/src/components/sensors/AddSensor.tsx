import { type SubmitEvent, useId, useState } from 'react';
import { api } from '../../lib/api';
import { failure } from '../../lib/load';
import type { Device, Option } from '../../lib/types';
import { input, label, primaryButton, secondaryButton } from '../../lib/ui';
import Dialog from '../ui/Dialog';
import Message from '../ui/Message';

interface Props {
  open: boolean;
  decoders: Option[];
  devices: Device[];
  onClose: () => void;
}

const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

function Form({ decoders, devices, onClose }: Omit<Props, 'open'>) {
  const id = useId();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [decoder, setDecoder] = useState(decoders[0]?.name ?? '');
  const [device, setDevice] = useState(devices.find((item) => item.active)?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalized = address.trim().toUpperCase().replace(/-/g, ':');

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { id } = await api<{ id: number }>('/sensors', 'POST', { name: name.trim(), address: normalized, decoder, device });
      location.assign(`/sensor/?id=${id}`);
    } catch (e) {
      setError(failure(e));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor={`${id}-name`} className={label}>
          Name
        </label>
        <input id={`${id}-name`} className={input} placeholder="Bedroom" maxLength={50} required autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div>
        <label htmlFor={`${id}-address`} className={label}>
          MAC address
        </label>
        <input
          id={`${id}-address`}
          className={`${input} font-mono uppercase`}
          placeholder="A4:C1:38:00:00:00"
          required
          spellCheck={false}
          autoCapitalize="characters"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          aria-invalid={address !== '' && !MAC.test(normalized)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-type`} className={label}>
            Type
          </label>
          <select id={`${id}-type`} className={input} value={decoder} onChange={(event) => setDecoder(event.target.value)}>
            {decoders.map((item) => (
              <option key={item.name} value={item.name}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-source`} className={label}>
            Source
          </label>
          <select id={`${id}-source`} className={input} value={device ?? ''} onChange={(event) => setDevice(event.target.value ? Number(event.target.value) : null)}>
            <option value="">None</option>
            {devices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[13px] text-muted">The first values show up within a few minutes.</p>
      <Message error={error} />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className={secondaryButton} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={primaryButton} disabled={busy || !name.trim() || !MAC.test(normalized) || !decoder}>
          Add Sensor
        </button>
      </div>
    </form>
  );
}

export default function AddSensor({ open, onClose, ...props }: Props) {
  return (
    <Dialog open={open} title="Add Sensor" onClose={onClose}>
      <Form {...props} onClose={onClose} />
    </Dialog>
  );
}