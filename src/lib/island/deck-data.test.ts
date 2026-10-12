import { expect, test } from 'vitest';
import { dayKey, machineLoads, missionDays, nextMission, timerShare, untilNextMinute, weekOf } from './deck-data';

test('the week runs Monday to Sunday around the day, today marked, across a month', () => {
  // Thursday 1 October 2026.
  const week = weekOf(new Date(2026, 9, 1, 15, 30), 'en');
  expect(week.map((day) => day.key)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  expect(week.map((day) => day.date)).toEqual([28, 29, 30, 1, 2, 3, 4]);
  expect(week.filter((day) => day.today).map((day) => day.key)).toEqual(['2026-10-01']);
  expect([week[0]?.name, week[6]?.name]).toEqual(['Mon', 'Sun']);
  // A Sunday is the end of its week, not the start of the next.
  const sunday = weekOf(new Date(2026, 9, 11, 9), 'en');
  expect([sunday[0]?.key, sunday[6]?.key, sunday[6]?.today]).toEqual(['2026-10-05', '2026-10-11', true]);
  expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
});

test('the clock waits for the next minute, never for nothing', () => {
  expect(untilNextMinute(new Date(2026, 9, 12, 10, 4, 0, 0).getTime())).toBe(60_000);
  expect(untilNextMinute(new Date(2026, 9, 12, 10, 4, 42, 500).getTime())).toBe(17_500);
  expect(untilNextMinute(new Date(2026, 9, 12, 10, 4, 59, 995).getTime())).toBe(20);
});

test('each machine counts the threads at work on it; alone, no tile', () => {
  const threads = [
    { id: 'a', status: 'running' as const },
    { id: 'b', status: 'waiting' as const },
    { id: 'c', status: 'idle' as const },
    { id: 'd', status: 'queued' as const },
    { id: 'e', status: 'running' as const }
  ];
  const owners: Record<string, string> = { d: 'srv', e: 'srv' };
  const machines = [
    { coreId: 'srv', name: 'Serveur', state: 'ready' },
    { coreId: 'lap', name: 'Portable', state: 'unreached' }
  ];
  expect(machineLoads(threads, (id) => owners[id] ?? null, machines, 'Ce PC')).toEqual([
    { coreId: null, name: 'Ce PC', online: true, working: 2 },
    { coreId: 'srv', name: 'Serveur', online: true, working: 2 },
    { coreId: 'lap', name: 'Portable', online: false, working: 0 }
  ]);
  expect(machineLoads(threads, () => null, [], 'Ce PC')).toEqual([]);
});

test('the focus ring fills with the phase, a stopwatch over the hour', () => {
  const work = { kind: 'pomodoro' as const, phase: 'work' as const, workMs: 25 * 60_000, breakMs: 5 * 60_000 };
  expect(timerShare(null, 0, 0)).toBe(0);
  expect(timerShare(work, 25 * 60_000, 0)).toBe(0);
  expect(timerShare(work, 5 * 60_000, 0)).toBeCloseTo(0.8);
  expect(timerShare({ ...work, phase: 'break' }, 60_000, 0)).toBeCloseTo(0.8);
  expect(timerShare({ ...work, kind: 'stopwatch' }, 0, 90 * 60_000)).toBeCloseTo(0.5);
  expect(timerShare({ ...work, workMs: 0 }, 0, 0)).toBe(0);
});

test("the week's dots mark the days a mission runs on, from its next run", () => {
  // Wednesday 14 October 2026: the week runs from Monday 12 to Sunday 18.
  const week = weekOf(new Date(2026, 9, 14, 10), 'en-GB');
  const at = (date: number, hour: number) => new Date(2026, 9, date, hour).getTime();
  const mission = (repeat: Parameters<typeof missionDays>[0][number]['repeat'], due: number, more = {}) => ({ repeat, minutes: new Date(due).getHours() * 60, due, paused: false, missing: false, ...more });
  const days = (missions: Parameters<typeof missionDays>[0]) => [...missionDays(missions, week)].sort();
  expect(days([mission({ kind: 'daily' }, at(15, 9))])).toEqual(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  expect(days([mission({ kind: 'weekdays' }, at(15, 8))])).toEqual(['2026-10-15', '2026-10-16']);
  expect(days([mission({ kind: 'weekly', day: 5 }, at(16, 18))])).toEqual(['2026-10-16']);
  expect(days([mission({ kind: 'once' }, at(17, 7)), mission({ kind: 'once' }, at(20, 7))])).toEqual(['2026-10-17']);
  // Late since last week: it runs again from Monday on.
  expect(days([mission({ kind: 'weekly', day: 1 }, at(5, 9))])).toEqual(['2026-10-12']);
  expect(days([mission({ kind: 'once' }, at(5, 9))])).toEqual([]);
  expect(days([mission({ kind: 'daily' }, at(15, 9), { paused: true }), mission({ kind: 'daily' }, at(15, 9), { missing: true })])).toEqual([]);
  expect(missionDays([mission({ kind: 'daily' }, at(15, 9))], []).size).toBe(0);
});

test('the next mission is the soonest one planned', () => {
  const mission = (id: string, due: number, more = {}) => ({ id, repeat: { kind: 'daily' as const }, minutes: 0, due, paused: false, missing: false, ...more });
  expect(nextMission([])).toBeNull();
  expect(nextMission([mission('late', 300), mission('soon', 100, { paused: true }), mission('next', 200), mission('gone', 50, { missing: true })])?.id).toBe('next');
  expect(nextMission([mission('off', 100, { paused: true })])).toBeNull();
});
