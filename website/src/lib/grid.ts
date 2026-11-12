import { cardKey } from './cards';
import type { Card } from './types';

// Summary cards sit on a grid of 2 columns, or 4 from the md breakpoint. Each card keeps its own spot per column count,
// so a layout made on a phone doesn't move the one on a laptop. Cards without a spot flow in after the others.
export type Columns = 2 | 4;

export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Layout = Map<string, Spot>;

const width = (card: Card) => (card.size === 'large' ? 2 : 1);

const overlaps = (a: Spot, b: Spot) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const fits = (spot: Spot, taken: Spot[], columns: Columns) => spot.x >= 0 && spot.y >= 0 && spot.x + spot.w <= columns && !taken.some((other) => overlaps(spot, other));

// The first free spot at or after a position, reading left to right and top to bottom.
const firstFree = (w: number, h: number, taken: Spot[], columns: Columns, from = { x: 0, y: 0 }): Spot => {
  for (let y = from.y; ; y++) {
    for (let x = y === from.y ? from.x : 0; x + w <= columns; x++) {
      if (fits({ x, y, w, h }, taken, columns)) {
        return { x, y, w, h };
      }
    }
  }
};

export const layoutOf = (cards: Card[], columns: Columns): Layout => {
  const layout: Layout = new Map();
  const loose: Card[] = [];

  for (const card of cards) {
    const at = card.at?.[columns];
    const spot = at && { x: at[0], y: at[1], w: width(card), h: 1 };

    if (spot && fits(spot, [...layout.values()], columns)) {
      layout.set(cardKey(card), spot);
    } else {
      loose.push(card);
    }
  }

  let from = { x: 0, y: Math.max(0, ...[...layout.values()].map((spot) => spot.y)) };

  for (const card of loose) {
    const spot = firstFree(width(card), 1, [...layout.values()], columns, from);
    layout.set(cardKey(card), spot);
    from = { x: spot.x + spot.w, y: spot.y };
  }

  return layout;
};

export const rowsOf = (layout: Layout) => Math.max(0, ...[...layout.values()].map((spot) => spot.y + spot.h));

// A free spot inside an area, so cards in the way can swap into the place the moved card left.
const freeIn = (area: Spot, w: number, h: number, taken: Spot[], columns: Columns) => {
  for (let y = area.y; y + h <= area.y + area.h; y++) {
    for (let x = area.x; x + w <= area.x + area.w; x++) {
      if (fits({ x, y, w, h }, taken, columns)) {
        return { x, y, w, h };
      }
    }
  }

  return null;
};

// Puts a card on a spot. Cards in the way move into the place it left when they fit, otherwise to the next free spot after their own.
const put = (layout: Layout, key: string, spot: Spot, columns: Columns): Layout => {
  const left = layout.get(key)!;
  const next: Layout = new Map(layout);
  next.set(key, spot);

  const moved = [...layout].filter(([other, place]) => other !== key && overlaps(place, spot)).sort(([, a], [, b]) => a.y - b.y || a.x - b.x);

  moved.forEach(([other]) => next.delete(other));

  for (const [other, place] of moved) {
    const taken = [...next.values()];
    next.set(other, freeIn(left, place.w, place.h, taken, columns) ?? firstFree(place.w, place.h, taken, columns, { x: place.x, y: place.y }));
  }

  return next;
};

export const moveTo = (layout: Layout, key: string, x: number, y: number, columns: Columns) => {
  const spot = layout.get(key)!;
  return put(layout, key, { ...spot, x: Math.min(Math.max(x, 0), columns - spot.w), y: Math.max(y, 0) }, columns);
};

export const resize = (layout: Layout, key: string, w: number, columns: Columns) => {
  const spot = layout.get(key)!;
  return put(layout, key, { ...spot, w, x: Math.min(spot.x, columns - w) }, columns);
};

// Saves every card's spot for this column count, so later changes don't make others flow somewhere else.
export const withLayout = (cards: Card[], layout: Layout, columns: Columns): Card[] =>
  cards.map((card) => {
    const spot = layout.get(cardKey(card));
    return spot ? { ...card, at: { ...card.at, [columns]: [spot.x, spot.y] } } : card;
  });