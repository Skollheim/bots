/*
 * Writes a release into `boite-plugin.json`: the version, then each
 * artifact's URL and sha256 from the executables `release.yml` built.
 *
 * `bun scripts/release-manifest.ts <version> <dir-with-executables>`.
 * A platform with no executable in the directory leaves the manifest.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetName, assetUrl, TARGETS } from './targets';
import { manifestProblems } from './check-manifest';

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function releaseManifest(text: string, version: string, sha256Of: (file: string) => string | null): string {
  if (!VERSION.test(version)) throw new Error(`version must look like 1.2.0, not ${JSON.stringify(version)}`);
  const manifest = JSON.parse(text) as Record<string, unknown> & { artifacts: Record<string, unknown> };
  const artifacts: Record<string, { url: string; sha256: string }> = {};
  for (const target of TARGETS) {
    const sha256 = sha256Of(assetName(target));
    if (sha256) artifacts[target.platform] = { url: assetUrl(target, version), sha256 };
  }
  if (Object.keys(artifacts).length === 0) throw new Error('no release executable was found');
  return `${JSON.stringify({ ...manifest, version, artifacts }, null, 2)}\n`;
}

if (import.meta.main) {
  const [version, dir] = process.argv.slice(2);
  if (!version || !dir) {
    console.error('usage: bun scripts/release-manifest.ts <version> <dir-with-executables>');
    process.exit(2);
  }
  const sha256Of = (file: string) => {
    const path = join(dir, file);
    return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
  };
  const next = releaseManifest(readFileSync('boite-plugin.json', 'utf8'), version, sha256Of);
  const problems = manifestProblems(next);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  writeFileSync('boite-plugin.json', next);
  console.log(`boite-plugin.json: ${version}`);
}
