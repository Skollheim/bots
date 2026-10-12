/*
 * The wheel on the collapsed pill goes through what it can show at rest, in a
 * loop: the live line (each conversation at work its own stop, or the one
 * followed from Home alone), the quota, the music while it plays, the timer
 * while one runs, and the robot alone. Empty stops are skipped. The view it
 * lands on becomes `prefs.pillRest` (`IslandBar.svelte`).
 *
 * A mouse's notch is one step. A trackpad sends many small deltas, and its
 * flick goes on by inertia: they add up to a notch's worth, and after each
 * step the wheel rests a moment, so the stops never race past.
 */
import type { PillRest } from '../companion/prefs';

export interface PillStop {
  view: PillRest;
  /** The conversation, for a live stop. */
  threadId: string | null;
}

export interface StopSources {
  /** The conversations at work, in the pill's order. */
  live: readonly string[];
  /** The thread followed from Home: then the only live stop. */
  followed: string | null;
  quota: boolean;
  music: boolean;
  timer: boolean;
}

/** The pill's stops, in the wheel's order; the robot alone is always one. */
export function pillStops(from: StopSources): PillStop[] {
  const live = from.followed !== null ? [from.followed] : from.live;
  const stops: PillStop[] = live.map((threadId) => ({ view: 'live', threadId }));
  for (const view of ['quota', 'music', 'timer'] as const) if (from[view]) stops.push({ view, threadId: null });
  stops.push({ view: 'robot', threadId: null });
  return stops;
}

/**
 * Where the pill stands among its stops: the view Settings chose when it has
 * something to show, else the live line on `threadId`. -1 when it shows none
 * of them, as the live line with nothing at work.
 */
export function stopAt(stops: readonly PillStop[], rest: PillRest, threadId: string | null): number {
  const chosen = stops.findIndex((stop) => stop.view === rest && rest !== 'live');
  if (chosen >= 0) return chosen;
  const live = stops.findIndex((stop) => stop.view === 'live' && stop.threadId === threadId);
  return live >= 0 ? live : stops.findIndex((stop) => stop.view === 'live');
}

/** The next stop, or the one before, round the loop; from nowhere, the first or the last. */
export function stepStop(stops: readonly PillStop[], at: number, step: 1 | -1): PillStop | null {
  if (stops.length === 0) return null;
  if (at < 0) return step > 0 ? stops[0]! : stops[stops.length - 1]!;
  return stops[(at + step + stops.length) % stops.length]!;
}

/** A notch's worth of pixels; a line and a page as the browser counts them, in pixels. */
export const NOTCH_PX = 50;
const LINE_PX = 40;
const PAGE_PX = 800;
/** After a step the wheel rests: the deltas meanwhile are the same gesture's tail. */
export const WHEEL_REST_MS = 220;
/** A pause this long starts a new gesture: what was added up is forgotten. */
const GESTURE_GAP_MS = 300;

export interface WheelPace {
  /** The pixels added up toward a step, signed. */
  sum: number;
  /** The last delta's time. */
  at: number;
  /** No step before then. */
  until: number;
}

export const WHEEL_STILL: WheelPace = { sum: 0, at: Number.NEGATIVE_INFINITY, until: Number.NEGATIVE_INFINITY };

/** One wheel event: the pace after it, and the step it makes (0 for none; down is forward). */
export function wheelStep(pace: WheelPace, deltaY: number, deltaMode: number, now: number): { pace: WheelPace; step: -1 | 0 | 1 } {
  const px = deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1);
  if (px === 0) return { pace, step: 0 };
  if (now < pace.until) return { pace: { sum: 0, at: now, until: pace.until }, step: 0 };
  // A new gesture, or one that turned the other way, starts from nothing.
  const fresh = now - pace.at > GESTURE_GAP_MS || Math.sign(px) !== Math.sign(pace.sum);
  const sum = (fresh ? 0 : pace.sum) + px;
  if (Math.abs(sum) < NOTCH_PX) return { pace: { sum, at: now, until: pace.until }, step: 0 };
  return { pace: { sum: 0, at: now, until: now + WHEEL_REST_MS }, step: sum > 0 ? 1 : -1 };
}
