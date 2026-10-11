import { expect, test } from 'vitest';
import type { Message, MessagePart, Turn } from '@boite/contracts';
import { fill, strings } from '../strings';
import { endedRows, finishLine, finishOf, turnFiles, type Finish } from './finished';
import type { SessionRow } from './sessions';

const copy = strings.island.finish;

function row(id: string, state: SessionRow['state'], extra: Partial<SessionRow> = {}): SessionRow {
  return { id, title: `Thread ${id}`, projectId: null, state, since: 1_000, endedAt: state === 'done' || state === 'failed' ? 181_000 : null, steps: [], task: null, detail: null, progress: null, helpers: 0, ...extra };
}

function turn(id: string, finishedAt: number | null): Turn {
  return { id, threadId: 't', status: finishedAt === null ? 'running' : 'done', queuedAt: 0, startedAt: 0, finishedAt, usage: null, error: null };
}

function edit(path: string | null, status: 'done' | 'error' = 'done', name = 'Edit'): MessagePart {
  const documents = path ? [{ kind: 'diff', path, oldText: '', newText: '' }] : undefined;
  return { type: 'tool', toolId: `tool-${path ?? 'none'}`, name, input: { file_path: path ?? 'x.ts' }, output: null, status, documents } as MessagePart;
}

function message(id: string, turnId: string, parts: MessagePart[]): Message {
  return { id, threadId: 't', turnId, role: 'assistant', parts, state: 'complete', createdAt: 0 } as Message;
}

const finish = (title: string, extra: Partial<Finish> = {}): Finish => ({ threadId: title, title, failed: false, workedMs: 4 * 60_000, files: null, ...extra });

test('a row counts as ended only when it was at work or waiting at the last look', () => {
  const before = new Map([
    ['a', 'working'],
    ['b', 'waiting'],
    ['c', 'done'],
    ['d', 'working']
  ] as const);
  const ended = endedRows(before, [row('a', 'done'), row('b', 'failed'), row('c', 'done'), row('d', 'working'), row('e', 'failed')]);
  expect(ended.map((entry) => entry.id)).toEqual(['a', 'b']);
});

test('a finish keeps the title, the failure and how long the request ran', () => {
  expect(finishOf(row('a', 'failed'), 2)).toEqual({ threadId: 'a', title: 'Thread a', failed: true, workedMs: 180_000, files: 2 });
  expect(finishOf(row('b', 'done', { title: '' }), null).title).toBe(strings.companion.untitled);
});

test('the files of the last turn are counted once each, from their diffs', () => {
  const snapshot = {
    turns: [turn('t1', 100), turn('t2', 200)],
    messages: [message('m1', 't1', [edit('old.ts')]), message('m2', 't2', [edit('a.ts'), edit('b.ts')]), message('m3', 't2', [edit('a.ts')])],
    messagesBefore: 'm0'
  };
  expect(turnFiles(snapshot)).toBe(2);
});

test('no count when the page may miss the start of the turn or an edit carries no diff', () => {
  const cut = { turns: [turn('t2', 200)], messages: [message('m2', 't2', [edit('a.ts')])], messagesBefore: 'm1' };
  expect(turnFiles(cut)).toBeNull();
  expect(turnFiles({ ...cut, messagesBefore: null })).toBe(1);
  const blind = { turns: [turn('t2', 200)], messages: [message('m2', 't2', [edit(null)])], messagesBefore: null };
  expect(turnFiles(blind)).toBeNull();
  // A failed edit changed nothing: it does not blind the count.
  expect(turnFiles({ ...blind, messages: [message('m2', 't2', [edit(null, 'error')])] })).toBe(0);
  expect(turnFiles({ turns: [turn('t2', null)], messages: [], messagesBefore: null })).toBeNull();
});

test('one thread: its name, done or failed, then its files, else how long it ran', () => {
  expect(finishLine([finish('Port the scheduler', { files: 3 })])).toEqual({ text: `Port the scheduler · ${copy.done} · ${fill(copy.filesMany, { count: '3' })}`, tone: 'done' });
  expect(finishLine([finish('Tidy', { files: 1 })])?.text).toBe(`Tidy · ${copy.done} · ${copy.filesOne}`);
  expect(finishLine([finish('Tidy', { files: 0 })])?.text).toBe(`Tidy · ${copy.done} · ${fill(strings.island.sessions.duration.minutes, { n: '4' })}`);
  expect(finishLine([finish('Tidy', { failed: true, workedMs: 45_000 })])).toEqual({
    text: `Tidy · ${copy.failed} · ${fill(strings.island.sessions.duration.seconds, { n: '45' })}`,
    tone: 'failed'
  });
});

test('several threads told together as a count, a failure among them in red', () => {
  expect(finishLine([])).toBeNull();
  expect(finishLine([finish('a'), finish('b')])).toEqual({ text: fill(copy.manyDone, { count: '2' }), tone: 'done' });
  expect(finishLine([finish('a'), finish('b', { failed: true }), finish('c')])).toEqual({
    text: `${fill(copy.manyDone, { count: '3' })} · ${fill(copy.someFailed, { count: '1' })}`,
    tone: 'failed'
  });
  expect(finishLine([finish('a', { failed: true }), finish('b', { failed: true })])?.text).toBe(fill(copy.manyFailed, { count: '2' }));
});
