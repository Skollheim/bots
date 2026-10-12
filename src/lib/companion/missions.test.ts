import type { Project } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  addMission,
  CHECK_MAX_MS,
  LATE_MAX_MS,
  MISSIONS_KEY,
  missionsBlock,
  nextAt,
  parseMission,
  parseRepeat,
  pauseMission,
  readMissions,
  removeMission,
  scheduleOf,
  settle,
  waitFor,
  type Mission,
  type MissionDirective,
  type NewMission
} from './missions';
import { Missions, type MissionsHost } from './missions.svelte';
import { parseDirectives } from './directives';
import { contextLine } from './brain';
import type { CompanionControl } from './prefs';

afterEach(() => window.localStorage.clear());

const HOUR = 3_600_000;
const at = (month: number, day: number, hours: number, minutes = 0) => new Date(2026, month - 1, day, hours, minutes).getTime();
// Friday 9 October 2026, 14:05, local time.
const now = at(10, 9, 14, 5);
const add = (content: string) => parseMission(content) as MissionDirective & { kind: 'add' };
const mission = (extra: Partial<Mission> = {}): Mission => ({
  id: 'm1',
  minutes: 9 * 60,
  repeat: { kind: 'daily' },
  projectId: 'p1',
  project: 'boite',
  prompt: 'Run the tests',
  due: at(10, 9, 9),
  paused: false,
  missing: false,
  createdAt: 0,
  ...extra
});

describe('the directive', () => {
  test('a mission reads its time, repeat, project and instruction, bars and all', () => {
    expect(parseMission('09:00 | daily | boite | Lance les tests')).toEqual({ kind: 'add', minutes: 540, date: null, repeat: { kind: 'daily' }, project: 'boite', prompt: 'Lance les tests' });
    expect(parseMission('2026-10-16 18h | once | site | a | b')).toEqual({ kind: 'add', minutes: 1080, date: { year: 2026, month: 10, day: 16 }, repeat: { kind: 'once' }, project: 'site', prompt: 'a | b' });
    expect(add('9h05 | every friday | p | x').repeat).toEqual({ kind: 'weekly', day: 5 });
  });

  test('cancel, pause and resume name a mission by its number', () => {
    expect(parseMission('cancel | 2')).toEqual({ kind: 'cancel', index: 2 });
    expect(parseMission('delete | #3')).toEqual({ kind: 'cancel', index: 3 });
    expect(parseMission('Pause | 1.')).toEqual({ kind: 'pause', index: 1 });
    expect(parseMission('resume | 4')).toEqual({ kind: 'resume', index: 4 });
    expect(parseMission('resume | x')).toBeNull();
    expect(parseMission('cancel')).toBeNull();
  });

  test('what cannot be read is dropped', () => {
    expect(parseMission('25:00 | daily | p | x')).toBeNull();
    expect(parseMission('9 | daily | p | x')).toBeNull();
    expect(parseMission('2026-02-31 09:00 | once | p | x')).toBeNull();
    expect(parseMission('09:00 | sometimes | p | x')).toBeNull();
    expect(parseMission('09:00 | daily | p')).toBeNull();
    expect(parseMission('09:00 | daily |  | x')).toBeNull();
  });

  test('a repeat reads in English and French', () => {
    expect(parseRepeat('')).toEqual({ kind: 'once' });
    expect(parseRepeat('une fois')).toEqual({ kind: 'once' });
    expect(parseRepeat('Every day')).toEqual({ kind: 'daily' });
    expect(parseRepeat('tous les jours')).toEqual({ kind: 'daily' });
    expect(parseRepeat('chaque jour')).toEqual({ kind: 'daily' });
    expect(parseRepeat('weekdays')).toEqual({ kind: 'weekdays' });
    expect(parseRepeat('jours ouvrés')).toEqual({ kind: 'weekdays' });
    expect(parseRepeat('weekly')).toEqual({ kind: 'weekly', day: null });
    expect(parseRepeat('tous les lundis')).toEqual({ kind: 'weekly', day: 1 });
    expect(parseRepeat('sun')).toEqual({ kind: 'weekly', day: 0 });
    expect(parseRepeat('fortnightly')).toBeNull();
  });

  test('a reply sets three missions at most, and the list ops beside them', () => {
    const lines = ['a', 'b', 'c', 'd'].map((name) => `[[mission: 09:00 | daily | p | ${name}]]`).join('\n');
    const { mission: asked, todo } = parseDirectives(`${lines}\n[[mission: cancel | 1]]\n[[todo: add | milk]]\n[[todo: done | 1, 2]]`, new Date(now));
    expect(asked.filter((entry) => entry.kind === 'add')).toHaveLength(3);
    expect(asked.at(-1)).toEqual({ kind: 'cancel', index: 1 });
    expect(todo).toEqual([{ kind: 'add', text: 'milk' }, { kind: 'done', index: 1 }, { kind: 'done', index: 2 }]);
  });
});

