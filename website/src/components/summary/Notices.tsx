import { CaretRightIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { clockTime, timeAgo } from '../../lib/format';
import { lowBattery } from '../../lib/metrics';
import { sensorPath, sourcePath } from '../../lib/paths';
import { isFresh, isOnline } from '../../lib/status';
import type { Device, Sensor } from '../../lib/types';
import { group, pressable, row } from '../../lib/ui';

interface Props {
  sensors: Sensor[];
  devices: Device[];
  now: number;
}

const notices = ({ sensors, devices, now }: Props) => {
  const list: { key: string; text: string; detail: string; href: string }[] = [];
  const offline = new Set<number>();

  for (const device of devices) {
    if (device.active && !isOnline(device, now)) {
      offline.add(device.id);
      list.push({
        key: `device:${device.id}`,
        text: `${device.name} is offline`,
        detail: device.last_seen_at ? `Seen ${timeAgo(device.last_seen_at, now)}` : 'Never connected',
        href: sourcePath(device.id),
      });
    }
  }

  for (const sensor of sensors) {
    const href = sensorPath(sensor.id);
    const recorded = sensor.metrics.filter((metric) => metric.active && metric.latest);
    const battery = lowBattery(sensor);

    if (sensor.device === null) {
      list.push({ key: `sensor:${sensor.id}`, text: `${sensor.name} has no source`, detail: 'Choose the source that relays it', href });
    } else if (!offline.has(sensor.device) && recorded.length && !recorded.some((metric) => isFresh(metric, now))) {
      const latest = recorded
        .map((metric) => metric.latest!.measured_at)
        .sort()
        .at(-1)!;
      list.push({ key: `sensor:${sensor.id}`, text: `${sensor.name} stopped reporting`, detail: `Last reading ${clockTime(latest, now)}`, href });
    }

    if (battery !== null) {
      list.push({ key: `battery:${sensor.id}`, text: `${sensor.name} needs a new battery`, detail: `${battery}% left`, href: sensorPath(sensor.id, 'battery') });
    }
  }

  return list;
};

export default function Notices(props: Props) {
  const list = notices(props);

  if (!list.length) {
    return null;
  }

  return (
    <div className={`${group} mb-6 divide-y divide-line`}>
      {list.map(({ key, text, detail, href }) => (
        <a key={key} href={href} className={`${row} ${pressable}`}>
          <WarningCircleIcon weight="fill" className="size-5 shrink-0 text-warning" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-body">{text}</span>
            <span className="block text-footnote text-muted">{detail}</span>
          </span>
          <CaretRightIcon weight="bold" className="size-3.5 shrink-0 text-muted/70" aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}