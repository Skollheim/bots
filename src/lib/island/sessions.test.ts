import { expect, test } from 'vitest';
import type { MessagePart, ThreadSummary, Turn } from '@boite/contracts';
import { LINGER_MS, STEP_LIMIT, currentStep, leadOf, reduceSessions, type SessionEvent, type SessionRow } from './sessions';

function thread(id: string, status: ThreadSummary['status'], extra: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    projectId: 'p-1',
    title: `Thread ${id}`,
    titleSource: 'user',
    providerId: 'claude',
    accountId: 'a-1',
    model: null,
    effort: null,
    cwd: 'C:\\src\\one',
    branch: null,
    permissionMode: 'default',
    status,
    runningSince: status === 'idle' ? null : 1_000,
    unread: false,
    archived: false,
    pinned: false,
    sessionId: null,
    createdAt: 0,
    updatedAt: 1_000,
    ...extra
  } as ThreadSummary;
}

function turn(threadId: string, status: Turn['status'], extra: Partial<Turn> = {}): Turn {
  return { id: `turn-${threadId}`, threadId, status, queuedAt: 900, startedAt: 1_000, finishedAt: status === 'running' ? null : 5_000, usage: null, error: null, ...extra };
}

function tool(toolId: string, name: string, input: unknown, status: 'running' | 'done' | 'error' = 'done', extra: Record<string, unknown> = {}): MessagePart {
  return { type: 'tool', toolId, name, input, output: null, status, ...extra } as MessagePart;
}

function run(...events: SessionEvent[]): SessionRow[] {
  return events.reduce<SessionRow[]>((rows, event) => reduceSessions(rows, event), []);
}

const listed = (at = 2_000, ...threads: ThreadSummary[]): SessionEvent => ({ type: 'threads', threads, at });

test('the list gives one row per thread at work or waiting, waiting first', () => {
  const rows = run(listed(2_000, thread('a', 'running'), thread('b', 'idle'), thread('c', 'waiting'), thread('d', 'queued'), thread('e', 'running', { archived: true })));
  expect(rows.map((row) => [row.id, row.state])).toEqual([['c', 'waiting'], ['a', 'working'], ['d', 'working']]);
  expect(rows[0]?.since).toBe(1_000);
  expect(leadOf(rows)?.id).toBe('c');
});

test('an open question the agent did not stop for makes the row wait', () => {
  const rows = run(listed(2_000, thread('a', 'running', { openQuestions: 1 })));
  expect(rows[0]?.state).toBe('waiting');
});

test('the elapsed time counts from the request, not the latest turn', () => {
  const rows = run(listed(9_000, thread('a', 'running', { requestSince: 400, runningSince: 8_000 })));
  expect(rows[0]?.since).toBe(400);
});

test('an old failure on the list does not show, a fresh one does', () => {
  expect(run(listed(LINGER_MS + 5_000, thread('a', 'error', { updatedAt: 1_000 })))).toEqual([]);
  expect(run(listed(5_000, thread('a', 'error', { updatedAt: 4_000 })))[0]?.state).toBe('failed');
});

test('tool parts become steps: the tool, its target, its status', () => {
  const rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'part', threadId: 'a', part: tool('t1', 'Read', { file_path: 'C:\\src\\one\\lib\\scheduler.ts' }) },
    { type: 'part', threadId: 'a', part: tool('t2', 'Bash', { command: 'bun run test\n--watch' }, 'running') },
    { type: 'part', threadId: 'a', part: { type: 'text', text: 'hello' } as MessagePart }
  );
  const steps = rows[0]?.steps ?? [];
  expect(steps.map((step) => [step.kind, step.target, step.status])).toEqual([['read', 'scheduler.ts', 'done'], ['command', 'bun run test', 'running']]);
});

test('a step updates in place and the row keeps the last six', () => {
  const events: SessionEvent[] = [listed(2_000, thread('a', 'running'))];
  for (let i = 0; i < STEP_LIMIT + 2; i += 1) events.push({ type: 'part', threadId: 'a', part: tool(`t${i}`, 'Grep', { pattern: `p${i}` }, 'running') });
  events.push({ type: 'part', threadId: 'a', part: tool(`t${STEP_LIMIT + 1}`, 'Grep', { pattern: 'last' }, 'done') });
  const steps = run(...events)[0]?.steps ?? [];
  expect(steps).toHaveLength(STEP_LIMIT);
  expect(steps[0]?.id).toBe('t2');
  expect(currentStep(run(...events)[0]!)).toMatchObject({ target: 'last', status: 'done' });
});

test('an Edit step carries its diff, from the document first, else from the input', () => {
  const fromInput = tool('e1', 'Edit', { file_path: 'C:\\a\\b.ts', old_string: 'one', new_string: 'two' });
  const fromDocument = tool('e2', 'Edit', { file_path: 'C:\\a\\c.ts', old_string: 'x', new_string: 'y' }, 'done', {
    documents: [{ kind: 'diff', path: 'C:\\a\\c.ts', oldText: 'whole old', newText: 'whole new' }]
  });
  const steps = run(listed(2_000, thread('a', 'running')), { type: 'part', threadId: 'a', part: fromInput }, { type: 'part', threadId: 'a', part: fromDocument })[0]?.steps ?? [];
  expect(steps[0]?.diff).toEqual({ path: 'C:\\a\\b.ts', oldText: 'one', newText: 'two' });
  expect(steps[1]?.diff).toEqual({ path: 'C:\\a\\c.ts', oldText: 'whole old', newText: 'whole new' });
  expect(run(listed(2_000, thread('a', 'running')), { type: 'part', threadId: 'a', part: tool('r', 'Read', { file_path: 'x' }) })[0]?.steps[0]?.diff).toBeNull();
});