describe('when it runs', () => {
  test('the next run follows the repeat, strictly after', () => {
    expect(nextAt({ kind: 'daily' }, 15 * 60, now)).toBe(at(10, 9, 15));
    expect(nextAt({ kind: 'daily' }, 14 * 60, now)).toBe(at(10, 10, 14));
    expect(nextAt({ kind: 'daily' }, 14 * 60 + 5, now)).toBe(at(10, 10, 14, 5));
    // Friday afternoon: the next weekday is Monday.
    expect(nextAt({ kind: 'weekdays' }, 9 * 60, now)).toBe(at(10, 12, 9));
    expect(nextAt({ kind: 'weekly', day: 3 }, 9 * 60, now)).toBe(at(10, 14, 9));
    expect(nextAt({ kind: 'weekly', day: 5 }, 9 * 60, now)).toBe(at(10, 16, 9));
    expect(nextAt({ kind: 'weekly', day: 5 }, 18 * 60, now)).toBe(at(10, 9, 18));
  });

  test('a schedule starts on its date, takes its weekday, and refuses a time gone', () => {
    expect(scheduleOf(add('2026-10-16 18:00 | weekly | p | x'), now)).toEqual({ minutes: 1080, repeat: { kind: 'weekly', day: 5 }, due: at(10, 16, 18) });
    // Saturday is the next 09:00.
    expect(scheduleOf(add('09:00 | weekly | p | x'), now)!.repeat).toEqual({ kind: 'weekly', day: 6 });
    expect(scheduleOf(add('2026-10-20 09:00 | daily | p | x'), now)!.due).toBe(at(10, 20, 9));
    expect(scheduleOf(add('2026-10-01 09:00 | daily | p | x'), now)!.due).toBe(at(10, 10, 9));
    expect(scheduleOf(add('2026-10-01 09:00 | once | p | x'), now)).toBeNull();
    expect(scheduleOf(add('09:00 | once | p | x'), now)!.due).toBe(at(10, 10, 9));
  });

  test('a run on time, a little late, or too late', () => {
    const due = at(10, 9, 9);
    expect(settle(mission(), due + 2 * 60_000)).toEqual({ run: { at: due, late: false }, missed: 0, due: at(10, 10, 9) });
    expect(settle(mission(), at(10, 9, 11))).toEqual({ run: { at: due, late: true }, missed: 0, due: at(10, 10, 9) });
    expect(settle(mission(), at(10, 10, 8))).toEqual({ run: null, missed: 1, due: at(10, 10, 9) });
    expect(settle(mission(), at(10, 8, 8))).toEqual({ run: null, missed: 0, due });
  });

  test('away two days, the latest occurrence runs and the others are missed', () => {
    expect(settle(mission(), at(10, 11, 10))).toEqual({ run: { at: at(10, 11, 9), late: true }, missed: 2, due: at(10, 12, 9) });
  });

  test('away for weeks, the days before last week count as missed at once', () => {
    const settled = settle(mission({ due: at(9, 1, 9) }), at(10, 9, 10));
    expect(settled.run).toEqual({ at: at(10, 9, 9), late: true });
    expect(settled.missed).toBeGreaterThan(0);
    expect(settled.due).toBe(at(10, 10, 9));
  });

  test('a mission run once ends, run or missed', () => {
    const once = mission({ repeat: { kind: 'once' } });
    expect(settle(once, at(10, 9, 10))).toEqual({ run: { at: at(10, 9, 9), late: true }, missed: 0, due: null });
    expect(settle(once, at(10, 9, 9) + LATE_MAX_MS + 1)).toEqual({ run: null, missed: 1, due: null });
  });

  test('an occurrence never runs twice', () => {
    const first = settle(mission(), at(10, 9, 9, 1));
    const again = settle(mission({ due: first.due! }), at(10, 9, 9, 1));
    expect(again).toEqual({ run: null, missed: 0, due: at(10, 10, 9) });
  });

  test('one timeout, to the soonest, never past the cap', () => {
    expect(waitFor([], now)).toBeNull();
    expect(waitFor([mission({ due: now + 60_000, paused: true })], now)).toBeNull();
    expect(waitFor([mission({ due: now + 3 * 60_000 }), mission({ due: now + HOUR })], now)).toBe(3 * 60_000);
    expect(waitFor([mission({ due: now + 2 * HOUR })], now)).toBe(CHECK_MAX_MS);
    expect(waitFor([mission({ due: now - HOUR })], now)).toBe(0);
    // Its project gone, an overdue mission is looked at again later, not at once.
    expect(waitFor([mission({ due: now - HOUR, missing: true })], now)).toBe(CHECK_MAX_MS);
  });
});

