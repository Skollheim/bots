import { expect, test } from 'vitest';
import type { MediaState } from './media';
import { accentOf, barOf, clockAfter, DRIFT_MS, fallTo, LEVEL_FLOOR, liftOnBlack, mirrored, nextCeiling, positionAt, type MusicBase } from './music';

const state = (position: number | null, playing = true, duration = 200_000): MediaState => ({ title: 'Song', artist: 'Band', app: 'Spotify.exe', playing, position, duration });

test('the position runs on while playing, stays while paused, within the track', () => {
  const base: MusicBase = { position: 10_000, at: 1_000, duration: 200_000, playing: true };
  expect(positionAt(base, 4_000)).toBe(13_000);
  expect(positionAt({ ...base, playing: false }, 4_000)).toBe(10_000);
  expect(positionAt(base, 1_000_000)).toBe(200_000);
  expect(positionAt(null, 4_000)).toBe(0);
});

test('a read that agrees with the count keeps the base; a seek, a pause or a new track makes a new one', () => {
  const base = clockAfter(null, state(10_000), 1_000)!;
  expect(base).toEqual({ position: 10_000, at: 1_000, duration: 200_000, playing: true });
  expect(clockAfter(base, state(13_000 + DRIFT_MS - 1), 4_000)).toBe(base);
  expect(clockAfter(base, state(60_000), 4_000)).toEqual({ position: 60_000, at: 4_000, duration: 200_000, playing: true });
  expect(clockAfter(base, state(13_000, false), 4_000)?.playing).toBe(false);
  expect(clockAfter(base, state(13_000, true, 90_000), 4_000)?.duration).toBe(90_000);
});

test('a player with no timeline has no clock', () => {
  expect(clockAfter(null, state(null), 1_000)).toBeNull();
  expect(clockAfter(null, state(0, true, 0), 1_000)).toBeNull();
  expect(clockAfter(null, null, 1_000)).toBeNull();
});

test('the ceiling follows a louder peak at once, lets go slowly, never under the floor', () => {
  expect(nextCeiling(0.2, 0.8)).toBe(0.8);
  expect(nextCeiling(0.8, 0.1)).toBeCloseTo(0.8 * 0.992);
  expect(nextCeiling(0, 0)).toBe(LEVEL_FLOOR);
});

test('a bar is the peak against the ceiling, eased, between 0 and 1', () => {
  expect(barOf(0, 0.5)).toBe(0);
  expect(barOf(0.5, 0.5)).toBe(1);
  expect(barOf(0.9, 0.5)).toBe(1);
  expect(barOf(0.125, 0.5)).toBeGreaterThan(0.25);
});

test('a bar rises at once and falls in steps', () => {
  expect(fallTo(0.2, 0.9)).toBe(0.9);
  expect(fallTo(1, 0)).toBeCloseTo(0.62);
});

test('the meter pulses from its centre: the newest level in the middle', () => {
  expect(mirrored([0.9, 0.5, 0.1], 5)).toEqual([0.1, 0.5, 0.9, 0.5, 0.1]);
  expect(mirrored([0.9], 3)).toEqual([0, 0.9, 0]);
});

test('the cover lends its most vivid colour, lifted for black; a grey cover lends none', () => {
  const pixels = (r: number, g: number, b: number, count = 12) => Array.from({ length: count }, () => [r, g, b, 255]).flat();
  expect(accentOf([...pixels(200, 30, 40), ...pixels(20, 20, 20, 60)])).toMatch(/^rgb\(/);
  expect(accentOf(pixels(128, 128, 128))).toBeNull();
  expect(accentOf([])).toBeNull();
  const [r, g, b] = liftOnBlack(40, 10, 10).match(/\d+/g)!.map(Number);
  expect(Math.max(r!, g!, b!)).toBeGreaterThanOrEqual(220);
  expect(r).toBeGreaterThan(g!);
});
