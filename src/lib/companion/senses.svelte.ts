/*
 * What the companion senses around it, from the shell's watch
 * (`companion_window.rs`): where the pointer is, whether the user is typing
 * or away, whether the pointer is on one of its areas, whether an app fills
 * the screen, and how long the last absence lasted. In a browser, where there is no shell, the page's own pointer
 * stands in, so the character still follows it on the dev page.
 */
import { absenceStart, sleptThrough, type Absence } from './absence';
import { inShell, listenShell } from './shell';

/** A minute without the pointer moving or a key, at night: the character dozes. */
const DROWSY_MS = 60_000;
const CLOCK_EVERY = 15_000;

export interface Point { x: number; y: number }

export const isNight = (hour: number): boolean => hour >= 23 || hour < 7;

export class Senses {
  /** The pointer, in the page's pixels; null until it is known. */
  pointer = $state<Point | null>(null);
  typing = $state(false);
  /** No key nor mouse for five minutes, as the shell measures it. */
  away = $state(false);
  hover = $state(false);
  /** The window stepped aside for an app that fills the screen. */
  fullscreen = $state(false);
  private signed = $state(Date.now());
  private now = $state(Date.now());
  /** When the user last showed a sign (a pointer move, a key), at most once a second. */
  private input = 0;
  /** The absence that just ended, by the wall clock (`absence.ts`): what the island's recap reads. */
  absence = $state.raw<Absence | null>(null);
  /** Since when nobody is at the keyboard, while `away`. */
  private awayFrom: number | null = null;
  private tick = Date.now();

  readonly asleep = $derived(this.away || (isNight(new Date(this.now).getHours()) && this.now - this.signed > DROWSY_MS));

  private readonly off: (() => void)[] = [];
  private disposed = false;

  constructor(private readonly handlers: { hover(over: boolean): void; outside(): void; summon(): void; input?(at: number): void }) {
    const clock = setInterval(() => {
      this.now = Date.now();
      // Woken from a sleep the shell had no time to call `away`.
      const slept = sleptThrough(this.tick, this.now);
      this.tick = this.now;
      if (slept && !this.away) this.absence = slept;
    }, CLOCK_EVERY);
    this.off.push(() => clearInterval(clock));
    if (!inShell()) {
      const move = (event: PointerEvent) => this.saw({ x: event.clientX, y: event.clientY });
      window.addEventListener('pointermove', move);
      this.off.push(() => window.removeEventListener('pointermove', move));
      return;
    }
    const hear = <T>(event: string, handler: (payload: T) => void) =>
      void listenShell<T>(event, handler).then((stop) => (this.disposed ? stop() : this.off.push(stop)));
    hear<Point>('cursor', (point) => this.saw(point));
    hear<boolean>('typing', (typing) => {
      this.typing = typing;
      if (typing) this.sign();
    });
    hear<boolean>('away', (away) => {
      this.away = away;
      if (away) this.awayFrom ??= absenceStart(Date.now());
      else {
        if (this.awayFrom !== null) this.absence = { from: this.awayFrom, to: Date.now() };
        this.awayFrom = null;
        this.sign();
      }
    });
    hear<boolean>('fullscreen', (full) => (this.fullscreen = full));
    hear<boolean>('hover', (over) => {
      this.hover = over;
      handlers.hover(over);
    });
    hear<null>('outside', () => handlers.outside());
    hear<null>('summon', () => {
      this.fullscreen = false;
      this.wake();
      handlers.summon();
    });
  }

  private saw(point: Point) {
    this.pointer = point;
    this.sign();
  }

  /** The user did something (not the companion ringing): heard by `input`, then awake. */
  private sign() {
    const now = Date.now();
    if (now - this.input > 1000) {
      this.input = now;
      this.handlers.input?.(now);
    }
    this.wake();
  }

  /** Something the user did: the companion is awake for another minute. */
  wake(): void {
    const now = Date.now();
    // Read on every pointer move: written only when it changes what `asleep` says.
    if (now - this.signed > 1000) {
      this.signed = now;
      this.now = now;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.off.forEach((stop) => stop());
  }
}
