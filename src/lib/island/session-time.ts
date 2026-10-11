/*
 * How long a session has been at it, calm enough to read at a glance: the
 * seconds only under a minute ("45s"), then minutes ("41 min"), then hours
 * and minutes ("1h 20m"), in the language the app speaks. Past the first
 * minute the text changes once a minute, so the clock that drives it wakes
 * only when a row's text would change or an ended row is due to leave.
 */
import { fill, strings } from '../strings';
import { isLive, LINGER_MS, type SessionRow } from './sessions';

const SECOND = 1_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** The clock still looks now and then when nothing is due: a row's start may move. */
const CLOCK_MAX_MS = MINUTE;

export interface DurationCopy {
  seconds: string;
  minutes: string;
  hours: string;
  hoursOnly: string;
}

/** A session's elapsed time in words: "45s", "41 min", "1h 20m", "2h". */
export function sessionTime(ms: number, copy: DurationCopy = strings.island.sessions.duration): string {
  const span = Math.max(0, ms);
  if (span < MINUTE) return fill(copy.seconds, { n: String(Math.floor(span / SECOND)) });
  if (span < HOUR) return fill(copy.minutes, { n: String(Math.floor(span / MINUTE)) });
  const hours = Math.floor(span / HOUR);
  const minutes = Math.floor((span % HOUR) / MINUTE);
  return minutes === 0 ? fill(copy.hoursOnly, { h: String(hours) }) : fill(copy.hours, { h: String(hours), m: String(minutes), mm: String(minutes).padStart(2, '0') });
}

/** How long until `sessionTime(ms)` reads differently: within the second under a minute, else within the minute. */
export function nextChange(ms: number): number {
  const span = Math.max(0, ms);
  const step = span < MINUTE ? SECOND : MINUTE;
  return step - (span % step);
}

/**
 * When a clock showing elapsed times since `starts` must look again: the
 * soonest of their texts changing; null with no start. The desktop HUD reads
 * its times by this rather than each second.
 */
export function elapsedDelay(starts: readonly (number | null)[], now: number): number | null {
  let soonest: number | null = null;
  for (const start of starts) {
    if (start === null) continue;
    const due = nextChange(now - start);
    if (soonest === null || due < soonest) soonest = due;
  }
  return soonest === null ? null : Math.min(soonest, CLOCK_MAX_MS);
}

/**
 * When the sessions' clock must look again: the soonest of a live row's time
 * changing and an ended row (not kept by its card) leaving; null when no row
 * needs it. Ended rows read a fixed time and need no tick.
 */
export function clockDelay(rows: readonly SessionRow[], now: number, keep: readonly string[] = []): number | null {
  const kept = new Set(keep);
  let soonest: number | null = null;
  for (const row of rows) {
    const due = isLive(row) ? nextChange(now - row.since) : kept.has(row.id) ? null : Math.max(0, (row.endedAt ?? 0) + LINGER_MS - now);
    if (due !== null && (soonest === null || due < soonest)) soonest = due;
  }
  return soonest === null ? null : Math.min(soonest, CLOCK_MAX_MS);
}
