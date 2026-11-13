import { WarningCircleIcon } from '@phosphor-icons/react';
import { clockTime } from '../../lib/format';
import { useLoad } from '../../lib/load';
import { LOW_BATTERY, batteryLevel, hasBattery, lowBattery } from '../../lib/metrics';
import { sensorPath } from '../../lib/paths';
import type { Params } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import { placeholder } from '../../lib/ui';
import BatteryFill from '../BatteryFill';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';

const BACK = { href: '/', label: 'Summary' };

// The page of a batteries card: every battery of the card, lowest first, each opening that sensor's battery.
export default function BatteriesPage({ params }: { params: Params }) {
  const ids = params.sensors!.split('-').map(Number);
  const { data, error } = useLoad(loadSensors);
  const list = (data ?? [])
    .filter((sensor) => ids.includes(sensor.id) && hasBattery(sensor))
    .map((sensor) => ({ sensor, level: batteryLevel(sensor), low: lowBattery(sensor) !== null, latest: sensor.metrics.find((metric) => metric.name === 'battery')?.latest }))
    .sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity));

  if (!data || !list.length) {
    return (
      <>
        <PageHeader title="Batteries" back={BACK} />
        {data ? <p className={placeholder}>The sensors of this card may have been removed.</p> : <Message error={error} loading />}
      </>
    );
  }

  const now = Date.now();

  return (
    <>
      <PageHeader title="Batteries" back={BACK} />
      <Section footer={`A battery at ${LOW_BATTERY}% or less shows as low.`}>
        {list.map(({ sensor, level, low, latest }) => (
          <Row
            key={sensor.id}
            href={sensorPath(sensor.id, 'battery')}
            label={
              <>
                <span className="block truncate">{sensor.name}</span>
                <span className="flex items-center gap-1 text-footnote text-muted">
                  {low && (
                    <span className="flex items-center gap-1 font-semibold text-warning">
                      <WarningCircleIcon weight="fill" className="size-3.5" aria-hidden="true" />
                      Low ·
                    </span>
                  )}
                  {latest ? clockTime(latest.measured_at, now) : 'No Data'}
                </span>
              </>
            }
            trailing={
              <>
                {level !== null && <BatteryFill level={level} low={low} className="block h-1.5 w-16 shrink-0 sm:w-24" />}
                <span className="w-11 shrink-0 text-right text-body font-semibold tabular-nums">{level === null ? '–' : `${Math.round(level)}%`}</span>
              </>
            }
          />
        ))}
      </Section>
    </>
  );
}