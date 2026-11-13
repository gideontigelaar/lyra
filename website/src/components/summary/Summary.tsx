import { DndContext, type DragMoveEvent, type DragStartEvent, type KeyboardCoordinateGetter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowUUpLeftIcon, ArrowUUpRightIcon, PlusIcon } from '@phosphor-icons/react';
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { cardKey, cardValues, defaultCards, fitValues, sparkKey, toCards, valueLimit } from '../../lib/cards';
import { type Columns, type Spot, dropOrder, layoutOf, rowsOf } from '../../lib/grid';
import { failure, useLoad } from '../../lib/load';
import { fetchPoints } from '../../lib/readings';
import { loadSensors } from '../../lib/sensors';
import type { Card, Device } from '../../lib/types';
import { iconButton, textButton } from '../../lib/ui';
import Message from '../ui/Message';
import PageHeader from '../ui/PageHeader';
import CardEditor from './CardEditor';
import Notices from './Notices';
import PinSheet from './PinSheet';
import SummaryCard, { type Bounds, DropOutline, type Spark } from './SummaryCard';

const REFRESH_MS = 300000;
const HOUR = 3600000;

// The grid's columns follow Tailwind's md breakpoint, like its CSS below.
const wide = () => window.matchMedia('(min-width: 48rem)');
const subscribeWidth = (listener: () => void) => {
  const query = wide();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
const useColumns = (): Columns => (useSyncExternalStore(subscribeWidth, () => wide().matches) ? 4 : 2);

const GRID =
  'relative h-[calc(var(--rows)*var(--cell)_+_(var(--rows)_-_1)*var(--gap))] transition-[height] duration-300 ease-out [--cell:calc((100cqw_-_(var(--cols)_-_1)*var(--gap))/var(--cols))] [--cols:2] [--gap:0.75rem] md:[--cols:4]';

const INSTRUCTIONS = 'Press Enter to change this card. Press Space to pick it up, the arrow keys to move it and Space again to put it down.';

// The card being moved: how far it may go and how far it went, in pixels.
interface Drag {
  bounds: Bounds;
  delta: { x: number; y: number };
}

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
  const [editing, setEditing] = useState<Card | null>(null);
  const [order, setOrder] = useState<{ key: string; cards: Card[]; rows: number; bounds: Bounds } | null>(null);
  const [leaving, setLeaving] = useState<{ card: Card; spot: Spot }[]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const dragged = useRef(false);
  const columns = useColumns();

  // The distance from one cell to the next, in pixels.
  const pitch = () => {
    const gap = 0.75 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return (grid.current!.clientWidth - (columns - 1) * gap) / columns + gap;
  };

  // Arrow keys move a card one cell at a time, as far as it may go.
  const arrows: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.code];

    if (!step || !grid.current || !drag.current) {
      return undefined;
    }

    event.preventDefault();
    const { bounds, delta } = drag.current;
    const x = delta.x + step[0] * pitch();
    const y = delta.y + step[1] * pitch();
    const inside = x >= bounds.left - 1 && x <= bounds.right + 1 && y >= bounds.top - 1 && y <= bounds.bottom + 1;
    return inside ? { x: currentCoordinates.x + step[0] * pitch(), y: currentCoordinates.y + step[1] * pitch() } : currentCoordinates;
  };

  // A mouse drags straight away. A finger holds a moment first, so swiping still scrolls the page.
  const dragSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: arrows, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );

  const sensors = data?.[0] ?? [];
  const devices = data?.[1].devices ?? [];
  const stored = saved === undefined ? (data ? toCards(data[2].cards, sensors) : null) : saved;
  const cards = history?.present ?? stored ?? defaultCards(sensors);
  const layout = layoutOf(cards, columns);
  const preview = order ? layoutOf(order.cards, columns) : layout;
  const rows = Math.max(rowsOf(preview), order?.rows ?? 0);
  const sparkKeys = [...new Set(cards.flatMap((card) => (card.type === 'batteries' || !card.graph ? [] : cardValues(card, sensors).map(({ sensor, metric }) => sparkKey(sensor.id, metric.name)))))];

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

  // A card moves within the grid. It can go one row past the last card when that's where it would end up.
  const onDragStart = ({ active }: DragStartEvent) => {
    const key = String(active.id);
    const card = cards.find((item) => cardKey(item) === key)!;
    const spot = layout.get(key)!;
    const end = rowsOf(layoutOf([...cards.filter((item) => item !== card), card], columns));
    const room = Math.max(rowsOf(layout), end);
    const step = pitch();
    const bounds = { left: -spot.x * step, right: (columns - spot.w - spot.x) * step, top: -spot.y * step, bottom: (room - spot.h - spot.y) * step };

    dragged.current = true;
    drag.current = { bounds, delta: { x: 0, y: 0 } };
    setOrder({ key, cards, rows: room, bounds });
  };

  const onDragMove = ({ active, delta }: DragMoveEvent) => {
    const key = String(active.id);
    const spot = layout.get(key);

    if (!drag.current || !spot) {
      return;
    }

    const { bounds } = drag.current;
    const x = Math.min(Math.max(delta.x, bounds.left), bounds.right);
    const y = Math.min(Math.max(delta.y, bounds.top), bounds.bottom);
    const next = dropOrder(cards, key, spot.x + x / pitch(), spot.y + y / pitch(), columns);
    const same = (list: Card[]) => list.every((card, i) => card === next[i]);
    drag.current.delta = { x, y };
    setOrder((current) => (current && same(current.cards) ? current : current && { ...current, cards: next }));
  };

  const endDrag = (drop: boolean) => {
    if (drop && order && order.cards.some((card, i) => card !== cards[i])) {
      change(order.cards);
    }

    drag.current = null;
    setOrder(null);
    // The click that ends a mouse drag shouldn't open the card's settings.
    setTimeout(() => (dragged.current = false));
  };

  const edit = (card: Card) => !dragged.current && setEditing(card);

  const add = (card: Card) => {
    change([...cards, card]);
    setAdding(false);
  };

  const save = (card: Card) => {
    change(cards.map((item) => (cardKey(item) === cardKey(editing!) ? card : item)));
    setEditing(null);
  };

  const remove = (card: Card) => {
    const key = cardKey(card);
    const spot = layout.get(key)!;
    change(cards.filter((item) => cardKey(item) !== key));
    setLeaving((list) => [...list.filter((item) => cardKey(item.card) !== key), { card, spot }]);
    setTimeout(() => setLeaving((list) => list.filter((item) => item.card !== card)), 300);
  };

  // A sensor card that gets smaller keeps the values that fit, from the left.
  const resizeCard = (card: Card) =>
    change(
      cards.map((item) => {
        if (item !== card) {
          return item;
        }

        const size = item.size === 'small' ? 'large' : 'small';
        const limit = item.type === 'sensor' ? valueLimit(size, item.graph) : Infinity;
        return item.type === 'sensor' && item.metrics.length > limit ? { ...item, size, metrics: fitValues(item.metrics, limit) } : { ...item, size };
      }),
    );

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
          {cards.length === 0 && !history && <p className="px-1 text-subheadline text-muted">Nothing pinned yet. Choose Edit to add sensors and values.</p>}
          <div className="@container">
            <DndContext
              sensors={dragSensors}
              accessibility={{ screenReaderInstructions: { draggable: INSTRUCTIONS } }}
              autoScroll={{ threshold: { x: 0, y: 0.2 } }}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={() => endDrag(true)}
              onDragCancel={() => endDrag(false)}
            >
              <div ref={grid} style={{ '--rows': rows } as CSSProperties} className={GRID}>
                {order && <DropOutline spot={preview.get(order.key)!} />}
                {/* One list, so a removed card keeps its element while it fades out. */}
                {[...cards.map((card) => ({ card, leaving: false })), ...leaving.filter(({ card }) => !layout.has(cardKey(card))).map(({ card }) => ({ card, leaving: true }))].map(
                  ({ card, leaving: gone }) => {
                    const key = cardKey(card);
                    return (
                      <SummaryCard
                        key={key}
                        card={card}
                        sensors={sensors}
                        sparks={sparks}
                        now={now}
                        editing={history !== null}
                        leaving={gone}
                        spot={gone ? leaving.find((item) => item.card === card)!.spot : (key === order?.key ? layout : preview).get(key)!}
                        bounds={key === order?.key ? order.bounds : undefined}
                        onRemove={() => remove(card)}
                        onResize={() => resizeCard(card)}
                        onEdit={() => edit(card)}
                      />
                    );
                  },
                )}
              </div>
            </DndContext>
          </div>
          <PinSheet open={adding} sensors={sensors} cards={cards} onAdd={add} onClose={() => setAdding(false)} />
          <CardEditor card={editing} sensors={sensors} cards={cards} onSave={save} onClose={() => setEditing(null)} />
        </>
      )}
    </>
  );
}