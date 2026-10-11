import { expect, test } from 'vitest';
import { strings as en } from '../strings.en';
import { fr } from '../strings.fr';
import { LINGER_MS, type SessionRow } from './sessions';
import { clockDelay, elapsedDelay, nextChange, sessionTime } from './session-time';

const EN = en.island.sessions.duration;
const FR = fr.island.sessions.duration;
const S = 1_000;
const M = 60_000;
const H = 60 * M;

test('the seconds show only under a minute, then minutes, then hours and minutes', () => {
  expect(sessionTime(0, EN)).toBe('0s');
  expect(sessionTime(45 * S + 999, EN)).toBe('45s');
  expect(sessionTime(M, EN)).toBe('1 min');
  expect(sessionTime(41 * M + 6 * S, EN)).toBe('41 min');
  expect(sessionTime(H - 1, EN)).toBe('59 min');
  expect(sessionTime(H, EN)).toBe('1h');
  expect(sessionTime(H + 20 * M + 59 * S, EN)).toBe('1h 20m');
  expect(sessionTime(26 * H + 5 * M, EN)).toBe('26h 5m');
});

test('French spaces its units and pads the minutes after the hour', () => {
  const nb = ' ';
  expect(sessionTime(45 * S, FR)).toBe(`45${nb}s`);
  expect(sessionTime(41 * M + 6 * S, FR)).toBe(`41${nb}min`);
  expect(sessionTime(2 * H, FR)).toBe(`2${nb}h`);
  expect(sessionTime(H + 20 * M, FR)).toBe(`1${nb}h${nb}20`);
  expect(sessionTime(H + 5 * M, FR)).toBe(`1${nb}h${nb}05`);
});

test('a time that went backwards reads as nothing yet', () => {
  expect(sessionTime(-5 * S, EN)).toBe('0s');
  expect(nextChange(-5 * S)).toBe(S);
});

test('the text changes within the second under a minute, then once a minute', () => {
  expect(nextChange(0)).toBe(S);
  expect(nextChange(12_400)).toBe(600);
  expect(nextChange(59_999)).toBe(1);
  expect(nextChange(M)).toBe(M);
  expect(nextChange(41 * M + 6 * S)).toBe(54 * S);
  expect(nextChange(2 * H + 30 * S)).toBe(30 * S);
});

function row(id: string, state: SessionRow['state'], since: number, endedAt: number | null = null): SessionRow {
  return { id, title: id, projectId: null, state, since, endedAt, steps: [], task: null, detail: null, progress: null, helpers: 0 };
}

test('the clock sleeps without a row and wakes for the soonest change', () => {
  const now = 10 * H;
  expect(clockDelay([], now)).toBeNull();
  // A row at work for 41 min 06 s changes in 54 s; one at work for 20 s changes within the second.
  expect(clockDelay([row('a', 'working', now - (41 * M + 6 * S))], now)).toBe(54 * S);
  expect(clockDelay([row('a', 'working', now - (41 * M + 6 * S)), row('b', 'waiting', now - 20_250)], now)).toBe(750);
});

test('an ended row needs the clock only to leave, unless its card keeps it', () => {
  const now = 10 * H;
  const ended = row('a', 'done', now - 5 * M, now - (LINGER_MS - 30 * S));
  expect(clockDelay([ended], now)).toBe(30 * S);
  expect(clockDelay([ended], now, ['a'])).toBeNull();
  // Past its time, it is due now.
  expect(clockDelay([row('b', 'failed', now - H, now - 2 * LINGER_MS)], now)).toBe(0);
});

test('the clock looks again within a minute at most', () => {
  const now = 10 * H;
  expect(clockDelay([row('a', 'done', now - M, now)], now)).toBe(M);
});

test('the desktop clock wakes for the soonest of its times to change, never without one', () => {
  const now = 10 * H;
  expect(elapsedDelay([], now)).toBeNull();
  expect(elapsedDelay([null], now)).toBeNull();
  // 41 min 06 s changes in 54 s; 20.25 s within the second; a start not yet known waits.
  expect(elapsedDelay([now - (41 * M + 6 * S), null, now - 20_250], now)).toBe(750);
  expect(elapsedDelay([now - (41 * M + 6 * S)], now)).toBe(54 * S);
  expect(elapsedDelay([now - 3 * H], now)).toBe(M);
});
