import { expect, test, vi } from 'vitest';
import type { Client } from '@boite/ui/lib/client';
import { fill, strings } from '../strings';
import type { SessionRow } from './sessions';
import { liveLine, rowDoing } from './session-text';
import { archive, changeCount, changeOf, relaunch } from './thread-actions';

function row(extra: Partial<SessionRow> = {}): SessionRow {
  return { id: 'a', title: 'Port the queue', projectId: 'p-1', state: 'working', since: 0, endedAt: null, steps: [], task: null, detail: null, progress: null, helpers: 0, ...extra };
}

test('a session does its last step, else its task, the core’s line, then its sub-agents', () => {
  const step = { id: 's', kind: 'command', name: 'Bash', target: 'bun run build', status: 'running', diff: null } as const;
  expect(rowDoing(row({ steps: [step], task: 'Build' }))).toBe(`${strings.island.sessions.tools.command} bun run build`);
  expect(rowDoing(row({ task: 'Build', detail: 'Compiling' }))).toBe('Build');
  expect(rowDoing(row({ detail: 'Compiling' }))).toBe('Compiling');
  expect(rowDoing(row({ helpers: 1 }))).toBe(strings.companion.hud.helper);
  expect(rowDoing(row({ helpers: 3 }))).toBe(fill(strings.companion.hud.helpers, { count: '3' }));
  expect(rowDoing(row())).toBeNull();
});

test('the pill’s line names the project, counts the tasks and fills its bar', () => {
  expect(liveLine(row({ task: 'Build', progress: { done: 3, total: 5 } }), 'Unity')).toEqual({ name: 'Unity', doing: '3/5 Build', progress: 0.6 });
  expect(liveLine(row(), '')).toEqual({ name: 'Port the queue', doing: strings.island.sessions.states.working, progress: null });
  expect(liveLine(row({ state: 'waiting', task: 'Build' }), 'Bots').doing).toBe(strings.island.sessions.states.waiting);
});

function client(answer: unknown = {}) {
  const call = vi.fn(async (_method: string, _params?: unknown) => answer);
  return { call, client: { call } as unknown as Client };
}

test('run again asks the thread to try again after a failure, to carry on after an answer', async () => {
  const fake = client();
  await relaunch(fake.client, 'thr-1', true);
  await relaunch(fake.client, 'thr-1', false);
  expect(fake.call.mock.calls.map(([method, params]) => [method, (params as { prompt: string }).prompt])).toEqual([
    ['turns.start', strings.island.notice.retryPrompt],
    ['turns.start', strings.island.notice.continuePrompt]
  ]);
});

test('archive leaves a thread started again meanwhile', async () => {
  const fake = client();
  await archive(fake.client, 'thr-1');
  expect(fake.call).toHaveBeenCalledWith('threads.archive', { threadId: 'thr-1', archived: true, onlyIfIdle: true });
});

test('a file’s change is cut like a session diff; a binary one has none', async () => {
  const long = 'x'.repeat(10_000);
  const text = await changeOf(client({ path: 'a.ts', oldPath: null, status: 'modified', oldText: null, newText: long, binary: false, truncated: false }).client, 'thr-1', 'a.ts');
  expect(text?.oldText).toBe('');
  expect(text?.newText.length).toBeLessThan(long.length);
  expect(await changeOf(client({ path: 'a.png', binary: true }).client, 'thr-1', 'a.png')).toBeNull();
});

test('a change counts its lines, or nothing when git counted none', () => {
  expect(changeCount({ additions: 12, deletions: 3 })).toBe('+12 −3');
  expect(changeCount({ additions: 4, deletions: null })).toBe('+4 −0');
  expect(changeCount({ additions: null, deletions: null })).toBe('');
});
