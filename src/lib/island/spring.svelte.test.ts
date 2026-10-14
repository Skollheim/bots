import { expect, test } from 'vitest';
import { advance, FrameSpring, MAX_FRAME_MS, STEP_MS, type Frames, type SpringOptions, type SpringState } from './spring.svelte';

/** The island's own spring. */
const OPTIONS: SpringOptions = { stiffness: 0.18, damping: 0.72, precision: 0.25 };
const FROM = { w: 200, h: 32 };
const TO = { w: 560, h: 400 };

/** Runs the spring at `hz` and records what it shows at each frame. */
function run(hz: number, until = 1500): number[] {
  let state: SpringState<typeof FROM> = { last: FROM, current: FROM, carry: 0 };
  const shown = [FROM.w];
  for (let frame = 1; frame <= (until * hz) / 1000; frame++) {
    const moved = advance(state, TO, 1000 / hz, OPTIONS);
    state = moved.state;
    shown.push(moved.shown.w);
    if (moved.settled) break;
  }
  return shown;
}

/** What a run shows at `ms`, a time where a frame falls at every rate measured. */
const at = (frames: number[], hz: number, ms: number) => frames[Math.round((ms * hz) / 1000)] ?? TO.w;

test('the island springs along the same curve at 60, 144 and 240 Hz', () => {
  const sixty = run(60);
  for (const hz of [144, 240]) {
    const fast = run(hz);
    // Every twelfth of a second, a frame falls at 60, 144 and 240 Hz alike.
    for (let ms = 1000 / 12; ms < 1000; ms += 1000 / 12) expect(at(fast, hz, ms)).toBeCloseTo(at(sixty, 60, ms), 1);
    // It settles in the same time, give or take a frame of the slower screen.
    expect(Math.abs((fast.length * 1000) / hz - (sixty.length * 1000) / 60)).toBeLessThan(STEP_MS + 1);
  }
});

test('at 60 Hz it moves as Svelte\'s spring did, frame for frame', () => {
  let last = FROM.w;
  let current = FROM.w;
  const svelte = [current];
  while (current !== TO.w) {
    const velocity = current - last;
    const move = velocity + OPTIONS.stiffness * (TO.w - current) - OPTIONS.damping * velocity;
    last = current;
    current = Math.abs(move) < OPTIONS.precision && Math.abs(TO.w - current) < OPTIONS.precision ? TO.w : current + move;
    svelte.push(current);
  }
  const ours = run(60);
  expect(ours).toHaveLength(svelte.length);
  ours.forEach((w, index) => expect(w).toBeCloseTo(svelte[index]!, 6));
});

test('a 240 Hz screen gets frames between the steps, each a little further on', () => {
  const frames = run(240, 200);
  for (let index = 1; index < frames.length; index++) expect(frames[index]!).toBeGreaterThan(frames[index - 1]!);
});

test('a stalled frame moves the spring no further than two steps', () => {
  const state: SpringState<typeof FROM> = { last: FROM, current: FROM, carry: 0 };
  const stalled = advance(state, TO, 5000, OPTIONS);
  const twice = advance(advance(state, TO, MAX_FRAME_MS / 2, OPTIONS).state, TO, MAX_FRAME_MS / 2, OPTIONS);
  expect(stalled.shown.w).toBeCloseTo(twice.shown.w, 6);
});

test('the spring asks for frames while it moves, none once settled or set at once', () => {
  const queue: ((now: number) => void)[] = [];
  const frames: Frames = { request: (callback) => queue.push(callback), cancel: () => queue.splice(0) };
  const spring = new FrameSpring(FROM, OPTIONS, frames);
  spring.set(FROM);
  expect(queue).toHaveLength(0);
  spring.set(TO);
  let now = performance.now();
  for (let index = 0; index < 400 && queue.length; index++) queue.shift()!((now += STEP_MS));
  expect(queue).toHaveLength(0);
  expect(spring.current).toEqual(TO);
  spring.set(FROM, { instant: true });
  expect(queue).toHaveLength(0);
  expect(spring.current).toEqual(FROM);
});
