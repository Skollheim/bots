/*
 * The island's spring, the same motion on a 60 Hz screen as on a 240 Hz one.
 *
 * Svelte's `Spring` (`svelte/motion`) steps once per frame and its velocity
 * gains a whole acceleration on every step, whatever the frame's length, so
 * its curve depends on the screen: opening the island from the pill settles
 * in about 370 ms at 60 Hz, 440 ms at 144 Hz and 460 ms at 240 Hz. This one
 * runs Svelte's own step at a fixed 60 steps a second, the curve Svelte's
 * numbers are given for, and shows a faster screen's frames part of the way
 * to the next step: more frames of the same curve.
 */

export type Box = Record<string, number>;

export interface SpringOptions {
  stiffness: number;
  damping: number;
  /** Below this, in both distance and step, a value is settled. */
  precision: number;
}

/** One step of the simulation: a sixtieth of a second, as Svelte's at 60 Hz. */
export const STEP_MS = 1000 / 60;
/** A frame longer than this (a stalled page) moves no further, as with Svelte's spring. */
export const MAX_FRAME_MS = 1000 / 30;

export interface SpringState<T extends Box> {
  /** The step before `current`: their gap is the velocity. */
  last: T;
  current: T;
  /** Time past `current` not yet stepped, in milliseconds. */
  carry: number;
}

function each<T extends Box>(of: T, value: (key: keyof T & string) => number): T {
  const next: Box = {};
  for (const key of Object.keys(of)) next[key] = value(key);
  return next as T;
}

/** Svelte's `tick_spring` for one number, at dt = 1: the next value, or the target once settled. */
export function stepValue(last: number, current: number, target: number, options: SpringOptions): number {
  const delta = target - current;
  const velocity = current - last;
  const move = velocity + options.stiffness * delta - options.damping * velocity;
  return Math.abs(move) < options.precision && Math.abs(delta) < options.precision ? target : current + move;
}

/**
 * Moves the spring on by `elapsed` milliseconds of wall time: whole steps,
 * then what to show between the last two. `settled` once every value has
 * reached its target.
 */
export function advance<T extends Box>(state: SpringState<T>, target: T, elapsed: number, options: SpringOptions): { state: SpringState<T>; shown: T; settled: boolean } {
  let { last, current } = state;
  let carry = state.carry + Math.min(Math.max(elapsed, 0), MAX_FRAME_MS);
  while (carry >= STEP_MS) {
    carry -= STEP_MS;
    const next = each(current, (key) => stepValue(last[key]!, current[key]!, target[key]!, options));
    last = current;
    current = next;
    if (Object.keys(current).every((key) => current[key] === target[key])) {
      return { state: { last: target, current: target, carry: 0 }, shown: target, settled: true };
    }
  }
  // Shown part of the way to the next step, not from the last one: no step behind.
  const between = carry / STEP_MS;
  const shown = each(current, (key) => current[key]! + (stepValue(last[key]!, current[key]!, target[key]!, options) - current[key]!) * between);
  return { state: { last, current, carry }, shown, settled: false };
}

/** Where frames come from: the page's `requestAnimationFrame`, or a test's. */
export interface Frames {
  request(callback: (now: number) => void): number;
  cancel(id: number): void;
}

const pageFrames: Frames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id)
};

/** A box of numbers that springs to where it is set, read through `current`. */
export class FrameSpring<T extends Box> {
  current = $state.raw() as T;
  #state: SpringState<T>;
  #target: T;
  #frame: number | null = null;
  #then = 0;

  constructor(
    value: T,
    private readonly options: SpringOptions,
    private readonly frames: Frames = pageFrames
  ) {
    this.current = { ...value };
    this.#target = { ...value };
    this.#state = { last: this.#target, current: this.#target, carry: 0 };
  }

  set(target: T, { instant = false }: { instant?: boolean } = {}): void {
    this.#target = { ...target };
    if (instant) {
      this.stop();
      this.#state = { last: this.#target, current: this.#target, carry: 0 };
      this.current = this.#target;
      return;
    }
    if (this.#frame !== null) return;
    if (Object.keys(target).every((key) => this.#state.current[key] === target[key])) return;
    this.#then = performance.now();
    this.#frame = this.frames.request(this.#tick);
  }

  stop(): void {
    if (this.#frame !== null) this.frames.cancel(this.#frame);
    this.#frame = null;
  }

  #tick = (now: number): void => {
    const moved = advance(this.#state, this.#target, now - this.#then, this.options);
    this.#then = now;
    this.#state = moved.state;
    this.current = moved.shown;
    this.#frame = moved.settled ? null : this.frames.request(this.#tick);
  };
}
