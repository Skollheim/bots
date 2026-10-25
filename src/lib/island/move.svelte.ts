/*
 * The island carried to another of its places (`place.ts`). A press on the
 * pill that moves past `MOVE_FROM` carries it: the window spans the screen
 * (`spanIsland`), the six places show as targets, and the island follows the
 * pointer, drawn `offset` away from its place, held where it was taken. Let
 * go, it goes to the place nearest, which is saved: the page lays it out
 * there at once and the offset, from where it was let go, springs back to
 * nothing. Then the window shrinks around it again (`App.svelte`).
 *
 * The pointer taken to another screen takes the span there (`island.rs`,
 * `companion://span`): the targets show on that screen, and the island lands
 * on it, the screen saved with the place (`landPatch`).
 *
 * A drag that ends without its release (the window lost the focus or the
 * pointer, or the shell gave the span up) puts the island back where it was.
 *
 * A press on the robot's face carries the island too: the robot never comes
 * out of it by a drag (Settings > Placement sets it loose).
 */
import { tick } from 'svelte';
import type { IslandPlace } from '../companion/prefs';
import { landPatch, nearestPlace, type LandPatch } from './place';
import { FrameSpring } from './spring.svelte';

/** How far the pointer goes before a press carries the island, CSS pixels: as far as a robot is pulled. */
export const MOVE_FROM = 4;

export interface MoveHost {
  place(): IslandPlace;
  /** The island's box as drawn, carried by the drag's offset. */
  island(): DOMRect | null;
  /** The window spans the screen under the pointer, the island's, for the targets and the drag; answers its name. */
  span(): Promise<string | null>;
  /** The island goes to its new place, on another screen when the drag took it there; saved. */
  land(patch: LandPatch): void;
  reduced(): boolean;
}

type Point = { x: number; y: number };

interface Press {
  id: number;
  /** Where the press was on the screen, for `MOVE_FROM`. */
  screen: Point;
  /** Where the island was taken, from its top left, CSS pixels. */
  grab: Point | null;
  /** The pill, which holds the pointer while the island is carried. */
  target: Element | null;
}

export class IslandMove {
  /** The island is carried, or still landing: the window spans the screen. */
  moving = $state(false);
  /** Let go: the island springs into its new place. */
  landing = $state(false);
  /** The place the island would go to if let go now. */
  over = $state<IslandPlace | null>(null);
  /** How far the island is drawn from its place. Same spring as the island's size. */
  readonly offset = new FrameSpring<Point>({ x: 0, y: 0 }, { stiffness: 0.18, damping: 0.72, precision: 0.25 });
  /** A drag just ended: the click it ends with opens nothing. */
  moved = false;
  #press: Press | null = null;
  #movedTimer: ReturnType<typeof setTimeout> | undefined;
  /** The drag under way, so a screen answered for an older one is not taken. */
  #drag = 0;
  /** The screen the drag began on, and the one the window spans now. */
  #from: string | null = null;
  #on: string | null = null;

  constructor(private readonly host: MoveHost) {}

