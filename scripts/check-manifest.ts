/*
 * Checks `boite-plugin.json` with Boite's own reader (`parseManifest`, from
 * the `vendor/boite` submodule), that Bots provides a desktop app and nothing
 * else, and that its artifacts are the ones `release.yml` uploads.
 *
 * `bun scripts/check-manifest.ts [path]`, `bun run check:manifest`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PluginManifest } from '@boite/contracts';
import { assetUrl, TARGETS } from './targets';

const ZERO = '0'.repeat(64);

// The reader imports `@boite/contracts`, a workspace package in Boite that
// Bun cannot find from the submodule's own folder: point it at the source.
Bun.plugin({
  name: 'boite-contracts',
  setup(build) {
    const contracts = fileURLToPath(new URL('../vendor/boite/packages/contracts/src/index.ts', import.meta.url));
    build.module('@boite/contracts', () => ({ contents: `export * from ${JSON.stringify(contracts)};`, loader: 'ts' }));
  },
});
const { parseManifest } = await import('../vendor/boite/packages/core/src/plugins/manifest');

/** The problems with the manifest text, none when it is sound. */
export function manifestProblems(text: string, file = 'boite-plugin.json'): string[] {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    return [`${file}: not JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  let manifest: PluginManifest;
  try {
    manifest = parseManifest(raw, file);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const problems: string[] = [];
  if (manifest.provides.desktopApp === undefined) problems.push(`${file}: provides.desktopApp must be {}`);
  if (Object.keys(manifest.provides).length !== 1) problems.push(`${file}: provides must name desktopApp alone`);
  if (manifest.id !== 'bots') problems.push(`${file}: id must be bots`);
  if (manifest.executable !== 'bots') problems.push(`${file}: executable must be bots`);
  for (const target of TARGETS) {
    const artifact = manifest.artifacts[target.platform];
    if (!artifact) continue;
    const url = assetUrl(target, manifest.version);
    if (artifact.url !== url) problems.push(`${file}: artifacts.${target.platform}.url must be ${url}`);
  }
  for (const platform of Object.keys(manifest.artifacts)) {
    if (!TARGETS.some((target) => target.platform === platform)) problems.push(`${file}: artifacts.${platform} is not a release target`);
  }
  if (!manifest.artifacts['win32-x64']) problems.push(`${file}: artifacts.win32-x64 is missing`);
  return problems;
}

/** Whether the hashes are still the placeholder the release workflow replaces. */
export function unreleased(text: string): boolean {
  const artifacts = (JSON.parse(text) as { artifacts?: Record<string, { sha256?: string }> }).artifacts ?? {};
  return Object.values(artifacts).some((artifact) => artifact.sha256 === ZERO);
}

if (import.meta.main) {
  const path = process.argv[2] ?? 'boite-plugin.json';
  const text = readFileSync(path, 'utf8');
  const problems = manifestProblems(text, path);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`${path}: accepted${unreleased(text) ? ' (sha256 placeholders: filled by the release workflow)' : ''}`);
}
