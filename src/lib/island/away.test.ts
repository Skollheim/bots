import { expect, test } from 'vitest';
import { fill, strings } from '../strings';
import { awayLines, awaySpan, awayWorth, joinSpan, keepEvents, RECAP_AFTER_MS, type AwayEvent, type AwayFacts } from './away';

const copy = strings.island.away;
const MIN = 60_000;
/** Back at 15:00 after leaving at 14:00. */
const BACK = Date.UTC(2026, 9, 12, 15, 0);
const FROM = BACK - 60 * MIN;

function facts(extra: Partial<AwayFacts> = {}): AwayFacts {
  return { from: FROM, back: BACK, now: BACK, events: [], waiting: [], alarms: [], quota: null, ...extra };
}

const finish = (threadId: string, title: string, at: number, failed = false): AwayEvent => ({ kind: 'finish', at, threadId, title, failed });

test('a span reads in minutes, then hours', () => {
  expect(awaySpan(10_000)).toBe(fill(copy.span.minutes, { m: '1' }));
  expect(awaySpan(40 * MIN)).toBe(fill(copy.span.minutes, { m: '40' }));
  expect(awaySpan(120 * MIN)).toBe(fill(copy.span.hours, { h: '2' }));
  expect(awaySpan(85 * MIN)).toBe(fill(copy.span.hoursMinutes, { h: '1', m: '25' }));
  expect(awaySpan(65 * MIN)).toBe(fill(copy.span.hoursMinutes, { h: '1', m: '05' }));
});

test('a short absence, or one where nothing new happened, makes no card', () => {
  const ended = [finish('a', 'Port', BACK - 10 * MIN)];
  expect(awayWorth(facts({ events: ended }))).toBe(true);
  expect(awayWorth(facts({ from: BACK - RECAP_AFTER_MS + 1, events: ended }))).toBe(false);
  expect(awayWorth(facts({ from: BACK - RECAP_AFTER_MS, events: ended }))).toBe(true);
  // What ended before the user left, or a quota alone, is no news.
  expect(awayWorth(facts({ events: [finish('a', 'Port', FROM - MIN)], quota: { name: 'Max', left: 5 } }))).toBe(false);
  // Something that started to wait, or a reminder that rang, meanwhile is.
  expect(awayWorth(facts({ waiting: [{ threadId: 'w', title: 'Docs', kind: 'question', since: FROM + MIN }] }))).toBe(true);
  expect(awayWorth(facts({ waiting: [{ threadId: 'w', title: 'Docs', kind: 'question', since: FROM - MIN }] }))).toBe(false);
  expect(awayWorth(facts({ alarms: [{ id: 'r', text: 'Call Sam', at: BACK - 5 * MIN }] }))).toBe(true);
});

test('the lines come in order: waiting, finished, pull requests, reminders, quota, memory', () => {
  const lines = awayLines(
    facts({
      now: BACK + 2 * MIN,
      events: [
        finish('a', 'Port the queue', FROM + 5 * MIN),
        { kind: 'memory', at: FROM + 6 * MIN, threadId: 'm', title: 'Unity build', program: null, machine: false },
        { kind: 'pr', at: FROM + 30 * MIN, threadId: 'a', url: 'https://x/pr/12', text: 'PR #12 · CI green · Port', failed: false }
      ],
      waiting: [{ threadId: 'w', title: 'Docs', kind: 'permission', since: BACK - 40 * MIN }],
      alarms: [{ id: 'r', text: 'Call Sam', at: BACK - 5 * MIN }],
      quota: { name: 'Claude', left: 12 }
    })
  );
  expect(lines.map((line) => line.icon)).toEqual(['waiting', 'finished', 'pr', 'alarm', 'quota', 'memory']);
  expect(lines[0]).toEqual({
    key: 'wait:w:permission',
    icon: 'waiting',
    text: fill(copy.waiting.permission, { title: 'Docs', time: awaySpan(42 * MIN) }),
    tone: 'attention',
    target: { kind: 'thread', threadId: 'w' }
  });
  expect(lines[1]).toMatchObject({ text: fill(copy.finishedOne, { title: 'Port the queue' }), tone: 'done', target: { kind: 'thread', threadId: 'a' } });
  expect(lines[2]).toMatchObject({ text: 'PR #12 · CI green · Port', tone: 'done' });
  expect(lines[3]).toMatchObject({ text: fill(copy.alarm, { text: 'Call Sam' }), target: { kind: 'home' } });
  expect(lines[4]).toMatchObject({ text: fill(copy.quotaLow, { name: 'Claude', left: '12' }), target: null });
  expect(lines[5]).toMatchObject({ text: fill(copy.memoryWarned, { title: 'Unity build' }), target: { kind: 'thread', threadId: 'm' } });
});

