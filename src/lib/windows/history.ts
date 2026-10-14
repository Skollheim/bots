/*
 * The system tab's last minute of a reading (the processor's load), drawn
 * under its number: the readings it keeps, and the line and the area that
 * draw them. The tab keeps them while it shows and drops them as it closes.
 */

export interface Reading {
  /** When it was read, in milliseconds. */
  at: number;
  /** From 0 to 100. */
  value: number;
}

/** How far back the drawing reaches. */
export const HISTORY_MS = 60_000;

/** `history` with `reading` added, without what fell out of the last `span` (kept one past the edge, so the line reaches it). */
export function remember(history: readonly Reading[], reading: Reading, span = HISTORY_MS): Reading[] {
  const value = Math.min(100, Math.max(0, reading.value));
  const kept = [...history.filter((point) => point.at < reading.at), { at: reading.at, value }];
  const edge = reading.at - span;
  const first = kept.findIndex((point) => point.at >= edge);
  return kept.slice(Math.max(0, first - 1));
}

export interface Spark {
  /** The line through the readings. */
  line: string;
  /** The same line closed down to the bottom, for the area under it. */
  area: string;
}

/**
 * The paths for `history` in a `width` × `height` box: the newest reading on
 * the right edge, a minute ago on the left, 0 at the bottom and 100 at the
 * top. Empty under two readings, there is no line yet.
 */
export function sparkPaths(history: readonly Reading[], width: number, height: number, span = HISTORY_MS): Spark {
  if (history.length < 2) return { line: '', area: '' };
  const newest = history[history.length - 1]!.at;
  const x = (at: number) => round(Math.max(0, width - ((newest - at) / span) * width));
  const y = (value: number) => round(height - (value / 100) * height);
  const points = history.map((point) => `${x(point.at)},${y(point.value)}`);
  const line = `M${points.join('L')}`;
  const area = `${line}L${x(newest)},${height}L${x(history[0]!.at)},${height}Z`;
  return { line, area };
}

/** The lowest and the highest of `history`, rounded, or null when it is empty. */
export function spanOf(history: readonly Reading[]): { low: number; high: number } | null {
  if (history.length === 0) return null;
  const values = history.map((point) => point.value);
  return { low: Math.round(Math.min(...values)), high: Math.round(Math.max(...values)) };
}

const round = (value: number) => Math.round(value * 10) / 10;