  /** A press on the pill: a drag if it moves far enough, a click otherwise. */
  press(event: PointerEvent): void {
    if (event.button !== 0 || this.moving) return;
    const box = this.host.island();
    this.#press = {
      id: event.pointerId,
      screen: { x: event.screenX, y: event.screenY },
      grab: box ? { x: event.clientX - box.x, y: event.clientY - box.y } : null,
      target: event.currentTarget instanceof Element ? event.currentTarget : null
    };
    window.addEventListener('pointermove', this.#move);
    window.addEventListener('pointerup', this.#release);
    window.addEventListener('pointercancel', this.#lost);
    window.addEventListener('lostpointercapture', this.#lost);
    window.addEventListener('blur', this.abort);
  }

  /** The window spans another screen, under the pointer (`companion://span`). */
  spanned(monitor: string): void {
    if (this.moving && !this.landing) this.#on = monitor;
  }

  /** The island landed, its offset back to nothing: the window shrinks around it. */
  settle(): void {
    if (!this.landing) return;
    this.landing = false;
    this.moving = false;
  }

  /**
   * The drag ends without its release: carried, the island goes back where it
   * was; landing, it lands at once. Either way the window shrinks around it.
   */
  abort = (): void => {
    this.#stopListening();
    this.#press = null;
    if (!this.moving) return;
    this.#endClick();
    this.over = null;
    this.offset.set({ x: 0, y: 0 }, { instant: true });
    this.landing = false;
    this.moving = false;
  };

  dispose(): void {
    this.#stopListening();
    this.offset.stop();
    clearTimeout(this.#movedTimer);
  }

  #nearest(): IslandPlace | null {
    const box = this.host.island();
    if (!box) return null;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    return nearestPlace(centre, { width: window.innerWidth, height: window.innerHeight }, { width: box.width, height: box.height });
  }

  #start(press: Press): void {
    this.moving = true;
    this.moved = true;
    const drag = ++this.#drag;
    this.#from = this.#on = null;
    void this.host.span().then(
      (monitor) => {
        if (drag !== this.#drag) return;
        this.#from = monitor;
        this.#on ??= monitor;
      },
      () => {}
    );
    // The pill keeps the pointer, wherever it goes: losing it ends the drag.
    try {
      press.target?.setPointerCapture(press.id);
    } catch {
      // A pointer already gone: its release or cancel ends the drag.
    }
  }

  #move = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.id) return;
    // The button went up where the window did not hear it.
    if (event.buttons === 0) return void this.#release(event);
    if (!this.moving) {
      if (Math.hypot(event.screenX - press.screen.x, event.screenY - press.screen.y) < MOVE_FROM) return;
      this.#start(press);
    }
    this.offset.set(this.#offsetAt(press, event), { instant: true });
    this.over = this.#nearest();
  };

  /**
   * The offset that keeps the island where it was taken under the pointer.
   * Measured in the window as it is now: the window grown to span a screen, or
   * moved to another one, lays the island out elsewhere, and the next move
   * follows.
   */
  #offsetAt(press: Press, event: PointerEvent): Point {
    const box = this.host.island();
    if (!press.grab || !box) return { x: event.screenX - press.screen.x, y: event.screenY - press.screen.y };
    const shown = this.offset.current;
    return { x: event.clientX - press.grab.x - (box.x - shown.x), y: event.clientY - press.grab.y - (box.y - shown.y) };
  }

  #release = async (event: PointerEvent): Promise<void> => {
    if (this.#press && event.pointerId !== this.#press.id) return;
    this.#stopListening();
    this.#press = null;
    if (!this.moving) return;
    this.#endClick();
    const place = this.#nearest() ?? this.host.place();
    this.over = null;
    this.landing = true;
    // Where it was let go, then laid out at its new place, the same offset on: the gap between them springs away.
    const before = this.host.island();
    const shown = this.offset.current;
    this.host.land(landPatch(place, this.#from, this.#on));
    await tick();
    const after = this.host.island();
    if (before && after) this.offset.set({ x: before.x + shown.x - after.x, y: before.y + shown.y - after.y }, { instant: true });
    this.offset.set({ x: 0, y: 0 }, { instant: this.host.reduced() });
  };

  #lost = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.id) return;
    // Taking the pointer for the pill takes it from what held it before (a touch's first target): that is no loss.
    if (event.type === 'lostpointercapture' && event.target !== press.target) return;
    this.abort();
  };

  #endClick(): void {
    clearTimeout(this.#movedTimer);
    this.#movedTimer = setTimeout(() => (this.moved = false), 300);
  }

  #stopListening(): void {
    window.removeEventListener('pointermove', this.#move);
    window.removeEventListener('pointerup', this.#release);
    window.removeEventListener('pointercancel', this.#lost);
    window.removeEventListener('lostpointercapture', this.#lost);
    window.removeEventListener('blur', this.abort);
  }
}
