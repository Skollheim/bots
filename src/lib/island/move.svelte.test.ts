import { tick } from 'svelte';
import { expect, test } from 'vitest';
import type { IslandPlace } from '../companion/prefs';
import { IslandMove, MOVE_FROM } from './move.svelte';
import type { LandPatch } from './place';

/** An island 200 × 32 laid out at `base` in the window, drawn the drag's offset away; the shell answers `screen`. */
function carried(screen: string | null = 'DISPLAY1') {
  const pill = document.createElement('button');
  document.body.append(pill);
  const landed: LandPatch[] = [];
  const at = { base: { x: 412, y: 0 } };
  let spans = 0;
  const box = () => ({ x: at.base.x + move.offset.current.x, y: at.base.y + move.offset.current.y, width: 200, height: 32 }) as DOMRect;
  const move: IslandMove = new IslandMove({
    place: (): IslandPlace => 'top-center',
    island: box,
    span: () => {
      spans += 1;
      return Promise.resolve(screen);
    },
    land: (patch) => landed.push(patch),
    reduced: () => true
  });
  return { move, pill, landed, at, box, spans: () => spans };
}

function pointer(type: string, at: { x: number; y: number }, options: { buttons?: number; target?: EventTarget; id?: number } = {}) {
  const event = new MouseEvent(type, { clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, button: 0, buttons: options.buttons ?? 1, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: options.id ?? 1 });
  (options.target ?? window).dispatchEvent(event);
  return event as PointerEvent;
}

function press(move: IslandMove, pill: Element, at: { x: number; y: number }) {
  const event = new MouseEvent('pointerdown', { clientX: at.x, clientY: at.y, screenX: at.x, screenY: at.y, button: 0, buttons: 1 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'currentTarget', { value: pill });
  move.press(event as PointerEvent);
}

test('a press that does not move far is a click: nothing spans, nothing lands', async () => {
  const { move, pill, landed, spans } = carried();
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 500 + MOVE_FROM - 1, y: 10 });
  pointer('pointerup', { x: 500 + MOVE_FROM - 1, y: 10 }, { buttons: 0 });
  await tick();
  expect([move.moving, move.moved, spans(), landed]).toEqual([false, false, 0, []]);
});

test('the island stays held where it was taken, the window grown or moved under it', () => {
  const { move, pill, at, box } = carried();
  press(move, pill, { x: 450, y: 10 });
  pointer('pointermove', { x: 470, y: 30 });
  expect(move.moving).toBe(true);
  expect(move.offset.current).toEqual({ x: 20, y: 20 });
  // The window spans another screen: the island is laid out elsewhere in it, and the next move puts it back under the pointer.
  at.base = { x: 900, y: 0 };
  pointer('pointermove', { x: 300, y: 500 });
  expect({ x: box().x, y: box().y }).toEqual({ x: 300 - 38, y: 500 - 10 });
});

test('let go on the same screen, only the place is saved', async () => {
  const { move, pill, landed, spans } = carried();
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 900, y: 700 });
  await tick();
  expect(move.over).toBe('bottom-right');
  pointer('pointerup', { x: 900, y: 700 }, { buttons: 0 });
  await tick();
  expect(spans()).toBe(1);
  expect(landed).toEqual([{ islandPlace: 'bottom-right' }]);
  expect(move.moved).toBe(true);
});

test('let go on another screen, its place there and the screen are saved', async () => {
  const { move, pill, landed } = carried('DISPLAY2');
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 520, y: 10 });
  await tick();
  move.spanned('DISPLAY1');
  pointer('pointermove', { x: 40, y: 740 });
  pointer('pointerup', { x: 40, y: 740 }, { buttons: 0 });
  await tick();
  expect(landed).toEqual([{ islandPlace: 'bottom-left', monitor: 'DISPLAY1' }]);
});

test('a screen told before the first span answers is kept; not carried, a screen told is not taken', async () => {
  const { move, pill, landed } = carried('DISPLAY2');
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 520, y: 10 });
  move.spanned('DISPLAY1');
  await tick();
  pointer('pointerup', { x: 520, y: 10 }, { buttons: 0 });
  await tick();
  expect(landed.at(-1)).toEqual({ islandPlace: 'top-center', monitor: 'DISPLAY1' });
  move.settle();
  move.spanned('DISPLAY3');
  // Let go before the shell answered: the screen stays as it was.
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 520, y: 10 });
  pointer('pointerup', { x: 520, y: 10 }, { buttons: 0 });
  await tick();
  expect(landed.at(-1)).toEqual({ islandPlace: 'top-center' });
});

test('the window losing the focus while carried puts the island back and shrinks the window', async () => {
  const { move, pill, landed } = carried();
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 800, y: 600 });
  window.dispatchEvent(new Event('blur'));
  expect([move.moving, move.landing, move.over, move.offset.current]).toEqual([false, false, null, { x: 0, y: 0 }]);
  // The drag is over: a later move or release does nothing.
  pointer('pointermove', { x: 900, y: 700 });
  pointer('pointerup', { x: 900, y: 700 }, { buttons: 0 });
  await tick();
  expect([move.moving, landed]).toEqual([false, []]);
});

test('a move with no button down is the release the window missed', async () => {
  const { move, pill, landed } = carried();
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 900, y: 700 });
  pointer('pointermove', { x: 900, y: 700 }, { buttons: 0 });
  await tick();
  expect(landed).toEqual([{ islandPlace: 'bottom-right' }]);
});

test('the pill losing the pointer ends the drag, another element losing it does not', () => {
  const { move, pill } = carried();
  const other = document.createElement('span');
  document.body.append(other);
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 600, y: 300 });
  pointer('lostpointercapture', { x: 600, y: 300 }, { target: other });
  expect(move.moving).toBe(true);
  pointer('pointercancel', { x: 600, y: 300 }, { id: 2 });
  expect(move.moving).toBe(true);
  pointer('lostpointercapture', { x: 600, y: 300 }, { target: pill });
  expect(move.moving).toBe(false);
});

test('a span given up while landing lands at once', async () => {
  const { move, pill } = carried();
  press(move, pill, { x: 500, y: 10 });
  pointer('pointermove', { x: 900, y: 700 });
  pointer('pointerup', { x: 900, y: 700 }, { buttons: 0 });
  move.abort();
  await tick();
  expect([move.moving, move.landing]).toEqual([false, false]);
});
