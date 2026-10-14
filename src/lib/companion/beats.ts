/*
 * The robots' occasional gestures (a blink, a flicker, a twitch of the
 * antenna), started by one timer for every robot on the page.
 *
 * A blink every five seconds written as an endless CSS animation holds
 * still 93 % of its cycle, yet keeps the compositor awake on every frame of
 * the display to find nothing changed. Here a gesture is a short animation
 * that runs only while it shows: `beat` marks the element with
 * `data-beat-<name>` for `length` ms, and the stylesheet plays the gesture
 * once on that mark. One timer serves every robot, each at its own jittered
 * rhythm around `every`. Nothing starts while the window is out of sight
 * (`data-dormant`, `App.svelte`), under reduced motion, or for an element
 * off screen (`onscreen`).
 */

export interface BeatOptions {
  /** The gesture, in the mark's name: `data-beat-<name>`. */
  name: string;
  /** About how often, in ms. */
  every: number;
  /** How long the gesture plays, in ms. */
  length: number;
  /** The share of `every` the rhythm drifts by, either way. */
  jitter?: number;
  /** Off, the gesture never starts (a face whose eyes are shut). */
  active?: boolean;
}

interface Entry {
  node: Element;
  options: BeatOptions;
  /** When it next starts, or ends while it plays. */
  at: number;
  playing: boolean;
}

/** The page's clock and timer, a test's in tests. */
export interface Clock {
  now(): number;
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const pageClock: Clock = {
  now: () => performance.now(),
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

/** Whether gestures may start: the window in sight and motion allowed. */
function lively(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.hasAttribute('data-dormant') || root.dataset.motion === 'reduced') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export class Beats {
  private readonly entries = new Set<Entry>();
  private timer: unknown = null;
  private timerAt = Infinity;

  constructor(
    private readonly clock: Clock = pageClock,
    private readonly random: () => number = Math.random,
    private readonly may: (node: Element) => boolean = (node) => lively() && !offscreen.has(node)
  ) {}

  /** Starts `node`'s gesture now and then, until the returned stop. */
  add(node: Element, options: BeatOptions): { update(options: BeatOptions): void; stop(): void } {
    // A random first time, as each endless animation started when its robot came: robots never blink together.
    const entry: Entry = { node, options, at: this.clock.now() + this.random() * options.every, playing: false };
    this.entries.add(entry);
    this.arm();
    return {
      update: (next) => {
        entry.options = next;
        if (next.active === false) this.end(entry);
      },
      stop: () => {
        this.end(entry);
        this.entries.delete(entry);
        this.arm();
      }
    };
  }

  private next(options: BeatOptions): number {
    const jitter = options.jitter ?? 0.2;
    return options.every * (1 - jitter + 2 * jitter * this.random());
  }

  private end(entry: Entry): void {
    if (!entry.playing) return;
    entry.playing = false;
    entry.node.removeAttribute(`data-beat-${entry.options.name}`);
  }

  private tick = (): void => {
    this.timer = null;
    this.timerAt = Infinity;
    const now = this.clock.now();
    for (const entry of this.entries) {
      if (entry.at > now) continue;
      if (entry.playing) {
        this.end(entry);
        entry.at = now + Math.max(0, this.next(entry.options) - entry.options.length);
      } else if (entry.options.active !== false && this.may(entry.node)) {
        entry.playing = true;
        entry.node.setAttribute(`data-beat-${entry.options.name}`, '');
        entry.at = now + entry.options.length;
      } else entry.at = now + this.next(entry.options);
    }
    this.arm();
  };

  /** One timer, set for the soonest start or end. */
  private arm(): void {
    let soonest = Infinity;
    for (const entry of this.entries) soonest = Math.min(soonest, entry.at);
    if (soonest === this.timerAt) return;
    if (this.timer !== null) this.clock.clear(this.timer);
    this.timer = null;
    this.timerAt = soonest;
    if (soonest !== Infinity) this.timer = this.clock.set(this.tick, Math.max(0, soonest - this.clock.now()));
  }
}

/** The page's beats: one timer for every robot. */
export const beats = new Beats();

/** A Svelte action: `use:beat={{ name: 'blink', every: 5000, length: 350 }}`. */
export function beat(node: Element, options: BeatOptions): { update(options: BeatOptions): void; destroy(): void } {
  const handle = beats.add(node, options);
  return { update: handle.update, destroy: handle.stop };
}

/** The elements out of view, by `onscreen`'s one observer. */
const offscreen = new WeakSet<Element>();
let observer: IntersectionObserver | null = null;

/**
 * A Svelte action: while the element is out of view (scrolled away in a
 * list, clipped by the island), it is marked `data-offscreen`, its endless
 * animations wait (`bots.css`) and its gestures do not start.
 */
export function onscreen(node: Element): { destroy(): void } {
  if (typeof IntersectionObserver === 'undefined') return { destroy() {} };
  observer ??= new IntersectionObserver((seen) => {
    for (const { target, isIntersecting } of seen) {
      if (isIntersecting) {
        offscreen.delete(target);
        target.removeAttribute('data-offscreen');
      } else {
        offscreen.add(target);
        target.setAttribute('data-offscreen', '');
      }
    }
  });
  observer.observe(node);
  return {
    destroy() {
      observer?.unobserve(node);
      offscreen.delete(node);
    }
  };
}
