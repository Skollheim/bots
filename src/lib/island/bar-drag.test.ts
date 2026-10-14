import { expect, test } from 'vitest';
import { clampShift, dropIndex, landingShift, slideOf, stepOf, type Span } from './bar-drag';

// Three things 40, 60 and 50 wide, 2 apart: 0-40, 42-102, 104-154.
const row: Span[] = [
  { left: 0, width: 40 },
  { left: 42, width: 60 },
  { left: 104, width: 50 }
];

test('a carried thing lands past every centre its own went by', () => {
  expect(dropIndex(row, 0, 0)).toBe(0);
  expect(dropIndex(row, 0, 51)).toBe(0);
  expect(dropIndex(row, 0, 53)).toBe(1);
  expect(dropIndex(row, 0, 200)).toBe(2);
  expect(dropIndex(row, 2, -60)).toBe(1);
  expect(dropIndex(row, 2, -200)).toBe(0);
  expect(dropIndex(row, 5, 10)).toBe(5);
});

test('the others slide aside by the carried width and one gap', () => {
  const step = stepOf(row, 0);
  expect(step).toBe(42);
  expect([0, 1, 2].map((index) => slideOf(index, 0, 2, step))).toEqual([0, -42, -42]);
  expect([0, 1, 2].map((index) => slideOf(index, 2, 0, stepOf(row, 2)))).toEqual([52, 52, 0]);
  expect([0, 1, 2].map((index) => slideOf(index, 1, 1, 62))).toEqual([0, 0, 0]);
  expect(stepOf([{ left: 0, width: 30 }], 0)).toBe(30);
});

test('the carried thing stays within the row and glides to the place it lands on', () => {
  expect(clampShift(row, 0, -30)).toBe(0);
  expect(clampShift(row, 0, 500)).toBe(114);
  expect(clampShift(row, 1, 20)).toBe(20);
  expect(clampShift([], 0, 20)).toBe(0);
  // First to last: it ends where the last one ended.
  expect(landingShift(row, 0, 2)).toBe(154 - 40);
  // Last to first: it starts where the first one started.
  expect(landingShift(row, 2, 0)).toBe(-104);
  expect(landingShift(row, 1, 1)).toBe(0);
});
