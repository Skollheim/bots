/*
 * When nobody was at the keyboard, by the wall clock: the computer may sleep
 * or lock meanwhile, and the page's timers freeze then (`senses.svelte.ts`).
 *
 * - The shell says `away` once five minutes went by without a key or the
 *   mouse (`AWAY_AFTER_MS` in `companion_window.rs`): the absence began five
 *   minutes before it said so.
 * - A computer put to sleep soon after the last key may wake to a key at once,
 *   before the shell could say `away`: the page's clock, which ticks every
 *   15 seconds, then finds a long gap between two ticks, and the gap was an
 *   absence too.
 */

/** The shell's wait before it says `away`. */
export const AWAY_IDLE_MS = 5 * 60_000;
/** A gap this long between two of the page's ticks: the computer slept. */
export const SLEPT_MS = 3 * 60_000;

export interface Absence {
  from: number;
  to: number;
}

/** When the absence began, from the time the shell said `away`. */
export const absenceStart = (awayAt: number): number => awayAt - AWAY_IDLE_MS;

/** The absence the gap between two ticks was, or null for a tick on time. */
export function sleptThrough(lastTick: number, now: number): Absence | null {
  return now - lastTick >= SLEPT_MS ? { from: lastTick, to: now } : null;
}
