import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowUUpLeftIcon, ArrowUUpRightIcon, PlusIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { cardKey, cardMetrics, defaultCards, sparkKey, toCards } from '../../lib/cards';
import { failure, useLoad } from '../../lib/load';
import { fetchPoints } from '../../lib/readings';
import { loadSensors } from '../../lib/sensors';
import type { Card, Device } from '../../lib/types';
import { iconButton, textButton } from '../../lib/ui';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import Notices from './Notices';
import PinSheet from './PinSheet';
import SummaryCard, { type Spark } from './SummaryCard';

const REFRESH_MS = 300000;
const HOUR = 3600000;

interface History {
  past: Card[][];
  present: Card[];
  future: Card[][];
}

export default function Summary() {
  const { data, error, reload } = useLoad(() => Promise.all([loadSensors(), api<{ devices: Device[] }>('/devices'), api<{ cards: unknown }>('/dashboard')]));
  const [saved, setSaved] = useState<Card[] | null | undefined>(undefined);
  const [history, setHistory] = useState<History | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sparks, setSparks] = useState<Record<string, Spark>>({});
  const [now, setNow] = useState(Date.now());
  const dragSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const sensors = data?.[0] ?? [];
  const devices = data?.[1].devices ?? [];
  const stored = saved === undefined ? (data ? toCards(data[2].cards, sensors) : null) : saved;
  const cards = history?.present ?? stored ?? defaultCards(sensors);
  const sparkKeys = [
    ...new Set(cards.flatMap((card) => (card.size === 'large' && card.type !== 'batteries' && card.graph ? cardMetrics(card, sensors).map((metric) => sparkKey(card.sensor, metric.name)) : []))),
  ];

  useEffect(() => {
    const refresh = setInterval(() => {
      reload();
      setNow(Date.now());
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && (reload(), setNow(Date.now()));
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!data) {
      return;
    }

    let current = true;
    const end = Math.ceil(Date.now() / HOUR) * HOUR;
    const start = end - 24 * HOUR;

    Promise.all(
      sparkKeys.map(async (key) => {
        const [sensor, metric] = key.split(':');
        return [key, { points: await fetchPoints(Number(sensor), metric, start, end, 'hour'), start, end }] as const;
      }),
    ).then((entries) => current && setSparks(Object.fromEntries(entries)), failure);

    return () => {
      current = false;
    };
  }, [data, sparkKeys.join(',')]);

  useEffect(() => {
    if (!history) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const change = (next: Card[]) => setHistory((h) => h && { past: [...h.past, h.present], present: next, future: [] });
  const undo = () => setHistory((h) => (h && h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h));
  const redo = () => setHistory((h) => (h && h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const keys = cards.map(cardKey);

    if (over && active.id !== over.id) {
      change(arrayMove(cards, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
    }
  };

  const toggle = (card: Card) => change(cards.some((item) => cardKey(item) === cardKey(card)) ? cards.filter((item) => cardKey(item) !== cardKey(card)) : [...cards, card]);

  const done = async () => {
    const reset = JSON.stringify(cards) === JSON.stringify(defaultCards(sensors));
    setSaving(true);
    setSaveError(null);

    try {
      await (reset ? api('/dashboard', 'DELETE') : api('/dashboard', 'PUT', { cards }));
      setSaved(reset ? null : cards);
      setHistory(null);
    } catch (e) {
      setSaveError(failure(e));
    }

    setSaving(false);
  };

  const actions = history ? (
    <>
      <button type="button" className={iconButton} onClick={undo} disabled={!history.past.length} aria-label="Undo">
        <ArrowUUpLeftIcon weight="bold" className="size-5" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} onClick={redo} disabled={!history.future.length} aria-label="Redo">
        <ArrowUUpRightIcon weight="bold" className="size-5" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} onClick={() => setAdding(true)} aria-label="Add">
        <PlusIcon weight="bold" className="size-5" aria-hidden="true" />
      </button>
      <button type="button" className={`${textButton} ml-1`} onClick={done} disabled={saving}>
        Done
      </button>
    </>
  ) : (
    data && (
      <button type="button" className={textButton} onClick={() => setHistory({ past: [], present: cards, future: [] })}>
        Edit
      </button>
    )
  );

  return (
    <>
      <PageHeader title="Summary" actions={actions} />
      <Message error={error ?? saveError} loading={!data} />
      {data && (
        <>
          {!history && <Notices sensors={sensors} devices={devices} now={now} />}
          {cards.length === 0 && !history && <p className="px-1 text-[15px] text-muted">Nothing pinned yet. Choose Edit to add sensors and values.</p>}
          <div className="@container">
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={cards.map(cardKey)} strategy={rectSortingStrategy}>
                <div className="grid auto-rows-[calc((100cqw-0.75rem)/2)] grid-cols-2 gap-3 md:auto-rows-[calc((100cqw-2.25rem)/4)] md:grid-cols-4">
                  {cards.map((card, index) => (
                    <SummaryCard
                      key={cardKey(card)}
                      card={card}
                      sensors={sensors}
                      sparks={sparks}
                      now={now}
                      index={index}
                      editing={history !== null}
                      onRemove={() => change(cards.filter((item) => item !== card))}
                      onResize={() => change(cards.map((item) => (item === card ? { ...item, size: item.size === 'small' ? 'large' : 'small' } : item)))}
                      onGraph={() => change(cards.map((item) => (item === card && item.type !== 'batteries' ? { ...item, graph: !item.graph } : item)))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          <PinSheet open={adding} sensors={sensors} cards={cards} onToggle={toggle} onClose={() => setAdding(false)} />
        </>
      )}
    </>
  );
}