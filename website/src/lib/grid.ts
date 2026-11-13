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

// Every place a dragged card can go, at the end of its row or not, with where it lands. Where it lands the same either way, it stays as it was.
const placesOf = (cards: Card[], key: string, columns: Columns) => {
  const card = cards.find((item) => cardKey(item) === key)!;
  const rest = cards.filter((item) => item !== card);
  const places: { order: Card[]; spot: Spot }[] = [];

  for (let i = 0; i <= rest.length; i++) {
    for (const moved of [card, flipped(card)]) {
      const order = [...rest.slice(0, i), moved, ...rest.slice(i)];
      places.push({ order, spot: layoutOf(order, columns).get(key)! });
    }
  }

  return places;
};

const nearest = (places: { order: Card[]; spot: Spot }[], x: number, y: number, fallback: Card[]) => {
  let best = { order: fallback, distance: Infinity };

  for (const { order, spot } of places) {
    const distance = (spot.x - x) ** 2 + (spot.y - y) ** 2;

    if (distance < best.distance) {
      best = { order, distance };
    }
  }

  return best.order;
};

// The order that puts a dragged card closest to where it's held, in cells from the top left.
export const dropOrder = (cards: Card[], key: string, x: number, y: number, columns: Columns) => nearest(placesOf(cards, key, columns), x, y, cards);

// For the arrow keys: the closest place that's the way the card is pushed, so a key moves it whenever it can go that way.
// Small cards fill gaps first, so the cell straight below isn't always free, and the closest place could be where it was.
export const keyOrder = (cards: Card[], key: string, x: number, y: number, columns: Columns) => {
  const start = layoutOf(cards, columns).get(key)!;
  const [right, down] = [Math.sign(x - start.x), Math.sign(y - start.y)];

  if (!right && !down) {
    return cards;
  }

  const ahead = placesOf(cards, key, columns).filter(({ spot }) => (!right || Math.sign(spot.x - start.x) === right) && (!down || Math.sign(spot.y - start.y) === down));
  return nearest(ahead, x, y, cards);
};