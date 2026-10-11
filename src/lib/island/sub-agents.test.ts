import { expect, test } from 'vitest';
import type { NativeAgent, ThreadSummary, Turn } from '@boite/contracts';
import { fill, strings } from '../strings';
import { agentsText } from './session-text';
import { AGENTS_SHOWN, childrenIndex, foldOf, liveCount, subAgentsOf, type SubAgent, type TeamRead } from './sub-agents';

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
    runningSince: status === 'idle' || status === 'error' ? null : 1_000,
    unread: false,
    archived: false,
    pinned: false,
    sessionId: null,
    createdAt: 0,
    updatedAt: 1_000,
    ...extra
  } as ThreadSummary;
}

function turn(threadId: string, status: Turn['status'], startedAt: number, finishedAt: number | null): Turn {
  return { id: `turn-${threadId}`, threadId, status, queuedAt: startedAt, startedAt, finishedAt, usage: null, error: null };
}

function native(id: string, status: NativeAgent['status'], startedAt: number, extra: Partial<NativeAgent> = {}): NativeAgent {
  return { id, status, startedAt, toolId: `tool-${id}`, ...extra } as NativeAgent;
}

const ROW = { id: 'main', since: 10_000, resting: false };
const kid = (id: string, status: ThreadSummary['status'], createdAt: number, extra: Partial<ThreadSummary> = {}) =>
  thread(id, status, { parentThreadId: 'main', createdAt, updatedAt: createdAt + 5_000, runningSince: status === 'running' ? createdAt : null, ...extra });
const agentsOf = (threads: ThreadSummary[], team?: TeamRead, row = ROW) => subAgentsOf(row, childrenIndex(threads), team);
const line = (agent: SubAgent) => [agent.id, agent.state, agent.depth];

test('the sub-agents come in start order, each followed by the ones it started', () => {
  const agents = agentsOf([
    thread('main', 'running'),
    kid('b', 'running', 13_000),
    kid('b1', 'running', 14_000, { parentThreadId: 'b' }),
    kid('a', 'idle', 11_000),
    kid('c', 'error', 12_000)
  ]);
  expect(agents.map(line)).toEqual([
    ['a', 'done', 0],
    ['c', 'failed', 0],
    ['b', 'working', 0],
    ['b1', 'working', 1]
  ]);
  expect(agents[0]).toMatchObject({ threadId: 'a', title: 'Thread a', start: 11_000, end: 16_000 });
  expect(agents[2]).toMatchObject({ start: 13_000, end: null });
});

test('a sub-agent asking a question, or waiting, waits; a stopped turn reads stopped', () => {
  const team: TeamRead = { natives: [], turns: new Map([['s', turn('s', 'stopped', 12_000, 15_000)]]) };
  const agents = agentsOf([kid('q', 'running', 11_000, { openQuestions: 1 }), kid('w', 'waiting', 11_500), kid('s', 'idle', 12_000)], team);
  expect(agents.map(line)).toEqual([
    ['q', 'waiting', 0],
    ['w', 'waiting', 0],
    ['s', 'stopped', 0]
  ]);
  // The team read gives the finished one its turn's own times.
  expect(agents[2]).toMatchObject({ start: 12_000, end: 15_000 });
});

test('only the current run: an old finished sub-agent leaves, an old one at work stays, and so does an old one with a new one under it', () => {
  const agents = agentsOf([
    kid('old-done', 'idle', 1_000),
    kid('old-live', 'running', 2_000),
    kid('old-parent', 'idle', 3_000),
    kid('new-under', 'idle', 12_000, { parentThreadId: 'old-parent' }),
    kid('slack', 'idle', 6_000)
  ]);
  expect(agents.map((agent) => agent.id)).toEqual(['old-live', 'old-parent', 'new-under', 'slack']);
});

