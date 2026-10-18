/*
 * The island carried to another of its places (`place.ts`). A press on the
 * pill that moves past `MOVE_FROM` carries it: the window spans the screen
 * (`spanIsland`), the six places show as targets, and the island follows the
 * pointer, drawn `offset` away from its place. Let go, it goes to the place
 * nearest, which is saved: the page lays it out there at once and the offset,
 * from where it was let go, springs back to nothing. Then the window shrinks
 * around it again (`App.svelte`).
 *
 * A press on the robot's face is not this: it pulls the robot out of the
 * island (`Companion.onpress`).
 */
import { tick } from 'svelte';
import type { IslandPlace } from '../companion/prefs';
import { nearestPlace } from './place';
import { FrameSpring } from './spring.svelte';

/** How far the pointer goes before a press carries the island, CSS pixels: as far as a robot is pulled. */
export const MOVE_FROM = 4;

export interface MoveHost {
  place(): IslandPlace;
  /** The island's box as drawn, carried by the drag's offset. */
  island(): DOMRect | null;
  /** The window spans the island's screen, for the targets and the drag. */
  span(): void;
  /** The island goes to `place`, saved. */
  land(place: IslandPlace): void;
  reduced(): boolean;
}

type Point = { x: number; y: number };

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
  #press: (Point & { id: number }) | null = null;
  #movedTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly host: MoveHost) {}

  /** A press on the pill: a drag if it moves far enough, a click otherwise. */
  press(event: PointerEvent): void {
    if (event.button !== 0 || this.moving) return;
    this.#press = { x: event.screenX, y: event.screenY, id: event.pointerId };
    window.addEventListener('pointermove', this.#move);
    window.addEventListener('pointerup', this.#release);
    window.addEventListener('pointercancel', this.#release);
  }

  /** The island landed, its offset back to nothing: the window shrinks around it. */
  settle(): void {
    if (!this.landing) return;
    this.landing = false;
    this.moving = false;
  }

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

  #move = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.id) return;
    const by = { x: event.screenX - press.x, y: event.screenY - press.y };
    if (!this.moving) {
      if (Math.hypot(by.x, by.y) < MOVE_FROM) return;
      this.moving = true;
      this.moved = true;
      this.host.span();
    }
    this.offset.set(by, { instant: true });
    this.over = this.#nearest();
  };

  #release = async (event: PointerEvent): Promise<void> => {
    if (this.#press && event.pointerId !== this.#press.id) return;
    this.#stopListening();
    this.#press = null;
    if (!this.moving) return;
    clearTimeout(this.#movedTimer);
    this.#movedTimer = setTimeout(() => (this.moved = false), 300);
    const place = this.#nearest() ?? this.host.place();
    this.over = null;
    this.landing = true;
    // Where it was let go, then laid out at its new place, the same offset on: the gap between them springs away.
    const before = this.host.island();
    const shown = this.offset.current;
    this.host.land(place);
    await tick();
    const after = this.host.island();
    if (before && after) this.offset.set({ x: before.x + shown.x - after.x, y: before.y + shown.y - after.y }, { instant: true });
    this.offset.set({ x: 0, y: 0 }, { instant: this.host.reduced() });
  };

  #stopListening(): void {
    window.removeEventListener('pointermove', this.#move);
    window.removeEventListener('pointerup', this.#release);
    window.removeEventListener('pointercancel', this.#release);
  }
}
