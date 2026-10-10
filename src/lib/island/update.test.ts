import { expect, test } from 'vitest';
import { compareVersions, latestOf, newerRelease, trackOf, type GitHubRelease } from './update';

function release(tag: string, extra: Partial<GitHubRelease> = {}): GitHubRelease {
  return { tag_name: tag, draft: false, html_url: `https://github.com/beboite/boite/releases/tag/${tag}`, published_at: '2026-10-10T03:00:00Z', assets: [{ name: 'latest.json' }], ...extra };
}

test('versions follow semver, prereleases included', () => {
  expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
  expect(compareVersions('2.0.0-nightly.20261010.2', '2.0.0-nightly.20261010.1')).toBe(1);
  expect(compareVersions('2.0.0-nightly.20261009.9', '2.0.0-nightly.20261010.1')).toBe(-1);
  expect(compareVersions('2.0.0', '2.0.0-beta.3')).toBe(1);
  expect(compareVersions('2.0.0-beta.2', '2.0.0-beta.10')).toBe(-1);
  expect(compareVersions('2.0.0-beta', '2.0.0-beta.1')).toBe(-1);
  expect(compareVersions('2.0.0-1', '2.0.0-alpha')).toBe(-1);
  expect(compareVersions('v2.0.0', '2.0.0+build.5')).toBe(0);
  expect(compareVersions('not a version', '2.0.0')).toBe(0);
});

test('the track is nightly for a "-nightly." version only', () => {
  expect(trackOf('2.0.0-nightly.20261010.1')).toBe('nightly');
  expect(trackOf('2.0.0-beta.1')).toBe('stable');
  expect(trackOf('2.0.0')).toBe('stable');
});

test('the newest release of a track skips drafts, the other track and unsigned builds', () => {
  const list = [
    release('v2.0.0-nightly.20261010.1'),
    release('v2.0.0-nightly.20261011.1', { draft: true }),
    release('v2.0.0-nightly.20261010.3', { assets: [] }),
    release('v2.0.0-nightly.20261010.2'),
    release('v2.0.0-beta.4'),
    release('desktop-tools')
  ];
  expect(latestOf(list, 'nightly')?.version).toBe('2.0.0-nightly.20261010.2');
  expect(latestOf(list, 'stable')).toMatchObject({ version: '2.0.0-beta.4', track: 'stable', url: 'https://github.com/beboite/boite/releases/tag/v2.0.0-beta.4' });
});

test('a newer release on the running track is offered, the current one is not', () => {
  const list = [release('v2.0.0-nightly.20261010.2'), release('v2.0.0-beta.9')];
  expect(newerRelease('2.0.0-nightly.20261010.1', list)?.version).toBe('2.0.0-nightly.20261010.2');
  expect(newerRelease('2.0.0-nightly.20261010.2', list)).toBeNull();
  expect(newerRelease('2.0.0-beta.9', list)).toBeNull();
  expect(newerRelease('2.0.0-beta.8', list)?.version).toBe('2.0.0-beta.9');
  expect(newerRelease('dev', list)).toBeNull();
});
