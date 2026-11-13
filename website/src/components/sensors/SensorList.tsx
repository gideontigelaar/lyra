import { PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { clockTime, formatNumber, unitText } from '../../lib/format';
import { useLoad } from '../../lib/load';
import { lowBattery, mainMetrics, metricStyle } from '../../lib/metrics';
import { sensorPath } from '../../lib/paths';
import { loadSensors } from '../../lib/sensors';
import { isFresh } from '../../lib/status';
import type { Device, Option, Sensor } from '../../lib/types';
import { iconButton, placeholder } from '../../lib/ui';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import AddSensor from './AddSensor';

export const sensorSummary = (sensor: Sensor) =>
  mainMetrics(sensor.metrics.filter((metric) => metric.active && metric.latest))
    .slice(0, 3)
    .map((metric) => formatNumber(metric.latest!.value, metricStyle(metric.name).decimals) + unitText(metric.unit).trim())
    .join(' · ');

// A problem with the sensor, in the warning colour, or else its source when there's more than one.
const sensorNote = (sensor: Sensor, devices: Device[], now: number) => {
  const recorded = sensor.metrics.filter((metric) => metric.active && metric.latest);
  const battery = lowBattery(sensor);

  if (sensor.device === null) {
    return { text: 'No source', warning: true };
  }

  if (recorded.length && !recorded.some((metric) => isFresh(metric, now))) {
    const latest = recorded
      .map((metric) => metric.latest!.measured_at)
      .sort()
      .at(-1)!;
    return { text: `No data since ${clockTime(latest, now)}`, warning: true };
  }

  if (battery !== null) {
    return { text: `Battery ${battery}%`, warning: true };
  }

  const source = devices.length > 1 ? devices.find((device) => device.id === sensor.device)?.name : undefined;
  return source ? { text: source, warning: false } : null;
};

export default function SensorList() {
  const { data, error } = useLoad(() => Promise.all([loadSensors(), api<{ devices: Device[] }>('/devices'), api<{ decoders: Option[] }>('/decoders')]));
  const [adding, setAdding] = useState(false);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Sensors"
        actions={
          <button type="button" className={iconButton} onClick={() => setAdding(true)} disabled={!data} aria-label="Add sensor">
            <PlusIcon weight="bold" className="size-6" aria-hidden="true" />
          </button>
        }
      />
      <Message error={error} loading={!data} />
      {data && (
        <>
          {data[0].length > 0 ? (
            <Section>
              {data[0].map((sensor) => {
                const note = sensorNote(sensor, data[1].devices, now);
                return (
                  <Row
                    key={sensor.id}
                    href={sensorPath(sensor.id)}
                    label={
                      <>
                        <span className="block truncate">{sensor.name}</span>
                        {note && <span className={`block truncate text-footnote ${note.warning ? 'font-semibold text-warning' : 'text-muted'}`}>{note.text}</span>}
                      </>
                    }
                    detail={<span className="tabular-nums">{sensorSummary(sensor)}</span>}
                  />
                );
              })}
            </Section>
          ) : (
            <p className={placeholder}>No sensors yet. Add one with its MAC address.</p>
          )}
          <AddSensor open={adding} decoders={data[2].decoders} devices={data[1].devices} onClose={() => setAdding(false)} />
        </>
      )}
    </>
  );
}