describe('across a change of clock (Europe/Paris)', () => {
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Europe/Paris';
  });
  afterAll(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });
  const shifts = () => new Date(2026, 0, 1).getTimezoneOffset() !== new Date(2026, 6, 1).getTimezoneOffset();

  test('09:00 stays 09:00 when the clock goes back, a day of 25 hours apart', () => {
    if (!shifts()) return;
    const first = nextAt({ kind: 'daily' }, 9 * 60, new Date(2026, 9, 23, 10).getTime());
    const second = nextAt({ kind: 'daily' }, 9 * 60, first);
    // The clock goes back at 03:00 on the 25th: from the 24th to the 25th is 25 hours.
    expect([new Date(first).getDate(), new Date(second).getDate()]).toEqual([24, 25]);
    expect([new Date(first).getHours(), new Date(second).getHours()]).toEqual([9, 9]);
    expect(second - first).toBe(25 * HOUR);
  });

  test('a time the clock jumps over runs at the hour after, then as set', () => {
    if (!shifts()) return;
    const jumped = new Date(nextAt({ kind: 'daily' }, 2 * 60 + 30, new Date(2026, 2, 28, 12).getTime()));
    expect([jumped.getDate(), jumped.getHours(), jumped.getMinutes()]).toEqual([29, 3, 30]);
    const after = new Date(nextAt({ kind: 'daily' }, 2 * 60 + 30, jumped.getTime()));
    expect([after.getDate(), after.getHours(), after.getMinutes()]).toEqual([30, 2, 30]);
  });

  test('a time the clock tells twice runs once', () => {
    if (!shifts()) return;
    const first = nextAt({ kind: 'daily' }, 2 * 60 + 30, new Date(2026, 9, 24, 12).getTime());
    expect(new Date(first).getDate()).toBe(25);
    expect(new Date(nextAt({ kind: 'daily' }, 2 * 60 + 30, first)).getDate()).toBe(26);
  });
});

describe('the request line', () => {
  test('the missions are numbered in a few words, flags and all', () => {
    expect(missionsBlock([])).toBeNull();
    const list = [
      mission({ prompt: 'Run [the] tests' }),
      mission({ id: 'm2', repeat: { kind: 'weekly', day: 5 }, minutes: 17 * 60 + 30, paused: true }),
      mission({ id: 'm3', repeat: { kind: 'once' }, due: at(10, 16, 18), minutes: 18 * 60, projectId: 'gone', prompt: 'x'.repeat(120) })
    ];
    const block = missionsBlock(list, new Set(['p1']))!;
    expect(block).toContain('1. every day 09:00 in boite: Run  the  tests');
    expect(block).toContain('2. every Friday 17:30 in boite: Run the tests (paused)');
    expect(block).toContain('3. once 2026-10-16 18:00 in boite: ');
    expect(block).toContain('… (project gone)');
    expect(block).not.toContain('[');
  });

  test('the context line carries the lists only when there are some', () => {
    const base = { now: new Date(now), seen: null, shots: [], files: [] };
    expect(contextLine(base)).not.toContain('\n');
    expect(contextLine({ ...base, lists: 'to-do list: 1. [ ] milk' })).toContain('\nto-do list: 1. [ ] milk]]');
  });
});

