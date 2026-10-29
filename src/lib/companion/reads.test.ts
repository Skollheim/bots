import { expect, test } from 'vitest';
import type { ThreadSummary } from '@boite/contracts';
import { asksRead, oneAtATime } from './reads';

const thread = (status: ThreadSummary['status'], updatedAt: number) => ({ id: 'thr_1', status, updatedAt, context: { tokens: updatedAt } }) as unknown as ThreadSummary;

test('a turn at work reads nothing again, a new thread or a status that moves does', () => {
  expect(asksRead(undefined, thread('running', 1))).toBe(true);
  expect(asksRead(thread('running', 1), thread('running', 2))).toBe(false);
  expect(asksRead(thread('running', 2), thread('waiting', 3))).toBe(true);
  expect(asksRead(thread('waiting', 3), thread('idle', 4))).toBe(true);
});

test('reads never overlap: the calls during a slow read make one more read after it', async () => {
  let reads = 0;
  let open = 0;
  let most = 0;
  const finish: (() => void)[] = [];
  const read = oneAtATime(async () => {
    reads++;
    most = Math.max(most, ++open);
    await new Promise<void>((resolve) => finish.push(resolve));
    open--;
  });
  const first = read();
  for (let i = 0; i < 20; i++) void read();
  expect(reads).toBe(1);
  finish.shift()!();
  await first;
  await Promise.resolve();
  expect(reads).toBe(2);
  finish.shift()!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(reads).toBe(2);
  expect(most).toBe(1);
  // Once idle, a call reads at once.
  void read();
  expect(reads).toBe(3);
  finish.shift()!();
});
