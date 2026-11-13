import { PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { sourcePath } from '../../lib/paths';
import { isOnline } from '../../lib/status';
import type { Device } from '../../lib/types';
import { iconButton } from '../../lib/ui';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import TextDialog from '../ui/TextDialog';
import KeyDialog from './KeyDialog';

export const sourceStatus = (device: Device, now: number) => {
  const state = !device.active ? 'Inactive' : isOnline(device, now) ? 'Online' : 'Offline';
  return `${state} · ${device.last_seen_at ? `seen ${timeAgo(device.last_seen_at, now)}` : 'never connected'}`;
};

export default function SourceList() {
  const { data, error, reload } = useLoad(() => api<{ devices: Device[] }>('/devices'));
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const now = Date.now();

  const add = async (name: string) => {
    setActionError(null);

    try {
      const result = await api<{ id: number; key: string }>('/devices', 'POST', { name });
      setKey(result.key);
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setAdding(false);
  };

  return (
    <>
      <PageHeader
        title="Sources"
        actions={
          <button type="button" className={iconButton} onClick={() => setAdding(true)} aria-label="Add source">
            <PlusIcon weight="bold" className="size-6" aria-hidden="true" />
          </button>
        }
      />
      <Message error={error ?? actionError} loading={!data} />
      {data &&
        (data.devices.length ? (
          <Section footer="A source is online when it checked in during the last 15 minutes.">
            {data.devices.map((device) => (
              <Row
                key={device.id}
                href={sourcePath(device.id)}
                label={
                  <>
                    <span className="block truncate">{device.name}</span>
                    <span className="block truncate text-footnote text-muted">{sourceStatus(device, now)}</span>
                  </>
                }
                detail={`${device.sensors.length} ${device.sensors.length === 1 ? 'sensor' : 'sensors'}`}
              />
            ))}
          </Section>
        ) : (
          <p className="px-1 text-subheadline text-muted">No sources yet. Add one to get its key.</p>
        ))}
      <TextDialog open={adding} title="Add Source" label="Name" value="" onClose={() => setAdding(false)} onSave={add} />
      <KeyDialog value={key} onClose={() => setKey(null)} />
    </>
  );
}