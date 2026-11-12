import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { failure, param, useLoad } from '../../lib/load';
import { loadSensors } from '../../lib/sensors';
import type { Device } from '../../lib/types';
import { group, pressable, primaryButton, row } from '../../lib/ui';
import { sensorSummary } from '../sensors/SensorList';
import ConfirmDialog from '../ui/ConfirmDialog';
import Dialog from '../ui/Dialog';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Switch from '../ui/Switch';
import TextDialog from '../ui/TextDialog';
import KeyDialog from './KeyDialog';
import { sourceStatus } from './SourceList';

export default function SourcePage() {
  const id = Number(param('id'));
  const { data, error, reload } = useLoad(() => Promise.all([api<{ devices: Device[] }>('/devices'), loadSensors()]));
  const [dialog, setDialog] = useState<'rename' | 'assign' | 'key' | 'remove' | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const device = data?.[0].devices.find((item) => item.id === id);
  const back = { href: '/sources/', label: 'Sources' };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);

    try {
      await action();
      reload();
    } catch (e) {
      setActionError(failure(e));
    }

    setBusy(false);
  };

  if (!data || !device) {
    return (
      <>
        <PageHeader title={data ? 'Source not found' : ''} back={back} />
        <Message error={error} loading={!data} />
      </>
    );
  }

  const sensors = data[1];
  const assigned = sensors.filter((sensor) => sensor.device === id);

  return (
    <>
      <PageHeader title={device.name} back={back} subtitle={sourceStatus(device, Date.now())} />
      <Message error={actionError} />
      <Section title="Sensors">
        {assigned.map((sensor) => (
          <Row key={sensor.id} href={`/sensor/?id=${sensor.id}`} label={sensor.name} detail={<span className="tabular-nums">{sensorSummary(sensor)}</span>} />
        ))}
        <Row label={<span className="text-accent">Choose Sensors…</span>} onClick={() => setDialog('assign')} />
      </Section>
      <Section title="Options" footer="When Active is off, Lyra rejects everything this source sends. Its key and sensors are kept.">
        <Row label="Active" trailing={<Switch label="Active" checked={device.active} onChange={(active) => run(() => api(`/devices/${id}`, 'PATCH', { active }))} />} />
        <Row label="Name" detail={device.name} onClick={() => setDialog('rename')} />
        <Row label="Replace Key" onClick={() => setDialog('key')} />
      </Section>
      <Section>
        <Row label="Remove Source" danger onClick={() => setDialog('remove')} />
      </Section>
      <Dialog open={dialog === 'assign'} title="Choose Sensors" onClose={() => setDialog(null)}>
        <div className={`${group} divide-y divide-line`}>
          {sensors.map((sensor) => {
            const here = sensor.device === id;
            const elsewhere = data[0].devices.find((item) => item.id === sensor.device && item.id !== id);
            return (
              <button
                key={sensor.id}
                type="button"
                aria-pressed={here}
                disabled={busy}
                onClick={() => run(() => api(`/sensors/${sensor.id}`, 'PATCH', { device: here ? null : id }))}
                className={`${row} ${pressable}`}
              >
                {here ? <CheckCircleIcon weight="fill" className="size-6 shrink-0 text-accent" aria-hidden="true" /> : <CircleIcon className="size-6 shrink-0 text-muted/60" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px]">{sensor.name}</span>
                  {elsewhere && <span className="block truncate text-[13px] text-muted">Now on {elsewhere.name}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className={`${primaryButton} mt-6 w-full`} onClick={() => setDialog(null)}>
          Done
        </button>
      </Dialog>
      <TextDialog
        open={dialog === 'rename'}
        title="Rename Source"
        label="Name"
        value={device.name}
        onClose={() => setDialog(null)}
        onSave={async (name) => {
          await run(() => api(`/devices/${id}`, 'PATCH', { name }));
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog === 'key'}
        title="Replace this source's key?"
        confirm="Replace Key"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(async () => {
            setKey((await api<{ key: string }>(`/devices/${id}/key`, 'POST')).key);
            setDialog(null);
          })
        }
      >
        The current key stops working right away. Flash the source with the new key to keep receiving its data.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'remove'}
        title={`Remove ${device.name}?`}
        confirm="Remove"
        busy={busy}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          run(async () => {
            await api(`/devices/${id}`, 'DELETE');
            location.assign('/sources/');
          })
        }
      >
        Its key stops working and its sensors are left without a source. Their recorded data is kept.
      </ConfirmDialog>
      <KeyDialog value={key} onClose={() => setKey(null)} />
    </>
  );
}