import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Client } from '@boite/ui/lib/client';
import { fill, strings } from '../strings';
import { listed, UNDO_MS, type UndoLine } from './archive-undo';
import { ArchiveUndo } from './archive-undo.svelte';
import type { SessionRow } from './sessions';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function row(id: string, state: SessionRow['state'], since: number): SessionRow {
  return { id, title: `Thread ${id}`, projectId: null, state, since, endedAt: state === 'done' || state === 'failed' ? since + 10 : null, steps: [], task: null, detail: null, progress: null, helpers: 0 };
}

const line = (entry: SessionRow): UndoLine => ({ threadId: entry.id, row: entry, followed: false, at: 0, undoing: false, problem: '' });

test('an archive line stands where its row stood, and hides the row the list still has', () => {
  const [a, b, c] = [row('a', 'working', 1), row('b', 'done', 2), row('c', 'done', 3)];
  expect(listed([a, b, c], [])).toEqual([a, b, c].map((entry) => ({ row: entry, undo: null })));
  const shown = listed([a, c], [line(b)]);
  expect(shown.map((entry) => [entry.row.id, entry.undo !== null])).toEqual([['a', false], ['b', true], ['c', false]]);
  // The list has not caught up with the archive yet: the line stands for the row, once.
  expect(listed([a, b, c], [line(b), line(c)]).map((entry) => [entry.row.id, entry.undo !== null])).toEqual([['a', false], ['b', true], ['c', true]]);
});

function fake(fail: (archived: boolean) => string | null = () => null) {
  const call = vi.fn(async (_method: string, params: { archived: boolean }) => {
    const reason = fail(params.archived);
    if (reason) throw new Error(reason);
    return {};
  });
  return { call, client: { call } as unknown as Client };
}

test('archived at once; the line and its timer last the seconds of the undo, then the card goes', async () => {
  const core = fake();
  const restored: UndoLine[] = [];
  const undo = new ArchiveUndo({ client: () => core.client, restore: (entry) => restored.push(entry) });
  const gone = vi.fn();
  await undo.archive(row('a', 'done', 1), true, gone);
  expect(core.call).toHaveBeenCalledWith('threads.archive', { threadId: 'a', archived: true, onlyIfIdle: true });
  expect(undo.lines.map((entry) => [entry.threadId, entry.followed])).toEqual([['a', true]]);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(UNDO_MS - 1);
  expect(gone).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(gone).toHaveBeenCalledOnce();
  expect(undo.lines).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(restored).toEqual([]);
});

test('each archive has its own undo; Undo unarchives and gives the row back, its card kept', async () => {
  const core = fake();
  const restored: string[] = [];
  const undo = new ArchiveUndo({ client: () => core.client, restore: (entry) => restored.push(entry.threadId) });
  const gone = vi.fn();
  await undo.archive(row('a', 'done', 1), false, gone);
  vi.advanceTimersByTime(2_000);
  await undo.archive(row('b', 'done', 2), false);
  expect(undo.has('a') && undo.has('b')).toBe(true);
  await undo.undo('a');
  expect(core.call).toHaveBeenLastCalledWith('threads.archive', { threadId: 'a', archived: false });
  expect(restored).toEqual(['a']);
  expect(undo.lines.map((entry) => entry.threadId)).toEqual(['b']);
  vi.advanceTimersByTime(UNDO_MS);
  expect(gone).not.toHaveBeenCalled();
  expect(undo.lines).toEqual([]);
});

test('a refused archive throws and leaves no line; a refused undo says why and keeps the line its time', async () => {
  const refused = fake((archived) => (archived ? 'busy' : null));
  const first = new ArchiveUndo({ client: () => refused.client, restore: () => {} });
  await expect(first.archive(row('a', 'done', 1), false)).rejects.toThrow('busy');
  expect(first.lines).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);

  const stuck = fake((archived) => (archived ? null : 'offline'));
  const restored = vi.fn();
  const undo = new ArchiveUndo({ client: () => stuck.client, restore: restored });
  const gone = vi.fn();
  await undo.archive(row('a', 'done', 1), false, gone);
  await undo.undo('a');
  expect(restored).not.toHaveBeenCalled();
  expect(undo.lines[0]).toMatchObject({ undoing: false, problem: fill(strings.island.notice.failed, { reason: 'offline' }) });
  vi.advanceTimersByTime(UNDO_MS);
  expect(gone).toHaveBeenCalledOnce();
  expect(undo.lines).toEqual([]);
});

test('the island leaving keeps every archive and lets their cards go', async () => {
  const core = fake();
  const undo = new ArchiveUndo({ client: () => core.client, restore: () => {} });
  const gone = vi.fn();
  await undo.archive(row('a', 'done', 1), false, gone);
  undo.dispose();
  expect(gone).toHaveBeenCalledOnce();
  expect(undo.lines).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
  expect(core.call).toHaveBeenCalledTimes(1);
});
