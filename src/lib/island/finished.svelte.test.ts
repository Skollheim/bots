import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { FinishWatch } from './finished.svelte';
import type { Finish } from './finished';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const finish = (threadId: string, failed = false): Finish => ({ threadId, title: threadId, failed, workedMs: 60_000, files: 2 });

test('threads ending close together are told together, until the peek for them is over', () => {
  const announced: boolean[] = [];
  const watch = new FinishWatch({ client: () => null, rows: () => [], announce: (failed) => announced.push(failed) });
  watch.add(finish('a'));
  watch.add(finish('b', true));
  watch.add(finish('a'));
  expect(watch.told.map((entry) => entry.threadId)).toEqual(['b', 'a']);
  expect(announced).toEqual([false, true, true]);
  expect(watch.line?.tone).toBe('failed');
  watch.clear();
  expect(watch.told).toEqual([]);
  expect(watch.line).toBeNull();
});
