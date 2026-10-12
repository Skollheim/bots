/*
 * What the deck's tiles show, worked out without the page: the week around a
 * day, when the clock next turns, how many threads each machine of the group
 * runs, how far the focus timer went, and the missions of the week. Pure, so
 * tested with fixed dates.
 */
import type { ThreadSummary } from '@boite/contracts';
import { nextAt, type Mission } from '../companion/missions';
import type { Pomodoro } from '../companion/pomodoro';

export interface WeekDay {
  /** `YYYY-MM-DD`, in local time. */
  key: string;
  /** The day of the month. */
  date: number;
  /** The short name, in the language asked ("lun.", "Mon"). */
  name: string;
  today: boolean;
}

/** `YYYY-MM-DD` in local time. */
export function dayKey(day: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The seven days, Monday first, of the week holding `now`. */
export function weekOf(now: Date, locale: string): WeekDay[] {
  const names = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
    const key = dayKey(day);
    return { key, date: day.getDate(), name: names.format(day), today: key === today };
  });
}

/** How long until the clock shows the next minute, at least a few milliseconds. */
export function untilNextMinute(now: number): number {
  const into = new Date(now).getSeconds() * 1000 + new Date(now).getMilliseconds();
  return Math.max(20, 60_000 - into);
}

export interface MachineLoad {
  /** The member's id; null for this machine. */
  coreId: string | null;
  name: string;
  /** Connected, or not reached now: its threads are missing then. */
  online: boolean;
  /** Threads at work there: queued, running or waiting. */
  working: number;
}

const working = (status: ThreadSummary['status']) => status === 'queued' || status === 'running' || status === 'waiting';

/**
 * This machine first, then the group's other machines in roster order, each
 * with the threads at work on it. Empty without other machines: one machine
 * alone says nothing the threads tile does not.
 */
export function machineLoads(
  threads: readonly Pick<ThreadSummary, 'id' | 'status'>[],
  coreIdOf: (threadId: string) => string | null,
  machines: readonly { coreId: string; name: string; state: string }[],
  localName: string
): MachineLoad[] {
  if (machines.length === 0) return [];
  const counts = new Map<string | null, number>();
  for (const thread of threads) {
    if (!working(thread.status)) continue;
    const owner = coreIdOf(thread.id);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  return [
    { coreId: null, name: localName, online: true, working: counts.get(null) ?? 0 },
    ...machines.map((machine) => ({ coreId: machine.coreId, name: machine.name, online: machine.state === 'ready', working: counts.get(machine.coreId) ?? 0 }))
  ];
}

/** The focus tile's quick starts, in minutes. */
export const FOCUS_PRESETS = [15, 25, 45, 60] as const;

/** How much of the phase is done, 0 to 1: what the focus ring fills. A stopwatch fills over an hour, round and round. */
export function timerShare(timer: Pick<Pomodoro, 'kind' | 'phase' | 'workMs' | 'breakMs'> | null, left: number, elapsed: number): number {
  if (!timer) return 0;
  if (timer.kind === 'stopwatch') return (elapsed % 3_600_000) / 3_600_000;
  const total = timer.phase === 'break' ? timer.breakMs : timer.workMs;
  return total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : 0;
}

type Planned = Pick<Mission, 'repeat' | 'minutes' | 'due' | 'paused' | 'missing'>;
const planned = (mission: Planned) => !mission.paused && !mission.missing;

/** Midnight of a `YYYY-MM-DD` day, moved by `days`. */
function midnight(key: string, days = 0): number {
  const [year = 0, month = 1, date = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, date + days).getTime();
}

/**
 * The days of `week` a mission runs on, from each one's next run on: the
 * week's dots. Paused missions and the ones whose project is gone are left out.
 */
export function missionDays(missions: readonly Planned[], week: readonly Pick<WeekDay, 'key'>[]): Set<string> {
  const days = new Set<string>();
  const first = week[0];
  const last = week[week.length - 1];
  if (!first || !last) return days;
  const start = midnight(first.key);
  const end = midnight(last.key, 1);
  for (const mission of missions) {
    if (!planned(mission)) continue;
    let at = mission.due;
    if (at < start) {
      if (mission.repeat.kind === 'once') continue;
      at = nextAt(mission.repeat, mission.minutes, start - 1);
    }
    // A week holds seven runs at most.
    for (let runs = 0; at < end && runs < 7; runs++) {
      days.add(dayKey(new Date(at)));
      if (mission.repeat.kind === 'once') break;
      at = nextAt(mission.repeat, mission.minutes, at);
    }
  }
  return days;
}

/** The mission that runs next, paused and lost ones left out; null without any. */
export function nextMission<T extends Planned>(missions: readonly T[]): T | null {
  let soonest: T | null = null;
  for (const mission of missions) if (planned(mission) && (!soonest || mission.due < soonest.due)) soonest = mission;
  return soonest;
}
