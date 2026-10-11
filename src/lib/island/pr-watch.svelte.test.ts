import { flushSync } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { PullRequestCheck } from '@boite/contracts';
import { checkState, ciVerdict, FOLLOW_CAP_MS, freshPullRequests, keepFollowing, nextDelay, NO_CHECKS_MS, prLine } from './pr-checks';
import { PrWatch } from './pr-watch.svelte';

const check = (name: string, state: string): PullRequestCheck => ({ name, state, url: '' });

test('check states read as GitHub reports them, anything unknown still pending', () => {
  for (const state of ['SUCCESS', 'NEUTRAL', 'SKIPPED', 'success']) expect(checkState(state), state).toBe('passed');
  for (const state of ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']) expect(checkState(state), state).toBe('failed');
  for (const state of ['QUEUED', 'IN_PROGRESS', 'PENDING', 'EXPECTED', 'WAITING', 'COMPLETED', '', 'whatever']) expect(checkState(state), state).toBe('pending');
});

test('one failed check fails the CI at once; green needs every check', () => {
  expect(ciVerdict([]).state).toBe('none');
  expect(ciVerdict([check('lint', 'SUCCESS'), check('tests', 'IN_PROGRESS')]).state).toBe('pending');
  expect(ciVerdict([check('lint', 'SUCCESS'), check('tests', 'SKIPPED')]).state).toBe('passed');
  const failed = ciVerdict([check('lint', 'IN_PROGRESS'), check('tests', 'FAILURE')]);
  expect([failed.state, failed.failed?.name]).toEqual(['failed', 'tests']);
});

test('the reads back off calmly and stop at the cap', () => {
  expect([0, 1, 2, 3, 4, 9].map((reads) => nextDelay(reads))).toEqual([20_000, 30_000, 45_000, 67_500, 101_250, 120_000]);
  expect(keepFollowing('pending', 0, FOLLOW_CAP_MS - 1)).toBe(true);
  expect(keepFollowing('pending', 0, FOLLOW_CAP_MS)).toBe(false);
  expect(keepFollowing('none', 0, NO_CHECKS_MS - 1)).toBe(true);
  expect(keepFollowing('none', 0, NO_CHECKS_MS)).toBe(false);
});

test('only open pull requests not met before are followed; the line names the PR first', () => {
  const list = [
    { url: 'https://github.com/a/b/pull/1', state: 'OPEN' as const },
    { url: 'https://github.com/a/b/pull/2', state: 'MERGED' as const },
    { url: 'https://github.com/a/b/pull/3', state: 'OPEN' as const }
  ];
  expect(freshPullRequests(list, new Set(['https://github.com/a/b/pull/3'])).map((pr) => pr.url)).toEqual(['https://github.com/a/b/pull/1']);
  expect(prLine(12, 'passed', 'Port the scheduler', null)).toEqual({ text: 'PR #12 · CI green · Port the scheduler', tone: 'done' });
  expect(prLine(12, 'failed', 'Port the scheduler', 'UI tests')).toEqual({ text: 'PR #12 · CI failed · UI tests', tone: 'failed' });
  expect(prLine(12, 'passed', '', null).text).toBe('PR #12 · CI green');
});

// -------------------------------------------------------------------------
// The watch, on a stub core
// -------------------------------------------------------------------------

const URL_12 = 'https://github.com/a/b/pull/12';
type Handler = (event: { threadId: string; pullRequests: { url: string; number: number; state: 'OPEN' | 'MERGED' | 'CLOSED' }[] }) => void;

function stub(reviews: (() => { state: string; checks: PullRequestCheck[] } | Error)[]) {
  let handler: Handler | null = null;
  const calls: string[] = [];
  const client = {
    on: (_event: string, next: Handler) => ((handler = next), () => (handler = null)),
    call: async (method: string) => {
      calls.push(method);
      const next = (reviews.length > 1 ? reviews.shift() : reviews[0])?.();
      if (next instanceof Error) throw next;
      return next;
    }
  };
  const announced: boolean[] = [];
  const watch = new PrWatch({ client: () => client as never, rows: () => [{ id: 't1', title: 'Port it' }], threads: () => [], announce: (failed) => announced.push(failed) });
  const stop = watch.start();
  flushSync();
  const emit = (state: 'OPEN' | 'MERGED' = 'OPEN', threadId = 't1') => handler?.({ threadId, pullRequests: [{ url: URL_12, number: 12, state }] });
  return { watch, stop, emit, calls, announced };
}

const pending = () => ({ state: 'OPEN', checks: [check('lint', 'SUCCESS'), check('tests', 'IN_PROGRESS')] });
const green = () => ({ state: 'OPEN', checks: [check('lint', 'SUCCESS'), check('tests', 'SUCCESS')] });
const red = () => ({ state: 'OPEN', checks: [check('lint', 'SUCCESS'), check('tests', 'FAILURE')] });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a new pull request is followed until its CI is green, then told once', async () => {
  const { watch, stop, emit, calls, announced } = stub([pending, pending, green]);
  emit();
  await vi.advanceTimersByTimeAsync(0);
  expect(calls).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(calls).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(announced).toEqual([false]);
  expect(watch.told).toMatchObject({ text: 'PR #12 · CI green · Port it', tone: 'done', threadId: 't1', url: URL_12 });
  // Settled: nothing runs any more, and the same pull request is not followed again.
  emit();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(calls).toHaveLength(3);
  expect(vi.getTimerCount()).toBe(0);
  stop();
});

test('a failure is told with the check that failed', async () => {
  const { watch, stop, emit, announced } = stub([pending, red]);
  emit();
  await vi.advanceTimersByTimeAsync(20_000);
  expect(announced).toEqual([true]);
  expect(watch.told?.text).toBe('PR #12 · CI failed · tests');
  watch.clear();
  expect(watch.told).toBeNull();
  stop();
});

test('a CI already settled on the first read, a merge, another thread: nothing is told', async () => {
  const done = stub([green]);
  done.emit();
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect([done.announced, done.calls.length, vi.getTimerCount()]).toEqual([[], 1, 0]);
  done.stop();

  const merged = stub([pending, pending, green]);
  merged.emit();
  await vi.advanceTimersByTimeAsync(0);
  merged.emit('MERGED');
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect([merged.announced, merged.calls.length, vi.getTimerCount()]).toEqual([[], 1, 0]);
  merged.stop();

  const elsewhere = stub([pending]);
  elsewhere.emit('OPEN', 't-other');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(elsewhere.calls).toHaveLength(0);
  elsewhere.stop();
});

test('a CI that never settles is let go at the cap, and errors in a row stop it sooner', async () => {
  const slow = stub([pending]);
  slow.emit();
  await vi.advanceTimersByTimeAsync(FOLLOW_CAP_MS + 5 * 60_000);
  expect(vi.getTimerCount()).toBe(0);
  expect(slow.calls.length).toBeLessThan(40);
  expect(slow.announced).toEqual([]);
  slow.stop();

  const broken = stub([() => new Error('gh failed')]);
  broken.emit();
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect([broken.calls.length, vi.getTimerCount()]).toEqual([3, 0]);
  broken.stop();
});

test('stopping the watch stops its timers', async () => {
  const { stop, emit } = stub([pending]);
  emit();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(1);
  stop();
  expect(vi.getTimerCount()).toBe(0);
});
