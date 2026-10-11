import { expect, test } from 'vitest';
import type { ThreadSummary } from '@boite/contracts';
import { coreKey, followedGone, parseFollowed, restingRow, withFollowed } from './followed';

function thread(id: string, extra: Partial<ThreadSummary> = {}): ThreadSummary {
  return { id, projectId: 'p-1', title: `Thread ${id}`, status: 'idle', archived: false, updatedAt: 5_000, ...extra } as ThreadSummary;
}

test('the choice belongs to the core’s host, or to the one core when it names none', () => {
  expect(coreKey({ hostname: 'desk' })).toBe('desk');
  expect(coreKey({ hostname: '  ' })).toBe('core');
  expect(coreKey(null)).toBe('core');
});

test('the stored choices are read entry by entry; one per core is written or let go', () => {
  expect(parseFollowed(null)).toEqual({});
  expect(parseFollowed('not json')).toEqual({});
  expect(parseFollowed('["a"]')).toEqual({});
  expect(parseFollowed('{"desk":"t-1","laptop":3,"x":""}')).toEqual({ desk: 't-1' });
  const map = withFollowed({ desk: 't-1' }, 'laptop', 't-2');
  expect(map).toEqual({ desk: 't-1', laptop: 't-2' });
  expect(withFollowed(map, 'desk', null)).toEqual({ laptop: 't-2' });
});

test('the followed thread is gone once the list has it no more or archived; an empty list is not read yet', () => {
  expect(followedGone('a', [])).toBe(false);
  expect(followedGone('a', [thread('a')])).toBe(false);
  expect(followedGone('a', [thread('b')])).toBe(true);
  expect(followedGone('a', [thread('a', { archived: true })])).toBe(true);
});

test('a followed thread with no row rests, or shows its failure; some threads never have one', () => {
  expect(restingRow(thread('a'))).toMatchObject({ id: 'a', title: 'Thread a', state: 'done', since: 5_000, endedAt: 5_000, steps: [], resting: true });
  expect(restingRow(thread('a', { status: 'error' }))?.state).toBe('failed');
  expect(restingRow(thread('a', { archived: true }))).toBeNull();
  expect(restingRow(thread('a', { incognito: true }))).toBeNull();
  expect(restingRow(thread('a', { parentThreadId: 'p' }))).toBeNull();
});
