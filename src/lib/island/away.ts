/*
 * The recap when the user comes back to the keyboard (`views/AwayCard.svelte`):
 * what happened while nobody was there, one short line each.
 *
 * The island gathers what it tells as it happens (`away.svelte.ts`): threads
 * that ended, pull requests whose CI settled, the memory guard's warnings.
 * Back after `RECAP_AFTER_MS` or longer, with something new since the user
 * left, the card shows; what waits for the user, the reminders still ringing
 * and the quota are read as they are now. Nothing to tell: no card.
 *
 * In order: the threads that wait for the user, the threads that finished or
 * failed, the pull requests, the reminders, the quota left when low, the
 * memory guard.
 */
import type { RadarKind } from '../companion/watch';
import { fill, strings } from '../strings';
import { AMBER_BELOW } from './quotas.svelte';

/** An absence shorter than this is a coffee: no recap. */
export const RECAP_AFTER_MS = 15 * 60_000;
/** What the island keeps of what happened, for a recap: a day at most. */
export const EVENTS_KEPT_MS = 24 * 60 * 60_000;
/** The waiting threads told one by one; past it the last line counts the rest. */
const WAITING_MAX = 3;
/** The finished threads named in their line. */
const TITLES_MAX = 3;
const PRS_MAX = 2;
const ALARMS_MAX = 2;

export type AwayEvent =
  | { kind: 'finish'; at: number; threadId: string; title: string; failed: boolean }
  | { kind: 'pr'; at: number; threadId: string; url: string; text: string; failed: boolean }
  | { kind: 'memory'; at: number; threadId: string | null; title: string; program: string | null; machine: boolean };
type FinishEvent = Extract<AwayEvent, { kind: 'finish' }>;
type PrEvent = Extract<AwayEvent, { kind: 'pr' }>;
type MemoryEvent = Extract<AwayEvent, { kind: 'memory' }>;

export interface AwayWaiting {
  threadId: string;
  title: string;
  kind: RadarKind;
  since: number;
}

export interface AwayAlarm {
  id: string;
  text: string;
  /** When it rang. */
  at: number;
}

export interface AwayQuota {
  name: string;
  /** Percent left of the subscription's tightest window, the one the pill shows. */
  left: number;
}

export interface AwayFacts {
  /** When the user left, and came back. */
  from: number;
  back: number;
  /** Now, for how long the waiting threads have waited. */
  now: number;
  events: readonly AwayEvent[];
  /** What waits for the user now (`watch.ts`, `waitingOnUser`). */
  waiting: readonly AwayWaiting[];
  /** The reminders ringing now. */
  alarms: readonly AwayAlarm[];
  quota: AwayQuota | null;
  /** The lines already opened from the card. */
  seen?: readonly string[];
  /** Settings turned the memory alert off: the guard's events are not told, those logged before included. */
  memoryOff?: boolean;
}

/** What a line opens: a thread in Boite, or the island's Home. */
export type AwayTarget = { kind: 'thread'; threadId: string } | { kind: 'home' };

export type AwayIcon = 'waiting' | 'finished' | 'failed' | 'pr' | 'alarm' | 'quota' | 'memory';

export interface AwayLine {
  /** Steady while what it tells lasts: a line opened is not told again. */
  key: string;
  icon: AwayIcon;
  text: string;
  tone: 'attention' | 'done' | 'failed' | 'muted';
  target: AwayTarget | null;
}

const MINUTE = 60_000;

/** `40 min`, `2 h`, `1 h 20 min`; a minute at least. */
export function awaySpan(ms: number): string {
  const copy = strings.island.away.span;
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  if (minutes < 60) return fill(copy.minutes, { m: String(minutes) });
  const [h, m] = [Math.floor(minutes / 60), minutes % 60];
  return m === 0 ? fill(copy.hours, { h: String(h) }) : fill(copy.hoursMinutes, { h: String(h), m: String(m).padStart(2, '0') });
}

const within = (facts: AwayFacts, at: number) => at >= facts.from && at <= facts.back;

/** The events of the absence; the last of each thread's ends, of each pull request's CI. */
function eventsOf(facts: AwayFacts): AwayEvent[] {
  const last = new Map<string, AwayEvent>();
  for (const event of facts.events) {
    if (!within(facts, event.at)) continue;
    const key = event.kind === 'finish' ? `finish:${event.threadId}` : event.kind === 'pr' ? `pr:${event.url}` : 'memory';
    const kept = last.get(key);
    if (!kept || kept.at <= event.at) {
      last.delete(key);
      last.set(key, event);
    }
  }
  return [...last.values()].sort((a, b) => a.at - b.at);
}

/** Back after a long enough absence, with something new since the user left: the card is worth showing. */
export function awayWorth(facts: AwayFacts): boolean {
  if (facts.back - facts.from < RECAP_AFTER_MS) return false;
  return (
    facts.events.some((event) => within(facts, event.at)) ||
    facts.waiting.some((entry) => within(facts, entry.since)) ||
    facts.alarms.some((alarm) => within(facts, alarm.at))
  );
}

const untitled = (title: string) => title || strings.companion.untitled;

