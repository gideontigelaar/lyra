import { formatNumber, timeAgo } from '../../lib/format';
import { dbm, duration, kilobytes, restartReason, signal } from '../../lib/telemetry';
import type { Device } from '../../lib/types';
import Fold from '../ui/Fold';
import { Row, Section } from '../ui/List';

interface Props {
  device: Device;
  temperature: { unit: string; convert: (value: number) => number };
  now: number;
}

export default function Diagnostics({ device, temperature, now }: Props) {
  const telemetry = device.telemetry;
  const rows: [string, string | undefined][] = telemetry
    ? [
        ['Last report', device.telemetry_at ? timeAgo(device.telemetry_at, now) : undefined],
        ['Uptime', telemetry.uptime === undefined ? undefined : duration(telemetry.uptime)],
        ['Boot count', telemetry.boots?.toString()],
        ['Last restart', telemetry.reset_reason && restartReason(telemetry.reset_reason)],
        ['Wi-Fi signal', telemetry.rssi === undefined ? undefined : `${signal(telemetry.rssi).label} (${dbm(telemetry.rssi)})`],
        ['Wi-Fi reconnects', telemetry.wifi_reconnects?.toString()],
        ['Free memory', telemetry.free_heap === undefined ? undefined : kilobytes(telemetry.free_heap)],
        ['Lowest free memory', telemetry.min_free_heap === undefined ? undefined : kilobytes(telemetry.min_free_heap)],
        ['Largest free block', telemetry.largest_block === undefined ? undefined : kilobytes(telemetry.largest_block)],
        ['Chip temperature', telemetry.temperature === undefined ? undefined : `${formatNumber(temperature.convert(telemetry.temperature), 1)}${temperature.unit}`],
        ['Queued broadcasts', telemetry.pending?.toString()],
        ['Dropped broadcasts', telemetry.dropped?.toString()],
        ['Firmware built', telemetry.build],
      ]
    : [];

  return (
    <Fold title="Diagnostics" hint="Uptime, restarts, Wi-Fi, memory">
      <Section footer="The source reports this every 5 minutes.">
        {telemetry ? (
          rows.filter(([, value]) => value !== undefined).map(([label, value]) => <Row key={label} label={label} detail={value} />)
        ) : (
          <Row label={<span className="text-muted">No reports yet</span>} />
        )}
      </Section>
    </Fold>
  );
}