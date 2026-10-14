/*
 * The slow loops a robot keeps up at rest (a breath, a doze), drawn in small
 * steps instead of on every frame of the screen.
 *
 * A breath moves the robot by a pixel or two over seconds. Played as a
 * smooth CSS animation, it makes the compositor draw the window on every
 * frame of the display: 240 times a second on a 240 Hz screen, for a
 * motion nobody could tell from a few dozen positions. Here each loop is
 * sampled `STEP_HZ` times a second along its own eased curve, with the
 * same rhythm and amplitude, and held between samples (`steps(1, end)`):
 * the window is drawn `STEP_HZ` times a second. A loop is stepped only
 * when no step moves any point of the robot by more than `MAX_STEP_PX` at
 * the largest size it is drawn (`stepped.test.ts` checks it); larger
 * motions (a hop, a float, the work) stay smooth.
 *
 * The keyframes are written once into the page (`useSteppedLoops`), named
 * `bots-<family>-<loop>-<ms>`; a character's stylesheet plays one with
 * `animation: <name> <ms> steps(1, end) infinite`.
 */

/** How many times a second a stepped loop moves on. */
export const STEP_HZ = 20;
/** The most a step may move a point of the robot, in screen pixels. */
export const MAX_STEP_PX = 0.25;
/** The largest a stepped robot is drawn: the desktop's 64 px, on a screen scaled to 200 %. */
export const LARGEST_PX = 128;

/** One transform, in the units the characters' stylesheets use. */
export interface Pose {
  rotate?: number;
  /** In percent of the robot's size. */
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
}

export interface Loop {
  name: string;
  ms: number;
  /** Where the robot turns and scales round, in fractions of its square. */
  origin: [number, number];
  /** The keyframes, `at` from 0 to 1, eased in and out between each. */
  keys: { at: number; pose: Pose }[];
}

/** CSS's `ease-in-out`, `cubic-bezier(0.42, 0, 0.58, 1)`: progress at time `t`, both 0 to 1. */
export function easeInOut(t: number): number {
  const bezier = (u: number, a: number, b: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u ** 2 * (1 - u) + u ** 3;
  let low = 0;
  let high = 1;
  for (let round = 0; round < 40; round++) {
    const middle = (low + high) / 2;
    if (bezier(middle, 0.42, 0.58) < t) low = middle;
    else high = middle;
  }
  return bezier((low + high) / 2, 0, 1);
}

const full = (pose: Pose): Required<Pose> => ({ rotate: pose.rotate ?? 0, translateY: pose.translateY ?? 0, scaleX: pose.scaleX ?? 1, scaleY: pose.scaleY ?? 1 });

/** The loop's pose at `t` (0 to 1 of its cycle), along its eased curve. */
export function poseAt(loop: Loop, t: number): Required<Pose> {
  const keys = loop.keys;
  let index = keys.findIndex((key) => key.at > t);
  if (index <= 0) index = keys.length - 1;
  const from = keys[index - 1]!;
  const to = keys[index]!;
  const share = to.at === from.at ? 1 : easeInOut((t - from.at) / (to.at - from.at));
  const [a, b] = [full(from.pose), full(to.pose)];
  const mix = (x: number, y: number) => x + (y - x) * share;
  return { rotate: mix(a.rotate, b.rotate), translateY: mix(a.translateY, b.translateY), scaleX: mix(a.scaleX, b.scaleX), scaleY: mix(a.scaleY, b.scaleY) };
}

/** How many samples the loop takes over its cycle. */
export const stepsOf = (loop: Loop): number => Math.round((loop.ms / 1000) * STEP_HZ);

const round = (value: number) => Number(value.toFixed(5));

/** The loop's keyframes, one per step. */
export function keyframes(loop: Loop): string {
  const steps = stepsOf(loop);
  const frames: string[] = [];
  for (let step = 0; step <= steps; step++) {
    const pose = poseAt(loop, step / steps);
    frames.push(`${round((step / steps) * 100)}%{transform:rotate(${round(pose.rotate)}deg) translateY(${round(pose.translateY)}%) scale(${round(pose.scaleX)},${round(pose.scaleY)})}`);
  }
  return `@keyframes ${loop.name}{${frames.join('')}}`;
}

const breath = (family: string, ms: number, origin: [number, number], scaleX: number, scaleY: number): Loop => ({
  name: `bots-${family}-breathe-${ms}`,
  ms,
  origin,
  keys: [
    { at: 0, pose: {} },
    { at: 0.5, pose: { scaleX, scaleY } },
    { at: 1, pose: {} }
  ]
});

/**
 * Every stepped loop, as each character's stylesheet had it smooth: the
 * box's breath (`CompanionCharacter`), the Jelly's (`JellyCharacter`) and
 * the Capsule's doze (`CapsuleCharacter`).
 */
export const LOOPS: Loop[] = [
  breath('box', 3000, [0.5, 0.88], 1.012, 1.03),
  breath('box', 4000, [0.5, 0.88], 1.012, 1.03),
  breath('box', 6000, [0.5, 0.88], 1.012, 1.03),
  breath('jelly', 4000, [0.5, 1], 1.02, 1.04),
  breath('jelly', 6000, [0.5, 1], 1.02, 1.04),
  {
    name: 'bots-capsule-nap-6000',
    ms: 6000,
    origin: [0.54, 0.96],
    keys: [
      { at: 0, pose: { rotate: -9, translateY: 2 } },
      { at: 0.5, pose: { rotate: -7, translateY: 2, scaleX: 1.01, scaleY: 1.02 } },
      { at: 1, pose: { rotate: -9, translateY: 2 } }
    ]
  }
];

/** Writes the stepped loops' keyframes into the page, once. */
export function useSteppedLoops(): void {
  if (typeof document === 'undefined' || document.getElementById('bots-stepped-loops')) return;
  const style = document.createElement('style');
  style.id = 'bots-stepped-loops';
  style.textContent = LOOPS.map(keyframes).join('\n');
  document.head.append(style);
}
