import { clockTime, formatNumber, unitText } from '../../lib/format';
import { useLoad } from '../../lib/load';
import { metricStyle, trendOf } from '../../lib/metrics';
import { sensorPath } from '../../lib/paths';
import type { Params } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import { card, placeholder } from '../../lib/ui';
import MetricChip from '../MetricChip';
import MetricValue from '../MetricValue';
import MetricChart from '../sensors/MetricChart';
import { Row, Section } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';

const BACK = { href: '/', label: 'Summary' };

// The page of an average card: the average now, its chart and the sensors it's taken over.
export default function AveragePage({ params }: { params: Params }) {
  const metric = params.metric!;
  const ids = params.sensors!.split('-').map(Number);
  const { data, error } = useLoad(loadSensors);
  const style = metricStyle(metric);
  const title = `Average ${style.label.toLowerCase()}`;
  const members = (data ?? []).flatMap((sensor) => {
    const value = ids.includes(sensor.id) ? sensor.metrics.find((item) => item.name === metric) : undefined;
    return value ? [{ sensor, value }] : [];
  });

  if (!data || !members.length) {
    return (
      <>
        <PageHeader title={title} back={BACK} />
        {data ? <p className={placeholder}>The sensors of this card may have been removed.</p> : <Message error={error} loading />}
      </>
    );
  }

  const now = Date.now();
  const unit = members[0].value.unit;
  const readings = members.flatMap(({ value }) => (value.latest ? [value.latest] : []));
  const numbers = readings.map((reading) => reading.value);
  const average = numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
  const changes = members.map(({ value }) => value.change);
  const newest = readings
    .map((reading) => reading.measured_at)
    .sort()
    .at(-1);
  const spread = numbers.length > 1 && `${formatNumber(Math.min(...numbers), style.decimals)}–${formatNumber(Math.max(...numbers), style.decimals)}${unitText(unit)} across ${numbers.length} sensors`;

  return (
    <>
      <PageHeader title={title} back={BACK} subtitle={members.map(({ sensor }) => sensor.name).join(', ')} />
      <div className={`${card} flex items-center gap-3 p-4`}>
        <MetricChip metric={metric} />
        <div className="min-w-0 flex-1">
          <div className="text-subheadline font-semibold">{newest ? `Now · ${clockTime(newest, now)}` : 'Now'}</div>
          {spread && <div className="truncate text-footnote text-muted">{spread}</div>}
        </div>
        <MetricValue metric={metric} value={average} unit={unit} trend={trendOf(metric, changes)} />
      </div>
      <div className="mt-6">
        <MetricChart sensors={members.map(({ sensor }) => sensor.id)} metric={members[0].value} />
      </div>
      <Section title="Sensors">
        {members.map(({ sensor, value }) => (
          <Row
            key={sensor.id}
            href={sensorPath(sensor.id, metric)}
            label={sensor.name}
            detail={value.latest ? <MetricValue metric={metric} value={value.latest.value} unit={unit} size="small" /> : 'No Data'}
          />
        ))}
      </Section>
    </>
  );
}