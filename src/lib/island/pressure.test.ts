import { expect, test } from 'vitest';
import type { MemoryEvent, MemoryStatus } from '@boite/contracts';
import { CALM_SHARE, guardOff, heaviest, NEAR_SHARE, nearness, pressureOf, samePressure, sizeText, stoppedOf, type AgentLoad } from './pressure';

const MB = 1024 * 1024;
const GB = 1024 * MB;

function status(extra: Partial<MemoryStatus> = {}, limits: Partial<MemoryStatus['limits']> = {}): MemoryStatus {
  return { state: 'ok', agentBytes: 2 * GB, availableBytes: 16 * GB, limits: { budgetMb: 8192, threadMemoryCapMb: 4096, memoryReserveMb: 1024, ...limits }, ...extra } as MemoryStatus;
}

const agent = (threadId: string, bytes: number, title = `Thread ${threadId}`): AgentLoad => ({ threadId, title, load: { memoryBytes: bytes } as AgentLoad['load'] });

test('a guard with every limit at zero is off and never warns', () => {
  const off = status({ agentBytes: 60 * GB, availableBytes: 0, state: 'critical' }, { budgetMb: 0, threadMemoryCapMb: 0, memoryReserveMb: 0 });
  expect(guardOff(off)).toBe(true);
  expect(nearness(off, 60 * GB)).toBe(0);
  expect(pressureOf(off, [agent('a', 60 * GB)])).toBeNull();
});

test('far from every limit, nothing warns', () => {
  expect(pressureOf(status(), [agent('a', 1 * GB)])).toBeNull();
  expect(nearness(status(), 1 * GB)).toBeLessThan(NEAR_SHARE);
});

test('a conversation near its own cap comes first, named, with its bytes', () => {
  const warning = pressureOf(status({ agentBytes: 7.5 * GB }), [agent('a', 1 * GB), agent('b', 3.6 * GB, 'Unity build')]);
  expect(warning).toEqual({ reason: 'thread', threadId: 'b', title: 'Unity build', bytes: 3.6 * GB, used: 3.6 * GB, limit: 4 * GB });
});

test('the agents together near the budget warn, with the heaviest to stop', () => {
  const warning = pressureOf(status({ agentBytes: 7 * GB }), [agent('a', 2 * GB), agent('b', 3 * GB)]);
  expect(warning).toMatchObject({ reason: 'budget', threadId: 'b', used: 7 * GB, limit: 8 * GB });
});

test('free memory near the reserve warns as the machine', () => {
  const warning = pressureOf(status({ availableBytes: 1.4 * GB }), [agent('a', 1 * GB)]);
  expect(warning).toMatchObject({ reason: 'machine', threadId: 'a', used: 1.4 * GB, limit: 1 * GB });
  expect(pressureOf(status({ availableBytes: 1.6 * GB }), [])).toBeNull();
});

test('a critical core warns even when the numbers look fine', () => {
  expect(pressureOf(status({ state: 'critical' }), [])).toMatchObject({ reason: 'machine', threadId: null });
});

test('a warning shown stays until the share falls under the calm line', () => {
  const near = status({ agentBytes: 6.7 * GB });
  expect(pressureOf(near, [])).toBeNull();
  expect(pressureOf(near, [], CALM_SHARE)).toMatchObject({ reason: 'budget' });
  expect(pressureOf(status({ agentBytes: 6.2 * GB }), [], CALM_SHARE)).toBeNull();
});

test('the nearness reaches the warning share where the warning starts', () => {
  expect(nearness(status({ agentBytes: 7 * GB }))).toBeCloseTo(0.875);
  expect(nearness(status(), 3.4 * GB)).toBeCloseTo(0.85);
  expect(nearness(status({ availableBytes: 1.5 * GB }))).toBeCloseTo(0.85);
});

test('the heaviest conversation is the one holding the most, none when nothing holds', () => {
  expect(heaviest([agent('a', 3), agent('b', 9), agent('c', 4)])?.threadId).toBe('b');
  expect(heaviest([agent('a', 0)])).toBeNull();
});

test('a process the guard stopped is told by its file name and its thread title', () => {
  const event = { kind: 'killed', reason: 'thread-quota', limitBytes: 4 * GB, threadId: 'a', pid: 4, exe: 'C:\\Tools\\node.exe', bytes: 2 * GB, state: 'ok', at: 50 } as MemoryEvent;
  expect(stoppedOf(event, (id) => `Title ${id}`)).toEqual({ threadId: 'a', title: 'Title a', program: 'node.exe', bytes: 2 * GB, at: 50 });
  expect(stoppedOf({ kind: 'pressure', threadId: null, state: 'critical', at: 1 } as MemoryEvent, () => '')).toBeNull();
});

test('sizes read in megabytes, then gigabytes with the language’s decimal mark', () => {
  const units = { mb: '{value} Mo', gb: '{value} Go', point: ',' };
  expect(sizeText(820 * MB, units)).toBe('820 Mo');
  expect(sizeText(1.5 * GB, units)).toBe('1,5 Go');
});

test('a warning is the same while its reason and conversation are, whatever the bytes', () => {
  const a = pressureOf(status({ agentBytes: 7 * GB }), [agent('a', 2 * GB)]);
  const b = pressureOf(status({ agentBytes: 7.2 * GB }), [agent('a', 2.1 * GB)]);
  expect(samePressure(a, b)).toBe(true);
  expect(samePressure(a, pressureOf(status({ agentBytes: 7 * GB }), [agent('b', 2 * GB)]))).toBe(false);
  expect(samePressure(a, null)).toBe(false);
});
