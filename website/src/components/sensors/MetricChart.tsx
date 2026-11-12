import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { formatNumber, unitText } from '../../lib/format';
import { failure } from '../../lib/load';
import { metricStyle } from '../../lib/metrics';
import { type PeriodId, PERIODS, isPeriod, periods } from '../../lib/periods';
import { averagePoints, fetchPoints, rangeOf } from '../../lib/readings';
import type { Point, SensorMetric } from '../../lib/types';
import { iconButton } from '../../lib/ui';
import RangeChart from '../chart/RangeChart';
import Message from '../ui/Message';
import Segmented from '../ui/Segmented';

interface Props {
  // More than one sensor charts their average.
  sensors: number[];
  metric: Pick<SensorMetric, 'name' | 'unit'>;
}

const HOUR = 3600000;

const storedPeriod = (): PeriodId => {
  try {
    const period = localStorage.getItem('period');
    return isPeriod(period) ? period : 'D';
  } catch {
    return 'D';
  }
};

export default function MetricChart({ sensors, metric }: Props) {
  const style = metricStyle(metric.name);
  const [period, setPeriod] = useState(storedPeriod);
  const [start, setStart] = useState(() => periods[storedPeriod()].start(new Date()));
  const [loaded, setLoaded] = useState<{ key: string; points: Point[]; before?: Point; after?: Point } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const config = periods[period];
  const end = config.shift(start, 1);
  const now = new Date();
  // Readings only show on the period they were loaded for, so the new axes never draw the last period's readings.
  const key = `${sensors.join('-')}:${metric.name}:${period}:${start.getTime()}`;
  const data = loaded?.key === key ? loaded : null;
  const points = data?.points ?? null;

  useEffect(() => {
    let current = true;
    setSelected(null);

    // One bucket on each side, so the line can continue to the chart's edges.
    const margin = { raw: 3 * HOUR, hour: HOUR, day: 25 * HOUR, week: 8 * 24 * HOUR, month: 32 * 24 * HOUR }[config.bucket];

    Promise.all(sensors.map((sensor) => fetchPoints(sensor, metric.name, start.getTime() - margin, end.getTime() + margin, config.bucket)))
      .then(averagePoints)
      .then(
        (result) => {
          if (current) {
            setLoaded({
              key,
              points: result.filter((point) => point.time >= start.getTime() && point.time < end.getTime()),
              before: result.findLast((point) => point.time < start.getTime()),
              after: result.find((point) => point.time >= end.getTime()),
            });
            setError(null);
          }
        },
        (e) => current && setError(failure(e)),
      );

    return () => {
      current = false;
    };
  }, [key]);

  const changePeriod = (next: PeriodId) => {
    setPeriod(next);
    setStart(periods[next].start(new Date()));

    try {
      localStorage.setItem('period', next);
    } catch {}
  };

  const slots = config.slots(start, end);
  const point = selected !== null ? points?.[selected] : undefined;
  const range = point ? { min: point.min, max: point.max } : rangeOf(points ?? []);
  const unit = unitText(metric.unit);
  const value = range && (range.min === range.max ? formatNumber(range.min, style.decimals) : `${formatNumber(range.min, style.decimals)}–${formatNumber(range.max, style.decimals)}`);
  const title = point ? config.slotTitle(point.time, slots[slots.findIndex((slot) => slot === point.time) + 1] ?? end.getTime()) : config.title(start, end, now);

  return (
    <>
      <Message error={error} />
      <Segmented label="Period" options={PERIODS} value={period} onChange={changePeriod} />
      <div className="mt-5 flex items-end justify-between gap-3" aria-live="polite">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-wide text-muted uppercase">{point && point.min === point.max ? 'Reading' : 'Range'}</div>
          <div className="tabular-nums">
            {value ? (
              <>
                <span className="text-[34px] leading-tight font-semibold tracking-tight">{value}</span>
                <span className="text-[17px] font-semibold text-muted">{unit}</span>
              </>
            ) : (
              <span className="text-[34px] leading-tight font-semibold tracking-tight text-muted">{points ? 'No Data' : '…'}</span>
            )}
          </div>
          <div className="text-[15px] text-muted">{point && point.min !== point.max ? `${title} · average ${formatNumber(point.avg, style.decimals)}${unit}` : title}</div>
        </div>
        <div className="flex shrink-0 gap-1 pb-0.5">
          <button type="button" className={iconButton} onClick={() => setStart(config.shift(start, -1))} aria-label={`Previous ${config.label.toLowerCase()}`}>
            <CaretLeftIcon weight="bold" className="size-5" aria-hidden="true" />
          </button>
          <button type="button" className={iconButton} onClick={() => setStart(config.shift(start, 1))} disabled={end.getTime() > now.getTime()} aria-label={`Next ${config.label.toLowerCase()}`}>
            <CaretRightIcon weight="bold" className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mt-4">
        <RangeChart
          id={key}
          points={points ?? []}
          before={data?.before}
          after={data?.after}
          start={start.getTime()}
          end={end.getTime()}
          slots={slots}
          ticks={config.ticks(start, end)}
          color={style.color}
          decimals={style.decimals}
          label={`${style.label} chart, ${config.title(start, end, now)}. Use the arrow keys to read values.`}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
    </>
  );
}