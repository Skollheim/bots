/*
 * What a press on the collapsed pill does (`pressRoute`), and the long press
 * that pulls a robot out where a plain drag must not (`LongPress`).
 *
 * On a pill with words, the robot's face is a small part of it: a drag there
 * pulls the robot out of the island, a drag elsewhere carries the island
 * (`move.svelte.ts`). On a pill that shows the robot alone, the face is
 * nearly all of it: a drag anywhere carries the island, and the robot comes
 * out only after a press held still `HOLD_MS`, then dragged. The deck's
 * corner character takes the same long press, so its swap click and a slip
 * of the hand do not set it loose.
 *
 * A press held long enough arms: the robot lifts a little (`armed`), and the
 * drag that follows pulls it out (`Companion.onpress`). Let go without a drag,
 * the armed press ends with no click (`held`).
 */

/** How long a press stays still before it arms, milliseconds. */
export const HOLD_MS = 400;
/** How far the pointer may go while the press arms, CSS pixels: as far as a drag begins. */
export const HOLD_STILL = 4;

/** Pull the robot out on a drag, carry the island, or carry it unless held long enough to pull. */
export type PressRoute = 'pull' | 'move' | 'hold';

/** What a press on the collapsed pill does: on its face, `onFace`; with the robot alone shown, `robotOnly`. */
export function pressRoute(onFace: boolean, robotOnly: boolean): PressRoute {
  if (!onFace) return 'move';
  return robotOnly ? 'hold' : 'pull';
}

interface Press {
  id: number;
  x: number;
  y: number;
  event: PointerEvent;
}

export class LongPress {
  /** The press was held long enough: the drag that follows pulls the robot out. */
  armed = $state(false);
  /** An armed press was let go without a drag: the click it ends with does nothing. */
  held = false;
  #press: Press | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #heldTimer: ReturnType<typeof setTimeout> | undefined;

  /** `onarm` gets the press that armed, to start the pull from where it began. */
  constructor(
    private readonly onarm: (press: PointerEvent) => void,
    private readonly ms = HOLD_MS
  ) {}

  press(event: PointerEvent): void {
    this.cancel();
    if (event.button !== 0) return;
    this.#press = { id: event.pointerId, x: event.screenX, y: event.screenY, event };
    this.#timer = setTimeout(this.#arm, this.ms);
    window.addEventListener('pointermove', this.#move);
    window.addEventListener('pointerup', this.#release);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('blur', this.cancel);
  }

  /** The press ends without arming, or its pull began: the robot settles. */
  cancel = (): void => {
    clearTimeout(this.#timer);
    window.removeEventListener('pointermove', this.#move);
    window.removeEventListener('pointerup', this.#release);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('blur', this.cancel);
    this.#press = null;
    this.armed = false;
  };

  dispose(): void {
    this.cancel();
    clearTimeout(this.#heldTimer);
  }

  #arm = (): void => {
    const press = this.#press;
    if (!press) return;
    this.armed = true;
    this.onarm(press.event);
  };

  // Before it arms, a press that moves is a drag of something else; armed, the move is the pull, which the robot's own handler starts.
  #move = (event: PointerEvent): void => {
    const press = this.#press;
    if (!press || event.pointerId !== press.id) return;
    if (Math.hypot(event.screenX - press.x, event.screenY - press.y) >= HOLD_STILL) this.cancel();
  };

  #release = (event: PointerEvent): void => {
    if (this.#press && event.pointerId !== this.#press.id) return;
    if (this.armed) {
      this.held = true;
      clearTimeout(this.#heldTimer);
      this.#heldTimer = setTimeout(() => (this.held = false), 300);
    }
    this.cancel();
  };
}
