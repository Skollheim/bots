import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PermissionRequest, ThreadSummary } from '@boite/contracts';
import { GroupClient } from '../group/group-client';
import { RULES_KEY } from './allow-rules';
import { AllowRules, forgetAllRules, storedRules, threadTag, TRACE_MS } from './allow.svelte';

const threads = [
  { id: 't1', projectId: 'p1', title: 'Run the tests' },
  { id: 't2', projectId: 'p1', title: 'Fix the docs' }
] as ThreadSummary[];
const projects = new Map([['p1', 'Notes']]);
const ask = (id: string, command: string, threadId = 't1'): PermissionRequest =>
  ({ id, threadId, turnId: 'turn', toolName: 'Bash', input: { command }, description: '', createdAt: 0 }) as PermissionRequest;

function setup(fail = false) {
  const answered: string[] = [];
  const client = {
    call: vi.fn(async (_method: string, params: { requestId: string; decision: string }) => {
      if (fail) throw new Error('gone');
      answered.push(`${params.requestId}:${params.decision}`);
    })
  };
  const failed = vi.fn();
  const rules = new AllowRules({ client: () => client as never, failed });
  return { rules, answered, client, failed };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

test('a request a rule covers is answered at once, once, and leaves a short trace', async () => {
  const { rules, answered, client } = setup();
  expect(rules.add(ask('r0', 'bun run test'), 'thread', threads, projects)).toBe(true);
  const left = rules.sift([ask('r1', 'bun run test'), ask('r2', 'bun run test && rm -rf .'), ask('r3', 'bun run test', 't2')], threads);
  expect(left.map((request) => request.id)).toEqual(['r2', 'r3']);
  await vi.advanceTimersByTimeAsync(0);
  expect(answered).toEqual(['r1:allow']);
  expect(rules.trace).toMatchObject({ threadId: 't1', text: 'Bash · bun run test' });
  // Read again before the core let go of it: not answered twice.
  rules.sift([ask('r1', 'bun run test')], threads);
  expect(client.call).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(TRACE_MS);
  expect(rules.trace).toBeNull();
});

test('a project rule holds in every thread of the project, and is kept for good', () => {
  const { rules } = setup();
  rules.add(ask('r0', 'git status', 't2'), 'project', threads, projects);
  expect(rules.sift([ask('r1', 'git status', 't1')], threads)).toEqual([]);
  expect(storedRules()).toMatchObject([{ scope: 'project', scopeId: 'p1', scopeName: 'Notes', core: 'demo' }]);
  expect(JSON.parse(localStorage.getItem(RULES_KEY)!)).toHaveLength(1);
});

test("a thread's rules go with the thread; a request the core refused goes to the user", async () => {
  const { rules, failed } = setup(true);
  rules.add(ask('r0', 'ls'), 'thread', threads, projects);
  expect(rules.sift([ask('r1', 'ls')], threads)).toEqual([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(failed).toHaveBeenCalledOnce();
  expect(rules.sift([ask('r1', 'ls')], threads).map((request) => request.id)).toEqual(['r1']);
  // The thread archived: it is no longer listed, and its rule is gone.
  rules.sift([], threads.slice(1));
  expect(rules.rules).toEqual([]);
  expect(storedRules()).toEqual([]);
});

test('no rule for a project-less thread, nor for a request too long to read', () => {
  const { rules } = setup();
  const loose = [{ id: 't9', projectId: null, title: 'Draft' }] as ThreadSummary[];
  expect(rules.add(ask('r0', 'ls', 't9'), 'project', loose, projects)).toBe(false);
  expect(rules.add(ask('r0', 'x'.repeat(5000)), 'thread', threads, projects)).toBe(false);
  rules.add(ask('r0', 'ls'), 'thread', threads, projects);
  forgetAllRules();
  expect(storedRules()).toEqual([]);
});

test("rules are each machine's: a server rule never answers here, and goes only when the server's list says so", async () => {
  const answered: string[] = [];
  let listed: string[] = [];
  const group = Object.assign(Object.create(GroupClient.prototype) as GroupClient, {
    local: { call: vi.fn() },
    coreIdOf: (threadId: string) => (threadId === 't3' ? 'core-srv' : null),
    answered: () => listed,
    call: vi.fn(async (_method: string, params: { requestId: string; decision: string }) => void answered.push(`${params.requestId}:${params.decision}`))
  });
  const rules = new AllowRules({ client: () => group as never, failed: vi.fn() });
  const all = [...threads, { id: 't3', projectId: 'p1', title: 'Fix the gameplay' }] as ThreadSummary[];
  expect(threadTag(group, 't3')).toBe('demo:group:core-srv');
  expect(threadTag(group, 't1')).toBe('demo');

  // Same project id on both machines: the rule made for the server's stays there.
  rules.add(ask('r0', 'dotnet test', 't3'), 'project', all, projects);
  expect(storedRules()).toMatchObject([{ scope: 'project', core: 'demo:group:core-srv' }]);
  expect(rules.sift([ask('r1', 'dotnet test', 't1')], all).map((request) => request.id)).toEqual(['r1']);
  expect(rules.sift([ask('r2', 'dotnet test', 't3')], all)).toEqual([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(answered).toEqual(['r2:allow']);

  rules.add(ask('r3', 'git push', 't3'), 'thread', all, projects);
  // The server did not answer the last list: its thread is away, not gone.
  rules.sift([], threads);
  expect(rules.rules.some((rule) => rule.scope === 'thread')).toBe(true);
  listed = ['core-srv'];
  rules.sift([], threads);
  expect(rules.rules.some((rule) => rule.scope === 'thread')).toBe(false);
});