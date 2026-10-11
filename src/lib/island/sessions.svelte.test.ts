import { flushSync } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { ThreadSummary } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { FOLLOWED_KEY } from './followed';
import { Sessions } from './sessions.svelte';

function thread(id: string, extra: Partial<ThreadSummary> = {}): ThreadSummary {
  return { id, projectId: 'p-1', title: `Thread ${id}`, status: 'idle', runningSince: null, archived: false, updatedAt: 5_000, ...extra } as ThreadSummary;
}

/** The sessions on a quiet core: idle threads only, so nothing is subscribed. */
function harness() {
  let threads = $state.raw<ThreadSummary[]>([]);
  const call = vi.fn(async (_method: string, _params?: unknown) => ({}));
  const client = { core: { hostname: 'desk' }, on: () => () => {}, call } as unknown as Client;
  const sessions = new Sessions({ client: () => client, threads: () => threads, own: () => [] });
  const stop = sessions.start();
  return {
    sessions,
    call,
    stop,
    list(next: ThreadSummary[]) {
      threads = next;
      flushSync();
    }
  };
}

const stored = () => JSON.parse(localStorage.getItem(FOLLOWED_KEY) ?? '{}') as Record<string, string>;

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

test('the thread followed on this core shows at rest with no turn seen, and is let go when archived', () => {
  localStorage.setItem(FOLLOWED_KEY, JSON.stringify({ desk: 'a', laptop: 'z' }));
  const { sessions, list, stop } = harness();
  list([thread('a'), thread('b')]);
  expect(sessions.followedId).toBe('a');
  expect(sessions.rows.map((row) => [row.id, row.resting])).toEqual([['a', true]]);
  expect(sessions.followedRow?.id).toBe('a');
  expect(sessions.ended).toEqual(['a']);

  sessions.followed.toggle('b');
  flushSync();
  expect(sessions.rows.map((row) => row.id)).toEqual(['b']);
  expect(stored()).toEqual({ desk: 'b', laptop: 'z' });

  list([thread('a'), thread('b', { archived: true })]);
  expect(sessions.followedId).toBeNull();
  expect(sessions.rows).toEqual([]);
  expect(stored()).toEqual({ laptop: 'z' });
  stop();
});

test('an ended row the pill follows outlasts its two minutes', () => {
  vi.useFakeTimers();
  const { sessions, list, stop } = harness();
  sessions.apply({ type: 'restore', row: { id: 'a', title: 'Thread a', projectId: 'p-1', state: 'done', since: Date.now() - 1_000, endedAt: Date.now(), steps: [], task: null, detail: null, progress: null, helpers: 0 } });
  list([thread('a')]);
  sessions.followed.set('a');
  flushSync();
  vi.advanceTimersByTime(10 * 60_000);
  flushSync();
  expect(sessions.rows.map((row) => [row.id, row.resting ?? false])).toEqual([['a', false]]);
  stop();
});

test('an archive undone gives the row back while the list still says archived, and follows it again', async () => {
  const { sessions, list, call, stop } = harness();
  const row = { id: 'a', title: 'Thread a', projectId: 'p-1', state: 'done' as const, since: 1_000, endedAt: Date.now(), steps: [], task: null, detail: null, progress: null, helpers: 0 };
  sessions.apply({ type: 'restore', row });
  list([thread('a')]);
  sessions.followed.set('a');
  flushSync();

  await sessions.undo.archive(row, sessions.followedId === 'a');
  list([thread('a', { archived: true })]);
  expect(sessions.rows).toEqual([]);
  expect(sessions.followedId).toBeNull();

  await sessions.undo.undo('a');
  flushSync();
  expect(call).toHaveBeenLastCalledWith('threads.archive', { threadId: 'a', archived: false });
  expect(sessions.undo.lines).toEqual([]);
  expect(sessions.rows.map((entry) => entry.id)).toEqual(['a']);
  // A list read before the core unarchived it: the row stays.
  list([thread('a', { archived: true }), thread('b')]);
  expect(sessions.rows.map((entry) => entry.id)).toEqual(['a']);
  list([thread('a'), thread('b')]);
  expect(sessions.rows.map((entry) => entry.id)).toEqual(['a']);
  expect(sessions.followedId).toBe('a');
  stop();
});
