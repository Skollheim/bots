import { expect, test } from 'vitest';
import { easeInOut, keyframes, LARGEST_PX, LOOPS, MAX_STEP_PX, poseAt, STEP_HZ, stepsOf, type Loop } from './stepped';

/** Where a point of the robot's square (fractions of its size) is drawn at `t`, in screen pixels at `LARGEST_PX`. */
function placed(loop: Loop, t: number, [x, y]: [number, number]): [number, number] {
  const pose = poseAt(loop, t);
  const [ox, oy] = loop.origin;
  // As CSS applies `rotate() translateY() scale()` round the origin: scale first, then the move, then the turn.
  const sx = (x - ox) * pose.scaleX;
  const sy = (y - oy) * pose.scaleY + pose.translateY / 100;
  const angle = (pose.rotate * Math.PI) / 180;
  return [(ox + sx * Math.cos(angle) - sy * Math.sin(angle)) * LARGEST_PX, (oy + sx * Math.sin(angle) + sy * Math.cos(angle)) * LARGEST_PX];
}

test('no step of a stepped loop moves any corner of the robot by a quarter pixel at its largest', () => {
  const corners: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const loop of LOOPS) {
    const steps = stepsOf(loop);
    let most = 0;
    for (let step = 0; step < steps; step++) {
      for (const corner of corners) {
        const [ax, ay] = placed(loop, step / steps, corner);
        const [bx, by] = placed(loop, (step + 1) / steps, corner);
        most = Math.max(most, Math.hypot(bx - ax, by - ay));
      }
    }
    expect(most, loop.name).toBeLessThan(MAX_STEP_PX);
  }
});

test('a loop keeps its rhythm: STEP_HZ samples a second, through the poses it had smooth', () => {
  for (const loop of LOOPS) {
    expect(stepsOf(loop)).toBe((loop.ms / 1000) * STEP_HZ);
    for (const key of loop.keys) {
      const pose = poseAt(loop, key.at === 1 ? 0 : key.at);
      expect(pose.scaleX).toBeCloseTo(key.pose.scaleX ?? 1, 6);
      expect(pose.scaleY).toBeCloseTo(key.pose.scaleY ?? 1, 6);
      expect(pose.rotate).toBeCloseTo(key.pose.rotate ?? 0, 6);
    }
  }
});

test('the curve between two poses is CSS ease-in-out', () => {
  expect(easeInOut(0)).toBeCloseTo(0, 6);
  expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  expect(easeInOut(1)).toBeCloseTo(1, 6);
  // cubic-bezier(0.42, 0, 0.58, 1) at a quarter of the time: about 0.129.
  expect(easeInOut(0.25)).toBeCloseTo(0.1291, 3);
});

test('the keyframes name the loop and hold a pose per step', () => {
  const css = keyframes(LOOPS[1]!);
  expect(css.startsWith('@keyframes bots-box-breathe-4000{')).toBe(true);
  expect(css.match(/%\{/g)).toHaveLength(stepsOf(LOOPS[1]!) + 1);
  expect(css).toContain('50%{transform:rotate(0deg) translateY(0%) scale(1.012,1.03)}');
});
