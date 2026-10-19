/*
 * The release targets: which executable each platform Boite knows downloads.
 * `release.yml` builds one `bots-<target-triple>[.exe]` per entry and
 * `release-manifest.ts` writes their URLs and hashes into `boite-plugin.json`.
 */

export const REPOSITORY = 'Skollheim/bots';

export interface Target {
  /** Boite's platform key, `${process.platform}-${process.arch}`. */
  platform: 'win32-x64' | 'win32-arm64' | 'darwin-x64' | 'darwin-arm64' | 'linux-x64' | 'linux-arm64';
  triple: string;
}

export const TARGETS: readonly Target[] = [
  { platform: 'win32-x64', triple: 'x86_64-pc-windows-msvc' },
  { platform: 'win32-arm64', triple: 'aarch64-pc-windows-msvc' },
  { platform: 'darwin-x64', triple: 'x86_64-apple-darwin' },
  { platform: 'darwin-arm64', triple: 'aarch64-apple-darwin' },
  { platform: 'linux-x64', triple: 'x86_64-unknown-linux-gnu' },
  { platform: 'linux-arm64', triple: 'aarch64-unknown-linux-gnu' },
];

/** The file a release carries for `target`. */
export function assetName(target: Target): string {
  return `bots-${target.triple}${target.platform.startsWith('win32') ? '.exe' : ''}`;
}

/** Where `release.yml` uploads that file for `version`. */
export function assetUrl(target: Target, version: string): string {
  return `https://github.com/${REPOSITORY}/releases/download/v${version}/${assetName(target)}`;
}
