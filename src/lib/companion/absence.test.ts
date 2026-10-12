import { expect, test } from 'vitest';
import { absenceStart, AWAY_IDLE_MS, SLEPT_MS, sleptThrough } from './absence';

const T = Date.UTC(2026, 9, 12, 14, 0);

test('the absence began the shell’s wait before it said away', () => {
  expect(absenceStart(T)).toBe(T - AWAY_IDLE_MS);
});

test('a long gap between two ticks was a sleep; a tick on time is nothing', () => {
  expect(sleptThrough(T, T + 15_000)).toBeNull();
  expect(sleptThrough(T, T + SLEPT_MS - 1)).toBeNull();
  expect(sleptThrough(T, T + 40 * 60_000)).toEqual({ from: T, to: T + 40 * 60_000 });
});
