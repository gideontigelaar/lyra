import { CaretRightIcon } from '@phosphor-icons/react';
import { type CSSProperties, useState } from 'react';
import { api } from '../../lib/api';
import { clockTime, formatNumber, intervalText, unitText } from '../../lib/format';
import { failure, param, useLoad } from '../../lib/load';
import { dataMetrics, detailMetrics, metricStyle, sortMetrics } from '../../lib/metrics';
import { loadSensors } from '../../lib/sensors';
import { isFresh, isOnline } from '../../lib/status';
import type { Device, Option } from '../../lib/types';
import { card as cardClass, disclosure, pressable } from '../../lib/ui';
import MetricValue from '../MetricValue';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Switch from '../ui/Switch';
import TextDialog from '../ui/TextDialog';
import MetricChart from './MetricChart';

const INTERVALS = [300, 900, 1800, 3600, 21600, 86400];
const SELECT = 'max-w-40 truncate rounded-lg bg-transparent py-1 text-right text-[17px] text-muted outline-none focus-visible:ring-2 focus-visible:ring-accent';

export default function SensorPage() {
  const id = Number(param('id'));
  const { data, error, reload } = useLoad(async () => {
    const [sensors, { devices }, { decoders }, { sinks }] = await Promise.all([
      loadSensors(),
      api<{ devices: Device[] }>('/devices'),
      api<{ decoders: Option[] }>('/decoders'),
      api<{ sinks: Option[] }>('/sinks'),
    ]);
    return { sensors, devices, decoders, sinks };
  });
  const [chosen, setChosen] = useState(() => param('metric'));
  const [settingsOpen, setSettingsOpen] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sensor = data?.sensors.find((item) => item.id === id);

  if (data && !sensor) {
    return (
      <>
        <PageHeader title="Sensor not found" back={{ href: '/sensors/', label: 'Sensors' }} />
        <p className="text-muted">This sensor may have been removed.</p>
      </>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);

    try {
      await action();
      reload();
    } catch (e) {
      setActionError(failure(e));
    }
  };

  const update = (change: object) => run(() => api(`/sensors/${id}`, 'PATCH', change));

  if (!data || !sensor) {
    return (
      <>
        <PageHeader title="" back={{ href: '/sensors/', label: 'Sensors' }} />
        <Message error={error} loading />
      </>
    );
  }

  const device = data.devices.find((item) => item.id === sensor.device);
  const metrics = sortMetrics(sensor.metrics);
  const values = dataMetrics(metrics);
  const shown = values.find((metric) => metric.name === chosen) ?? values[0];
  const recorded = sensor.metrics.filter((metric) => metric.active && metric.latest);
  const now = Date.now();
  let status: string | undefined;

  if (!device) {
    status = 'Not assigned to a source';
  } else if (!isOnline(device, now)) {
    status = `${device.name} is ${device.active ? 'offline' : 'inactive'}`;
  } else if (recorded.length && !recorded.some((metric) => isFresh(metric, now))) {
    status = `No data since ${clockTime(
      recorded
        .map((metric) => metric.latest!.measured_at)
        .sort()
        .at(-1)!,
      now,
    )}`;
  }

  const choose = (name: string) => {
    setChosen(name);
    history.replaceState(null, '', `?id=${id}&metric=${name}`);
  };

  return (
    <>
      <PageHeader title={sensor.name} back={{ href: '/sensors/', label: 'Sensors' }} subtitle={status} />
      <Message error={actionError} />
      {shown ? (
        <>
          <div role="group" aria-label="Values" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {values.map((metric) => {
              const style = metricStyle(metric.name);
              return (
                <button
                  key={metric.name}
                  type="button"
                  aria-pressed={metric === shown}
                  onClick={() => choose(metric.name)}
                  style={{ '--tw-ring-color': style.color } as CSSProperties}
                  className={`${cardClass} ${pressable} flex flex-col gap-3 p-4 text-left aria-pressed:ring-2`}
                >
                  <span className="flex w-full items-center gap-1.5">
                    <style.icon weight="fill" className="size-4 shrink-0" style={{ color: style.color }} aria-hidden="true" />
                    <span className="truncate text-[15px] font-semibold">{style.label}</span>
                    {metric.latest && <span className="ml-auto shrink-0 text-[13px] text-muted">{clockTime(metric.latest.measured_at, now)}</span>}
                  </span>
                  <MetricValue metric={metric.name} value={metric.latest?.value ?? null} unit={metric.unit} />
                </button>
              );
            })}
          </div>
          <div className="mt-6">
            <MetricChart sensor={id} metric={shown} />
          </div>
        </>
      ) : (
        <p className="px-1 text-[15px] text-muted">Waiting for the first reading.</p>
      )}
      <details className="group mt-10" open={settingsOpen ?? (!shown || sensor.device === null)} onToggle={(event) => setSettingsOpen(event.currentTarget.open)}>
        <summary className={disclosure}>
          Settings
          <CaretRightIcon weight="bold" className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden="true" />
        </summary>
        {metrics.length > 0 && (
          <Section title="Recording">
            {metrics.map((metric) => (
              <Row
                key={metric.name}
                label={metricStyle(metric.name).label}
                trailing={
                  <>
                    <select
                      aria-label={`${metricStyle(metric.name).label} interval`}
                      className={SELECT}
                      value={metric.interval}
                      disabled={!metric.active}
                      onChange={(event) => update({ metrics: { [metric.name]: { interval: Number(event.target.value) } } })}
                    >
                      {[...new Set([...INTERVALS, metric.interval])]
                        .sort((a, b) => a - b)
                        .map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {intervalText(seconds)}
                          </option>
                        ))}
                    </select>
                    <Switch label={`Record ${metricStyle(metric.name).label.toLowerCase()}`} checked={metric.active} onChange={(active) => update({ metrics: { [metric.name]: { active } } })} />
                  </>
                }
              />
            ))}
          </Section>
        )}
        {data.sinks.length > 1 && (
          <Section title="Send Values To">
            {data.sinks.map((sink) => (
              <Row
                key={sink.name}
                label={sink.label}
                trailing={
                  <Switch
                    label={`Send to ${sink.label}`}
                    checked={sensor.sinks.includes(sink.name)}
                    onChange={(on) => update({ sinks: on ? [...sensor.sinks, sink.name] : sensor.sinks.filter((name) => name !== sink.name) })}
                  />
                }
              />
            ))}
          </Section>
        )}
        <Section title="Details">
          <Row label="Name" detail={sensor.name} onClick={() => setRenaming(true)} />
          <Row
            label="Source"
            trailing={
              <select aria-label="Source" className={SELECT} value={sensor.device ?? ''} onChange={(event) => update({ device: event.target.value ? Number(event.target.value) : null })}>
                <option value="">None</option>
                {data.devices.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            }
          />
          <Row label="Type" detail={data.decoders.find((item) => item.name === sensor.decoder)?.label ?? sensor.decoder} />
          <Row label="MAC address" detail={<span className="font-mono text-[15px] select-all">{sensor.address}</span>} />
          {detailMetrics(metrics).map((metric) => (
            <Row
              key={metric.name}
              label={metricStyle(metric.name).label}
              detail={metric.latest ? `${formatNumber(metric.latest.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}` : 'No data'}
            />
          ))}
        </Section>
        <Section>
          <Row label="Remove Sensor" danger onClick={() => setRemoving(true)} />
        </Section>
      </details>
      <TextDialog
        open={renaming}
        title="Rename Sensor"
        label="Name"
        value={sensor.name}
        onClose={() => setRenaming(false)}
        onSave={async (name) => {
          await update({ name });
          setRenaming(false);
        }}
      />
      <ConfirmDialog
        open={removing}
        title={`Remove ${sensor.name}?`}
        confirm="Remove"
        busy={busy}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          setBusy(true);
          await run(async () => {
            await api(`/sensors/${id}`, 'DELETE');
            location.assign('/sensors/');
          });
          setBusy(false);
        }}
      >
        This removes the sensor and all of its recorded data. This can't be undone.
      </ConfirmDialog>
    </>
  );
}