test('a finished turn closes the row with a Done step, once, and it stays two minutes', () => {
  let rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'part', threadId: 'a', part: tool('t1', 'Bash', { command: 'ls' }, 'running') },
    { type: 'turnFinished', turn: turn('a', 'done'), at: 5_000 },
    { type: 'thread', thread: thread('a', 'idle'), at: 5_100 },
    { type: 'turnFinished', turn: turn('a', 'done'), at: 5_200 }
  );
  expect(rows[0]).toMatchObject({ state: 'done', endedAt: 5_000 });
  expect(rows[0]?.steps.map((step) => [step.kind, step.status])).toEqual([['command', 'done'], ['done', 'done']]);
  rows = reduceSessions(rows, { type: 'prune', at: 5_000 + LINGER_MS - 1 });
  expect(rows).toHaveLength(1);
  expect(reduceSessions(rows, { type: 'prune', at: 5_000 + LINGER_MS })).toEqual([]);
});

test('the thread going idle first also makes the row done', () => {
  const rows = run(listed(2_000, thread('a', 'running')), { type: 'thread', thread: thread('a', 'idle'), at: 4_000 });
  expect(rows[0]).toMatchObject({ state: 'done', endedAt: 4_000 });
});

test('a turn in error fails the row, and idle afterwards keeps it failed', () => {
  const rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'turnFinished', turn: turn('a', 'error', { error: 'quota reached\nmore' }), at: 5_000 },
    { type: 'thread', thread: thread('a', 'idle'), at: 5_100 }
  );
  expect(rows[0]?.state).toBe('failed');
  expect(currentStep(rows[0]!)).toMatchObject({ kind: 'done', status: 'error', target: 'quota reached' });
});

test('a new turn on an ended row starts it over', () => {
  const rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'part', threadId: 'a', part: tool('t1', 'Read', { file_path: 'x' }) },
    { type: 'turnFinished', turn: turn('a', 'done'), at: 5_000 },
    { type: 'turnStarted', turn: turn('a', 'running', { id: 'turn-2', startedAt: 6_000 }), at: 6_000 }
  );
  expect(rows[0]).toMatchObject({ state: 'working', since: 6_000, endedAt: null, steps: [] });
});

test('an update for an unknown idle thread adds nothing; one at work adds a row', () => {
  expect(run({ type: 'thread', thread: thread('a', 'idle'), at: 2_000 })).toEqual([]);
  expect(run({ type: 'thread', thread: thread('a', 'running'), at: 2_000 })[0]?.title).toBe('Thread a');
});

test('a page of messages seeds the steps, the live ones stay on top', () => {
  const rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'part', threadId: 'a', part: tool('live', 'Bash', { command: 'git status' }, 'running') },
    {
      type: 'messages',
      threadId: 'a',
      messages: [{ id: 'm1', threadId: 'a', turnId: 'turn-a', role: 'assistant', state: 'streaming', createdAt: 1_000, parts: [tool('old', 'Read', { file_path: 'a.ts' }), { type: 'text', text: 'ok' } as MessagePart] }]
    }
  );
  expect(rows[0]?.steps.map((step) => step.id)).toEqual(['old', 'live']);
});

test('the task in progress follows the activity', () => {
  const rows = run(listed(2_000, thread('a', 'running')), {
    type: 'activity',
    threadId: 'a',
    activity: { goal: null, loop: null, tasks: [{ id: '1', text: 'Write tests', status: 'completed' }, { id: '2', text: 'Port the queue', status: 'in_progress' }] }
  });
  expect(rows[0]?.task).toBe('Port the queue');
});

test('a live row the list no longer has leaves; an ended one stays its two minutes', () => {
  let rows = run(listed(2_000, thread('a', 'running'), thread('b', 'running')), { type: 'thread', thread: thread('b', 'idle'), at: 3_000 });
  rows = reduceSessions(rows, listed(4_000));
  expect(rows.map((row) => row.id)).toEqual(['b']);
});

test('a list read before the turn ended does not bring the row back to work', () => {
  const rows = run(
    listed(2_000, thread('a', 'running')),
    { type: 'turnFinished', turn: turn('a', 'done'), at: 5_000 },
    listed(5_100, thread('a', 'running', { runningSince: 1_000 }))
  );
  expect(rows[0]?.state).toBe('done');
  expect(run(listed(2_000, thread('a', 'running')), { type: 'turnFinished', turn: turn('a', 'done'), at: 5_000 }, listed(7_000, thread('a', 'running', { runningSince: 6_000 })))[0]?.state).toBe('working');
});

test('the reducer never edits the rows it is given', () => {
  const before = run(listed(2_000, thread('a', 'running')));
  const frozen = structuredClone(before);
  reduceSessions(before, { type: 'part', threadId: 'a', part: tool('t1', 'Read', { file_path: 'x' }) });
  expect(before).toEqual(frozen);
});