test('many finished threads: the count, failures first and marked, three names at most', () => {
  const [line] = awayLines(
    facts({
      events: [finish('a', 'A', FROM + MIN), finish('b', 'B', FROM + 2 * MIN, true), finish('c', 'C', FROM + 3 * MIN), finish('d', 'D', FROM + 4 * MIN), finish('a', 'A', FROM + 5 * MIN)]
    })
  );
  // A ended twice: once counted, at its last end.
  const names = [fill(copy.failedMark, { title: 'B' }), 'C', 'D', fill(copy.more, { count: '1' })].join(', ');
  expect(line).toEqual({ key: 'finish', icon: 'failed', text: fill(copy.finishedMany, { count: '4', titles: names }), tone: 'failed', target: { kind: 'thread', threadId: 'b' } });
});

test('a thread that ended is not told again as unread; past three, the waiting are counted', () => {
  const waiting = [
    { threadId: 'a', title: 'A', kind: 'answer' as const, since: FROM + MIN },
    { threadId: 'p', title: 'P', kind: 'permission' as const, since: FROM + 2 * MIN },
    { threadId: 'q', title: 'Q', kind: 'question' as const, since: FROM + 3 * MIN },
    { threadId: 'r', title: 'R', kind: 'question' as const, since: FROM + 4 * MIN },
    { threadId: 's', title: 'S', kind: 'failed' as const, since: FROM + 5 * MIN }
  ];
  const lines = awayLines(facts({ events: [finish('a', 'A', FROM + MIN)], waiting }));
  expect(lines.map((line) => line.key)).toEqual(['wait:p:permission', 'wait:q:question', 'wait:more', 'finish']);
  expect(lines[2]).toMatchObject({ text: fill(copy.othersWaiting, { count: '2' }), target: { kind: 'home' } });
});

test('what happened outside the absence is left out; the quota only when low; opened lines go', () => {
  const lines = awayLines(
    facts({
      events: [finish('old', 'Old', FROM - MIN), finish('late', 'Late', BACK + MIN), finish('a', 'A', FROM + MIN)],
      alarms: [{ id: 'early', text: 'Before', at: FROM - MIN }],
      quota: { name: 'Max', left: 40 }
    })
  );
  expect(lines.map((line) => line.text)).toEqual([fill(copy.finishedOne, { title: 'A' })]);
  expect(awayLines(facts({ quota: { name: 'Max', left: 0 } }))[0]).toMatchObject({ text: fill(copy.quotaOut, { name: 'Max' }), tone: 'failed' });
  expect(awayLines(facts({ events: [finish('a', 'A', FROM + MIN)], seen: ['finish'] }))).toEqual([]);
});

test('the memory guard: what it stopped, or the machine running low, the latest only', () => {
  const stopped: AwayEvent = { kind: 'memory', at: FROM + 9 * MIN, threadId: 't', title: 'Build', program: 'node.exe', machine: false };
  const machine: AwayEvent = { kind: 'memory', at: FROM + 2 * MIN, threadId: null, title: '', program: null, machine: true };
  expect(awayLines(facts({ events: [machine, stopped] }))).toEqual([
    { key: 'memory', icon: 'memory', text: fill(copy.memoryStopped, { program: 'node.exe', title: 'Build' }), tone: 'failed', target: { kind: 'thread', threadId: 't' } }
  ]);
  expect(awayLines(facts({ events: [machine] }))[0]).toMatchObject({ text: copy.memoryMachine, target: null });
});

test('only the last day is kept', () => {
  const events = [finish('old', 'Old', BACK - 25 * 60 * MIN), finish('a', 'A', BACK - 60 * MIN)];
  expect(keepEvents(events, BACK).map((event) => event.at)).toEqual([BACK - 60 * MIN]);
});

test('a new absence joins the card still waiting: from the first leaving to the last return', () => {
  expect(joinSpan(null, { from: FROM, to: BACK })).toEqual({ from: FROM, back: BACK });
  expect(joinSpan({ from: FROM, back: BACK }, { from: BACK + 30 * MIN, to: BACK + 60 * MIN })).toEqual({ from: FROM, back: BACK + 60 * MIN });
});