describe('storage', () => {
  const entry: NewMission = { minutes: 540, repeat: { kind: 'daily' }, due: at(10, 10, 9), projectId: 'p1', project: 'boite', prompt: 'Run the tests' };

  test('missions are kept per core, the soonest first, and read back whole', () => {
    addMission('desk', entry, now);
    addMission('desk', { ...entry, due: at(10, 9, 18), repeat: { kind: 'weekly', day: 5 }, minutes: 18 * 60 }, now);
    addMission('server', { ...entry, prompt: 'Other' }, now);
    const desk = readMissions('desk');
    expect(desk.map((entry) => entry.due)).toEqual([at(10, 9, 18), at(10, 10, 9)]);
    expect(desk[1]).toMatchObject({ ...entry, paused: false, missing: false, createdAt: now });
    expect(readMissions('server').map((entry) => entry.prompt)).toEqual(['Other']);
    removeMission('desk', desk[0]!.id);
    expect(readMissions('desk')).toHaveLength(1);
  });

  test('what does not read as a mission is dropped, the rest kept', () => {
    window.localStorage.setItem(MISSIONS_KEY, JSON.stringify({ desk: [{ id: 'bad' }, { ...mission(), repeat: { kind: 'weekly', day: 9 } }, mission()] }));
    expect(readMissions('desk').map((entry) => entry.id)).toEqual(['m1']);
    window.localStorage.setItem(MISSIONS_KEY, 'not json');
    expect(readMissions('desk')).toEqual([]);
  });

  test('a mission taken up again starts from its next occurrence', () => {
    window.localStorage.setItem(MISSIONS_KEY, JSON.stringify({ desk: [mission({ due: at(10, 5, 9) })] }));
    expect(pauseMission('desk', 'm1', true, now)[0]).toMatchObject({ paused: true, due: at(10, 5, 9) });
    expect(pauseMission('desk', 'm1', false, now)[0]).toMatchObject({ paused: false, due: at(10, 10, 9) });
  });
});

describe('the companion runs them', () => {
  // The timeout a check arms stays still: each test checks by hand.
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());
  const project = (id: string, name: string): Project => ({ id, name, path: `C:\\src\\${id}`, createdAt: 0 }) as Project;

  function host(control: CompanionControl = 'ask', projects = [project('p1', 'boite')]) {
    const call = vi.fn(async (method: string) => (method === 'projects.list' ? projects : null));
    const said: string[] = [];
    const run = vi.fn(async () => null);
    const value: MissionsHost = { client: () => ({ call }) as unknown as Client, control: () => control, core: () => 'desk', run, say: (text) => said.push(text) };
    return { value, run, said, projects };
  }

  test('asked first, a mission waits on its card, then is kept', async () => {
    const { value } = host('ask');
    const missions = new Missions(value);
    await missions.request([add('09:00 | weekdays | Boite | Run the tests')], now);
    expect(missions.pending).toHaveLength(1);
    expect(readMissions('desk')).toEqual([]);
    missions.confirm(missions.pending[0]!.id, now);
    expect(missions.pending).toEqual([]);
    expect(missions.list).toMatchObject([{ projectId: 'p1', repeat: { kind: 'weekdays' }, due: at(10, 12, 9) }]);
    missions.dispose();
  });

  test('without asking, it is kept at once and told; an unknown project is told', async () => {
    const { value, said } = host('auto');
    const missions = new Missions(value);
    await missions.request([add('09:00 | daily | boite | Run the tests'), add('09:00 | daily | nowhere | x')], now);
    expect(readMissions('desk')).toHaveLength(1);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('nowhere');
    await missions.request([{ kind: 'cancel', index: 1 }], now);
    expect(readMissions('desk')).toEqual([]);
    missions.dispose();
  });

  test('a due mission runs once, through the task path, marked late when it is', async () => {
    const { value, run } = host();
    window.localStorage.setItem(MISSIONS_KEY, JSON.stringify({ desk: [mission()] }));
    const missions = new Missions(value);
    await missions.check(at(10, 9, 11));
    await missions.check(at(10, 9, 11));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ projectId: 'p1', project: 'boite', prompt: 'Run the tests', worktree: false }, 'late');
    expect(readMissions('desk')[0]!.due).toBe(at(10, 10, 9));
    missions.dispose();
  });

  test('its project gone, a mission stays listed, runs nothing, and says so once', async () => {
    const { value, run, said } = host('ask', [project('p2', 'other')]);
    window.localStorage.setItem(MISSIONS_KEY, JSON.stringify({ desk: [mission({ repeat: { kind: 'once' } })] }));
    const missions = new Missions(value);
    await missions.check(at(10, 9, 9, 1));
    await missions.check(at(10, 9, 9, 20));
    expect(run).not.toHaveBeenCalled();
    expect(said).toHaveLength(1);
    expect(readMissions('desk')).toMatchObject([{ id: 'm1', missing: true }]);
    expect(missions.block()).toContain('(project gone)');
    missions.dispose();
  });
});
