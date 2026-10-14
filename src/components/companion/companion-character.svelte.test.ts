/*
 * The companion draws a skin with its family's character: the box for a box
 * or no skin, a Jelly, Bubble, Capsule or Retro robot for the others.
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { Robot } from '../../lib/robots';
import CompanionCharacter from './CompanionCharacter.svelte';

let shown: { character: Record<string, unknown>; target: HTMLElement } | null = null;

function show(skin: Robot | null, mood: 'idle' | 'working' | 'calling' = 'idle'): HTMLElement {
  const target = document.body.appendChild(document.createElement('div'));
  shown = { character: mount(CompanionCharacter, { target, props: { mood, skin, lively: false } }), target };
  flushSync();
  return target.firstElementChild as HTMLElement;
}

afterEach(() => {
  if (shown) {
    unmount(shown.character);
    shown.target.remove();
    shown = null;
  }
});

const robot = (family: Robot['family']): Robot => ({ family, shape: 1, color: 2, eyes: 1, top: 1 });

test('no skin and a box skin draw the box', () => {
  expect(show(null).classList.contains('char')).toBe(true);
  unmount(shown!.character);
  shown!.target.remove();
  expect(show(robot('box')).classList.contains('char')).toBe(true);
});

for (const family of ['jelly', 'bubble', 'capsule', 'retro'] as const) {
  test(`a ${family} skin draws the ${family} character, with the mood's face`, () => {
    const root = show(robot(family), 'working');
    expect(root.classList.contains(family)).toBe(true);
    expect(root.classList.contains('f-working')).toBe(true);
    expect(root.querySelector(`[data-family='${family}']`)).not.toBeNull();
    expect(root.getAttribute('role')).toBe('img');
  });
}

test('a calling robot shows its mark', () => {
  const root = show(robot('retro'), 'calling');
  expect(root.classList.contains('f-calling')).toBe(true);
  expect(root.querySelector('.shout')?.textContent).toBe('!');
});
