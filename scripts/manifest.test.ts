import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { manifestProblems, unreleased } from './check-manifest';
import { releaseManifest } from './release-manifest';
import { assetName, TARGETS } from './targets';

const manifest = readFileSync(new URL('../boite-plugin.json', import.meta.url), 'utf8');

test('the manifest in the repository passes Boite\'s reader, desktopApp aside', () => {
  expect(manifestProblems(manifest)).toEqual([]);
  expect(unreleased(manifest)).toBe(true);
});

test('a manifest that names another feature or a foreign URL is refused', () => {
  const raw = JSON.parse(manifest);
  expect(manifestProblems(JSON.stringify({ ...raw, provides: { desktopApp: {}, accountPools: { providers: ['claude'] } } }))).toContain(
    'boite-plugin.json: provides must name desktopApp alone',
  );
  const moved = { ...raw, artifacts: { ...raw.artifacts, 'linux-x64': { ...raw.artifacts['linux-x64'], url: 'https://example.com/bots' } } };
  expect(manifestProblems(JSON.stringify(moved)).join('\n')).toContain('artifacts.linux-x64.url');
});

test('a release writes its version, URLs and hashes for the executables it built', () => {
  const built = new Map([[assetName(TARGETS[0]!), 'a'.repeat(64)], [assetName(TARGETS[3]!), 'b'.repeat(64)]]);
  const next = JSON.parse(releaseManifest(manifest, '1.2.3', (file) => built.get(file) ?? null));
  expect(next.version).toBe('1.2.3');
  expect(Object.keys(next.artifacts)).toEqual(['win32-x64', 'darwin-arm64']);
  expect(next.artifacts['win32-x64']).toEqual({
    url: 'https://github.com/beboite/bots/releases/download/v1.2.3/bots-x86_64-pc-windows-msvc.exe',
    sha256: 'a'.repeat(64),
  });
  expect(next.provides).toEqual({ desktopApp: {} });
  expect(manifestProblems(JSON.stringify(next))).toEqual([]);
  expect(() => releaseManifest(manifest, 'v1', () => null)).toThrow();
});
