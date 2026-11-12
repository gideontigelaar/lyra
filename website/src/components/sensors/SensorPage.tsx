import { type CSSProperties, useState } from 'react';
import { api } from '../../lib/api';
import { cardKey } from '../../lib/cards';
import { clockTime, formatNumber, intervalText, unitText } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { dataMetrics, detailMetrics, metricStyle, sortMetrics } from '../../lib/metrics';
import { dataPath, sensorPath, summaryHome } from '../../lib/paths';
import { loadPins, togglePin } from '../../lib/pins';
import { type Params, navigate } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import { isFresh, isOnline } from '../../lib/status';
import { showNotice } from '../../lib/toast';
import type { Card, Device, Option } from '../../lib/types';
import { card as cardClass, inlineSelect, pressable, row } from '../../lib/ui';
import MetricChip from '../MetricChip';
import MetricValue from '../MetricValue';
import ConfirmDialog from '../ui/ConfirmDialog';
import { CopyMark, CopyText, useCopy } from '../ui/Copy';
import Fold from '../ui/Fold';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Switch from '../ui/Switch';
import TextDialog from '../ui/TextDialog';
import MetricChart from './MetricChart';

const INTERVALS = [300, 900, 1800, 3600, 21600, 86400];
export default function SensorPage({ params }: { params: Params }) {
  const id = Number(params.id);
  const { data, error, reload } = useLoad(async () => {
    const [sensors, { devices }, { decoders }, { sinks }] = await Promise.all([
      loadSensors(),
      api<{ devices: Device[] }>('/devices'),
      api<{ decoders: Option[] }>('/decoders'),
      api<{ sinks: Option[] }>('/sinks'),
    ]);
    return { sensors, devices, decoders, sinks, pins: await loadPins(sensors) };
  });
  const [pins, setPins] = useState<Card[] | null>(null);
  const [chosen, setChosen] = useState(params.metric);
  const { copied, copy } = useCopy();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const sensor = data?.sensors.find((item) => item.id === id);
  const home = summaryHome() ?? { href: '/sensors/', label: 'Sensors' };

  if (data && !sensor) {
    return (
      <>
        <PageHeader title="Sensor not found" back={home} />
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
        <PageHeader title="" back={home} />
        <Message error={error} loading />
      </>
    );
  }

  const device = data.devices.find((item) => item.id === sensor.device);
  const metrics = sortMetrics(sensor.metrics);
  const values = dataMetrics(metrics);
  const shown = values.find((metric) => metric.name === chosen) ?? values[0];
  const currentPins = pins ?? data.pins;
  const card: Card | null = shown ? { type: 'metric', size: 'small', sensor: id, metric: shown.name, graph: true } : null;
  const pinned = card !== null && currentPins.some((item) => cardKey(item) === cardKey(card));
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

  // Up to 3 tiles side by side, then rows of 2 or 3 where the last row stretches, so no tile sits alone next to a gap.
  const perRow = values.length <= 3 ? values.length : values.length === 4 ? 2 : 3;
  const narrow = perRow > 2;

  const choose = (name: string) => {
    setChosen(name);
    history.replaceState(history.state, '', sensorPath(id, name));
  };

  return (
    <>
      <PageHeader title={sensor.name} back={home} subtitle={status} />
      <Message error={actionError} />
      {shown ? (
        <>
          <div role="group" aria-label="Values" className="flex flex-wrap gap-3">
            {values.map((metric) => {
              const style = metricStyle(metric.name);
              return (
                <button
                  key={metric.name}
                  type="button"
                  aria-pressed={metric === shown}
                  onClick={() => choose(metric.name)}
                  style={{ '--tw-ring-color': style.color, flexBasis: `calc(${100 / perRow}% - ${((perRow - 1) * 0.75) / perRow}rem)` } as CSSProperties}
                  className={`${cardClass} ${pressable} flex min-w-0 grow flex-col gap-3 p-3 text-left aria-pressed:ring-2 sm:p-4 ${narrow ? 'max-sm:px-2.5' : ''}`}
                >
                  <span className={`flex w-full items-center gap-2 ${narrow ? 'max-sm:flex-col max-sm:items-start max-sm:gap-1.5' : ''}`}>
                    <MetricChip metric={metric.name} small />
                    <span className={`max-w-full truncate text-[15px] font-semibold ${narrow ? 'max-sm:text-[13px] max-sm:tracking-tight' : ''}`}>{style.label}</span>
                    {metric.latest && <span className={`ml-auto shrink-0 text-[13px] text-muted ${narrow ? 'max-md:hidden' : ''}`}>{clockTime(metric.latest.measured_at, now)}</span>}
                  </span>
                  <MetricValue metric={metric.name} value={metric.latest?.value ?? null} unit={metric.unit} />
                </button>
              );
            })}
          </div>
          <div className="mt-6">
            <MetricChart sensors={[id]} metric={shown} />
          </div>
          <Section title={metricStyle(shown.name).label}>
            <Row
              label="Pin to Summary"
              trailing={
                <Switch
                  label="Pin to Summary"
                  checked={pinned}
                  onChange={() =>
                    card &&
                    run(async () => {
                      setPins(await togglePin(data.sensors, currentPins, card));
                      showNotice(pinned ? 'Unpinned from Summary' : 'Pinned to Summary');
                    })
                  }
                />
              }
            />
            <Row label="Show All Data" href={dataPath(id, shown.name)} />
          </Section>
        </>
      ) : (
        <p className="px-1 text-[15px] text-muted">Waiting for the first reading.</p>
      )}
      <Fold title="Settings" hint="Recording, details, remove" defaultOpen={!shown || sensor.device === null}>
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
                      className={inlineSelect}
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
              <select aria-label="Source" className={inlineSelect} value={sensor.device ?? ''} onChange={(event) => update({ device: event.target.value ? Number(event.target.value) : null })}>
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
          <button type="button" className={`${row} ${pressable}`} onClick={() => copy(sensor.address, 'MAC address')}>
            <span className="min-w-0 flex-1 text-[17px]">MAC address</span>
            <CopyText text={sensor.address} copied={copied} className="font-mono text-[15px] text-muted" />
            <span className="text-muted/70">
              <CopyMark copied={copied} />
            </span>
          </button>
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
      </Fold>
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
            showNotice(`Removed ${sensor.name}`);
            navigate(home.href);
          });
          setBusy(false);
        }}
      >
        This removes the sensor and all of its recorded data. This can't be undone.
      </ConfirmDialog>
    </>
  );
}