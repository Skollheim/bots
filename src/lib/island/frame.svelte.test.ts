import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FLASH_MS, HOVER_OPEN_MS, IslandFrame, LEAVE_MS, type FrameSource } from './frame.svelte';

function source(over: Partial<{ open: boolean; hover: boolean; waiting: boolean; talking: boolean }> = {}) {
  const state = $state({ open: false, hover: true, waiting: false, talking: false, ...over });
  const link: FrameSource = {
    isOpen: () => state.open,
    setOpen: (open) => (state.open = open),
    openOnHover: () => state.hover,
    waiting: () => state.waiting,
    talking: () => state.talking
  };
  return { state, frame: new IslandFrame(link) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a hover peeks, a longer one opens, and the island collapses a moment after the pointer leaves', () => {
  const { state, frame } = source();
  expect(frame.size).toBe('collapsed');
  frame.hover(true);
  expect(frame.size).toBe('peek');
  vi.advanceTimersByTime(HOVER_OPEN_MS);
  expect(state.open).toBe(true);
  frame.hover(false);
  vi.advanceTimersByTime(LEAVE_MS - 1);
  expect(state.open).toBe(true);
  vi.advanceTimersByTime(1);
  expect(state.open).toBe(false);
});

test('without open on hover, only a click opens', () => {
  const { state, frame } = source({ hover: false });
  frame.hover(true);
  vi.advanceTimersByTime(HOVER_OPEN_MS * 3);
  expect(state.open).toBe(false);
  frame.click();
  expect(state.open).toBe(true);
});

test('a pin, a waiting agent or a view holding it keeps the island open', () => {
  const { state, frame } = source({ open: true });
  frame.hover(true);
  frame.hold('chat', true);
  frame.hover(false);
  vi.advanceTimersByTime(LEAVE_MS * 2);
  expect(state.open).toBe(true);
  frame.hold('chat', false);
  vi.advanceTimersByTime(LEAVE_MS);
  expect(state.open).toBe(false);

  state.open = true;
  state.waiting = true;
  frame.settle();
  vi.advanceTimersByTime(LEAVE_MS * 2);
  expect(state.open).toBe(true);
  expect(frame.glow).toBe('attention');

  state.waiting = false;
  frame.togglePin();
  frame.settle();
  vi.advanceTimersByTime(LEAVE_MS * 2);
  expect(state.open).toBe(true);
  frame.togglePin();
  vi.advanceTimersByTime(LEAVE_MS);
  expect(state.open).toBe(false);
});

test('a view calling for attention opens the island amber until it lets go', () => {
  const { state, frame } = source({ hover: false });
  const release = frame.call('timer');
  expect(state.open).toBe(true);
  expect(frame.glow).toBe('attention');
  release();
  expect(frame.glow).toBe('none');
  vi.advanceTimersByTime(LEAVE_MS);
  expect(state.open).toBe(false);
});

test('a finished turn peeks green for a few seconds; a reply on its way glows blue', () => {
  const { state, frame } = source();
  frame.flash();
  expect([frame.size, frame.glow]).toEqual(['peek', 'done']);
  vi.advanceTimersByTime(FLASH_MS);
  expect([frame.size, frame.glow]).toEqual(['collapsed', 'none']);
  state.talking = true;
  expect(frame.glow).toBe('talking');
});

test('the shortcut opens on a tab', () => {
  const { state, frame } = source();
  frame.show('chat');
  expect([state.open, frame.tab]).toEqual([true, 'chat']);
});

test('the deck opens on the last tab used, and keeps each tab chosen once', () => {
  const kept: string[] = [];
  const link: FrameSource = { isOpen: () => false, setOpen: () => {}, openOnHover: () => false, waiting: () => false, talking: () => false, lastTab: () => 'music', keepTab: (tab) => kept.push(tab) };
  const frame = new IslandFrame(link);
  expect(frame.tab).toBe('music');
  frame.pick('music');
  frame.pick('stats');
  frame.show('chat');
  expect([frame.tab, kept]).toEqual(['chat', ['stats', 'chat']]);
  expect(source().frame.tab).toBe('threads');
});

test('a failure peeks red, and a plain flash meanwhile keeps it red', () => {
  const { frame } = source();
  frame.flash(true);
  expect(frame.glow).toBe('failed');
  frame.flash();
  expect(frame.glow).toBe('failed');
  vi.advanceTimersByTime(FLASH_MS);
  frame.flash();
  expect(frame.glow).toBe('done');
});

test('while the pill is being read, a hover peeks without opening, and counts again once it is let go', () => {
  const { state, frame } = source();
  frame.hush('ask', true);
  frame.hover(true);
  vi.advanceTimersByTime(HOVER_OPEN_MS * 3);
  expect([state.open, frame.size]).toEqual([false, 'peek']);
  frame.hush('ask', false);
  vi.advanceTimersByTime(HOVER_OPEN_MS - 1);
  expect(state.open).toBe(false);
  vi.advanceTimersByTime(1);
  expect(state.open).toBe(true);
});

test('a hush coming during a hover stops the opening under way', () => {
  const { state, frame } = source();
  frame.hover(true);
  vi.advanceTimersByTime(HOVER_OPEN_MS - 100);
  frame.hush('dot', true);
  vi.advanceTimersByTime(HOVER_OPEN_MS);
  expect(state.open).toBe(false);
  frame.hover(false);
  frame.hush('dot', false);
  vi.advanceTimersByTime(HOVER_OPEN_MS * 2);
  expect(state.open).toBe(false);
});

test('the edit mode opens the island and holds it open until it ends', () => {
  const { state, frame } = source();
  frame.edit(true);
  expect(frame.editing).toBe(true);
  expect(state.open).toBe(true);
  frame.hover(true);
  frame.hover(false);
  vi.advanceTimersByTime(LEAVE_MS * 3);
  expect(state.open).toBe(true);
  frame.edit(true);
  frame.edit(false);
  expect(frame.editing).toBe(false);
  vi.advanceTimersByTime(LEAVE_MS);
  expect(state.open).toBe(false);
});
