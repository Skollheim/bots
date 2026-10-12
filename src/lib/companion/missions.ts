/*
 * Scheduled missions: a thread the companion launches at a set time, once or
 * on a repeat, with nobody at the keyboard (`[[mission: when | repeat |
 * project | instruction]]`). Boite's core has no clock-driven scheduler, so
 * they live here, per core (`per-core.ts`), and `missions.svelte.ts` runs
 * them. What is here is pure: the directive, the next run, what a late run
 * does, the storage and the line a request carries. Times are the user's
 * local wall clock: a mission at 09:00 stays at 09:00 across a DST change.
 */
import { cleanText, makeId, readPerCore, subscribePerCore, writePerCore } from './per-core';

export type Repeat = { kind: 'once' } | { kind: 'daily' } | { kind: 'weekdays' } | { kind: 'weekly'; day: number };

export interface Mission {
  id: string;
  /** The local time of day it runs at, in minutes after midnight. */
  minutes: number;
  repeat: Repeat;
  projectId: string;
  /** The project's name when it was set, shown when the project is gone. */
  project: string;
  prompt: string;
  /** The next occurrence to run, epoch milliseconds: the scheduled time, not when it ran. */
  due: number;
  paused: boolean;
  /** Its project was gone at its last occurrence, and the user was told: not told again. */
  missing: boolean;
  createdAt: number;
}

/** A local date, the month from 1. */
export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

/** A repeat as asked: a weekly one may leave its day to the date's. */
export type AskedRepeat = Repeat | { kind: 'weekly'; day: null };

export type MissionDirective =
  | { kind: 'add'; minutes: number; date: LocalDate | null; repeat: AskedRepeat; project: string; prompt: string }
  | { kind: 'cancel' | 'pause' | 'resume'; index: number };

export const MISSIONS_KEY = 'bots.missions';
/** A mission whose time passed while Bots was off or asleep runs on return when it is less late than this. */
export const LATE_MAX_MS = 12 * 60 * 60_000;
/** A run later than this after its time is marked late. */
export const ON_TIME_MS = 5 * 60_000;
/** The timer never waits longer: a computer waking from sleep runs a due mission soon after. */
export const CHECK_MAX_MS = 10 * 60_000;
export const MISSION_LIMIT = 30;
const PROMPT_MAX = 4000;
/** How much of an instruction the request line carries. */
const PROMPT_SHOWN = 80;
const DAY_MS = 24 * 60 * 60_000;
/** A reply sets a few missions at most: more is a reply gone wrong. */
export const MISSIONS_PER_REPLY = 3;

// ---------------------------------------------------------------------------
// The directive
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES: readonly (readonly string[])[] = [
  ['sunday', 'sun', 'dimanche'],
  ['monday', 'mon', 'lundi'],
  ['tuesday', 'tue', 'mardi'],
  ['wednesday', 'wed', 'mercredi'],
  ['thursday', 'thu', 'jeudi'],
  ['friday', 'fri', 'vendredi'],
  ['saturday', 'sat', 'samedi']
];

/** `once`, `daily`, `weekdays`, `weekly`, or a weekday (`friday`, `every friday`). Null for anything else. */
export function parseRepeat(text: string): AskedRepeat | null {
  const value = text.trim().toLowerCase().replace(/^(every|tous les|chaque)\s+/, '').replace(/s$/, '');
  if (value === '' || value === 'once' || value === 'one time' || value === 'une foi') return { kind: 'once' };
  if (value === 'daily' || value === 'day' || value === 'everyday' || value === 'jour') return { kind: 'daily' };
  if (value === 'weekday' || value === 'workday' || value === 'jours ouvré' || value === 'jours de semaine') return { kind: 'weekdays' };
  if (value === 'weekly' || value === 'week' || value === 'semaine') return { kind: 'weekly', day: null };
  const day = WEEKDAY_NAMES.findIndex((names) => names.includes(value));
  return day < 0 ? null : { kind: 'weekly', day };
}

