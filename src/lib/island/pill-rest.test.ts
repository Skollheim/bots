import { expect, test } from 'vitest';
import { fill, strings } from '../strings';
import type { MediaState } from '../companion/media';
import type { QuotaAccount, QuotaBar } from './quotas.svelte';
import { restLine, robotWidth, sessionLine, type RestLine } from './pill-rest';
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
  expect(restLine('live', { live, media, quota })).toBe(live);
  expect(restLine('robot', { live, media, quota })).toBeNull();
  expect(restLine('quota', { live, media, quota })).toEqual({
    name: 'Max',
    doing: fill(strings.island.assistant.quotas.left, { percent: '18' }),
    progress: null,
    kind: 'quota',
    tone: 'amber'
  });
  expect(restLine('quota', { live, media, quota: null })).toBe(live);
  expect(restLine('music', { live, media, quota })).toEqual({ name: 'Midnight Circuit', doing: 'Neon Tides', progress: null, kind: 'music', tone: null });
  expect(restLine('music', { live, media: { ...media, playing: false }, quota })).toBe(live);
  expect(restLine('music', { live: null, media: null, quota })).toBeNull();
});

test('the robot alone takes a short pill, longer only for its dots', () => {
  expect(robotWidth(0)).toBe(96);
  expect(robotWidth(48)).toBe(112);
});
