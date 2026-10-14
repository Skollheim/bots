import { expect, test } from 'vitest';
import { Beats, type Clock } from './beats';

/** A clock the test moves by hand, with the timers it holds. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; callback: () => void; handle: number }[] = [];
  let handles = 0;
  const clock: Clock = {
    now: () => now,
    set: (callback, ms) => {
      timers.push({ at: now + ms, callback, handle: ++handles });
      return handles;
    },
    clear: (handle) => (timers = timers.filter((timer) => timer.handle !== handle))
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers = timers.filter((timer) => timer !== due);
      now = due.at;
      due.callback();
    }
    now = end;
  };
  return { clock, advance, pending: () => timers.length };
}

/** When the mark was on, over `ms` read every 10 ms. */
function marks(node: Element, name: string, advance: (ms: number) => void, ms: number): number[] {
  const on: number[] = [];
  for (let at = 0; at < ms; at += 10) {
    advance(10);
    if (node.hasAttribute(`data-beat-${name}`)) on.push(at);
  }
  return on;
}

test('a gesture shows for its length, about every period, with one timer for every robot', () => {
  const { clock, advance, pending } = fakeClock();
  const beats = new Beats(clock, () => 0.5, () => true);
  const robots = [document.createElement('div'), document.createElement('div'), document.createElement('div')];
  robots.forEach((robot) => beats.add(robot, { name: 'blink', every: 5000, length: 350 }));
  expect(pending()).toBe(1);
  const on = marks(robots[0]!, 'blink', advance, 20_000);
  // Four blinks in twenty seconds, each 350 ms long.
  const starts = on.filter((at, index) => index === 0 || at - on[index - 1]! > 10);
  expect(starts).toHaveLength(4);
  expect(on.length).toBeGreaterThanOrEqual(4 * 34);
  expect(on.length).toBeLessThanOrEqual(4 * 36);
  expect(pending()).toBe(1);
});

test('the rhythm drifts within its jitter, never in step across robots', () => {
  const { clock, advance } = fakeClock();
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const beats = new Beats(clock, random, () => true);
  const [a, b] = [document.createElement('div'), document.createElement('div')];
  beats.add(a, { name: 'blink', every: 5000, length: 350 });
  beats.add(b, { name: 'blink', every: 5000, length: 350 });
  const onA = marks(a, 'blink', advance, 60_000);
  const starts = onA.filter((at, index) => index === 0 || at - onA[index - 1]! > 10);
  const gaps = starts.slice(1).map((at, index) => at - starts[index]!);
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(4000 - 20);
    expect(gap).toBeLessThanOrEqual(6000 + 20);
  }
});

test('nothing starts while gestures may not, an inactive face, or after the stop', () => {
  const { clock, advance, pending } = fakeClock();
  let may = false;
  const beats = new Beats(clock, () => 0.5, () => may);
  const node = document.createElement('div');
  const handle = beats.add(node, { name: 'blink', every: 1000, length: 100 });
  expect(marks(node, 'blink', advance, 5000)).toHaveLength(0);
  may = true;
  handle.update({ name: 'blink', every: 1000, length: 100, active: false });
  expect(marks(node, 'blink', advance, 5000)).toHaveLength(0);
  handle.update({ name: 'blink', every: 1000, length: 100 });
  expect(marks(node, 'blink', advance, 5000).length).toBeGreaterThan(0);
  handle.stop();
  expect(node.hasAttribute('data-beat-blink')).toBe(false);
  expect(pending()).toBe(0);
});