test('archived and incognito sub-agents do not show, nor another thread’s', () => {
  const agents = agentsOf([kid('gone', 'running', 11_000, { archived: true }), kid('hidden', 'running', 11_000, { incognito: true }), thread('other', 'running', { parentThreadId: 'elsewhere' })]);
  expect(agents).toEqual([]);
});

test('a row at rest, or without sub-agents, has none: no chevron', () => {
  expect(agentsOf([thread('main', 'idle')])).toEqual([]);
  expect(agentsOf([kid('a', 'running', 11_000)], undefined, { ...ROW, resting: true })).toEqual([]);
});

test('the provider’s own agents join from the team read, by start, titled by their name or else their task', () => {
  const team: TeamRead = {
    natives: [
      native('n-run', 'running', 12_500, { name: 'Explore the retry paths\nmore' }),
      native('n-done', 'done', 10_500, { task: '\nRead the sync docs' }),
      native('n-old', 'done', 1_000, { name: 'From another request' }),
      native('n-old-live', 'running', 1_000, { name: 'Still at it' }),
      native('n-error', 'error', 13_000, { name: 'Probe', finishedAt: 14_000 }),
      native('n-unknown', 'unknown', 13_500)
    ],
    turns: new Map()
  };
  const agents = agentsOf([kid('a', 'running', 11_000)], team);
  expect(agents.map(line)).toEqual([
    ['native:n-old-live', 'working', 0],
    ['native:n-done', 'done', 0],
    ['a', 'working', 0],
    ['native:n-run', 'working', 0],
    ['native:n-error', 'failed', 0],
    ['native:n-unknown', 'unknown', 0]
  ]);
  expect(agents[1]).toMatchObject({ threadId: null, title: 'Read the sync docs', end: null });
  expect(agents[3]?.title).toBe('Explore the retry paths');
  expect(agents[4]).toMatchObject({ start: 13_000, end: 14_000 });
  expect(agents[5]?.title).toBe('');
  expect(liveCount(agents)).toBe(3);
});

test('the fold shows eight lines at most: finished groups leave first, oldest first', () => {
  const done = [1, 2, 3].map((n) => kid(`done-${n}`, 'idle', 10_000 + n * 100));
  const live = [1, 2, 3, 4, 5, 6, 7].map((n) => kid(`live-${n}`, 'running', 11_000 + n * 100));
  const agents = agentsOf([...done, ...live]);
  const fold = foldOf(agents);
  expect(fold.shown.map((agent) => agent.id)).toEqual(['done-3', ...live.map((one) => one.id)]);
  expect(fold).toMatchObject({ more: 2, finished: 3, total: 10 });
  expect(fold.shown).toHaveLength(AGENTS_SHOWN);
});

test('past the finished ones, the fold keeps the first lines and counts the rest', () => {
  const agents = agentsOf(Array.from({ length: 11 }, (_, n) => kid(`live-${n}`, 'running', 11_000 + n * 100)));
  const fold = foldOf(agents);
  expect(fold.shown.map((agent) => agent.id)).toEqual(agents.slice(0, AGENTS_SHOWN).map((agent) => agent.id));
  expect(fold).toMatchObject({ more: 3, finished: 0, total: 11 });
});

test('a finished group leaves whole, with the sub-agents under it', () => {
  const threads = [
    kid('p', 'idle', 10_100),
    kid('p1', 'idle', 10_200, { parentThreadId: 'p' }),
    ...Array.from({ length: 8 }, (_, n) => kid(`live-${n}`, 'running', 11_000 + n * 100))
  ];
  const fold = foldOf(agentsOf(threads));
  expect(fold.shown.map((agent) => agent.id)).toEqual(Array.from({ length: 8 }, (_, n) => `live-${n}`));
  expect(fold.more).toBe(2);
});

test('the row’s second line counts the sub-agents at work', () => {
  const copy = strings.island.sessions.agents;
  expect(agentsText(0)).toBeNull();
  expect(agentsText(1)).toBe(copy.one);
  expect(agentsText(3)).toBe(fill(copy.many, { count: '3' }));
});