/** `09:00`, `9h05`, `18h`: minutes after midnight, null for anything else. */
function clockOf(text: string): number | null {
  const clock = /^(\d{1,2})(?:[:h](\d{2})?)?$/.exec(text.trim().toLowerCase());
  if (!clock || (clock[2] === undefined && !text.toLowerCase().includes('h'))) return null;
  const [hours, minutes] = [Number(clock[1]), Number(clock[2] ?? 0)];
  return hours > 23 || minutes > 59 ? null : hours * 60 + minutes;
}

/** WHEN: a time (`09:00`) or a local date and time (`2026-10-16 18:00`). */
function whenOf(text: string): { minutes: number; date: LocalDate | null } | null {
  const value = text.trim();
  const dated = /^(\d{4})-(\d{2})-(\d{2})[ tT]+(.+)$/.exec(value);
  if (!dated) {
    const minutes = clockOf(value);
    return minutes === null ? null : { minutes, date: null };
  }
  const [year, month, day] = [Number(dated[1]), Number(dated[2]), Number(dated[3])];
  const minutes = clockOf(dated[4]!);
  const check = new Date(year, month - 1, day);
  // `new Date` rolls an impossible date over (31 February): refuse it instead.
  if (minutes === null || check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return { minutes, date: { year, month, day } };
}

/** The number of an entry in the list the request line carried (`2`, `#2`, `2.`), from 1. */
export function indexOf(text: string): number | null {
  const match = /^#?\s*(\d{1,3})\.?$/.exec(text.trim());
  const index = match ? Number(match[1]) : 0;
  return index >= 1 ? index : null;
}

const OPS = new Set(['cancel', 'delete', 'remove', 'pause', 'resume']);

/**
 * `WHEN | REPEAT | PROJECT | INSTRUCTION`, the instruction possibly holding
 * bars of its own; or `cancel | N`, `pause | N`, `resume | N` for the Nth
 * mission the request line listed. Null when it cannot be read.
 */
export function parseMission(content: string): MissionDirective | null {
  const parts = content.split('|');
  const head = parts[0]!.trim().toLowerCase();
  if (OPS.has(head)) {
    const index = parts.length === 2 ? indexOf(parts[1]!) : null;
    if (index === null) return null;
    const kind = head === 'pause' || head === 'resume' ? head : 'cancel';
    return { kind, index };
  }
  if (parts.length < 4) return null;
  const when = whenOf(parts[0]!);
  const repeat = parseRepeat(parts[1]!);
  const project = parts[2]!.trim();
  const prompt = parts.slice(3).join('|').trim().slice(0, PROMPT_MAX);
  if (!when || !repeat || !project || !prompt) return null;
  return { kind: 'add', ...when, repeat, project, prompt };
}

// ---------------------------------------------------------------------------
// When it runs
// ---------------------------------------------------------------------------

function matches(repeat: Repeat, weekday: number): boolean {
  if (repeat.kind === 'weekdays') return weekday >= 1 && weekday <= 5;
  if (repeat.kind === 'weekly') return weekday === repeat.day;
  return true;
}

/**
 * The first local `minutes` of a day the repeat takes, strictly after
 * `after`; `once` takes any day. In a DST gap the clock jumps over, it is the
 * time `Date` lands on (02:30 becomes 03:30); in the hour told twice, the first.
 */
export function nextAt(repeat: Repeat, minutes: number, after: number): number {
  const from = new Date(after);
  const [hours, mins] = [Math.floor(minutes / 60), minutes % 60];
  for (let offset = 0; ; offset++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, mins).getTime();
    if (at > after && matches(repeat, day.getDay())) return at;
  }
}

/**
 * What a directive asks, made a mission's schedule: its repeat, a weekly one
 * on the date's weekday when it names none, and its first run. Null when that
 * run is already past (a date gone by, once).
 */
