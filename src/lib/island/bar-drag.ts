/*
 * The arithmetic of a drag along the bar, kept apart so it is tested
 * without a page. While one thing is carried, the others stay in place in
 * the DOM and slide aside by its width; once dropped, the list is reordered
 * and every slide goes back to zero in the same frame, so nothing jumps.
 */

/** One thing of a row, as measured when the drag began. */
export interface Span {
  left: number;
  width: number;
}

/** How far the pointer goes before a press becomes a drag. */
export const DRAG_SLOP = 4;

const center = (span: Span): number => span.left + span.width / 2;

/** How far the carried thing may go: no further than the row's ends. */
export function clampShift(spans: readonly Span[], from: number, dx: number): number {
  const first = spans[0];
  const last = spans[spans.length - 1];
  const carried = spans[from];
  if (!first || !last || !carried) return 0;
  const min = first.left - carried.left;
  const max = last.left + last.width - (carried.left + carried.width);
  return Math.max(min, Math.min(max, dx));
}

/** Where the carried thing lands, among the row's places: past every centre its own centre went by. */
export function dropIndex(spans: readonly Span[], from: number, dx: number): number {
  const carried = spans[from];
  if (!carried) return from;
  const at = center(carried) + dx;
  return spans.reduce((count, span, index) => (index !== from && center(span) < at ? count + 1 : count), 0);
}

/** The room the carried thing takes: its width and one gap, the gap read between the first two. */
export function stepOf(spans: readonly Span[], from: number): number {
  const carried = spans[from];
  if (!carried) return 0;
  const [a, b] = spans;
  const gap = a && b ? Math.max(0, b.left - (a.left + a.width)) : 0;
  return carried.width + gap;
}

/** How far the thing at `index` slides aside while `from` is carried to `to`. */
export function slideOf(index: number, from: number, to: number, step: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -step;
  if (to < from && index >= to && index < from) return step;
  return 0;
}

/** Where the carried thing ends, from where it began: the place it lands on. */
export function landingShift(spans: readonly Span[], from: number, to: number): number {
  const carried = spans[from];
  const target = spans[to];
  if (!carried || !target || from === to) return 0;
  return to > from ? target.left + target.width - carried.width - carried.left : target.left - carried.left;
}
