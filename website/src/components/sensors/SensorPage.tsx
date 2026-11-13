import { WarningCircleIcon } from '@phosphor-icons/react';
import { type CSSProperties, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { exportReadings, importReadings } from '../../lib/backup';
import { cardKey } from '../../lib/cards';
import { aboutDays, clockTime, formatList, formatNumber, intervalText, unitText } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { dataMetrics, detailMetrics, lowBattery, metricStyle, sortMetrics, trendOf } from '../../lib/metrics';
import { dataPath, sensorPath, summaryHome } from '../../lib/paths';
import { loadPins, togglePin } from '../../lib/pins';
import { type Params, navigate } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import { isFresh, isOnline } from '../../lib/status';
import { showNotice } from '../../lib/toast';
import type { Card, Device, Option } from '../../lib/types';
import { card as cardClass, inlineSelect, placeholder, pressable, row } from '../../lib/ui';
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
import Warning from '../ui/Warning';
import MetricChart from './MetricChart';

// Like the logging intervals of other sensor apps: minutes for values that change quickly, hours or a day for ones like the battery.
const INTERVALS = [60, 300, 600, 900, 1800, 3600, 21600, 86400];
export default function SensorPage({ params }: { params: Params }) {
  const id = Number(params.id);
  const { data, error, reload } = useLoad(async () => {
    const [sensors, { devices }, { decoders }, { sinks }] = await Promise.all([
      loadSensors(),
      api<{ devices: Device[] }>('/devices'),
      api<{ decoders: Option[] }>('/decoders'),
      api<{ sinks: Option[] }>('/sinks'),
    ]);
    return { sensors, devices, decoders, sinks, pins: await loadPins(sensors, devices) };
  });
  const [pins, setPins] = useState<Card[] | null>(null);
  const [chosen, setChosen] = useState(params.metric);
  const { copied, copy } = useCopy();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [backup, setBackup] = useState<'export' | number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const sensor = data?.sensors.find((item) => item.id === id);
  const home = summaryHome() ?? { href: '/sensors/', label: 'Sensors' };

  if (data && !sensor) {
    return (
      <>
        <PageHeader title="Sensor not found" back={home} />
        <p className={placeholder}>This sensor may have been removed.</p>
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
  // A battery is pinned as a batteries card, the only card a battery goes on.
  const card: Card | null = !shown
    ? null
    : shown.name === 'battery'
      ? { type: 'batteries', size: 'small', sensor: null, metric: null, sensors: [id], left: true }
      : { type: 'metric', size: 'small', sensor: id, metric: shown.name, graph: true, detail: null };
  const pinned = card !== null && currentPins.some((item) => cardKey(item) === cardKey(card));
  const recorded = sensor.metrics.filter((metric) => metric.active && metric.latest);
  const temperature = metrics.find((metric) => metric.name === 'temperature');
  const dewPoint = sensor.dewPoint !== null && temperature ? `${formatNumber(sensor.dewPoint, metricStyle('dew_point').decimals)}${unitText(temperature.unit)}` : null;
  const now = Date.now();
  const low = lowBattery(sensor);
  // What needs attention first, marked like on Summary, or else which source relays the sensor.
  let problem: string | null = null;

  if (!device) {
    problem = 'Not assigned to a source';
  } else if (device.active && !isOnline(device, now)) {
    problem = `${device.name} is offline`;
  } else if (device.active && recorded.length && !recorded.some((metric) => isFresh(metric, now))) {
    problem = `No data since ${clockTime(
      recorded
        .map((metric) => metric.latest!.measured_at)
        .sort()
        .at(-1)!,
      now,
    )}`;
  } else if (low !== null) {
    problem = `Needs a new battery · ${low}% left`;
  }

  const status = problem ? <Warning>{problem}</Warning> : device && (device.active ? `Relayed by ${device.name}` : `${device.name} is inactive`);

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
                    <span className={`flex max-w-full min-w-0 items-center gap-1 text-subheadline font-semibold ${narrow ? 'max-sm:text-footnote max-sm:tracking-tight' : ''}`}>
                      <span className="truncate">{style.label}</span>
                      {metric.name === 'battery' && low !== null && <WarningCircleIcon weight="fill" className="size-[1.1em] shrink-0 text-warning" aria-label="Low" />}
                    </span>
                    {metric.latest && <span className={`ml-auto shrink-0 text-footnote text-muted ${narrow ? 'max-md:hidden' : ''}`}>{clockTime(metric.latest.measured_at, now)}</span>}
                  </span>
                  <span className="@container w-full">
                    <MetricValue metric={metric.name} value={metric.latest?.value ?? null} unit={metric.unit} trend={trendOf(metric.name, [metric.change])} fit />
                  </span>
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
            {/* Like in a weather app, the dew point goes with the humidity. */}
            {shown.name === 'humidity' && dewPoint && <Row label="Dew point" detail={dewPoint} />}
            {shown.name === 'battery' && sensor.battery_days_left !== null && <Row label="Time left" detail={aboutDays(sensor.battery_days_left)} />}
            <Row label="Show All Data" href={dataPath(id, shown.name)} />
          </Section>
        </>
      ) : (
        <p className={placeholder}>Waiting for the first reading.</p>
      )}
      <Fold title="Settings" hint="Recording, details, backup" defaultOpen={!shown || sensor.device === null}>
        {metrics.length > 0 && (
          <Section title="Recording" footer="How often each value is saved.">
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
            label={
              <span className="flex items-center gap-1.5">
                Source
                {sensor.device === null && <WarningCircleIcon weight="fill" className="size-[1.1em] shrink-0 text-warning" aria-label="No source" />}
              </span>
            }
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
            <span className="min-w-0 flex-1 text-body">MAC address</span>
            <CopyText text={sensor.address} copied={copied} className="font-mono text-subheadline text-muted" />
            <span className="text-muted/70">
              <CopyMark copied={copied} />
            </span>
          </button>
          {detailMetrics(metrics).map((metric) => (
            <Row
              key={metric.name}
              label={metricStyle(metric.name).label}
              detail={metric.latest ? `${formatNumber(metric.latest.value, metricStyle(metric.name).decimals)}${unitText(metric.unit)}` : 'No Data'}
            />
          ))}
        </Section>
        <Section
          title="Backup"
          footer={`One CSV file with every reading of ${metrics.length ? formatList(metrics.map((metric) => metricStyle(metric.name).label.toLowerCase())) : 'this sensor'}. Importing one skips the readings that are here already.`}
        >
          <Row
            label="Export All Values"
            detail={backup === 'export' ? 'Exporting…' : undefined}
            disabled={backup !== null}
            onClick={() =>
              run(async () => {
                setBackup('export');
                showNotice(await exportReadings(sensor).finally(() => setBackup(null)));
              })
            }
          />
          <Row label="Import Values…" detail={typeof backup === 'number' ? `Importing… ${Math.round(backup * 100)}%` : undefined} disabled={backup !== null} onClick={() => file.current?.click()} />
        </Section>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';

            if (picked) {
              setBackup(0);
              run(async () => showNotice(await importReadings(sensor, picked, setBackup).finally(() => setBackup(null))));
            }
          }}
        />
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