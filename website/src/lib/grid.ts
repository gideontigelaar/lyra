import { cardKey } from './cards';
import type { Card } from './types';

// Summary cards sit on a grid of 2 columns, or 4 from the md breakpoint. They follow each other in order, row by row.
// The only gap is where a wide card doesn't fit in what's left of a row and moves on to the next.
export type Columns = 2 | 4;

export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
}

const width = (card: Card) => (card.size === 'large' ? 2 : 1);

export const layoutOf = (cards: Card[], columns: Columns) => {
  const layout = new Map<string, Spot>();
  let x = 0;
  let y = 0;

  for (const card of cards) {
    if (x + width(card) > columns) {
      x = 0;
      y++;
    }

    layout.set(cardKey(card), { x, y, w: width(card), h: 1 });
    x += width(card);
  }

  return layout;
};

export const rowsOf = (layout: Map<string, Spot>) => Math.max(0, ...[...layout.values()].map((spot) => spot.y + spot.h));

// The order that puts a dragged card closest to where it's held, in cells from the top left.
export const dropOrder = (cards: Card[], key: string, x: number, y: number, columns: Columns) => {
  const card = cards.find((item) => cardKey(item) === key)!;
  const rest = cards.filter((item) => item !== card);
  let best = { order: cards, distance: Infinity };

  for (let i = 0; i <= rest.length; i++) {
    const order = [...rest.slice(0, i), card, ...rest.slice(i)];
    const spot = layoutOf(order, columns).get(key)!;
    const distance = (spot.x - x) ** 2 + (spot.y - y) ** 2;

    if (distance < best.distance) {
      best = { order, distance };
    }
  }

  return best.order;
};