import { api } from './api';
import { cardKey, defaultCards, toCards } from './cards';
import type { Card, Sensor } from './types';

export const loadPins = async (sensors: Sensor[]) => toCards((await api<{ cards: unknown }>('/dashboard')).cards, sensors) ?? defaultCards(sensors);

export const togglePin = async (sensors: Sensor[], cards: Card[], card: Card) => {
  const next = cards.some((item) => cardKey(item) === cardKey(card)) ? cards.filter((item) => cardKey(item) !== cardKey(card)) : [...cards, card];
  await (JSON.stringify(next) === JSON.stringify(defaultCards(sensors)) ? api('/dashboard', 'DELETE') : api('/dashboard', 'PUT', { cards: next }));
  return next;
};