export function scheduleOf(directive: MissionDirective & { kind: 'add' }, now: number): { minutes: number; repeat: Repeat; due: number } | null {
  const { minutes, date } = directive;
  const start = date ? new Date(date.year, date.month - 1, date.day).getTime() : null;
  const dated = start === null ? null : new Date(date!.year, date!.month - 1, date!.day, Math.floor(minutes / 60), minutes % 60).getTime();
  let repeat: Repeat;
  if (directive.repeat.kind === 'weekly' && directive.repeat.day === null) {
    const first = dated ?? nextAt({ kind: 'daily' }, minutes, now);
    repeat = { kind: 'weekly', day: new Date(first).getDay() };
  } else repeat = directive.repeat as Repeat;
  if (repeat.kind === 'once') {
    const due = dated ?? nextAt(repeat, minutes, now);
    return due > now ? { minutes, repeat, due } : null;
  }
  // A recurring mission with a date starts that day, or now when it is past.
  return { minutes, repeat, due: nextAt(repeat, minutes, Math.max(now, (start ?? now) - 1)) };
}

/** What a mission does at `now`: run an occurrence, maybe late, skip the older ones, and when it comes next. */
export interface Settled {
  /** The occurrence to run now; null when none is due or the last one is too late. */
  run: { at: number; late: boolean } | null;
  /** Occurrences let go, too late to run. */
  missed: number;
  /** The next occurrence, after `now`; null when a mission run once is over. */
  due: number | null;
}

/**
 * The occurrences due by `now`: the latest runs when it is less than
 * `LATE_MAX_MS` late, the ones before it are missed, and the next one comes
 * after `now`, so no occurrence ever runs twice.
 */
export function settle(mission: Pick<Mission, 'minutes' | 'repeat' | 'due'>, now: number): Settled {
  const { repeat, minutes } = mission;
  if (mission.due > now) return { run: null, missed: 0, due: mission.due };
  let latest = mission.due;
  let missed = 0;
  if (repeat.kind !== 'once') {
    // Away for weeks: what came before the last week is missed, the week walked.
    if (now - latest > 8 * DAY_MS) {
      latest = nextAt(repeat, minutes, now - 8 * DAY_MS);
      missed++;
    }
    for (let next = nextAt(repeat, minutes, latest); next <= now; next = nextAt(repeat, minutes, latest)) {
      latest = next;
      missed++;
    }
  }
  const due = repeat.kind === 'once' ? null : nextAt(repeat, minutes, latest);
  if (now - latest > LATE_MAX_MS) return { run: null, missed: missed + 1, due };
  return { run: { at: latest, late: now - latest > ON_TIME_MS }, missed, due };
}

/**
 * How long the companion waits before it looks again: to the soonest mission
 * running, never past `CHECK_MAX_MS`; null with none to run. A mission whose
 * project is gone is looked at again only every `CHECK_MAX_MS`, for its
 * project coming back.
 */
export function waitFor(missions: readonly Pick<Mission, 'due' | 'paused' | 'missing'>[], now: number): number | null {
  const dues = missions.filter((mission) => !mission.paused).map((mission) => (mission.missing ? Math.max(mission.due, now + CHECK_MAX_MS) : mission.due));
  if (dues.length === 0) return null;
  return Math.min(CHECK_MAX_MS, Math.max(0, Math.min(...dues) - now));
}

