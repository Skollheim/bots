import type { AgentsSnapshot } from '@boite/contracts';
import { expect, test } from 'vitest';
import { sessionThreadOf } from '../companion/crew';
import { conversation, openWork, settled } from '../island/assistant.svelte';
import { placedAgents, readableSnapshot } from './agents';

test('a newer core\'s snapshot, where an agent is a thread, reads without breaking the island', () => {
  // As a core sends it since bots became threads: no messages, work or deliveries, sessions without a scope.
  const answer = {
    revision: 3,
    profiles: [{ id: 'ag', name: 'Bots', status: 'active' }],
    sessions: [{ id: 's1', agentId: 'ag', threadId: 'thr_1', revision: 1, createdAt: 0, updatedAt: 0 }],
    routines: [],
    status: [],
    watches: [],
    accountGrants: [],
    limits: { paused: false },
    entrusted: []
  } as unknown as AgentsSnapshot;
  const snapshot = readableSnapshot(answer);
  expect(sessionThreadOf(snapshot, 'ag')).toBe('thr_1');
  expect(openWork(snapshot, 'ag')).toEqual([]);
  expect(conversation(snapshot, [], 'ag')).toEqual([]);
  expect(settled(snapshot, 'ag', 'm1')).toBe(false);
  expect(placedAgents(snapshot, []).map((agent) => agent.key)).toEqual(['ag']);
  expect(answer).not.toHaveProperty('work');
});
