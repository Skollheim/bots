import { expect, test } from 'vitest';
import { characterOf, faceState, markOf } from './character';

test('each skin is drawn by its family, and no skin by the classic box', () => {
  for (const family of ['box', 'jelly', 'bubble', 'capsule', 'retro'] as const) {
    expect(characterOf({ family, shape: 0, color: 0, eyes: 0, top: 0 })).toBe(family);
  }
  expect(characterOf(null)).toBe('box');
  expect(characterOf(undefined)).toBe('box');
});

test('the drawing blinks at rest, glances at work, hops when it calls, keeps still with its eyes shut', () => {
  expect(faceState('awake')).toBe('idle');
  expect(faceState('happy')).toBe('idle');
  expect(faceState('working')).toBe('working');
  expect(faceState('calling')).toBe('waiting');
  expect(faceState('alarm')).toBe('waiting');
  for (const face of ['sleep', 'calm', 'rest', 'startled', 'yawn'] as const) expect(faceState(face)).toBe('still');
});

test('a z asleep, a ! when it calls, sparks for joy, nothing otherwise', () => {
  expect(markOf('sleep')).toBe('z');
  expect(markOf('calling')).toBe('shout');
  expect(markOf('alarm')).toBe('shout');
  expect(markOf('cheer')).toBe('spark');
  expect(markOf('happy')).toBe('spark');
  expect(markOf('working')).toBeNull();
});
