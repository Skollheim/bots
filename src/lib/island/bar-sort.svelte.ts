/*
 * A row of the bar that the user reorders with the pointer, in edit mode:
 * a press that moves past `DRAG_SLOP` carries the thing, the others slide
 * aside (`bar-drag.ts`), and the drop glides it into its place before the
 * list is reordered. A press that does not move stays a click.
 *
 * Each row's things carry `data-sort`; the row is measured once, when the
 * drag begins. `settling` is on for the frame the list is reordered in:
 * the row draws it without its transitions, so nothing slides back.
 */
import { clampShift, DRAG_SLOP, dropIndex, landingShift, slideOf, stepOf, type Span } from './bar-drag';

/** How long the drop glides before the list takes the new order. */
export const LAND_MS = 150;

export class RowSorter {
  /** The index carried, or null. */
  carried = $state<number | null>(null);
  /** How far it went from its place, in pixels. */
  shift = $state(0);
  /** The place it would land on. */
  target = $state(0);
  /** Dropped: it glides to its place. */
  landing = $state(false);
  /** The frame the list is reordered in: no transition then. */
  settling = $state(false);

  #spans: Span[] = [];
  #step = 0;
  #from = -1;
  #startX = 0;
  #pointer: number | null = null;
  #dragged = false;
  #landTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly commit: (from: number, to: number) => void,
    private readonly reduced: () => boolean = () => false
  ) {}

  /** A press on the thing at `index`; the row is the element whose `[data-sort]` children are its things. */
  press(event: PointerEvent, index: number, row: HTMLElement | null): void {
    if (event.button !== 0 || this.landing || !row) return;
    this.#spans = [...row.querySelectorAll<HTMLElement>(':scope > [data-sort]')].map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, width: box.width };
    });
    this.#from = index;
    this.#startX = event.clientX;
    this.#pointer = event.pointerId;
    this.#dragged = false;
    this.#step = stepOf(this.#spans, index);
  }

  move(event: PointerEvent): void {
    if (event.pointerId !== this.#pointer) return;
    const dx = event.clientX - this.#startX;
    if (!this.#dragged) {
      if (Math.abs(dx) < DRAG_SLOP) return;
      this.#dragged = true;
      this.carried = this.#from;
      try {
        (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
      } catch {
        /* a pointer the page made up has nothing to capture; the drag goes on without */
      }
    }
    this.shift = clampShift(this.#spans, this.#from, dx);
    this.target = dropIndex(this.#spans, this.#from, this.shift);
  }

  /** The press ends. True when it was a drag, so the click it ends with is not one. */
  release(event: PointerEvent): boolean {
    if (event.pointerId !== this.#pointer) return false;
    this.#pointer = null;
    if (!this.#dragged) return false;
    const [from, to] = [this.#from, this.target];
    if (this.reduced()) {
      this.#settle(from, to);
      return true;
    }
    this.landing = true;
    this.shift = landingShift(this.#spans, from, to);
    this.#landTimer = setTimeout(() => this.#settle(from, to), LAND_MS);
    return true;
  }

  /** The press was taken away (the window lost the pointer): everything goes back. */
  cancel(): void {
    clearTimeout(this.#landTimer);
    this.#pointer = null;
    this.#dragged = false;
    this.carried = null;
    this.shift = 0;
    this.landing = false;
  }

  /** How far the thing at `index` is moved now. */
  offset(index: number): number {
    if (this.carried === null) return 0;
    return index === this.carried ? this.shift : slideOf(index, this.carried, this.target, this.#step);
  }

  #settle(from: number, to: number): void {
    this.settling = true;
    this.carried = null;
    this.shift = 0;
    this.landing = false;
    if (from !== to) this.commit(from, to);
    requestAnimationFrame(() => requestAnimationFrame(() => (this.settling = false)));
  }

  dispose(): void {
    clearTimeout(this.#landTimer);
  }
}
