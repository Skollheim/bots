import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HOLD_MS, HOLD_STILL, LongPress, pressRoute } from './hold.svelte';
import { IslandMove, MOVE_FROM } from './move.svelte';
import type { LandPatch } from './place';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

function pointer(type: string, at: { x: number; y: number }, target: EventTarget = window, buttons = 1) {
  const event = new MouseEvent(type, { clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, button: 0, buttons, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
  return event as PointerEvent;
}

/** The pill as `IslandBar.svelte` wires it: a route per press, the island's move, the long press, and the robot's pull. */
function pill(robotOnly: boolean) {
  const bar = document.createElement('button');
  const face = document.createElement('span');
  bar.append(face);
  document.body.append(bar);
  const pulled: PointerEvent[] = [];
  const landed: LandPatch[] = [];
  const move = new IslandMove({
    place: () => 'top-center',
    island: () => ({ x: 400, y: 0, width: 200, height: 32 }) as DOMRect,
    span: () => Promise.resolve('DISPLAY1'),
    land: (patch) => landed.push(patch),
    reduced: () => true
  });
  const hold = new LongPress((event) => {
    move.abort();
    pulled.push(event);
  });
  const down = (target: Element, at: { x: number; y: number }) => {
    const event = new MouseEvent('pointerdown', { clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, button: 0, buttons: 1 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'currentTarget', { value: bar });
    const press = event as PointerEvent;
    const route = pressRoute(target === face, robotOnly);
    if (route === 'pull') return void pulled.push(press);
    move.press(press);
    if (route === 'hold') hold.press(press);
  };
  return { bar, face, move, hold, pulled, landed, down };
}

test('the route of a press: the face of a worded pill pulls, the robot alone holds, the rest moves', () => {
  expect(pressRoute(true, false)).toBe('pull');
  expect(pressRoute(true, true)).toBe('hold');
  expect(pressRoute(false, false)).toBe('move');
  expect(pressRoute(false, true)).toBe('move');
});

test('a drag on a pill that shows the robot alone carries the island', () => {
  const { face, move, hold, pulled, down } = pill(true);
  down(face, { x: 420, y: 10 });
  pointer('pointermove', { x: 420 + MOVE_FROM, y: 10 });
  expect(move.moving).toBe(true);
  vi.advanceTimersByTime(HOLD_MS * 2);
  expect([hold.armed, pulled.length]).toEqual([false, 0]);
  move.dispose();
});

test('a long press on the robot alone arms, and the island stays put', () => {
  const { face, move, hold, pulled, down } = pill(true);
  down(face, { x: 420, y: 10 });
  pointer('pointermove', { x: 420 + HOLD_STILL - 1, y: 10 });
  vi.advanceTimersByTime(HOLD_MS - 1);
  expect(hold.armed).toBe(false);
  vi.advanceTimersByTime(1);
  expect(hold.armed).toBe(true);
  expect(pulled).toHaveLength(1);
  expect(pulled[0]!.screenX).toBe(420);
  // The drag that follows is the robot's pull: the island no longer moves.
  pointer('pointermove', { x: 460, y: 40 });
  expect(move.moving).toBe(false);
  expect(hold.armed).toBe(false);
  hold.dispose();
});

test('an armed press let go without a drag opens nothing', () => {
  const { face, hold, down } = pill(true);
  down(face, { x: 420, y: 10 });
  vi.advanceTimersByTime(HOLD_MS);
  pointer('pointerup', { x: 420, y: 10 }, window, 0);
  expect([hold.armed, hold.held]).toEqual([false, true]);
  vi.advanceTimersByTime(300);
  expect(hold.held).toBe(false);
});

test('a click on the robot alone stays a click', () => {
  const { face, move, hold, pulled, down } = pill(true);
  down(face, { x: 420, y: 10 });
  vi.advanceTimersByTime(120);
  pointer('pointerup', { x: 420, y: 10 }, window, 0);
  vi.advanceTimersByTime(HOLD_MS);
  expect([move.moving, move.moved, hold.armed, hold.held, pulled.length]).toEqual([false, false, false, false, 0]);
});

test('on a worded pill the face pulls the robot at once, the rest carries the island', () => {
  const worded = pill(false);
  worded.down(worded.face, { x: 420, y: 10 });
  expect(worded.pulled).toHaveLength(1);
  pointer('pointermove', { x: 440, y: 10 });
  expect(worded.move.moving).toBe(false);

  const rest = pill(false);
  rest.down(rest.bar, { x: 520, y: 10 });
  pointer('pointermove', { x: 540, y: 10 });
  expect([rest.move.moving, rest.pulled.length]).toEqual([true, 0]);
  rest.move.dispose();
});

test('a long press ends with a lost pointer or window', () => {
  const { face, hold, pulled, down } = pill(true);
  down(face, { x: 420, y: 10 });
  window.dispatchEvent(new Event('blur'));
  vi.advanceTimersByTime(HOLD_MS);
  expect([hold.armed, pulled.length]).toEqual([false, 0]);
});
