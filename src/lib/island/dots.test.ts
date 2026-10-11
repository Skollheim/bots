import { expect, test } from 'vitest';
import { strings } from '../strings';
import { DOTS_MAX, dotLine, pillDots } from './dots';
import type { SessionRow } from './sessions';

function row(id: string, state: SessionRow['state']): SessionRow {
  return { id, title: `Thread ${id}`, projectId: null, state, since: 0, endedAt: null, steps: [], task: null, detail: null, progress: null, helpers: 0 };
}

test('one dot per row, in its state colour and in the rows order', () => {
  const dots = pillDots([row('w', 'waiting'), row('a', 'working'), row('f', 'failed'), row('d', 'done')], 1);
  expect(dots.map((dot) => [dot.key, dot.tone])).toEqual([
    ['w', 'attention'],
    ['a', 'working'],
    ['f', 'failed'],
    ['d', 'done']
  ]);
});

test('a request with no waiting row gets an amber dot first, and the dots stop at the cap', () => {
  const rows = Array.from({ length: 9 }, (_, index) => row(`r${index}`, 'working'));
  const dots = pillDots(rows, 2);
  expect(dots).toHaveLength(DOTS_MAX);
  expect(dots[0]).toMatchObject({ key: 'waiting', tone: 'attention', threadId: null });
  expect(pillDots([], 0)).toEqual([]);
});

test('a hovered dot names its thread and its state', () => {
  const [working, ended] = pillDots([row('a', 'working'), row('d', 'done')], 0);
  expect(dotLine(working!)).toEqual({ text: `Thread a · ${strings.island.sessions.states.working}`, tone: 'working' });
  expect(dotLine(ended!).tone).toBe('done');
  expect(dotLine(pillDots([], 1)[0]!)).toEqual({ text: strings.island.waitingOne, tone: 'attention' });
});
