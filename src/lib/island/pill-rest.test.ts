import { expect, test } from 'vitest';
import { fill, strings } from '../strings';
import type { MediaState } from '../companion/media';
import type { QuotaAccount, QuotaBar } from './quotas.svelte';
import { restLine, robotWidth, sessionLine, timerLine, type RestLine } from './pill-rest';
import type { SessionRow } from './sessions';

function row(extra: Partial<SessionRow> = {}): SessionRow {
  return { id: 'a', title: 'Port the queue', projectId: null, state: 'working', since: 0, endedAt: null, steps: [], task: 'Build', detail: null, progress: null, helpers: 0, ...extra };
}

const words = strings.island.sessions.followState;

test('a session’s line says what it does at work, else how it ended, or that it rests', () => {
  expect(sessionLine(row(), 'Unity')).toEqual({ name: 'Unity', doing: 'Build', progress: null, kind: 'live', tone: 'working' });
  expect(sessionLine(row({ state: 'done', endedAt: 5 }), '')).toMatchObject({ name: 'Port the queue', doing: words.done, tone: 'done' });
  expect(sessionLine(row({ state: 'failed', endedAt: 5 }), '').doing).toBe(words.failed);
  expect(sessionLine(row({ state: 'done', endedAt: 5, resting: true }), '').doing).toBe(words.resting);
});

const live: RestLine = { name: 'Unity', doing: 'Build', progress: null, kind: 'live', tone: 'working' };
const media: MediaState = { title: 'Midnight Circuit', artist: 'Neon Tides', app: 'Spotify.exe', playing: true };
const quota = { account: { name: 'Max' } as QuotaAccount, bar: { left: 18, tone: 'amber' } as QuotaBar };

test('at rest the pill shows what Settings chose, the live line when that has nothing to show', () => {
  expect(restLine('live', { live, media, quota, timer: null })).toBe(live);
  expect(restLine('robot', { live, media, quota, timer: null })).toBeNull();
  expect(restLine('quota', { live, media, quota, timer: null })).toEqual({
    name: 'Max',
    doing: fill(strings.island.assistant.quotas.left, { percent: '18' }),
    progress: null,
    kind: 'quota',
    tone: 'amber'
  });
  expect(restLine('quota', { live, media, quota: null, timer: null })).toBe(live);
  expect(restLine('music', { live, media, quota, timer: null })).toEqual({ name: 'Midnight Circuit', doing: 'Neon Tides', progress: null, kind: 'music', tone: null });
  expect(restLine('music', { live, media: { ...media, playing: false }, quota, timer: null })).toBe(live);
  expect(restLine('music', { live: null, media: null, quota, timer: null })).toBeNull();
  expect(restLine('timer', { live, media, quota, timer: null })).toBe(live);
  expect(restLine('timer', { live, media, quota, timer: { kind: 'countdown', phase: 'work', label: 'Tea', ms: 61_000, paused: false } })?.kind).toBe('timer');
});

const pomodoro = strings.companion.pomodoro;

test('the timer’s line: what it is for, else its phase, then its clock', () => {
  expect(timerLine({ kind: 'pomodoro', phase: 'work', label: 'Write the doc', ms: 754_200, paused: false })).toEqual({
    name: 'Write the doc',
    doing: '12:35',
    progress: null,
    kind: 'timer',
    tone: 'amber',
    paused: false
  });
  expect(timerLine({ kind: 'pomodoro', phase: 'break', label: 'Write the doc', ms: 120_000, paused: true })).toMatchObject({ name: pomodoro.rest, doing: '2:00', tone: 'done', paused: true });
  expect(timerLine({ kind: 'pomodoro', phase: 'work', label: '', ms: 60_000, paused: false }).name).toBe(pomodoro.work);
  expect(timerLine({ kind: 'countdown', phase: 'work', label: '', ms: 5_000, paused: false }).name).toBe(pomodoro.countdown);
  // A stopwatch counts up, rounded down.
  expect(timerLine({ kind: 'stopwatch', phase: 'work', label: '', ms: 65_900, paused: false })).toMatchObject({ name: pomodoro.stopwatch, doing: '1:05' });
});

test('the robot alone takes a short pill, longer only for its dots', () => {
  expect(robotWidth(0)).toBe(96);
  expect(robotWidth(48)).toBe(112);
});
