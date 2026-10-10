import type { Message, ThreadSummary, Turn } from '@boite/contracts';
import { expect, test, vi } from 'vitest';
import { changedFiles, duration, recapCandidates, RecapReader, recapThread, startOfDay, summarize, todaysTurns } from './recap.svelte';

const NOW = new Date(2026, 9, 10, 15, 0).getTime();
const MIDNIGHT = new Date(2026, 9, 10, 0, 0).getTime();
const MIN = 60_000;

function thread(id: string, over: Partial<ThreadSummary> = {}): ThreadSummary {
  return { id, title: `Thread ${id}`, projectId: 'p1', status: 'idle', updatedAt: NOW - MIN, archived: false, ...over } as ThreadSummary;
}

function turn(id: string, startedAt: number | null, finishedAt: number | null, status: Turn['status'] = 'done'): Turn {
  return { id, threadId: 't', status, queuedAt: startedAt ?? 0, startedAt, finishedAt, usage: null, error: null } as unknown as Turn;
}

function diffMessage(turnId: string, paths: string[]): Message {
  return {
    id: `m-${turnId}`,
    threadId: 't',
    turnId,
    role: 'assistant',
    state: 'complete',
    createdAt: 0,
    parts: [{ type: 'tool', toolId: 'x', name: 'Edit', input: {}, output: null, status: 'done', documents: paths.map((path) => ({ kind: 'diff', path, oldText: '', newText: '' })) }]
  } as unknown as Message;
}

test('the day starts at local midnight', () => {
  expect(startOfDay(NOW)).toBe(MIDNIGHT);
});

test('only the user’s own threads at rest and touched today are read', () => {
  const picked = recapCandidates(
    [
      thread('old', { updatedAt: MIDNIGHT - MIN }),
      thread('agent', { agentSessionId: 's' } as Partial<ThreadSummary>),
      thread('secret', { incognito: true }),
      thread('mine'),
      thread('busy', { status: 'running' }),
      thread('assistant'),
      thread('later', { updatedAt: NOW })
    ],
    MIDNIGHT,
    ['assistant']
  );
  expect(picked.map((entry) => entry.id)).toEqual(['later', 'mine']);
});

test('a turn counts the time it ran inside today, and only once it finished', () => {
  const turns = [turn('a', MIDNIGHT - 10 * MIN, MIDNIGHT + 5 * MIN), turn('b', NOW - 30 * MIN, NOW - 10 * MIN), turn('c', NOW - MIN, null, 'running'), turn('d', MIDNIGHT - 30 * MIN, MIDNIGHT - MIN)];
  expect(todaysTurns(turns, MIDNIGHT)).toEqual([
    { finishedAt: MIDNIGHT + 5 * MIN, workedMs: 5 * MIN },
    { finishedAt: NOW - 10 * MIN, workedMs: 20 * MIN }
  ]);
});

test('files changed are the distinct diff paths of today’s turns', () => {
  const messages = [diffMessage('a', ['src/a.ts', 'src/b.ts']), diffMessage('b', ['src/a.ts']), diffMessage('old', ['src/z.ts'])];
  expect([...changedFiles(messages, new Set(['a', 'b']))]).toEqual(['src/a.ts', 'src/b.ts']);
});

test('a thread with no turn finished today has no line; the totals add the lines up', () => {
  expect(recapThread(thread('x'), [turn('d', MIDNIGHT - 30 * MIN, MIDNIGHT - MIN)], [], MIDNIGHT, null)).toBeNull();
  const one = recapThread(thread('x'), [turn('a', NOW - 50 * MIN, NOW - 20 * MIN)], [diffMessage('a', ['a.ts', 'b.ts'])], MIDNIGHT, 'Boite')!;
  expect(one).toMatchObject({ id: 'x', project: 'Boite', workedMs: 30 * MIN, files: 2, finishedAt: NOW - 20 * MIN });
  const two = { ...one, id: 'y', finishedAt: NOW - 5 * MIN, workedMs: 10 * MIN, files: 1 };
  const recap = summarize([one, two]);
  expect(recap.threads.map((line) => line.id)).toEqual(['y', 'x']);
  expect(recap).toMatchObject({ files: 3, workedMs: 40 * MIN });
});

test('a duration splits into hours and minutes', () => {
  expect(duration(125 * MIN)).toEqual({ hours: 2, minutes: 5 });
  expect(duration(20_000)).toEqual({ hours: 0, minutes: 0 });
});

test('the reader reads the day once, then keeps it a moment', async () => {
  const call = vi.fn(async (method: string, params: { threadId?: string }) => {
    if (method === 'threads.list') return [thread('x'), thread('y', { projectId: 'p2' })];
    return { turns: params.threadId === 'x' ? [turn('a', NOW - 40 * MIN, NOW - 30 * MIN)] : [], messages: [diffMessage('a', ['a.ts'])] };
  });
  const reader = new RecapReader({ client: () => ({ call }) as never, projects: () => new Map([['p1', 'Boite']]), leftOut: () => [] });
  await reader.load(NOW);
  expect(reader.recap.threads).toEqual([{ id: 'x', title: 'Thread x', project: 'Boite', finishedAt: NOW - 30 * MIN, workedMs: 10 * MIN, files: 1 }]);
  const calls = call.mock.calls.length;
  await reader.load(NOW + 1_000);
  expect(call.mock.calls.length).toBe(calls);
  await reader.load(NOW + 1_000, true);
  expect(call.mock.calls.length).toBeGreaterThan(calls);
});
