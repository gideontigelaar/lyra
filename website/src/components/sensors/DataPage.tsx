import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatNumber, unitText } from '../../lib/format';
import { failure, useLoad } from '../../lib/load';
import { metricStyle } from '../../lib/metrics';
import { dataPath, sensorPath } from '../../lib/paths';
import { fetchPoints } from '../../lib/readings';
import type { Params } from '../../lib/router';
import { loadSensors } from '../../lib/sensors';
import type { Point } from '../../lib/types';
import { dangerButton, dangerTextButton, group, placeholder, pressable, row, textButton, wideSecondaryButton } from '../../lib/ui';
import { showNotice } from '../../lib/toast';
import { startOfDay, wall, zoned } from '../../lib/zone';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Row } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';

interface Item {
  point: Point;
  to: number;
}

const WINDOW_DAYS = 365;

const dateParam = (time: number) => {
  const { year, month, day } = wall(time);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseDate = (value: string | undefined) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? zoned(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

const iso = (time: number) => new Date(time).toISOString();

export default function DataPage({ params }: { params: Params }) {
  const sensorId = Number(params.id);
  const metricName = params.metric ?? '';
  const date = parseDate(params.date);
  const style = metricStyle(metricName);
  const { data } = useLoad(loadSensors);
  const [items, setItems] = useState<Item[]>([]);
  const [windowEnd, setWindowEnd] = useState(() => (date ? startOfDay(date, 1) : startOfDay(Date.now(), 1)));
  const [version, setVersion] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState<'selected' | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const sensor = data?.find((item) => item.id === sensorId);
  const metric = sensor?.metrics.find((item) => item.name === metricName);
  const unit = metric ? unitText(metric.unit) : '';
  const detail = (point: Point) => formatDate(point.time, date ? 'time' : 'date');
  const format = (point: Point) =>
    point.min === point.max ? formatNumber(point.min, style.decimals) + unit : `${formatNumber(point.min, style.decimals)}–${formatNumber(point.max, style.decimals)}${unit}`;

  useEffect(() => {
    let current = true;
    const from = date ?? startOfDay(windowEnd, -WINDOW_DAYS);
    setLoading(true);

    fetchPoints(sensorId, metricName, from.getTime(), windowEnd.getTime(), date ? 'raw' : 'day').then(
      (points) => {
        if (!current) {
          return;
        }

        // Older data can only exist when this window's data reaches back to its first day.
        const reachesStart = points.length > 0 && points[0].time < startOfDay(from, 1).getTime();
        setItems((list) => [...list, ...points.reverse().map((point) => ({ point, to: date ? point.time + 1000 : startOfDay(point.time, 1).getTime() }))]);
        setExhausted(date !== null || !reachesStart);
        setLoading(false);
      },
      (e) => current && (setError(failure(e)), setLoading(false)),
    );

    return () => {
      current = false;
    };
  }, [windowEnd.getTime(), version]);

  const restart = () => {
    setItems([]);
    setSelected(new Set());
    setEditing(false);
    setExhausted(false);
    setWindowEnd(date ? startOfDay(date, 1) : startOfDay(Date.now(), 1));
    setVersion((v) => v + 1);
  };

  const remove = async () => {
    const ranges =
      confirming === 'all'
        ? [date ? { from: iso(date.getTime()), to: iso(startOfDay(date, 1).getTime()) } : { from: '1970-01-01T00:00:00Z', to: iso(startOfDay(Date.now(), 1).getTime()) }]
        : items.filter((item) => selected.has(item.point.time)).map((item) => ({ from: iso(item.point.time), to: iso(item.to) }));
    setBusy(true);

    try {
      await api('/readings', 'DELETE', { sensor: sensorId, metric: metricName, ranges });
      const count = ranges.length;
      showNotice(confirming === 'all' ? `Deleted ${date ? "this day's" : 'all'} ${what}` : `Deleted ${count} ${date ? 'reading' : 'day'}${count === 1 ? '' : 's'}`);
      setConfirming(null);
      restart();
    } catch (e) {
      setError(failure(e));
    }

    setBusy(false);
  };

  const toggle = (key: number) =>
    setSelected((keys) => {
      const next = new Set(keys);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const what = `${style.label.toLowerCase()} data`;

  return (
    <>
      <PageHeader
        title={date ? formatDate(date, 'dateLong') : 'All Recorded Data'}
        subtitle={date ? style.label : undefined}
        back={date ? { href: dataPath(sensorId, metricName), label: 'All Data' } : { href: sensorPath(sensorId, metricName), label: sensor?.name ?? 'Sensor' }}
        actions={
          editing ? (
            <>
              <button type="button" className={dangerTextButton} onClick={() => setConfirming('all')}>
                Delete All
              </button>
              <button type="button" className={textButton} onClick={() => (setEditing(false), setSelected(new Set()))}>
                Done
              </button>
            </>
          ) : (
            <button type="button" className={textButton} onClick={() => setEditing(true)} disabled={!items.length}>
              Edit
            </button>
          )
        }
      />
      <Message error={error} />
      {items.length > 0 && (
        <div className={`${group} divide-y divide-line`}>
          {items.map(({ point }) =>
            editing ? (
              <button key={point.time} type="button" onClick={() => toggle(point.time)} aria-pressed={selected.has(point.time)} className={`${row} ${pressable}`}>
                {selected.has(point.time) ? (
                  <CheckCircleIcon weight="fill" className="size-6 shrink-0 text-accent" aria-hidden="true" />
                ) : (
                  <CircleIcon className="size-6 shrink-0 text-muted/60" aria-hidden="true" />
                )}
                <span className="flex-1 text-body tabular-nums">{format(point)}</span>
                <span className="text-body text-muted">{detail(point)}</span>
              </button>
            ) : (
              <Row
                key={point.time}
                href={date ? undefined : dataPath(sensorId, metricName, dateParam(point.time))}
                label={<span className="tabular-nums">{format(point)}</span>}
                detail={detail(point)}
              />
            ),
          )}
        </div>
      )}
      {!loading && !items.length && <p className={placeholder}>No data recorded.</p>}
      {loading && <Message loading />}
      {!exhausted && !loading && (
        <button type="button" className={`${wideSecondaryButton} mt-4`} onClick={() => setWindowEnd(startOfDay(windowEnd, -WINDOW_DAYS))}>
          Show Earlier
        </button>
      )}
      {editing && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[max(6rem,calc(env(safe-area-inset-bottom)+5rem))] z-30 flex justify-center md:bottom-8">
          <button type="button" className={`${dangerButton} shadow-lg`} onClick={() => setConfirming('selected')}>
            Delete {selected.size} {date ? (selected.size === 1 ? 'Reading' : 'Readings') : selected.size === 1 ? 'Day' : 'Days'}
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'all' ? `Delete all ${what}?` : `Delete ${selected.size} ${date ? 'reading' : 'day'}${selected.size === 1 ? '' : 's'}?`}
        confirm="Delete"
        busy={busy}
        onClose={() => setConfirming(null)}
        onConfirm={remove}
      >
        {confirming === 'all'
          ? date
            ? `Every ${what} from this day is permanently deleted.`
            : `Every ${what} recorded for this sensor is permanently deleted.`
          : 'The selected data is permanently deleted.'}{' '}
        This can't be undone.
      </ConfirmDialog>
    </>
  );
}