import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { manifestProblems, unreleased } from './check-manifest';
import { releaseManifest } from './release-manifest';
import { assetName, TARGETS } from './targets';

const manifest = readFileSync(new URL('../boite-plugin.json', import.meta.url), 'utf8');
const ZERO = '0'.repeat(64);

test('the manifest in the repository passes Boite\'s reader', () => {
  expect(manifestProblems(manifest)).toEqual([]);
});

test('the hashes are all placeholders before a release, or all the release\'s, never a mix', () => {
  const raw = JSON.parse(manifest);
  const withHash = (sha256: (platform: string) => string) =>
    JSON.stringify({ ...raw, artifacts: Object.fromEntries(Object.entries(raw.artifacts as Record<string, { url: string }>).map(([platform, artifact]) => [platform, { ...artifact, sha256: sha256(platform) }])) });
  const placeholders = withHash(() => ZERO);
  expect(manifestProblems(placeholders)).toEqual([]);
  expect(unreleased(placeholders)).toBe(true);
  const released = withHash(() => 'c'.repeat(64));
  expect(manifestProblems(released)).toEqual([]);
  expect(unreleased(released)).toBe(false);
  expect(manifestProblems(withHash((platform) => (platform === 'win32-x64' ? 'c'.repeat(64) : ZERO))).join('\n')).toContain('sha256 must be all placeholders');
});

test('a manifest that names another feature or a foreign URL is refused', () => {
  const raw = JSON.parse(manifest);
  expect(manifestProblems(JSON.stringify({ ...raw, provides: { desktopApp: {}, accountPools: { providers: ['claude'] } } }))).toContain(
    'boite-plugin.json: provides must name desktopApp alone',
  );
  expect(manifestProblems(JSON.stringify({ ...raw, provides: { desktopApp: { window: 'big' } } })).join('\n')).toContain('provides.desktopApp.window');
  const moved = { ...raw, artifacts: { ...raw.artifacts, 'linux-x64': { ...raw.artifacts['linux-x64'], url: 'https://example.com/bots' } } };
  expect(manifestProblems(JSON.stringify(moved)).join('\n')).toContain('artifacts.linux-x64.url');
});

test('a release writes its version, URLs and hashes for the executables it built', () => {
  const built = new Map([[assetName(TARGETS[0]!), 'a'.repeat(64)], [assetName(TARGETS[3]!), 'b'.repeat(64)]]);
  const next = JSON.parse(releaseManifest(manifest, '1.2.3', (file) => built.get(file) ?? null));
  expect(next.version).toBe('1.2.3');
  expect(Object.keys(next.artifacts)).toEqual(['win32-x64', 'darwin-arm64']);
  expect(next.artifacts['win32-x64']).toEqual({
    url: 'https://github.com/Skollheim/bots/releases/download/v1.2.3/bots-x86_64-pc-windows-msvc.exe',
    sha256: 'a'.repeat(64),
  });
  expect(next.provides).toEqual({ desktopApp: {} });
  expect(manifestProblems(JSON.stringify(next))).toEqual([]);
  expect(() => releaseManifest(manifest, 'v1', () => null)).toThrow();
});
