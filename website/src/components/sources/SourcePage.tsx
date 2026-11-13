import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { failure, useLoad } from '../../lib/load';
import { sensorPath, summaryHome } from '../../lib/paths';
import { type Params, navigate } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import { showNotice } from '../../lib/toast';
import type { Device } from '../../lib/types';
import { group, pressable, row, widePrimaryButton } from '../../lib/ui';
import { displayUnit } from '../../lib/units';
import { sensorSummary } from '../sensors/SensorList';
import ConfirmDialog from '../ui/ConfirmDialog';
import Dialog from '../ui/Dialog';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Switch from '../ui/Switch';
import TextDialog from '../ui/TextDialog';
import KeyDialog from './KeyDialog';
import Diagnostics from './Diagnostics';
import { sourceStatus } from './SourceList';

export default function SourcePage({ params }: { params: Params }) {
  const id = Number(params.id);
  const { data, error, reload } = useLoad(() => Promise.all([api<{ devices: Device[] }>('/devices'), loadSensors(), displayUnit('°C')]));
  const [dialog, setDialog] = useState<'rename' | 'assign' | 'key' | 'remove' | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [moving, setMoving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const device = data?.[0].devices.find((item) => item.id === id);
  const back = summaryHome() ?? { href: '/sources/', label: 'Sources' };

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
  const sourceOf = (device: number | null) => data[0].devices.find((item) => item.id === device && item.id !== id);
  // Sensors picked here that another source relays now.
  const moves = sensors.filter((sensor) => chosen.includes(sensor.id) && sourceOf(sensor.device));

  const choose = () => {
    setChosen(assigned.map((sensor) => sensor.id));
    setDialog('assign');
  };

  const saveChoice = () =>
    run(async () => {
      for (const sensor of sensors) {
        const picked = chosen.includes(sensor.id);

        if (picked !== (sensor.device === id)) {
          await api(`/sensors/${sensor.id}`, 'PATCH', { device: picked ? id : null });
        }
      }

      setMoving(false);
      setDialog(null);
    });

  return (
    <>
      <PageHeader title={device.name} back={back} subtitle={sourceStatus(device, Date.now())} />
      <Message error={actionError} />
      <Section title="Sensors">
        {assigned.map((sensor) => (
          <Row key={sensor.id} href={sensorPath(sensor.id)} label={sensor.name} detail={<span className="tabular-nums">{sensorSummary(sensor)}</span>} />
        ))}
        <Row label={<span className="text-accent">Choose Sensors…</span>} onClick={choose} />
      </Section>
      <Section title="Options" footer="While Active is off, everything this source sends is rejected. Its key and sensors are kept.">
        <Row label="Active" trailing={<Switch label="Active" checked={device.active} onChange={(active) => run(() => api(`/devices/${id}`, 'PATCH', { active }))} />} />
        <Row label="Name" detail={device.name} onClick={() => setDialog('rename')} />
        <Row label="Replace Key" onClick={() => setDialog('key')} />
      </Section>
      <Diagnostics device={device} temperature={data[2]} now={Date.now()} />
      <Section>
        <Row label="Remove Source" danger onClick={() => setDialog('remove')} />
      </Section>
      <Dialog open={dialog === 'assign'} title="Choose Sensors" onClose={() => setDialog(null)}>
        <div className={`${group} divide-y divide-line`}>
          {sensors.map((sensor) => {
            const picked = chosen.includes(sensor.id);
            const elsewhere = sourceOf(sensor.device);
            return (
              <button
                key={sensor.id}
                type="button"
                aria-pressed={picked}
                onClick={() => setChosen(picked ? chosen.filter((item) => item !== sensor.id) : [...chosen, sensor.id])}
                className={`${row} ${pressable}`}
              >
                <span className="grid size-6 shrink-0" aria-hidden="true">
                  <CircleIcon className={`col-start-1 row-start-1 size-6 text-muted/60 transition duration-200 ${picked ? 'opacity-0' : ''}`} />
                  <CheckCircleIcon weight="fill" className={`col-start-1 row-start-1 size-6 text-accent transition duration-200 ${picked ? '' : 'scale-50 opacity-0'}`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body">{sensor.name}</span>
                  {elsewhere && <span className="block truncate text-footnote text-muted">Now on {elsewhere.name}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" className={`${widePrimaryButton} mt-6`} disabled={busy} onClick={() => (moves.length ? setMoving(true) : saveChoice())}>
          Save
        </button>
      </Dialog>
      <ConfirmDialog
        open={moving}
        title={moves.length === 1 ? `Move ${moves[0].name}?` : `Move ${moves.length} sensors?`}
        confirm="Move"
        busy={busy}
        onClose={() => setMoving(false)}
        onConfirm={saveChoice}
      >
        {moves.map((sensor) => `${sensor.name} is relayed by ${sourceOf(sensor.device)?.name} now.`).join(' ')} {moves.length === 1 ? 'It moves' : 'They move'} to {device.name}, and only {device.name}{' '}
        picks {moves.length === 1 ? 'it' : 'them'} up from then on.
      </ConfirmDialog>
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
            showNotice(`Removed ${device.name}`);
            navigate(back.href);
          })
        }
      >
        Its key stops working and its sensors are left without a source. Their recorded data is kept.
      </ConfirmDialog>
      <KeyDialog value={key} onClose={() => setKey(null)} />
    </>
  );
}