import { expect, test } from 'vitest';
import type { MediaState } from './media';
import { accentOf, ART_SETTLE_MS, barOf, clockAfter, DRIFT_MS, fallTo, heldClock, isNewTrack, LEVEL_FLOOR, liftOnBlack, mirrored, nextCeiling, positionAt, seekTo, SKIP_ANSWER_MS, slideOf, type MusicBase } from './music';
import { Music } from './music.svelte';

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

test('a seek moves the clock at once, within the track', () => {
  const base: MusicBase = { position: 10_000, at: 1_000, duration: 200_000, playing: true };
  expect(seekTo(base, 120_000, 5_000)).toEqual({ position: 120_000, at: 5_000, duration: 200_000, playing: true });
  expect(seekTo(base, 999_000, 5_000)?.position).toBe(200_000);
  expect(seekTo(base, -5, 5_000)?.position).toBe(0);
  expect(seekTo(null, 120_000, 5_000)).toBeNull();
});

test('while a seek settles, a read from before it is not believed, but a pause or another track is', () => {
  const sought: MusicBase = { position: 120_000, at: 5_000, duration: 200_000, playing: true };
  expect(heldClock(sought, state(14_000), 6_000)).toBe(sought);
  expect(heldClock(sought, state(121_000), 6_000)).toBe(sought);
  expect(heldClock(sought, state(14_000, false), 6_000)?.playing).toBe(false);
  expect(heldClock(sought, state(2_000, true, 90_000), 6_000)?.duration).toBe(90_000);
  expect(heldClock(sought, null, 6_000)).toBeNull();
});

test('the music holds a seek against stale reads for a while, then follows the player again', () => {
  const music = new Music();
  music.sync(state(10_000), 1_000);
  music.seek(120_000, 2_000);
  expect(music.position(2_000)).toBe(120_000);
  music.sync(state(11_000), 2_500);
  expect(music.position(3_000)).toBe(121_000);
  // The player never moved: once the hold is over, its word wins.
  music.sync(state(15_000), 9_000);
  expect(music.position(9_000)).toBe(15_000);
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

test('another title or artist is a new track; the position, the play state or a late cover are not', () => {
  const song = { title: 'Song', artist: 'Band', art: 'data:a' };
  expect(isNewTrack(song, { ...song }, 0)).toBe(false);
  expect(isNewTrack(song, { ...song, title: 'Other' }, 0)).toBe(true);
  expect(isNewTrack(song, { ...song, artist: 'Other' }, 0)).toBe(true);
  // The cover the player sends after the title, or none, belongs to the same track.
  expect(isNewTrack({ ...song, art: null }, song, 0)).toBe(false);
  expect(isNewTrack(song, { ...song, art: undefined }, ART_SETTLE_MS * 4)).toBe(false);
  // Another cover right after a change arrives late; long after, it is another track.
  expect(isNewTrack(song, { ...song, art: 'data:b' }, ART_SETTLE_MS - 1)).toBe(false);
  expect(isNewTrack(song, { ...song, art: 'data:b' }, ART_SETTLE_MS)).toBe(true);
  expect(isNewTrack(null, song, 0)).toBe(false);
  expect(isNewTrack(song, null, 0)).toBe(false);
});

test('a new track slides back after a press of previous, forward otherwise', () => {
  expect(slideOf(null, 1_000)).toBe(1);
  expect(slideOf({ action: 'next', at: 1_000 }, 1_500)).toBe(1);
  expect(slideOf({ action: 'previous', at: 1_000 }, 1_500)).toBe(-1);
  expect(slideOf({ action: 'previous', at: 1_000 }, 1_000 + SKIP_ANSWER_MS + 1)).toBe(1);
});