import { expect, test } from 'vitest';
import { DECK_TAB_KEY, DECK_TABS, FIRST_TAB, readDeckTab, tabKey, travel, writeDeckTab } from './deck-tabs';

function memory(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) };
}

test('the deck opens on the tab kept, or the first one when none is kept or it is unknown', () => {
  expect(readDeckTab(memory({ [DECK_TAB_KEY]: 'stats' }))).toBe('stats');
  expect(readDeckTab(memory({ [DECK_TAB_KEY]: 'home' }))).toBe(FIRST_TAB);
  expect(readDeckTab(memory())).toBe(FIRST_TAB);
  expect(readDeckTab(null)).toBe(FIRST_TAB);
  const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  expect(readDeckTab(refusing)).toBe(FIRST_TAB);
  expect(() => writeDeckTab(refusing, 'chat')).not.toThrow();
  const store = memory();
  writeDeckTab(store, 'music');
  expect(readDeckTab(store)).toBe('music');
});

test('the content slides the way the bar goes', () => {
  expect(travel('threads', 'chat')).toBe(1);
  expect(travel('system', 'today')).toBe(-1);
  expect(travel('stats', 'stats')).toBe(0);
});

test('the arrows move along the tab bar and wrap, Home and End go to its ends', () => {
  expect(tabKey('ArrowRight', 'threads')).toBe('today');
  expect(tabKey('ArrowLeft', 'threads')).toBe('system');
  expect(tabKey('ArrowRight', 'system')).toBe('threads');
  expect(tabKey('Home', 'music')).toBe(DECK_TABS[0]);
  expect(tabKey('End', 'music')).toBe('system');
  expect(tabKey('Enter', 'music')).toBeNull();
});
