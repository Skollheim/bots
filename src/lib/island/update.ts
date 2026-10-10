/*
 * A newer Boite on its track, picked from GitHub's release list as Boite's
 * own desktop updater picks it (`apps/shell/src-tauri/src/updater.rs`): not
 * a draft, on the same track (a "-nightly." tag or not), with a `latest.json`
 * (a signed desktop build), the highest version. Pure; the watch that reads
 * the list is `update.svelte.ts`.
 */

export type Track = 'stable' | 'nightly';

/** What the island reads of a GitHub release. */
export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  html_url: string;
  published_at: string | null;
  assets: readonly { name: string }[];
}

export interface Release {
  version: string;
  track: Track;
  /** The release's page, its notes. */
  url: string;
  publishedAt: string | null;
}

export function trackOf(version: string): Track {
  return version.includes('-nightly.') ? 'nightly' : 'stable';
}

interface Version {
  core: [number, number, number];
  pre: string[];
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const NUMERIC = /^\d+$/;

export function parseVersion(text: string): Version | null {
  const match = SEMVER.exec(text.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

function comparePart(a: string, b: string): number {
  const numberA = NUMERIC.test(a);
  const numberB = NUMERIC.test(b);
  if (numberA && numberB) return Math.sign(Number(a) - Number(b));
  // Numbers come before words; words compare as ASCII, as semver says.
  if (numberA !== numberB) return numberA ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver's order: below 0 when `a` is older, 0 when equal or unreadable, above 0 when newer. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index++) {
    const step = Math.sign(left.core[index]! - right.core[index]!);
    if (step !== 0) return step;
  }
  // A release outranks its prereleases.
  if (left.pre.length === 0 || right.pre.length === 0) return Math.sign(right.pre.length - left.pre.length);
  for (let index = 0; index < Math.min(left.pre.length, right.pre.length); index++) {
    const step = comparePart(left.pre[index]!, right.pre[index]!);
    if (step !== 0) return step;
  }
  return Math.sign(left.pre.length - right.pre.length);
}

/** The newest signed desktop release of a track, as Boite's updater would offer it. */
export function latestOf(releases: readonly GitHubRelease[], track: Track): Release | null {
  let top: Release | null = null;
  for (const release of releases) {
    const version = release.tag_name.replace(/^v/, '');
    if (release.draft || trackOf(version) !== track || !parseVersion(version)) continue;
    if (!release.assets.some((asset) => asset.name === 'latest.json')) continue;
    if (!top || compareVersions(version, top.version) > 0) top = { version, track, url: release.html_url, publishedAt: release.published_at };
  }
  return top;
}

/** The release newer than the running Boite on its own track, or null when it is current. */
export function newerRelease(current: string, releases: readonly GitHubRelease[]): Release | null {
  if (!parseVersion(current)) return null;
  const top = latestOf(releases, trackOf(current));
  return top && compareVersions(top.version, current) > 0 ? top : null;
}
