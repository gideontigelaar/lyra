import { CheckCircleIcon, CircleIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatNumber, unitText } from '../../lib/format';
import { failure, param, useLoad } from '../../lib/load';
import { metricStyle } from '../../lib/metrics';
import { fetchPoints } from '../../lib/readings';
import { loadSensors } from '../../lib/sensors';
import type { Point } from '../../lib/types';
import { dangerButton, group, pressable, row, secondaryButton, textButton } from '../../lib/ui';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Row } from '../ui/List';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';

interface Item {
  point: Point;
  to: number;
}

const WINDOW_DAYS = 365;

const day = (date: Date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);

const dateParam = (time: number) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const parseDate = (value: string | null) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

const iso = (time: number) => new Date(time).toISOString();

export default function DataPage() {
  const sensorId = Number(param('sensor'));
  const metricName = param('metric') ?? '';
  const date = parseDate(param('date'));
  const style = metricStyle(metricName);
  const base = `/data/?sensor=${sensorId}&metric=${metricName}`;
  const { data } = useLoad(loadSensors);
  const [items, setItems] = useState<Item[]>([]);
  const [windowEnd, setWindowEnd] = useState(() => (date ? day(date, 1) : day(new Date(), 1)));
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
    const from = date ?? day(windowEnd, -WINDOW_DAYS);
    setLoading(true);

    fetchPoints(sensorId, metricName, from.getTime(), windowEnd.getTime(), date ? 'raw' : 'day').then(
      (points) => {
        if (!current) {
          return;
        }

        // Older data can only exist when this window's data reaches back to its first day.
        const reachesStart = points.length > 0 && points[0].time < day(from, 1).getTime();
        setItems((list) => [...list, ...points.reverse().map((point) => ({ point, to: date ? point.time + 1000 : day(new Date(point.time), 1).getTime() }))]);
        setExhausted(date !== null || !reachesStart);
        setLoading(false);
      },
      (e) => current && (setError(failure(e)), setLoading(false)),
    );

    return () => {
      current = false;
    };
  }, [windowEnd.getTime()]);

  const restart = () => {
    setItems([]);
    setSelected(new Set());
    setEditing(false);
    setExhausted(false);
    setWindowEnd(date ? day(date, 1) : day(new Date(), 1));
  };

  const remove = async () => {
    const ranges =
      confirming === 'all'
        ? [date ? { from: iso(date.getTime()), to: iso(day(date, 1).getTime()) } : { from: '1970-01-01T00:00:00Z', to: iso(day(new Date(), 1).getTime()) }]
        : items.filter((item) => selected.has(item.point.time)).map((item) => ({ from: iso(item.point.time), to: iso(item.to) }));
    setBusy(true);

    try {
      await api('/readings', 'DELETE', { sensor: sensorId, metric: metricName, ranges });
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
        back={date ? { href: base, label: 'All Data' } : { href: `/sensor/?id=${sensorId}&metric=${metricName}`, label: sensor?.name ?? 'Sensor' }}
        actions={
          editing ? (
            <>
              <button type="button" className={`${textButton} text-danger`} onClick={() => setConfirming('all')}>
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
                <span className="flex-1 text-[17px] tabular-nums">{format(point)}</span>
                <span className="text-[17px] text-muted">{detail(point)}</span>
              </button>
            ) : (
              <Row key={point.time} href={date ? undefined : `${base}&date=${dateParam(point.time)}`} label={<span className="tabular-nums">{format(point)}</span>} detail={detail(point)} />
            ),
          )}
        </div>
      )}
      {!loading && !items.length && <p className="px-1 text-[15px] text-muted">No data recorded.</p>}
      {loading && <Message loading />}
      {!exhausted && !loading && (
        <button type="button" className={`${secondaryButton} mt-4 w-full`} onClick={() => setWindowEnd(day(windowEnd, -WINDOW_DAYS))}>
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