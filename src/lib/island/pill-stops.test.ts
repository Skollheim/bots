import { expect, test } from 'vitest';
import { NOTCH_PX, pillStops, stepStop, stopAt, WHEEL_REST_MS, WHEEL_STILL, wheelStep, type PillStop, type WheelPace } from './pill-stops';

const none = { live: [], followed: null, quota: false, music: false, timer: false };

test('the stops: each conversation at work, the quota, the music, the timer, the robot; empty ones skipped', () => {
  expect(pillStops({ live: ['a', 'b'], followed: null, quota: true, music: true, timer: true })).toEqual([
    { view: 'live', threadId: 'a' },
    { view: 'live', threadId: 'b' },
    { view: 'quota', threadId: null },
    { view: 'music', threadId: null },
    { view: 'timer', threadId: null },
    { view: 'robot', threadId: null }
  ]);
  expect(pillStops(none)).toEqual([{ view: 'robot', threadId: null }]);
  expect(pillStops({ ...none, live: ['a'], timer: true }).map((stop) => stop.view)).toEqual(['live', 'timer', 'robot']);
});

test('a followed thread is the one live stop', () => {
  expect(pillStops({ ...none, live: ['a', 'b'], followed: 'z' }).filter((stop) => stop.view === 'live')).toEqual([{ view: 'live', threadId: 'z' }]);
});

const stops: PillStop[] = pillStops({ live: ['a', 'b'], followed: null, quota: true, music: false, timer: true });

test('the pill stands on the view Settings chose, else on the live line it shows', () => {
  expect(stopAt(stops, 'quota', 'a')).toBe(2);
  expect(stopAt(stops, 'robot', 'a')).toBe(4);
  expect(stopAt(stops, 'live', 'b')).toBe(1);
  // The music stopped: the live line shows, the pill stands there.
  expect(stopAt(stops, 'music', 'b')).toBe(1);
  expect(stopAt(stops, 'live', 'gone')).toBe(0);
  expect(stopAt(pillStops(none), 'live', null)).toBe(-1);
});

test('the wheel goes round the loop both ways', () => {
  expect(stepStop(stops, 0, 1)).toEqual({ view: 'live', threadId: 'b' });
  expect(stepStop(stops, 4, 1)).toEqual({ view: 'live', threadId: 'a' });
  expect(stepStop(stops, 0, -1)).toEqual({ view: 'robot', threadId: null });
  expect(stepStop(stops, -1, 1)).toEqual(stops[0]);
  expect(stepStop(stops, -1, -1)).toEqual(stops[4]);
  expect(stepStop([], 0, 1)).toBeNull();
});

/** The steps a run of deltas makes, `every` ms apart from t = 1000. */
function run(deltas: number[], every: number, mode = 0): number[] {
  let pace: WheelPace = WHEEL_STILL;
  return deltas.map((delta, index) => {
    const next = wheelStep(pace, delta, mode, 1000 + index * every);
    pace = next.pace;
    return next.step;
  });
}

test('a mouse notch is one step, down forward and up back', () => {
  expect(run([100], 0)).toEqual([1]);
  expect(run([-100], 0)).toEqual([-1]);
  expect(run([3], 0, 1)).toEqual([1]);
  expect(run([0], 0)).toEqual([0]);
});

test('notches spaced past the rest each step; faster ones wait for it', () => {
  expect(run([100, 100, 100], WHEEL_REST_MS + 10)).toEqual([1, 1, 1]);
  expect(run([100, 100, 100], 50)).toEqual([1, 0, 0]);
});

test('a trackpad’s small deltas add up to a notch, and its flick does not race through', () => {
  // 4 px every 16 ms: a step once 50 px are in, then the rest swallows the tail; 720 ms of flick make two steps.
  const steps = run(Array.from({ length: 45 }, () => 4), 16);
  const first = steps.indexOf(1);
  expect(first).toBe(Math.ceil(NOTCH_PX / 4) - 1);
  expect(steps.filter((step) => step !== 0)).toHaveLength(2);
  // Turning the other way starts again from nothing.
  expect(run([30, -30, -30], 16)).toEqual([0, 0, -1]);
  // A pause forgets what was added up.
  expect(run([30, 30], 400)).toEqual([0, 0]);
});
