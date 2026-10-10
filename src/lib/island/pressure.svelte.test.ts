import { expect, test, vi } from 'vitest';
import type { MemoryStatus } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { CALM_EVERY, MemoryWatch, NEAR_EVERY } from './pressure.svelte';

const GB = 1024 * 1024 * 1024;

function core(read: { agentBytes: number; agents: { threadId: string; title: string; bytes: number }[] }) {
  const call = vi.fn(async (method: string, _params?: unknown) => {
    if (method === 'resources.memoryStatus') {
      return { state: 'ok', agentBytes: read.agentBytes, availableBytes: 16 * GB, limits: { budgetMb: 8192, threadMemoryCapMb: 4096, memoryReserveMb: 1024 } } satisfies MemoryStatus;
    }
    if (method === 'resources.usage') return { sampledAt: 0, agents: read.agents.map((agent) => ({ threadId: agent.threadId, title: agent.title, load: { memoryBytes: agent.bytes } })) };
    return { killed: 2 };
  });
  return { call, client: { call, on: () => () => {} } as unknown as Client };
}

test('far from the limits, the watch reads the status only, and slowly', async () => {
  const fake = core({ agentBytes: 2 * GB, agents: [] });
  const memory = new MemoryWatch();
  expect(await memory.read(fake.client)).toBe(CALM_EVERY);
  expect(memory.warning).toBeNull();
  expect(fake.call.mock.calls.map(([method]) => method)).toEqual(['resources.memoryStatus']);
});

test('near the budget, it names the heaviest conversation and reads more often', async () => {
  const fake = core({ agentBytes: 7 * GB, agents: [{ threadId: 'a', title: 'Unity', bytes: 3 * GB }, { threadId: 'b', title: 'Docs', bytes: 1 * GB }] });
  const memory = new MemoryWatch();
  expect(await memory.read(fake.client)).toBe(NEAR_EVERY);
  expect(memory.warning).toMatchObject({ reason: 'budget', threadId: 'a', title: 'Unity' });
});

test('a warning set aside stays hidden until another conversation is the cause', async () => {
  const read = { agentBytes: 7 * GB, agents: [{ threadId: 'a', title: 'Unity', bytes: 3 * GB }] };
  const fake = core(read);
  const memory = new MemoryWatch();
  await memory.read(fake.client);
  memory.ignore();
  expect(memory.warning).toBeNull();
  read.agentBytes = 7.3 * GB;
  await memory.read(fake.client);
  expect(memory.warning).toBeNull();
  read.agents = [{ threadId: 'b', title: 'Docs', bytes: 3.2 * GB }];
  await memory.read(fake.client);
  expect(memory.warning).toMatchObject({ threadId: 'b' });
});

test('stop ends the conversation’s processes and reads again', async () => {
  const fake = core({ agentBytes: 7 * GB, agents: [{ threadId: 'a', title: 'Unity', bytes: 3 * GB }] });
  const memory = new MemoryWatch();
  await memory.stop(fake.client, 'a', (reason) => reason);
  expect(fake.call).toHaveBeenCalledWith('resources.killTree', { threadId: 'a' });
  expect(memory.stopping).toBe(false);
  expect(memory.problem).toBe('');
});
