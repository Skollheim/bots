import { describe, expect, it } from 'vitest';
import { HISTORY_MS, remember, sparkPaths, spanOf, type Reading } from './history';

const T0 = Date.UTC(2026, 9, 13, 15, 0, 0);
const at = (seconds: number, value: number): Reading => ({ at: T0 + seconds * 1_000, value });

describe('the last minute of a reading', () => {
  it('keeps a minute, and one reading past its edge', () => {
    let history: Reading[] = [];
    for (let second = 0; second <= 80; second += 2) history = remember(history, at(second, second));
    expect(history[history.length - 1]).toEqual(at(80, 80));
    // 80 s - 60 s = 20 s: the reading at 18 s stays, so the line reaches the left edge.
    expect(history[0]).toEqual(at(18, 18));
    expect(history).toHaveLength(32);
  });

  it('clamps a reading to 0..100, and an earlier reading replaces the ones after it', () => {
    const history = remember([at(10, 30)], at(12, 140));
    expect(history[1]!.value).toBe(100);
    expect(remember(history, at(11, 5))).toEqual([at(10, 30), at(11, 5)]);
    expect(remember([], at(0, -4))).toEqual([at(0, 0)]);
  });

  it('draws nothing under two readings', () => {
    expect(sparkPaths([], 300, 40)).toEqual({ line: '', area: '' });
    expect(sparkPaths([at(0, 50)], 300, 40)).toEqual({ line: '', area: '' });
  });

  it('draws the newest reading on the right and a minute ago on the left', () => {
    const { line, area } = sparkPaths([at(0, 0), at(30, 50), at(60, 100)], 300, 40);
    expect(line).toBe('M0,40L150,20L300,0');
    expect(area).toBe('M0,40L150,20L300,0L300,40L0,40Z');
  });

  it('starts a short history on the right, and pins what lies past a minute to the left edge', () => {
    expect(sparkPaths([at(50, 20), at(60, 20)], 300, 40).line).toBe('M250,32L300,32');
    expect(sparkPaths([at(-10, 20), at(60, 20)], 300, 40, HISTORY_MS).line).toBe('M0,32L300,32');
  });

  it('reads the lowest and the highest', () => {
    expect(spanOf([])).toBeNull();
    expect(spanOf([at(0, 31.4), at(2, 18.6), at(4, 40.5)])).toEqual({ low: 19, high: 41 });
  });
});
