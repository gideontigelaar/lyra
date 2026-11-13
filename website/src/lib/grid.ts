import { cardKey } from './cards';
import type { Card } from './types';

// Summary cards sit on a grid of 2 columns, or 4 from the md breakpoint. They follow each other in order, row by row,
// each in the first spot it fits. So a large card that doesn't fit in what's left of a row moves on to the next, and a small card after it fills the gap.
// A card alone in its row can sit at the right end of it instead, when it was dropped there. Rows stay where they are, so no card floats apart.
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
  // The cells taken in each row.
  const taken: boolean[][] = [];
  const free = (x: number, y: number, w: number) => x + w <= columns && Array.from({ length: w }, (_, i) => !taken[y]?.[x + i]).every(Boolean);

  for (const card of cards) {
    const w = width(card);
    let y = 0;
    let x = 0;

    while (!free(x, y, w)) {
      x = x + 1 > columns - w ? 0 : x + 1;
      y += x === 0 ? 1 : 0;
    }

    taken[y] ??= [];
    for (let i = 0; i < w; i++) taken[y][x + i] = true;
    layout.set(cardKey(card), { x, y, w, h: 1 });
  }

  for (const card of cards) {
    const spot = layout.get(cardKey(card))!;

    if (card.end && taken[spot.y].filter(Boolean).length === spot.w) {
      spot.x = columns - spot.w;
    }
  }

  return layout;
};

// The same card at the end of its row or not, the same object each time, so a drag only changes something when it moves.
const ends = new WeakMap<Card, Card>();

const flipped = (card: Card) => {
  if (!ends.has(card)) {
    const { end, ...rest } = card;
    const other = (end ? rest : { ...card, end: true }) as Card;
    ends.set(card, other);
    ends.set(other, card);
  }

  return ends.get(card)!;
};

export const rowsOf = (layout: Map<string, Spot>) => Math.max(0, ...[...layout.values()].map((spot) => spot.y + spot.h));

// The order that puts a dragged card closest to where it's held, in cells from the top left, at the end of its row or not.
export const dropOrder = (cards: Card[], key: string, x: number, y: number, columns: Columns) => {
  const card = cards.find((item) => cardKey(item) === key)!;
  const rest = cards.filter((item) => item !== card);
  let best = { order: cards, distance: Infinity };

  for (let i = 0; i <= rest.length; i++) {
    // Where it lands the same either way, it stays as it was.
    for (const moved of [card, flipped(card)]) {
      const order = [...rest.slice(0, i), moved, ...rest.slice(i)];
      const spot = layoutOf(order, columns).get(key)!;
      const distance = (spot.x - x) ** 2 + (spot.y - y) ** 2;

      if (distance < best.distance) {
        best = { order, distance };
      }
    }
  }

  return best.order;
};