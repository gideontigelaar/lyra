import { DndContext, type DragMoveEvent, type KeyboardCoordinateGetter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowUUpLeftIcon, ArrowUUpRightIcon, PlusIcon } from '@phosphor-icons/react';
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { cardKey, cardValues, defaultCards, sparkKey, toCards } from '../../lib/cards';
import { type Columns, type Spot, layoutOf, moveTo, resize, rowsOf, withLayout } from '../../lib/grid';
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
import SummaryCard, { PLACE, type Spark, spotStyle } from './SummaryCard';

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
  const [target, setTarget] = useState<{ key: string; x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<{ card: Card; spot: Spot }[]>([]);
  const grid = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const columns = useColumns();

  // The distance from one cell to the next, in pixels.
  const pitch = () => {
    const gap = 0.75 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return (grid.current!.clientWidth - (columns - 1) * gap) / columns + gap;
  };

  const arrows: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.code];

    if (!step || !grid.current) {
      return undefined;
    }

    event.preventDefault();
    return { x: currentCoordinates.x + step[0] * pitch(), y: currentCoordinates.y + step[1] * pitch() };
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
  const preview = target ? moveTo(layout, target.key, target.x, target.y, columns) : layout;
  const rows = rowsOf(preview) + (history ? 1 : 0);
  const sparkKeys = [
    ...new Set(
      cards.flatMap((card) =>
        card.type === 'batteries' || !card.graph || (card.type === 'sensor' && card.size === 'small') ? [] : cardValues(card, sensors).map(({ sensor, metric }) => sparkKey(sensor.id, metric.name)),
      ),
    ),
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
  // Every change keeps the spots cards have now, so nothing else moves unless something takes its place.
  const placed = () => withLayout(cards, layout, columns);
  const undo = () => setHistory((h) => (h && h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h));
  const redo = () => setHistory((h) => (h && h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  const onDragMove = ({ active }: DragMoveEvent) => {
    const rect = active.rect.current.translated;
    const key = String(active.id);
    const spot = layout.get(key);

    if (!rect || !grid.current || !spot) {
      return;
    }

    const box = grid.current.getBoundingClientRect();
    const others = rowsOf(new Map([...layout].filter(([other]) => other !== key)));
    const x = Math.min(Math.max(Math.round((rect.left - box.left) / pitch()), 0), columns - spot.w);
    const y = Math.min(Math.max(Math.round((rect.top - box.top) / pitch()), 0), others);
    setTarget((current) => (current && current.x === x && current.y === y ? current : { key, x, y }));
  };

  const endDrag = (drop: boolean) => {
    if (drop && target) {
      change(withLayout(cards, preview, columns));
    }

    setTarget(null);
    // The click that ends a mouse drag shouldn't open the card's settings.
    setTimeout(() => (dragged.current = false));
  };

  const edit = (card: Card) => !dragged.current && setEditing(card);

  const toggle = (card: Card) => {
    const base = placed();
    change(base.some((item) => cardKey(item) === cardKey(card)) ? base.filter((item) => cardKey(item) !== cardKey(card)) : [...base, card]);
  };

  const save = (card: Card) => {
    change(placed().map((item) => (cardKey(item) === cardKey(editing!) ? card : item)));
    setEditing(null);
  };

  const remove = (card: Card) => {
    const key = cardKey(card);
    const spot = layout.get(key)!;
    change(placed().filter((item) => cardKey(item) !== key));
    setLeaving((list) => [...list.filter((item) => cardKey(item.card) !== key), { card, spot }]);
    setTimeout(() => setLeaving((list) => list.filter((item) => item.card !== card)), 300);
  };

  const resizeCard = (card: Card) => {
    const size = card.size === 'small' ? 'large' : 'small';
    const next = resize(layout, cardKey(card), size === 'large' ? 2 : 1, columns);
    change(
      withLayout(
        cards.map((item) => (item === card ? { ...item, size } : item)),
        next,
        columns,
      ),
    );
  };

  // The default layout is the default cards in their flowing spots, whatever spots were saved on the way.
  const isDefault = () => {
    const defaults = defaultCards(sensors);
    const plain = (list: Card[]) => JSON.stringify(list.map(({ at: _, ...card }) => card));
    const spots = (list: Card[], count: Columns) => JSON.stringify([...layoutOf(list, count)]);
    return plain(cards) === plain(defaults) && ([2, 4] as const).every((count) => spots(cards, count) === spots(defaults, count));
  };

  const done = async () => {
    const reset = isDefault();
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
            <DndContext
              sensors={dragSensors}
              accessibility={{ screenReaderInstructions: { draggable: INSTRUCTIONS } }}
              onDragStart={() => (dragged.current = true)}
              onDragMove={onDragMove}
              onDragEnd={() => endDrag(true)}
              onDragCancel={() => endDrag(false)}
            >
              <div ref={grid} style={{ '--rows': rows } as CSSProperties} className={GRID}>
                {target && (
                  <div
                    aria-hidden="true"
                    style={spotStyle(preview.get(target.key)!)}
                    className={`${PLACE} rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5 transition-[translate,opacity] duration-200 ease-out starting:opacity-0`}
                  />
                )}
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
                        spot={gone ? leaving.find((item) => item.card === card)!.spot : (key === target?.key ? layout : preview).get(key)!}
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
          <PinSheet open={adding} sensors={sensors} cards={cards} onToggle={toggle} onClose={() => setAdding(false)} />
          <CardEditor card={editing} sensors={sensors} cards={cards} onSave={save} onClose={() => setEditing(null)} />
        </>
      )}
    </>
  );
}