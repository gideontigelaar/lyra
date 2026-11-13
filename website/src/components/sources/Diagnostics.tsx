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
  const { telemetry, counts } = device;
  const rows: [string, string | undefined][] = telemetry
    ? [
        ['Last report', device.telemetry_at ? timeAgo(device.telemetry_at, now) : undefined],
        ['Uptime', telemetry.uptime === undefined ? undefined : duration(telemetry.uptime)],
        ['Last restart', telemetry.reset_reason && restartReason(telemetry.reset_reason)],
        ['Wi-Fi signal', telemetry.rssi === undefined ? undefined : `${signal(telemetry.rssi).label} (${dbm(telemetry.rssi)})`],
        ['Free memory', telemetry.free_heap === undefined ? undefined : kilobytes(telemetry.free_heap)],
        ['Lowest free memory', telemetry.min_free_heap === undefined ? undefined : kilobytes(telemetry.min_free_heap)],
        ['Largest free block', telemetry.largest_block === undefined ? undefined : kilobytes(telemetry.largest_block)],
        ['Chip temperature', telemetry.temperature === undefined ? undefined : `${formatNumber(temperature.convert(telemetry.temperature), 1)}${temperature.unit}`],
        ['Queued broadcasts', telemetry.pending?.toString()],
        ['Firmware built', telemetry.build],
      ]
    : [];
  // Counts of a recent stretch, so they say how it's doing now instead of adding up for good.
  const recent: [string, number][] = counts
    ? [
        ['Restarts', counts.restarts],
        ['Wi-Fi reconnects', counts.wifi_reconnects],
        ['Dropped broadcasts', counts.dropped],
      ]
    : [];

  return (
    <Fold title="Diagnostics" hint="Uptime, restarts, Wi-Fi, memory">
      <Section footer={counts ? undefined : 'The source reports this every 5 minutes.'}>
        {telemetry ? (
          rows.filter(([, value]) => value !== undefined).map(([label, value]) => <Row key={label} label={label} detail={value} />)
        ) : (
          <Row label={<span className="text-muted">No reports yet</span>} />
        )}
      </Section>
      {counts && (
        <Section title="Last 7 Days" footer="The source reports this every 5 minutes.">
          {recent.map(([label, value]) => (
            <Row key={label} label={label} detail={formatNumber(value, 0)} />
          ))}
        </Section>
      )}
    </Fold>
  );
}