// ---------------------------------------------------------------------------
// What the request line carries
// ---------------------------------------------------------------------------

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function repeatWords(mission: Pick<Mission, 'repeat' | 'due'>): string {
  const { repeat } = mission;
  if (repeat.kind === 'daily') return 'every day';
  if (repeat.kind === 'weekdays') return 'weekdays';
  if (repeat.kind === 'weekly') return `every ${WEEKDAYS[repeat.day]}`;
  const at = new Date(mission.due);
  return `once ${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** The missions, numbered for `[[mission: cancel | N]]`, in a few words each; null when there is none. */
export function missionsBlock(missions: readonly Mission[], projects?: ReadonlySet<string>): string | null {
  if (missions.length === 0) return null;
  const lines = missions.map((mission, index) => {
    const prompt = mission.prompt.length > PROMPT_SHOWN ? `${mission.prompt.slice(0, PROMPT_SHOWN - 1)}…` : mission.prompt;
    const flags = [mission.paused ? 'paused' : '', projects && !projects.has(mission.projectId) ? 'project gone' : ''].filter(Boolean);
    const name = mission.project.replace(/[[\]\n]/g, ' ');
    return `${index + 1}. ${repeatWords(mission)} ${clock(mission.minutes)} in ${name}: ${prompt.replace(/[[\]\n]/g, ' ')}${flags.length ? ` (${flags.join(', ')})` : ''}`;
  });
  return `scheduled missions: ${lines.join('; ')}`;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function repeatOf(value: unknown): Repeat | null {
  const { kind, day } = (value ?? {}) as Record<string, unknown>;
  if (kind === 'once' || kind === 'daily' || kind === 'weekdays') return { kind };
  return kind === 'weekly' && typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6 ? { kind, day } : null;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A stored mission, or null when it does not read as one. */
export function parseStoredMission(entry: unknown): Mission | null {
  const raw = (entry ?? {}) as Record<string, unknown>;
  const repeat = repeatOf(raw.repeat);
  const { id, minutes, projectId, project, prompt, due, createdAt } = raw;
  if (typeof id !== 'string' || !repeat || typeof projectId !== 'string' || typeof prompt !== 'string' || prompt.trim() === '') return null;
  if (!finite(minutes) || minutes < 0 || minutes >= 24 * 60 || !finite(due)) return null;
  return {
    id,
    minutes: Math.floor(minutes),
    repeat,
    projectId,
    project: typeof project === 'string' ? project : '',
    prompt,
    due,
    paused: raw.paused === true,
    missing: raw.missing === true,
    createdAt: finite(createdAt) ? createdAt : due
  };
}

/** The missions of `core`, the soonest first. */
export function readMissions(core: string): Mission[] {
  return readPerCore(MISSIONS_KEY, core, parseStoredMission).sort((a, b) => a.due - b.due);
}

export function writeMissions(core: string, missions: readonly Mission[]): void {
  writePerCore(MISSIONS_KEY, core, [...missions].sort((a, b) => a.due - b.due).slice(0, MISSION_LIMIT));
}

export type NewMission = Pick<Mission, 'minutes' | 'repeat' | 'due' | 'projectId' | 'project' | 'prompt'>;

export function addMission(core: string, mission: NewMission, now = Date.now()): Mission[] {
  const made: Mission = { ...mission, id: makeId(now), prompt: mission.prompt.trim().slice(0, PROMPT_MAX), project: cleanText(mission.project, 200), paused: false, missing: false, createdAt: now };
  const next = [...readMissions(core), made];
  writeMissions(core, next);
  return readMissions(core);
}

export function removeMission(core: string, id: string): Mission[] {
  writeMissions(core, readMissions(core).filter((mission) => mission.id !== id));
  return readMissions(core);
}

export function updateMission(core: string, id: string, change: Partial<Omit<Mission, 'id'>>): Mission[] {
  writeMissions(core, readMissions(core).map((mission) => (mission.id === id ? { ...mission, ...change } : mission)));
  return readMissions(core);
}

/**
 * Paused or running again. A recurring mission taken up again starts from its
 * next occurrence after `now`, never one it slept through.
 */
export function pauseMission(core: string, id: string, paused: boolean, now = Date.now()): Mission[] {
  const mission = readMissions(core).find((entry) => entry.id === id);
  if (!mission) return readMissions(core);
  const due = !paused && mission.repeat.kind !== 'once' && mission.due <= now ? nextAt(mission.repeat, mission.minutes, now) : mission.due;
  return updateMission(core, id, { paused, due });
}

export const subscribeMissions = (listener: () => void): (() => void) => subscribePerCore(MISSIONS_KEY, listener);