function waitingLines(facts: AwayFacts, finished: ReadonlySet<string>): AwayLine[] {
  const copy = strings.island.away;
  // A thread that ended is told with the others that ended, not again as unread.
  const entries = facts.waiting.filter((entry) => !((entry.kind === 'answer' || entry.kind === 'failed') && finished.has(entry.threadId)));
  const told = entries.length > WAITING_MAX ? entries.slice(0, WAITING_MAX - 1) : entries;
  const lines: AwayLine[] = told.map((entry) => ({
    key: `wait:${entry.threadId}:${entry.kind}`,
    icon: 'waiting',
    text: fill(copy.waiting[entry.kind], { title: untitled(entry.title), time: awaySpan(facts.now - entry.since) }),
    tone: entry.kind === 'failed' ? 'failed' : 'attention',
    target: { kind: 'thread', threadId: entry.threadId }
  }));
  if (told.length < entries.length) {
    lines.push({ key: 'wait:more', icon: 'waiting', text: fill(copy.othersWaiting, { count: String(entries.length - told.length) }), tone: 'attention', target: { kind: 'home' } });
  }
  return lines;
}

/** The threads that ended with the same outcome, on one line: their count and three names at most. */
function finishLine(ends: FinishEvent[], failed: boolean): AwayLine | null {
  const copy = strings.island.away;
  const first = ends[0];
  if (!first) return null;
  const key = failed ? 'finish:failed' : 'finish:done';
  const icon = failed ? 'failed' : 'finished';
  const tone = failed ? 'failed' : 'done';
  const target: AwayTarget = { kind: 'thread', threadId: first.threadId };
  if (ends.length === 1) return { key, icon, text: fill(failed ? copy.failedOne : copy.finishedOne, { title: untitled(first.title) }), tone, target };
  const names = ends.slice(0, TITLES_MAX).map((end) => untitled(end.title));
  if (ends.length > TITLES_MAX) names.push(fill(copy.more, { count: String(ends.length - TITLES_MAX) }));
  return { key, icon, text: fill(failed ? copy.failedMany : copy.finishedMany, { count: String(ends.length), titles: names.join(', ') }), tone, target };
}

function memoryLine(event: MemoryEvent): AwayLine {
  const copy = strings.island.away;
  const target: AwayTarget | null = event.threadId ? { kind: 'thread', threadId: event.threadId } : null;
  const text = event.program
    ? fill(copy.memoryStopped, { program: event.program, title: untitled(event.title) })
    : event.machine
      ? copy.memoryMachine
      : fill(copy.memoryWarned, { title: untitled(event.title) });
  return { key: 'memory', icon: 'memory', text, tone: event.program ? 'failed' : 'attention', target };
}

/** The card's lines, in order; empty when everything it would tell was dealt with. */
export function awayLines(facts: AwayFacts): AwayLine[] {
  const copy = strings.island.away;
  const events = eventsOf(facts);
  const ends = events.filter((event): event is FinishEvent => event.kind === 'finish');
  const lines: AwayLine[] = waitingLines(facts, new Set(ends.map((end) => end.threadId)));
  // The failures first, in red, apart from the threads that finished well: they are what a glance must not miss.
  for (const failed of [true, false]) {
    const line = finishLine(ends.filter((end) => end.failed === failed), failed);
    if (line) lines.push(line);
  }
  for (const pr of events.filter((event): event is PrEvent => event.kind === 'pr').slice(-PRS_MAX)) {
    lines.push({ key: `pr:${pr.url}`, icon: 'pr', text: pr.text, tone: pr.failed ? 'failed' : 'done', target: { kind: 'thread', threadId: pr.threadId } });
  }
  for (const alarm of facts.alarms.filter((entry) => within(facts, entry.at)).slice(0, ALARMS_MAX)) {
    lines.push({ key: `alarm:${alarm.id}`, icon: 'alarm', text: fill(copy.alarm, { text: alarm.text }), tone: 'attention', target: { kind: 'home' } });
  }
  if (facts.quota && facts.quota.left < AMBER_BELOW) {
    const { name, left } = facts.quota;
    const out = left <= 0;
    lines.push({ key: 'quota', icon: 'quota', text: out ? fill(copy.quotaOut, { name }) : fill(copy.quotaLow, { name, left: String(Math.round(left)) }), tone: out ? 'failed' : 'attention', target: null });
  }
  const memory = facts.memoryOff ? undefined : events.filter((event): event is MemoryEvent => event.kind === 'memory').at(-1);
  if (memory) lines.push(memoryLine(memory));
  const seen = new Set(facts.seen ?? []);
  return lines.filter((line) => !seen.has(line.key));
}

/** What is kept of what happened: the last day, and only what a recap may still tell. */
export function keepEvents(events: readonly AwayEvent[], now: number): AwayEvent[] {
  return events.filter((event) => now - event.at <= EVENTS_KEPT_MS);
}

/** The absence the card tells of: from the first leaving to the last return. */
export interface AwaySpan {
  from: number;
  back: number;
}

/** The span a return gives: a card still waiting keeps its first leaving. */
export function joinSpan(pending: AwaySpan | null, absence: { from: number; to: number }): AwaySpan {
  return { from: Math.min(pending?.from ?? absence.from, absence.from), back: Math.max(pending?.back ?? absence.to, absence.to) };
}
